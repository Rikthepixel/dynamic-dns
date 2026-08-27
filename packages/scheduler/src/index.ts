import path from "path";
import { retrieveIpv4, retrieveIpv6 } from "./ip/index.js";
import { retrieveStorage, saveStorage } from "./storage.js";
import { configDotenv } from "dotenv";
import z from "zod/v4";
import { Result, ResultType } from "./helpers/result.js";
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
  ): Promise<void>;
}

const env = z
  .object({
    TICK_MS: z.coerce.number().default(30_000), // 30 Seconds
    EXPIRY_MS: z.coerce.number().default(15 * 60 * 1000), // 15 Minutes
    IP_PROVIDERS: z
      .string()
      .optional()
      .transform((val) => (val ? JSON.parse(val) : val))
      .pipe(
        z
          .array(
            z.object({ ipv4: z.url().nullable(), ipv6: z.url().nullable() }),
          )
          .or(z.object({ ipv4: z.url().nullable(), ipv6: z.url().nullable() }))
          .optional(),
      ),
  })
  .parse(process.env);

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

  async shouldAttemptUpdate(
    ipv4Address?: string | null,
    ipv6Address?: string | null,
  ): Promise<boolean> {
    if (ipv4Address === undefined && ipv6Address === undefined) {
      return false;
    }

    const previous = await retrieveStorage(this.storagePath);
    const now = new Date();

    const expired = previous.timestamp
      ? now.getTime() - previous.timestamp.getTime() > env.EXPIRY_MS
      : true;

    return (
      ipv4Address !== previous.ipv4Address ||
      ipv6Address !== previous.ipv6Address ||
      expired
    );
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

    this.driver.write(
      ipv4Address.unwrapOr(undefined),
      ipv6Address.unwrapOr(undefined),
    );

    await saveStorage(this.storagePath, {
      timestamp: new Date(),
      ipv4Address: ipv4Address.unwrapOr(undefined),
      ipv6Address: ipv6Address.unwrapOr(undefined),
    });
  }

  async tick(force: boolean = false) {
    const [ipv4Address, ipv6Address] = await Promise.all([
      retrieveIpv4(),
      retrieveIpv6(),
    ]);

    if (
      force ||
      (await this.shouldAttemptUpdate(
        ipv4Address.unwrapOr(undefined),
        ipv6Address.unwrapOr(undefined),
      ))
    ) {
      this.update(ipv4Address, ipv6Address);
    } else {
      await this.driver.keepAlive(); // Keep session alive to prevent logout
    }

    this.scheduleTick();
  }

  scheduleTick(force: boolean = false) {
    setTimeout(() => this.tick(force), env.TICK_MS); // 30 Seconds
  }
}
