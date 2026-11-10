import { afterEach, describe, expect, test } from "bun:test";
import { MemoryCache } from "../src/MemoryCache.js";
import { VaultCachedSecretsManager } from "../src/VaultCachedSecretsManager.js";
import { VaultClient } from "../src/VaultClient.js";
import { VaultError } from "../src/VaultError.js";

class FakeVaultClient extends VaultClient {
  secretValues = new Map<string, unknown>();

  loginCount = 0;

  requestedPaths: string[] = [];

  override async approleLogin() {
    this.loginCount += 1;
  }

  override async getSecret<TData = unknown>({
    secretPath,
  }: {
    secretPath: string;
    mountPoint?: string;
  }): Promise<TData> {
    this.requestedPaths.push(secretPath);
    await Promise.resolve();

    if (!this.secretValues.has(secretPath)) {
      const error = new VaultError("Failed to get secret from vault");
      error.status = 404;
      error.secretPath = secretPath;
      throw error;
    }

    return this.secretValues.get(secretPath) as TData;
  }
}

function createManager(
  secretValues: Record<string, unknown>,
  cache?: MemoryCache
) {
  const manager = new VaultCachedSecretsManager({
    roleId: "role-id",
    secretId: "secret-id",
    serviceUrl: "https://vault.test/",
    mountPoint: "kv",
    client: FakeVaultClient,
    cache,
  });

  if (!(manager.client instanceof FakeVaultClient)) {
    throw new Error("Expected the manager to use FakeVaultClient");
  }

  manager.client.secretValues = new Map(Object.entries(secretValues));

  return { manager, client: manager.client };
}

describe("VaultCachedSecretsManager config", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("reads missing config values from env vars", () => {
    process.env.VAULT_APPROLE_ROLE_ID = "env-role";
    process.env.VAULT_APPROLE_SECRET_ID = "env-secret";
    process.env.VAULT_SERVICE_URL = "https://env.vault.test/";
    process.env.VAULT_MOUNT_POINT = "env-mount";

    const manager = new VaultCachedSecretsManager();

    expect(manager.config).toEqual({
      roleId: "env-role",
      secretId: "env-secret",
      serviceUrl: "https://env.vault.test/",
      mountPoint: "env-mount",
    });
    expect(manager.client.serviceUrl).toBe("https://env.vault.test/");
  });

  test("prefers explicit config over env vars", () => {
    process.env.VAULT_APPROLE_ROLE_ID = "env-role";

    const manager = new VaultCachedSecretsManager({ roleId: "explicit-role" });

    expect(manager.config.roleId).toBe("explicit-role");
  });
});

describe("VaultCachedSecretsManager.initialize", () => {
  test("fetches every path and caches it", async () => {
    const { manager, client } = createManager({
      "my/secret": { apiKey: "abc" },
      "my/other": { apiKey: "def" },
    });

    await manager.initialize(["my/secret", "my/other"]);

    expect(client.requestedPaths).toEqual(["my/secret", "my/other"]);
    expect(manager.getSecret("my/secret")).toEqual({ apiKey: "abc" });
    expect(manager.getSecret("my/other")).toEqual({ apiKey: "def" });
  });

  test("skips keys that are already in the cache", async () => {
    const cache = new MemoryCache(new Map([["hydrated", "from-env"]]));
    const { manager, client } = createManager(
      { hydrated: "from-vault", "my/secret": "abc" },
      cache
    );

    await manager.initialize(["hydrated", "my/secret"]);

    expect(client.requestedPaths).toEqual(["my/secret"]);
    expect(manager.getSecret("hydrated")).toBe("from-env");
  });

  test("rejects when a fetch fails, and a retry fetches only the missing keys", async () => {
    const { manager, client } = createManager({ "my/secret": "abc" });

    await expect(manager.initialize(["my/secret", "my/missing"])).rejects.toBeInstanceOf(VaultError);

    client.secretValues.set("my/missing", "found");
    client.requestedPaths = [];
    await manager.initialize(["my/secret", "my/missing"]);

    expect(client.requestedPaths).toEqual(["my/missing"]);
    expect(manager.getSecret("my/missing")).toBe("found");
  });
});

