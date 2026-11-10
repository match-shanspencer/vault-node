import { describe, expect, test } from "bun:test";
import { MemoryCache } from "../src/MemoryCache.js";

describe("MemoryCache", () => {
  test("returns undefined for a missing key", () => {
    const cache = new MemoryCache();

    expect(cache.get("missing")).toBeUndefined();
  });

  test("stores and returns a value", () => {
    const cache = new MemoryCache();

    const stored = cache.set("my/secret", { token: "abc" });

    expect(stored).toEqual({ token: "abc" });
    expect(cache.get("my/secret")).toEqual({ token: "abc" });
  });

  test("deletes a value", () => {
    const cache = new MemoryCache();
    cache.set("my/secret", "value");

    cache.delete("my/secret");

    expect(cache.get("my/secret")).toBeUndefined();
  });

  test("reads values from a map given to the constructor", () => {
    const cache = new MemoryCache(new Map([["hydrated", "from-env"]]));

    expect(cache.get("hydrated")).toBe("from-env");
  });

  test("keysFor uses the key as both the cache key and the vault path", () => {
    const cache = new MemoryCache();

    expect(cache.keysFor("my/secret")).toEqual({
      cacheKey: "my/secret",
      vaultPath: "my/secret",
    });
  });
});
