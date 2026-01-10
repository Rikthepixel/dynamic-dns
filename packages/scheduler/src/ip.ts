type IpifyResponse = { ip: string };

const IPV4_API_URL = "https://api.ipify.org?format=json";
const IPV6_API_URL = "https://api6.ipify.org?format=json";

export async function retrieveIpv4(): Promise<string> {
  return await fetch(IPV4_API_URL)
    .then<IpifyResponse>((res) => res.json())
    .then((data) => data.ip);
}

export async function retrieveIpv6(): Promise<string | null> {
  return await fetch(IPV6_API_URL)
    .then<IpifyResponse>((res) => res.json())
    .then((data) => data.ip)
    .catch(() => null);
}
