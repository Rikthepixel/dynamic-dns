import { Driver } from "@packages/scheduler";
import { BrowserContext, Page } from "playwright";

export type MijnDomeinCredentials = {
  username: string;
  password: string;
  otp: string | null;
};

export class MijnDomeinDriver implements Driver {
  constructor(
    protected browser: BrowserContext,
    protected credentials: MijnDomeinCredentials,
    protected records: Record<string, [string, string][]>,
  ) {}

  async connect() {
    const page = await this.browser.newPage();

    await page.goto("https://www.mijndomein.nl/account/product");

    const loggedIn = await page
      .waitForURL(
        (url) =>
          url.pathname === "/auth" && url.hostname === "www.mijndomein.nl",
        { timeout: 2000 },
      )
      .then(() => false)
      .catch(() => true);

    // if it redirects to login page, we need to login
    if (loggedIn) {
      await page.close();
      return;
    }

    await page.waitForURL((url) => url.searchParams.has("login_challenge"));
    await page
      .locator('form input[type="email"]')
      .fill(this.credentials.username);
    await page
      .locator('form input[type="password"]')
      .fill(this.credentials.password);

    await page
      .locator('form button :text("Inloggen op Mijn Account")')
      .click({ delay: Math.floor(Math.random() * 200) + 100 });

    const twoFactorDialog = page.locator(
      'form:has-text("Verificatiecode"):has(input[type="text"])',
    );
    await twoFactorDialog.waitFor();

    if (this.credentials.otp === null) {
      throw new Error("OTP required for login.");
    }

    twoFactorDialog.locator('input[type="text"]').fill(this.credentials.otp);
    twoFactorDialog.locator('button :text("Inloggen")').click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/account/product" &&
        url.hostname === "www.mijndomein.nl",
    );

    await page.close();
  }

  public async write(ipv4Address: string | null, ipv6Address: string | null) {
    for (const [dnsPackageId, dynamicRecords] of Object.entries(this.records)) {
      const dnsPackage = await this.package(parseInt(dnsPackageId));
      const topLevelDomain = await dnsPackage.topLevelDomain();

      if (!dynamicRecords.every(([name]) => name.endsWith(topLevelDomain))) {
        console.error(
          `Records do not belong to the top level domain ${topLevelDomain}`,
        );
        continue;
      }

      const records = await dnsPackage.records();
      let changed = false;

      for (const [dynamicRecordName, dynamicRecordType] of dynamicRecords) {
        const existingCName = records.find(
          (record) =>
            record.type === "CNAME" && record.name === dynamicRecordName,
        );

        if (existingCName) {
          console.error(
            `Package ${dnsPackageId}: Skipping record "${dynamicRecordName}", already exists as CNAME, remove existing record.`,
          );
          continue;
        }

        if (ipv4Address && dynamicRecordType === "ipv4") {
          const existingIpv4 = records.find(
            (record) =>
              record.type === "A" && record.name === dynamicRecordName,
          );

          if (existingIpv4) {
            if (existingIpv4.content === ipv4Address) {
              continue;
            }
            existingIpv4.content = ipv4Address;
            await dnsPackage.setRecord(existingIpv4);
            changed = true;
            console.log(
              `Package ${dnsPackageId}: Updated 'A' record for "${dynamicRecordName}" to ${ipv4Address}`,
            );
          } else {
            await dnsPackage.addRecord({
              type: "A",
              name: dynamicRecordName,
              content: ipv4Address,
            });
            changed = true;
            console.log(
              `Package ${dnsPackageId}: Added 'A' record for "${dynamicRecordName}" to ${ipv4Address}`,
            );
          }
        }

        if (ipv6Address && dynamicRecordType === "ipv6") {
          const existingIpv6 = records.find(
            (record) =>
              record.type === "AAAA" && record.name === dynamicRecordName,
          );
          if (existingIpv6) {
            if (existingIpv6.content === ipv6Address) {
              continue;
            }

            existingIpv6.content = ipv6Address;
            await dnsPackage.setRecord(existingIpv6);
            changed = true;
            console.log(
              `Package ${dnsPackageId}: Updated 'AAAA' record for "${dynamicRecordName}" to ${ipv6Address}`,
            );
          } else {
            await dnsPackage.addRecord({
              type: "AAAA",
              name: dynamicRecordName,
              content: ipv6Address,
            });
            changed = true;
            console.log(
              `Package ${dnsPackageId}: Added 'AAAA' record for "${dynamicRecordName}" to ${ipv6Address}`,
            );
          }
        }
      }

      if (changed) {
        await dnsPackage.saveChanges();
      }

      await dnsPackage.close();
    }
  }

  async keepAlive() {
    const page = await this.browser.newPage();
    await page.goto("https://www.mijndomein.nl/account/product");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.close();
  }

  async package(id: number): Promise<DnsPackage> {
    const page = await this.browser.newPage();
    const url = new URL(
      "/portaal/dns-instellingen",
      "https://mijnaccount.mijndomein.nl",
    );
    url.searchParams.set("packageId", id.toString());
    await page.goto(url.toString());

    // If not redirected to auth page, we are logged in
    const loggedIn = await page
      .waitForURL(
        (url) =>
          url.pathname === "/auth" && url.hostname === "www.mijndomein.nl",
        { timeout: 1000 },
      )
      .then(() => false)
      .catch(() => true);

    if (!loggedIn) {
      throw new Error("Unauthenticated.");
    }

    return new DnsPackage(page);
  }
}

