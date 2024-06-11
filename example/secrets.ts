import { VaultCachedSecretsManager } from "../src/VaultCachedSecretsManager.js";

export const secrets = new VaultCachedSecretsManager({
  roleId: process.env.VAULT_APPROLE_ROLE_ID || "my-role-id",
  secretId: process.env.VAULT_APPROLE_SECRET_ID || "my-role-id",
  serviceUrl: process.env.VAULT_SERVICE_URL || "https://vault-q.i.mct360.com/",
  mountPoint: process.env.VAULT_MOUNT_POINT || "match_kv_qa1",
});
