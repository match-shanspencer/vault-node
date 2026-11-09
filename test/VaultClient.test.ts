import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  setSystemTime,
  spyOn,
  test,
} from "bun:test";
import { VaultClient } from "../src/VaultClient.js";
import { VaultError } from "../src/VaultError.js";

const serviceUrl = "https://vault.test/";
const credentials = { roleId: "role-id", secretId: "secret-id" };
const startTime = new Date("2026-01-01T00:00:00.000Z");

function loginResponse(clientToken: string, leaseDuration: number) {
  return Response.json({ auth: { client_token: clientToken, lease_duration: leaseDuration } });
}

function secretResponse(data: unknown) {
  return Response.json({ data: { data, metadata: {} } });
}

function mockFetch(...responses: Response[]) {
  const fetchSpy = spyOn(globalThis, "fetch");

  for (const response of responses) {
    fetchSpy.mockResolvedValueOnce(response);
  }

  return fetchSpy;
}

async function captureVaultError(promise: Promise<unknown>) {
  const caught = await promise.then(
    () => undefined,
    (error: unknown) => error
  );

  if (!(caught instanceof VaultError)) {
    throw new Error(`Expected a VaultError, got ${String(caught)}`);
  }

  return caught;
}

function requestAt(fetchSpy: ReturnType<typeof mockFetch>, callIndex: number) {
  const [url, init] = fetchSpy.mock.calls[callIndex] ?? [];
  return { url: String(url), init: init ?? {} };
}

beforeEach(() => {
  setSystemTime(startTime);
});

afterEach(() => {
  mock.restore();
  setSystemTime();
});

describe("VaultClient.approleLogin", () => {
  test.each([
    ["serviceUrl", "", credentials.roleId, credentials.secretId],
    ["roleId", serviceUrl, "", credentials.secretId],
    ["secretId", serviceUrl, credentials.roleId, ""],
  ])("throws when %s is missing", async (missingField, url, roleId, secretId) => {
    const client = new VaultClient({ serviceUrl: url });

    await expect(client.approleLogin({ roleId, secretId })).rejects.toThrow(
      `Missing vault ${missingField}`
    );
  });

  test("posts the role credentials and stores the token", async () => {
    const fetchSpy = mockFetch(loginResponse("token-1", 3600));
    const client = new VaultClient({ serviceUrl });

    await client.approleLogin(credentials);

    const request = requestAt(fetchSpy, 0);
    expect(request.url).toBe("https://vault.test/v1/auth/approle/login");
    expect(request.init.method).toBe("POST");
    expect(JSON.parse(String(request.init.body))).toEqual({
      role_id: "role-id",
      secret_id: "secret-id",
    });
    expect(client.token).toBe("token-1");
    expect(client.tokenExpiresAt).toBe(startTime.getTime() + 3600 * 1000);
  });

  test("does not log in again while the token is valid", async () => {
    const fetchSpy = mockFetch(loginResponse("token-1", 3600));
    const client = new VaultClient({ serviceUrl });

    await client.approleLogin(credentials);
    setSystemTime(new Date(startTime.getTime() + 60_000));
    await client.approleLogin(credentials);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("logs in again when the token is expired", async () => {
    const fetchSpy = mockFetch(
      loginResponse("token-1", 3600),
      loginResponse("token-2", 3600)
    );
    const client = new VaultClient({ serviceUrl });

    await client.approleLogin(credentials);
    setSystemTime(new Date(startTime.getTime() + 3600 * 1000));
    await client.approleLogin(credentials);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(client.token).toBe("token-2");
  });

  test("logs in again inside the 30 second expiry buffer", async () => {
    const fetchSpy = mockFetch(
      loginResponse("token-1", 3600),
      loginResponse("token-2", 3600)
    );
    const client = new VaultClient({ serviceUrl });

    await client.approleLogin(credentials);
    setSystemTime(new Date(startTime.getTime() + (3600 - 30) * 1000));
    await client.approleLogin(credentials);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  test("treats a lease duration of 0 as a token that never expires", async () => {
    const fetchSpy = mockFetch(loginResponse("token-1", 0));
    const client = new VaultClient({ serviceUrl });

    await client.approleLogin(credentials);
    setSystemTime(new Date(startTime.getTime() + 365 * 24 * 3600 * 1000));
    await client.approleLogin(credentials);

    expect(client.tokenExpiresAt).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("concurrent calls share one login request", async () => {
    const fetchSpy = mockFetch(loginResponse("token-1", 3600));
    const client = new VaultClient({ serviceUrl });

    await Promise.all([
      client.approleLogin(credentials),
      client.approleLogin(credentials),
      client.approleLogin(credentials),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("throws a VaultError with the response status when login fails", async () => {
    mockFetch(new Response(null, { status: 403, statusText: "Forbidden" }));
    const client = new VaultClient({ serviceUrl });

    const error = await captureVaultError(client.approleLogin(credentials));

    expect(error.status).toBe(403);
    expect(error.statusText).toBe("Forbidden");
    expect(error.url).toBe("https://vault.test/v1/auth/approle/login");
  });

  test("retries the login after a failure", async () => {
    const fetchSpy = mockFetch(
      new Response(null, { status: 500 }),
      loginResponse("token-1", 3600)
    );
    const client = new VaultClient({ serviceUrl });

    await client.approleLogin(credentials).catch(() => undefined);
    await client.approleLogin(credentials);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(client.token).toBe("token-1");
  });

  test("throws when the response has no client token", async () => {
    mockFetch(loginResponse("", 3600));
    const client = new VaultClient({ serviceUrl });

    await expect(client.approleLogin(credentials)).rejects.toThrow(
      "Failed to obtain client token from vault."
    );
  });
});

describe("VaultClient.getSecret", () => {
  test("sends the token and returns the secret data", async () => {
    const fetchSpy = mockFetch(secretResponse({ apiKey: "abc" }));
    const client = new VaultClient({ serviceUrl });
    client.token = "token-1";

    const secret = await client.getSecret({ secretPath: "my/secret", mountPoint: "kv" });

    const request = requestAt(fetchSpy, 0);
    expect(request.url).toBe("https://vault.test/v1/kv/data/my/secret");
    expect(request.init.headers).toEqual({ "X-Vault-Token": "token-1" });
    expect(secret).toEqual({ apiKey: "abc" });
  });

  test("throws a VaultError with the secret path when the request fails", async () => {
    mockFetch(new Response(null, { status: 404, statusText: "Not Found" }));
    const client = new VaultClient({ serviceUrl });

    const error = await captureVaultError(
      client.getSecret({ secretPath: "my/secret", mountPoint: "kv" })
    );

    expect(error.status).toBe(404);
    expect(error.secretPath).toBe("my/secret");
    expect(error.url).toBe("https://vault.test/v1/kv/data/my/secret");
  });
});
