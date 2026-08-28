import path from "path";
import { retrieveIpv4, retrieveIpv6 } from "./ip/index.js";
import { retrieveStorage, saveStorage } from "./storage.js";
import { configDotenv } from "dotenv";
import z from "zod/v4";
import { Result } from "./helpers/result.js";
import { IpProvider } from "./ip/providers/base.js";
import { PlaintextProvider } from "./ip/providers/plaintext-provider.js";

configDotenv({
  quiet: true,
  path: path.resolve(process.cwd(), "..", "..", ".env"),
});
configDotenv({ quiet: true });

export interface Driver {
  connect(): Promise<void>;
  keepAlive(): Promise<void>;
  write(
    ipv4Address?: string | null,
    ipv6Address?: string | null,
  ): Promise<boolean>;
}

const envSchema = z.looseObject({
  TICK_MS: z.coerce.number().default(30_000), // 30 Seconds
  EXPIRY_MS: z.coerce.number().default(15 * 60 * 1000), // 15 Minutes
  IP_PROVIDERS: z
    .string()
    .optional()
    .transform((val) => (val ? JSON.parse(val) : val))
    .pipe(
      z
        .array(z.object({ ipv4: z.url().nullable(), ipv6: z.url().nullable() }))
        .or(z.object({ ipv4: z.url().nullable(), ipv6: z.url().nullable() }))
        .optional(),
    ),

  CALLBACK_URL: z.url().optional(),
  CALLBACK_METHOD: z
    .union([z.literal("GET"), z.literal("POST")])
    .default("GET"),
});
const env = z
  .discriminatedUnion("CALLBACK_AUTH", [
    z.looseObject({
      ...envSchema.shape,
      CALLBACK_AUTH: z.literal("basic"),
      CALLBACK_AUTH_USERNAME: z.string(),
      CALLBACK_AUTH_PASSWORD: z.string(),
    }),
    z.looseObject({
      ...envSchema.shape,
      CALLBACK_AUTH: z.undefined(),
    }),
  ])
  .parse(process.env);

function isExpired(timestamp: Date | null, expiryMs: number) {
  const now = new Date();
  return timestamp ? now.getTime() - timestamp.getTime() > expiryMs : true;
}

export class Scheduler {
  protected storagePath: string;
  protected ipProviders: IpProvider[] = [];
  constructor(
    protected driver: Driver,
    storageDir: string,
  ) {
    this.storagePath = path.resolve(storageDir, "scheduler.json");

    if (env.IP_PROVIDERS) {
      this.ipProviders.push(
        ...(Array.isArray(env.IP_PROVIDERS)
          ? env.IP_PROVIDERS
          : [env.IP_PROVIDERS]
        )
          .map((provider) => {
            if (!provider.ipv4 && !provider.ipv6) {
              return null;
            }
            return new PlaintextProvider(provider.ipv4, provider.ipv6);
          })
          .filter((provider) => provider !== null),
      );
    }
  }

  async start() {
    console.log("Starting scheduler...");
    await this.driver.connect();
    console.log("Driver connected.");
    await this.tick(true);
    this.scheduleTick();
  }

  async update(
    ipv4Address: Result<string | null>,
    ipv6Address: Result<string | null>,
  ) {
    console.log("Retrieved IP addresses:");
    console.log(
      "- IPv4:",
      ipv4Address.isSuccess ? ipv4Address.value : "Error while retrieving IPv4",
    );
    console.log(
      "- IPv6:",
      ipv6Address.isSuccess ? ipv6Address.value : "Error while retrieving IPv6",
      "\n",
    );

    const recordsChanged = this.driver.write(
      ipv4Address.unwrapOr(undefined),
      ipv6Address.unwrapOr(undefined),
    );

    await saveStorage(this.storagePath, {
      timestamp: new Date(),
      ipv4Address: ipv4Address.unwrapOr(undefined),
      ipv6Address: ipv6Address.unwrapOr(undefined),
    });

    return recordsChanged;
  }

  async tick(force: boolean = false) {
    const [ipv4Address, ipv6Address] = await Promise.all([
      retrieveIpv4(),
      retrieveIpv6(),
    ]);

    const previous = await retrieveStorage(this.storagePath);

    const ipsChanged =
      ipv4Address.unwrapOr(undefined) !== previous.ipv4Address ||
      ipv6Address.unwrapOr(undefined) !== previous.ipv6Address;
    const expired = isExpired(previous.timestamp, env.EXPIRY_MS);

    if (force || ipsChanged || expired) {
      const recordsChanged = await this.update(ipv4Address, ipv6Address);
      if ((recordsChanged || ipsChanged) && env.CALLBACK_URL) {
        void this.triggerCallback({
          v4: ipv4Address.isSuccess
            ? {
                previous: previous.ipv4Address,
                current: ipv4Address.unwrap(),
              }
            : undefined,

          v6: ipv6Address.isSuccess
            ? {
                previous: previous.ipv6Address,
                current: ipv6Address.unwrap(),
              }
            : undefined,
        });
      }
    } else {
      await this.driver.keepAlive(); // Keep session alive to prevent logout
    }

    this.scheduleTick();
  }

  scheduleTick(force: boolean = false) {
    setTimeout(() => this.tick(force), env.TICK_MS); // 30 Seconds
  }

  async triggerCallback(data: CallbackData) {
    if (!env.CALLBACK_URL) {
      return;
    }

    const url = new URL(env.CALLBACK_URL);
    const headers: HeadersInit = {};
    const requestInit: RequestInit = {
      method: env.CALLBACK_METHOD,
      credentials: env.CALLBACK_AUTH ? "include" : "omit",
      headers,
    };

    if (env.CALLBACK_AUTH === "basic") {
      headers["Authorization"] =
        `Basic ${btoa(`${env.CALLBACK_AUTH_USERNAME}:${env.CALLBACK_AUTH_PASSWORD}`)}`;
    }

    if (env.CALLBACK_METHOD === "GET") {
      if (data.v4) {
        url.searchParams.append("ipv4", data.v4.current ?? "");

        if (
          data.v4.previous !== undefined &&
          data.v4.previous !== data.v4.current
        ) {
          url.searchParams.append("previous_ipv4", data.v4.previous ?? "");
        }
      }
      if (data.v6) {
        url.searchParams.append("ipv6", data.v6.current ?? "");

        if (
          data.v6.previous !== undefined &&
          data.v6.previous !== data.v6.current
        ) {
          url.searchParams.append("previous_ipv6", data.v6.previous ?? "");
        }
      }
    } else if (env.CALLBACK_METHOD === "POST") {
      requestInit.body = JSON.stringify({ ...data });
      headers["Content-Type"] = "application/json";
    }

    await fetch(url, requestInit).catch(() => null);
  }
}

type CallbackData = {
  v4?: {
    previous?: string | null;
    current: string | null;
  };

  v6?: {
    previous?: string | null;
    current: string | null;
  };
};