export type DnsRecord = {
  index: number;
  type: string;
  name: string;
  content: string;
};

class DnsPackage {
  protected _topLevelDomain: string | null = null;
  protected _records: DnsRecord[] | null = null;

  constructor(protected page: Page) {}

  async refresh() {
    await this.page.reload();
    this._topLevelDomain = null;
    this._records = null;
  }

  async topLevelDomain(): Promise<string> {
    if (this._topLevelDomain) {
      return this._topLevelDomain;
    }

    const topLevelDomainElement = this.page
      .getByRole("heading", { level: 4 })
      .filter({ hasText: /^DNS regels voor/ });
    await topLevelDomainElement.waitFor();
    const text = await topLevelDomainElement.textContent();
    const topLevelDomain = text?.replace("DNS regels voor", "").trim();

    if (!topLevelDomain) {
      throw new Error("Could not determine top level domain.");
    }

    this._topLevelDomain = topLevelDomain;
    return topLevelDomain;
  }

  async records(): Promise<DnsRecord[]> {
    if (this._records) {
      return this._records;
    }

    const rows = await this.page.locator(".dnseditor_row").all();

    const recordPromises = rows.map(async (row, index) => {
      const [type, name, content] = await Promise.all([
        row.locator("select").first().inputValue(),
        row.locator("input").nth(0).inputValue(),
        row.locator("input").nth(1).inputValue(),
      ]);

      return {
        index,
        type,
        name,
        content,
      };
    });

    const records = await Promise.all(recordPromises);
    this._records = records;
    return records;
  }

  async setRecord(record: DnsRecord) {
    const row = this.page.locator(".dnseditor_row").nth(record.index);

    const type = await row.locator("select").first().inputValue();
    if (type !== record.type) {
      await row.locator("select").first().selectOption(record.type);
    }

    const [name, content] = await Promise.all([
      row.locator("input").nth(0).inputValue(),
      row.locator("input").nth(1).inputValue(),
    ]);

    if (name !== record.name) {
      await row.locator("input").nth(0).fill(record.name);
    }

    if (content !== record.content) {
      await row.locator("input").nth(1).fill(record.content);
    }
    this._records = null;
  }

  async removeRecord(index: number) {
    const row = this.page.locator(".dnseditor_row").nth(index);
    await row.locator(".dns-delete-button i").click();
  }

  async addRecord(record: Omit<DnsRecord, "index">) {
    await this.page.locator(".dns-add-button i").click();
    this._records = null;
    const row = this.page.locator(".dnseditor_row").last();

    await row.locator("select").first().selectOption(record.type);
    await row.locator("input").nth(0).fill(record.name);
    await row.locator("input").nth(1).fill(record.content);
  }

  async saveChanges() {
    await this.page.locator("button#dnsedit_submit").click();
  }

  async close() {
    await this.page.close();
  }
}
