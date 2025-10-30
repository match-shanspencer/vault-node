import "./environment.js";
import { secrets } from "./secrets.js";

function doSomething() {
  console.log("Some secret:");
  console.log(secrets.getSecret("foo/bar"));
  console.log("Some other secret:");
  console.log(secrets.getSecret("spam/eggs"));
}

async function main() {
  await secrets.initialize(["foo/bar", "spam/eggs"]);

  doSomething();
}

main();
