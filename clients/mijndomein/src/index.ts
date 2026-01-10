import { Scheduler } from "@packages/scheduler";
import { firefox } from "playwright";
import { MijnDomeinCredentials, MijnDomeinDriver } from "./driver.js";
import z from "zod/v4";
import path from "path";
import fs from "fs/promises";

const env = z
  .object({
    MIJNDOMEIN_USERNAME: z.string().email(),
    MIJNDOMEIN_PASSWORD: z.string(),
    MIJNDOMEIN_OTP: z.string().min(6).max(6).nullable(),
    MIJNDOMEIN_RECORDS: z.string(),
  })
  .parse(process.env);

export const credentials: MijnDomeinCredentials = {
  username: env.MIJNDOMEIN_USERNAME,
  password: env.MIJNDOMEIN_PASSWORD,
  otp: env.MIJNDOMEIN_OTP,
};

const recordsSchema = z.record(
  z.coerce.number().int(),
  z.union([
    z.array(
      z.union([
        z.tuple([
          z.string(),
          z.union([z.literal("ipv4"), z.literal("ipv6"), z.literal("both")]),
        ]),
        z.string(),
      ]),
    ),
    z.string(),
  ]),
);

export const records: Record<string, [string, string][]> = {};
for (const [dnsPackageId, recs] of Object.entries(
  recordsSchema.parse(JSON.parse(env.MIJNDOMEIN_RECORDS)),
)) {
  const normalizedRecords: [string, string][] = [];
  records[dnsPackageId] = normalizedRecords;

  if (typeof recs === "string") {
    normalizedRecords.push([recs, "ipv4"]);
    normalizedRecords.push([recs, "ipv6"]);
    continue;
  }

  for (const rec of recs) {
    if (typeof rec === "string") {
      normalizedRecords.push([rec, "ipv4"]);
      normalizedRecords.push([rec, "ipv6"]);
    } else if (rec[1] === "both") {
      normalizedRecords.push([rec[0], "ipv4"]);
      normalizedRecords.push([rec[0], "ipv6"]);
    } else {
      normalizedRecords.push([rec[0], rec[1]]);
    }
  }
}

const storagePath =
  process.env.STORAGE_MODE === "docker"
    ? path.resolve(import.meta.dirname, "..", "..", "..", "storage")
    : path.resolve(import.meta.dirname, "..", "storage");

await fs.mkdir(storagePath, { recursive: true }).catch(() => null);

const browser = await firefox.launchPersistentContext(
  path.resolve(storagePath, "browser"),
);

const driver = new MijnDomeinDriver(browser, credentials, records);

new Scheduler(
  driver,
  storagePath,
).start();
