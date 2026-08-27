import {
  errorIntoResult,
  promiseIntoResult,
  Result,
} from "../../helpers/result.js";
import {
  IpProvider,
  IpTypeNotImplementedError,
  isIpv6Error,
  parsePlainTextResponse,
} from "./base.js";

export class PlaintextProvider extends IpProvider {
  constructor(
    protected ipv4Url: string | null,
    protected ipv6Url: string | null,
  ) {
    super();
  }

  async retrieveIpv4(): Promise<Result<string | null>> {
    if (!this.ipv4Url) {
      return errorIntoResult(new IpTypeNotImplementedError("v4"));
    }
    return promiseIntoResult(
      fetch(this.ipv4Url).then((res) => parsePlainTextResponse(res)),
    );
  }

  async retrieveIpv6(): Promise<Result<string | null>> {
    if (!this.ipv6Url) {
      return errorIntoResult(new IpTypeNotImplementedError("v6"));
    }

    return promiseIntoResult(
      fetch(this.ipv6Url)
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
