import Vault from "./Vault";

type Config = {
  roleId: string;
  mountPoint?: string;
  secretId: string;
  serviceUrl: string;
};

export default class VaultCachedSecretsManager {
  cache = new Map<string, any>();

  initialized = false;

  client: Vault;

  config: Config;

  constructor() {
    this.config = this.getConfig();
    this.client = new Vault({ serviceUrl: this.config.serviceUrl });
  }

  private getConfig() {
    const {
      VAULT_APPROLE_ROLE_ID,
      VAULT_APPROLE_SECRET_ID,
      VAULT_SERVICE_URL,
      VAULT_MOUNT_POINT,
    } = process.env;
    const roleId = VAULT_APPROLE_ROLE_ID || "";
    const secretId = VAULT_APPROLE_SECRET_ID || "";
    const serviceUrl = VAULT_SERVICE_URL || "https://vault.i.mct360.com/";
    const mountPoint = VAULT_MOUNT_POINT || "match_kv_prod";

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

    // eslint-disable-next-line no-restricted-syntax, no-loops/no-loops
    for (const secretPath of secretPaths) {
      // eslint-disable-next-line no-await-in-loop
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
