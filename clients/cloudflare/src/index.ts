import fs from "fs/promises";
import path from "path";
import { Scheduler } from "@packages/scheduler";
import { CloudflareDriver } from "./driver.js";
import { z } from "zod/v4";

const env = z
  .object({
    CLOUDFLARE_API_TOKEN: z.string().min(1),
    CLOUDFLARE_RECORDS: z.string().min(1),
  })
  .parse(process.env);

const storagePath =
  process.env.STORAGE_MODE === "docker"
    ? path.resolve(import.meta.dirname, "..", "..", "..", "storage")
    : path.resolve(import.meta.dirname, "..", "storage");

console.log("Using storage path:", storagePath);

await fs.mkdir(storagePath, { recursive: true }).catch(() => null);

const driver = new CloudflareDriver(
  env.CLOUDFLARE_API_TOKEN,
  JSON.parse(env.CLOUDFLARE_RECORDS),
);

const scheduler = new Scheduler(driver, storagePath);
scheduler.start();
