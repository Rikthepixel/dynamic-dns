import { Result } from "../../helpers/result.js";

export class IpTypeNotImplementedError extends Error {
  constructor(public ipType: "v4" | "v6") {
    super(`Provider doesn't supply a IP${ipType}.`);
  }
}

export abstract class IpProvider {
  /** @throws {IpTypeNotImplementedError} */
  abstract retrieveIpv4(): Promise<Result<string | null>>;
  /** @throws {IpTypeNotImplementedError} */
  abstract retrieveIpv6(): Promise<Result<string | null>>;
}

export async function parsePlainTextResponse(response: Response) {
  const content = await response.text();
  if (!response.ok) {
    throw new Error(content);
  }
  return content;
}

export function isIpv6Error(err: unknown): err is TypeError {
  return (
    err instanceof TypeError &&
    err.cause instanceof Error &&
    "syscall" in err.cause
  );
}
