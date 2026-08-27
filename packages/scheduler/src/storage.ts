import fs from "fs/promises";
import z from "zod/v4";

const dataSchema = z.object({
  timestamp: z.coerce.date().nullable(),
  ipv4Address: z.string().nullable().optional(),
  ipv6Address: z.string().nullable().optional(),
});

export type Data = z.infer<typeof dataSchema>;

export async function saveStorage(storagePath: string, data: Data) {
  return await fs.writeFile(storagePath, JSON.stringify(data, null, 2));
}

export async function retrieveStorage(storagePath: string): Promise<Data> {
  return await fs
    .readFile(storagePath)
    .then<Data>((content) => dataSchema.parse(JSON.parse(content.toString())))
    .catch<Data>(() => ({
      timestamp: null,
      ipv4Address: null,
      ipv6Address: null,
    }));
}
