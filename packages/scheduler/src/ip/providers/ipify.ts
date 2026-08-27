import { promiseIntoResult, Result } from "../../helpers/result.js";
import { IpProvider, isIpv6Error, parsePlainTextResponse } from "./base.js";

export class IpifyIpProvider extends IpProvider {
  protected IPV4_API_URL = "https://api.ipify.org";
  async retrieveIpv4(): Promise<Result<string | null>> {
    return promiseIntoResult(
      fetch(this.IPV4_API_URL).then((res) => parsePlainTextResponse(res)),
    );
  }

  protected IPV6_API_URL = "https://api6.ipify.org";
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
