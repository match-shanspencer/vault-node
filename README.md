# vault-node

Vault integration for NodeJS applications using ES Modules, or CommonJS.

## Install

```bash
yarn add @match/vault

# or

npm install @match/vault
```

## Usage

```ts
// secrets.ts
import { VaultCachedSecretsManager } from "@match/vault";

export const secrets = new VaultCachedSecretsManager({
  roleId: process.env.VAULT_APPROLE_ROLE_ID,
  secretId: process.env.VAULT_APPROLE_SECRET_ID,
  serviceUrl: process.env.VAULT_SERVICE_URL || "https://vault-q.i.mct360.com/",
  mountPoint: process.env.VAULT_MOUNT_POINT || "match_kv_qa1",
});
```

```ts
// index.ts
import { secrets } from "./secrets";
import { fetchData } from "./fetchData";

function doWork() {
  const myFirstSecret = secrets.getSecret("my/secret/path");
  // do something with the secret value
}

async function main() {
  // Fetch secrets from vault, and cache them for later use throughout the code.
  await secrets.initialize(["my/secret/path", "my/other/secret/path"]);
  await fetchData();
  doWork();
}

main();
```

```ts
// fetchData.ts
import { secrets } from "./secrets";

export const fetchData = async () => {
  const myOtherSecret = secrets.getSecret("my/other/secret/path");
  const response = await fetch("/api/endpoint", {
    headers: {
      Authorization: myOtherSecret,
    },
  });
}

```

## Demo

This demo requires VAULT_APPROLE_ROLE_ID, and VAULT_APPROLE_SECRET_ID environment variables.

> If you do not have Vault AppRole credentials, request them from the Ops Team - from there make a User [Access Request](https://jira.i.mct360.com/servicedesk/customer/portal/2) (UAR) for resource "Other" and give them the details about what you need.

```bash
# QA1 - see .env file for other Environment values
VAULT_APPROLE_ROLE_ID=your_role_id VAULT_APPROLE_SECRET_ID=your_secret_id yarn example
```
