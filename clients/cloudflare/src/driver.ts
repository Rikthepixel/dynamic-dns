import { Driver } from "@packages/scheduler";

type DnsRecord = {
  id: string;
  name: string;
  ttl: number;
  type: "A" | "AAAA" | "CNAME" | (string & {});
  comment?: string;
  content?: string;
  proxied?: boolean;
};

type PostDnsRecord = Omit<DnsRecord, "id">;
type DeleteDnsRecord = Pick<DnsRecord, "id">;

const TYPE_TO_DNS_TYPE: Record<string, string[]> = {
  both: ["A", "AAAA"],
  ipv4: ["A"],
  ipv6: ["AAAA"],
};

export class CloudflareDriver implements Driver {
  constructor(
    protected apiToken: string,
    protected records: Record<string, [string, string][]>,
  ) {}

  async connect(): Promise<void> {
    // No need to connect for Cloudflare
    return;
  }

  async keepAlive(): Promise<void> {
    // Not needed for Cloudflare
    return;
  }

  protected async zoneRecords(zoneId: string) {
    return await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      { headers: { Authorization: `Bearer ${this.apiToken}` } },
    )
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            `Failed to fetch DNS records: ${res.status} ${res.statusText}`,
          );
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data.errors) && data.errors.length > 0) {
          throw new Error(
            `API Error: ${data.errors
              .map((err: any) => err.message)
              .join(", ")}`,
          );
        }

        return data.result as DnsRecord[];
      });
  }

  protected async batchRecords(
    zoneId: string,
    posts: PostDnsRecord[],
    patches: DnsRecord[],
    deletes: DeleteDnsRecord[] = [],
  ) {
    if (posts.length === 0 && patches.length === 0 && deletes.length === 0) {
      return;
    }

    await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/batch`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiToken}`,
        },
        body: JSON.stringify({ posts, patches, deletes }),
      },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to batch DNS records: ${response.status} ${response.statusText}`,
          );
        }
        return response.json();
      })
      .then((data) => {
        if (Array.isArray(data.errors) && data.errors.length > 0) {
          throw new Error(
            `API Error: ${data.errors
              .map((err: any) => err.message)
              .join(", ")}`,
          );
        }
      });
  }

  async write(
    ipv4Address: string | null,
    ipv6Address: string | null,
  ): Promise<void> {
    for (const [zoneId, dynamicRecords] of Object.entries(this.records)) {
      const patches: DnsRecord[] = [];
      const posts: PostDnsRecord[] = [];
      const deletes: DeleteDnsRecord[] = [];

      const records = await this.zoneRecords(zoneId);

      for (const [name, type] of dynamicRecords) {
        const recordTypes = TYPE_TO_DNS_TYPE[type];
        if (!recordTypes) {
          continue;
        }

        for (const recordType of recordTypes) {
          const hasCName = records.some(
            (record) => record.type === "CNAME" && record.name === name,
          );
          if (hasCName) {
            console.log(
              `Zone ${zoneId}: Skipping record "${name}", already exists as CNAME, remove existing record.`,
            );

            continue;
          }

          const existingRecord = records.find(
            (record) => record.type === recordType && record.name === name,
          );

          const content = recordType === "A" ? ipv4Address : ipv6Address;
          if (existingRecord && existingRecord.content === content) {
            continue;
          }

          if (!content) {
            if (existingRecord) {
              deletes.push({ id: existingRecord.id });
              console.log(
                "Deleting record",
                existingRecord.type,
                existingRecord.name,
              );
            }
            continue;
          } else if (existingRecord) {
            existingRecord.content = content;
            existingRecord.comment = "Dynamic DNS Client";
            patches.push(existingRecord);

            console.log(
              "Updating record",
              recordType,
              existingRecord.name,
              content,
            );
            continue;
          }

          posts.push({
            type: recordType,
            name,
            content: content,
            ttl: 1,
            comment: "Dynamic DNS Client",
          });

          console.log("Creating record", recordType, name, content);
        }
      }

      await this.batchRecords(zoneId, posts, patches, deletes);
    }
  }
}
