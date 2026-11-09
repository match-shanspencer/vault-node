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
  roleId: "YOUR_APP_ROLE_ID",
  secretId: "YOUR_APP_SECRET_ID",
  serviceUrl: "https://your_vault_instance_url/",
  mountPoint: "YOUR_MOUNT_POINT_NAME",
});
```

### Sync

> All secrets need to be fetched with initialize() before calling getSecret() or tryGetSecret()

#### getSecret

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
};
```

#### tryGetSecret

```ts
import { secrets } from "./secrets";

async function main() {
  // Fetch secrets from vault, and cache them for later use throughout the code.
  await secrets.initialize(["my/secret/path", "my/other/secret/path"]);

  const mySecret = secrets.tryGetSecret("my/secret/path");

  if (mySecret.data) {
    console.log(mySecret.data);
  }
}
```

### Async

#### getAsync

```ts
import { secrets } from "./secrets";

async function doWork() {
  try {
    const secret = await secrets.getSecretAsync("my/secret/path");
    console.log(secret);
  } catch (err) {
    // do something error
  }
}
```

#### tryGetAsync

```ts
import { secrets } from "./secrets";

async function doWork() {
  const secret = await secrets.tryGetSecretAsync("my/secret/path");

  if (secret.data) {
    console.log(secret.data);
  }
}
```

## Custom cache

> Hydrate from env values. Fetch missing values from vault.

```ts
import { VaultCachedSecretsManager, MemoryCache } from "@match/vault";

const envValuesMap = new Map([
  ["myCustomCacheKey", process.env.CUSTOM_CACHE_VALUE],
]);

class EnvCache extends MemoryCache {
  keysFor(key: string) {
    switch (key) {
      case "myCustomCacheKey": {
        return {
          cacheKey: key,
          vaultPath: "some/path/in/vault",
        };
      }
    }

    return {
      cacheKey: key,
      vaultPath: key,
    };
  }
}

const secrets = new VaultCachedSecretsManager({
  roleId: "YOUR_APP_ROLE_ID",
  secretId: "YOUR_APP_SECRET_ID",
  serviceUrl: "https://your_vault_instance_url/",
  mountPoint: "YOUR_MOUNT_POINT_NAME",
  cache: new EnvCache(envValuesMap),
});
```
