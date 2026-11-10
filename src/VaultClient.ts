import { VaultError } from "./VaultError.js";

type Config = {
  serviceUrl: string;
};

type AppRoleLoginResponse = {
  request_id: string;
  lease_id: string;
  renewable: boolean;
  lease_duration: number;
  data: null | unknown;
  wrap_info: null | unknown;
  warnings: null | unknown;
  auth: {
    client_token: string;
    accessor: string;
    policies: string[];
    token_policies: string[];
    metadata: Record<string, unknown>;
    lease_duration: number;
    renewable: boolean;
    entity_id: string;
    token_type: string;
    orphan: boolean;
    mfa_requirement: null | unknown;
    num_uses: number;
  };
};

type GetSecretResponse<TData = unknown> = {
  request_id: string;
  lease_id: string;
  renewable: boolean;
  lease_duration: number;
  data: {
    data: TData;
    metadata: unknown;
  };
};

export class VaultClient {
  token: string;

  serviceUrl: string;

  version = "v1";

  constructor(config: Config) {
    this.serviceUrl = config.serviceUrl;
    this.token = "";
  }

  private resolveUrl(url: string) {
    return new URL(url, this.serviceUrl).toString();
  }

  // Refresh this long before the real expiry so a token cannot expire mid-request.
  private static readonly tokenExpiryBufferMs = 30_000;

  // null means the token has no TTL (Vault returns lease_duration 0).
  tokenExpiresAt: number | null = null;

  private pendingLogin: Promise<void> | null = null;

  private getTokenStatus() {
    const isExpired =
      this.tokenExpiresAt !== null &&
      Date.now() >= this.tokenExpiresAt - VaultClient.tokenExpiryBufferMs;

    return {
      hasToken: this.token !== "",
      isExpired,
    };
  }

  private setToken(auth: AppRoleLoginResponse["auth"]) {
    this.token = auth.client_token;
    this.tokenExpiresAt =
      auth.lease_duration > 0 ? Date.now() + auth.lease_duration * 1000 : null;
  }

  async approleLogin({
    roleId,
    secretId,
  }: {
    roleId: string;
    secretId: string;
  }) {
    if (!this.serviceUrl) {
      throw new Error("Missing vault serviceUrl");
    }

    if (!roleId) {
      throw new Error("Missing vault roleId");
    }

    if (!secretId) {
      throw new Error("Missing vault secretId");
    }

    const tokenStatus = this.getTokenStatus();

    if (tokenStatus.hasToken && !tokenStatus.isExpired) {
      return;
    }

    this.pendingLogin ??= this.requestToken({ roleId, secretId }).finally(
      () => {
        this.pendingLogin = null;
      }
    );

    return this.pendingLogin;
  }

  private async requestToken({
    roleId,
    secretId,
  }: {
    roleId: string;
    secretId: string;
  }) {
    const url = this.resolveUrl(`${this.version}/auth/approle/login`);

    const req = await fetch(url, {
      method: "POST",
      body: JSON.stringify({
        role_id: roleId,
        secret_id: secretId,
      }),
    });

    if (req.ok) {
      const data = (await req.json()) as AppRoleLoginResponse;

      if (data.auth.client_token) {
        this.setToken(data.auth);
      } else {
        const missingTokenError = new VaultError(
          "Failed to obtain client token from vault."
        );
        missingTokenError.status = req.status;
        missingTokenError.statusText = req.statusText;
        missingTokenError.url = url;
        throw missingTokenError;
      }

      return;
    }

    const error = new VaultError("Failed to authenticate with vault");
    error.status = req.status;
    error.statusText = req.statusText;
    error.url = url;

    throw error;
  }

  async getSecret<TData = unknown>({
    secretPath,
    mountPoint,
  }: {
    secretPath: string;
    mountPoint?: string;
  }) {
    const mount = mountPoint ? `${mountPoint}/data` : `/data`;
    const url = this.resolveUrl(`${this.version}/${mount}/${secretPath}`);

    const req = await fetch(url, {
      method: "GET",
      headers: {
        "X-Vault-Token": this.token,
      },
    });

    if (req.ok) {
      const res = (await req.json()) as GetSecretResponse<TData>;
      return res.data.data;
    }

    const error = new VaultError("Failed to get secret from vault");
    error.status = req.status;
    error.statusText = req.statusText;
    error.secretPath = secretPath;
    error.url = url;

    throw error;
  }
}
