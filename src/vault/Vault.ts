import VaultError from "./VaultError";

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

export default class Vault {
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

  async approleLogin({
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
        this.token = data.auth.client_token;
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
      const res = await req.json();
      const data = res.data.data as GetSecretResponse<TData>;

      return data;
    }

    const error = new VaultError("Failed to get secret from vault");
    error.status = req.status;
    error.statusText = req.statusText;
    error.secretPath = secretPath;
    error.url = url;

    throw error;
  }
}
