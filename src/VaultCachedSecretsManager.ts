import { VaultClient } from "./VaultClient.js";
import { MemoryCache } from "./MemoryCache.js";

type Config = {
  roleId: string;
  mountPoint?: string;
  secretId: string;
  serviceUrl: string;
  client?: typeof VaultClient;
  cache?: MemoryCache;
};

type SecretResult<TData = unknown> = {
  error: Error | null;
  data: TData | null;
};

type SecretKeys = { cacheKey: string; vaultPath: string };

export class VaultCachedSecretsManager {
  cache: MemoryCache;

  initialized = false;

  client: VaultClient;

  config: Config;

  loaders = new Map<string, Promise<any>>();

  constructor(config: Partial<Config> = {}) {
    const Client = config.client || VaultClient;
    this.config = this.getConfig(config);
    this.client = new Client({ serviceUrl: this.config.serviceUrl });
    this.cache = config.cache || new MemoryCache();
  }

  private getConfig(config?: Partial<Config>) {
    const {
      VAULT_APPROLE_ROLE_ID,
      VAULT_APPROLE_SECRET_ID,
      VAULT_SERVICE_URL,
      VAULT_MOUNT_POINT,
    } = process.env;
    const roleId = config?.roleId || VAULT_APPROLE_ROLE_ID || "";
    const secretId = config?.secretId || VAULT_APPROLE_SECRET_ID || "";
    const serviceUrl = config?.serviceUrl || VAULT_SERVICE_URL || "";
    const mountPoint = config?.mountPoint || VAULT_MOUNT_POINT || "";

    return {
      roleId,
      secretId,
      serviceUrl,
      mountPoint,
    };
  }

  private keysFor(key: string): SecretKeys {
    return this.cache.keysFor(key);
  }

  private async login() {
    return await this.client.approleLogin({
      roleId: this.config.roleId,
      secretId: this.config.secretId,
    });
  }

  private fetchSecret<TData = unknown>(keys: SecretKeys): Promise<TData> {
    const existing = this.loaders.get(keys.cacheKey);

    if (existing) return existing;

    const loader: Promise<TData> = this.login()
      .then(() =>
        this.client.getSecret<TData>({
          secretPath: keys.vaultPath,
          mountPoint: this.config.mountPoint,
        })
      )
      .then((secret) => {
        this.cache.set<TData>(keys.cacheKey, secret);
        return secret;
      })
      .finally(() => this.loaders.delete(keys.cacheKey));

    this.loaders.set(keys.cacheKey, loader);
    return loader;
  }

  async fetchSecrets(secretPaths: string[]) {
    return Promise.all(
      secretPaths.map((secretPath) =>
        this.fetchSecret(this.keysFor(secretPath))
      )
    );
  }

  async initialize(secretPaths: string[]) {
    if (this.initialized) {
      return;
    }

    const pathsToFetch = this.cache.filter(secretPaths);

    await this.fetchSecrets(pathsToFetch);
    this.initialized = true;
  }

  getSecret<TData = unknown>(key: string): TData {
    const { cacheKey } = this.keysFor(key);
    const cached = this.cache.get<TData>(cacheKey);

    if (cached !== undefined) {
      return cached;
    }

    throw new Error(
      `Secret "${key}" is not cached. Add it to initialize(), or use getSecretAsync()`
    );
  }

  tryGetSecret<TData = unknown>(key: string): SecretResult<TData> {
    try {
      const secret = this.getSecret<TData>(key);
      return { data: secret, error: null };
    } catch (error) {
      const err = new Error("Failed to get secret", { cause: error });
      return { data: null, error: err };
    }
  }

  async getSecretAsync<TData = unknown>(key: string): Promise<TData> {
    const { cacheKey, vaultPath } = this.keysFor(key);
    const cached = this.cache.get<TData>(cacheKey);

    if (cached !== undefined) {
      return cached;
    }

    return await this.fetchSecret<TData>({ cacheKey, vaultPath });
  }

  async tryGetSecretAsync<TData = unknown>(
    key: string
  ): Promise<SecretResult<TData>> {
    try {
      const secret = await this.getSecretAsync<TData>(key);
      return { data: secret, error: null };
    } catch (error) {
      const err = new Error("Failed to get secret", { cause: error });
      return { data: null, error: err };
    }
  }
}