describe("VaultCachedSecretsManager.getSecret", () => {
  test("throws with the key name when the key is not cached", () => {
    const { manager } = createManager({});

    expect(() => manager.getSecret("my/secret")).toThrow(
      'Secret "my/secret" is not cached'
    );
  });

  test("tryGetSecret returns the data when the key is cached", async () => {
    const { manager } = createManager({ "my/secret": "abc" });
    await manager.initialize(["my/secret"]);

    expect(manager.tryGetSecret("my/secret")).toEqual({ data: "abc", error: null });
  });

  test("tryGetSecret returns an error with the cause when the key is not cached", () => {
    const { manager } = createManager({});

    const result = manager.tryGetSecret("my/secret");

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.cause).toBeInstanceOf(Error);
  });
});

describe("VaultCachedSecretsManager.getSecretAsync", () => {
  test("fetches a missing key and caches it", async () => {
    const { manager, client } = createManager({ "my/secret": "abc" });

    expect(await manager.getSecretAsync("my/secret")).toBe("abc");
    expect(await manager.getSecretAsync("my/secret")).toBe("abc");

    expect(client.requestedPaths).toEqual(["my/secret"]);
    expect(manager.getSecret("my/secret")).toBe("abc");
  });

  test("calls login before each fetch", async () => {
    const { manager, client } = createManager({ "my/secret": "abc", "my/other": "def" });

    await manager.getSecretAsync("my/secret");
    await manager.getSecretAsync("my/other");

    expect(client.loginCount).toBe(2);
  });

  test("concurrent calls for one key share one request", async () => {
    const { manager, client } = createManager({ "my/secret": "abc" });

    const secrets = await Promise.all([
      manager.getSecretAsync("my/secret"),
      manager.getSecretAsync("my/secret"),
    ]);

    expect(secrets).toEqual(["abc", "abc"]);
    expect(client.requestedPaths).toEqual(["my/secret"]);
  });

  test("shares the request that initialize already started", async () => {
    const { manager, client } = createManager({ "my/secret": "abc" });

    const [, secret] = await Promise.all([
      manager.initialize(["my/secret"]),
      manager.getSecretAsync("my/secret"),
    ]);

    expect(secret).toBe("abc");
    expect(client.requestedPaths).toEqual(["my/secret"]);
  });

  test("retries after a failed fetch", async () => {
    const { manager, client } = createManager({});

    await expect(manager.getSecretAsync("my/secret")).rejects.toBeInstanceOf(VaultError);

    client.secretValues.set("my/secret", "abc");

    expect(await manager.getSecretAsync("my/secret")).toBe("abc");
    expect(client.requestedPaths).toEqual(["my/secret", "my/secret"]);
  });

  test("tryGetSecretAsync returns an error with the cause when the fetch fails", async () => {
    const { manager } = createManager({});

    const result = await manager.tryGetSecretAsync("my/secret");

    expect(result.data).toBeNull();
    expect(result.error?.cause).toBeInstanceOf(VaultError);
  });
});

describe("VaultCachedSecretsManager with a custom keysFor", () => {
  class AliasCache extends MemoryCache {
    override keysFor(key: string) {
      if (key === "apiKey") {
        return { cacheKey: key, vaultPath: "services/api/key" };
      }

      return super.keysFor(key);
    }
  }

  test("fetches from the vault path and caches under the cache key", async () => {
    const cache = new AliasCache();
    const { manager, client } = createManager({ "services/api/key": "abc" }, cache);

    await manager.initialize(["apiKey"]);

    expect(client.requestedPaths).toEqual(["services/api/key"]);
    expect(cache.get("apiKey")).toBe("abc");
    expect(manager.getSecret("apiKey")).toBe("abc");
  });
});
