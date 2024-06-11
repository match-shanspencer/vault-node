import { VaultClient } from "./VaultClient.js";

type Config = {
  roleId: string;
  mountPoint?: string;
  secretId: string;
  serviceUrl: string;
  client?: typeof VaultClient;
};

export class VaultCachedSecretsManager {
  cache = new Map<string, any>();

  initialized = false;

  client: VaultClient;

  config: Config;

  constructor(config: Partial<Config> = {}) {
    const Client = config.client || VaultClient;
    this.config = this.getConfig(config);
    this.client = new Client({ serviceUrl: this.config.serviceUrl });
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

  async initialize(secretPaths: string[]) {
    if (this.initialized) {
      return;
    }

    await this.client.approleLogin({
      roleId: this.config.roleId,
      secretId: this.config.secretId,
    });

    for (const secretPath of secretPaths) {
      const data = await this.client.getSecret({
        secretPath,
        mountPoint: this.config.mountPoint,
      });

      this.cache.set(secretPath, data);
    }

    this.initialized = true;
  }

  getSecret<TData = unknown>(secretPath: string) {
    if (!this.initialized) {
      throw new Error(
        "Secrets have not been initialized. Call initialize first"
      );
    }

    return this.cache.get(secretPath) as TData;
  }
}
