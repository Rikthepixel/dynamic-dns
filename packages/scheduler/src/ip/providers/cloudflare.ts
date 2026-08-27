import {
  errorIntoResult,
  Result,
  valueIntoResult,
} from "../../helpers/result.js";
import { IpProvider, IpTypeNotImplementedError } from "./base.js";
import { exec } from "child_process";

export class CloudflareIpProvider extends IpProvider {
  retrieveIpv4(): Promise<Result<string | null>> {
    return new Promise((resolve) => {
      const process = exec(
        "dig @alex.ns.cloudflare.com chaos txt myip.cloudflare +short",
        (err, stdout, stderr) => {
          if (err) {
            resolve(errorIntoResult(err));
            process.kill();
            return;
          }
          if (stderr.length > 0) {
            resolve(errorIntoResult(new Error(stderr)));
            process.kill();
            return;
          }

          const ip = stdout
            .trim()
            .match(/^"(.*)"$/)
            ?.at(1);

          if (!ip) {
            resolve(errorIntoResult(new Error("Couldn't parse output")));
            process.kill();
            return;
          }

          resolve(valueIntoResult(ip));
          process.kill();
        },
      );
    });
  }
  retrieveIpv6(): Promise<Result<string | null>> {
    throw new IpTypeNotImplementedError("v6");
  }
}
