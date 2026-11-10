export class MemoryCache {
  cache: Map<string, unknown>;

  constructor(cache = new Map<string, unknown>()) {
    this.cache = cache;
  }

  keysFor(key: string) {
    return {
      cacheKey: key,
      vaultPath: key,
    };
  }

  filter(keys: string[]) {
    return keys.filter((key) => {
      const { cacheKey } = this.keysFor(key);
      return !this.cache.has(cacheKey);
    });
  }

  set<TData = unknown>(key: string, data: TData) {
    this.cache.set(key, data);
    return data;
  }

  get<TData = unknown>(key: string): TData | undefined {
    if (this.cache.has(key)) {
      return this.cache.get(key) as TData;
    }

    return undefined;
  }

  delete(key: string) {
    this.cache.delete(key);
  }
}
