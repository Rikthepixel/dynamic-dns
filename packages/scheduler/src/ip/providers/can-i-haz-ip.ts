import { promiseIntoResult, Result } from "src/helpers/result.js";
import { IpProvider, isIpv6Error, parsePlainTextResponse } from "./base.js";

export class CanIHazIpIpProvider extends IpProvider {
  protected IPV4_API_URL = "https://icanhazip.com";
  async retrieveIpv4(): Promise<Result<string | null>> {
    return promiseIntoResult(
      fetch(this.IPV4_API_URL).then((res) => parsePlainTextResponse(res)),
    );
  }

  protected IPV6_API_URL = "https://ipv6.icanhazip.com";
  async retrieveIpv6(): Promise<Result<string | null>> {
    return promiseIntoResult(
      fetch(this.IPV6_API_URL)
        .then((res) => parsePlainTextResponse(res))
        .catch((err) => {
          // We don't have one
          if (isIpv6Error(err)) {
            return null;
          }

          throw err;
        }),
    );
  }
}
