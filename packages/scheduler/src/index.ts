import path from "path";
import { retrieveIpv4, retrieveIpv6 } from "./ip.js";
import { retrieveStorage, saveStorage } from "./storage.js";
import { configDotenv } from "dotenv";
import z from "zod/v4";

configDotenv({
  quiet: true,
  path: path.resolve(process.cwd(), "..", "..", ".env"),
});
configDotenv({ quiet: true });

export interface Driver {
  connect(): Promise<void>;
  keepAlive(): Promise<void>;
  write(ipv4Address: string | null, ipv6Address: string | null): Promise<void>;
}

const env = z
  .object({
    TICK_MS: z.coerce.number().default(30_000), // 30 Seconds
    EXPIRY_MS: z.coerce.number().default(15 * 60 * 1000), // 15 Minutes
  })
  .parse(process.env);

export class Scheduler {
  protected storagePath: string;
  constructor(
    protected driver: Driver,
    storageDir: string,
  ) {
    this.storagePath = path.resolve(storageDir, "scheduler.json");
  }

  async start() {
    console.log("Starting scheduler...");
    await this.driver.connect();
    console.log("Driver connected.");
    await this.tick(true);
    this.scheduleTick();
  }

  async shouldAttemptUpdate(
    ipv4Address: string | null,
    ipv6Address: string | null,
  ): Promise<boolean> {
    if (!ipv4Address || !ipv6Address) {
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

  async update(ipv4Address: string | null, ipv6Address: string | null) {
    console.log("Retrieved IP addresses:");
    console.log("- IPV4:", ipv4Address);
    console.log("- IPV6:", ipv6Address, "\n");

    this.driver.write(ipv4Address, ipv6Address);

    await saveStorage(this.storagePath, {
      timestamp: new Date(),
      ipv4Address,
      ipv6Address,
    });
  }

  async tick(force: boolean = false) {
    const [ipv4Address, ipv6Address] = await Promise.all([
      retrieveIpv4(),
      retrieveIpv6(),
    ]);

    if (force || (await this.shouldAttemptUpdate(ipv4Address, ipv6Address))) {
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
