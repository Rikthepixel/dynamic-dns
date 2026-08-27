import { Result } from "src/helpers/result.js";
import { CanIHazIpIpProvider } from "./providers/can-i-haz-ip.js";
import { CloudflareIpProvider } from "./providers/cloudflare.js";
import { IpifyIpProvider } from "./providers/ipify.js";
import { IpProvider } from "./providers/base.js";

const BASE_PROVIDERS = [
  new CloudflareIpProvider(),
  new IpifyIpProvider(),
  new CanIHazIpIpProvider(),
];

class NoAvailableProvidersError extends Error {
  constructor() {
    super("All providers threw an error");
  }
}

export async function retrieveIpv4(
  providers: IpProvider[] = [],
): Promise<Result<string | null, NoAvailableProvidersError | Error>> {
  for (const provider of [...providers, ...BASE_PROVIDERS]) {
    const result = await provider.retrieveIpv4();
    if (result.isError) continue;
    return result;
  }
  throw new NoAvailableProvidersError();
}

export async function retrieveIpv6(
  providers: IpProvider[] = [],
): Promise<Result<string | null, NoAvailableProvidersError | Error>> {
  for (const provider of [...providers, ...BASE_PROVIDERS]) {
    const result = await provider.retrieveIpv6();
    if (result.isError) continue;
    return result;
  }
  throw new NoAvailableProvidersError();
}
