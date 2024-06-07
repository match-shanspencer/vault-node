export default class VaultError extends Error {
  status: number;

  statusText: string;

  secretPath?: string;

  url: string;

  constructor(message?: string) {
    super(message);

    this.status = 0;
    this.statusText = "";
    this.url = "";
  }
}
