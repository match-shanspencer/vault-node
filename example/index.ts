import "./environment.js";
import { secrets } from "./secrets.js";

function doSomething() {
  console.log("okapi/api secrets:");
  console.log(secrets.getSecret("okapi/api"));
  console.log("shared/auth/zendesk/messaging secrets:");
  console.log(secrets.getSecret("shared/auth/zendesk/messaging"));
}

async function main() {
  await secrets.initialize(["okapi/api", "shared/auth/zendesk/messaging"]);

  doSomething();
}

main();
