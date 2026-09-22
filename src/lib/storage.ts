import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensure } from './errors';

export type StoredObject = { key: string; bytes: Uint8Array; contentType: string };
export interface StorageService {
  put(object: StoredObject): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}

class LocalStorage implements StorageService {
  private readonly root: string;
  constructor() {
    ensure(process.env.NODE_ENV !== 'production', 'Local file storage is disabled in production.', 503);
    this.root = path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_LOCAL_ROOT || '.data/uploads');
  }
  private target(key: string) {
    ensure(/^[a-z0-9-]+\/[a-z0-9-]+$/i.test(key), 'Invalid storage key.');
    const target = path.resolve(this.root, key);
    ensure(target.startsWith(`${this.root}${path.sep}`), 'Invalid storage key.');
    return target;
  }
  async put(object: StoredObject) { const target = this.target(object.key); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, object.bytes); }
  async get(key: string) { return new Uint8Array(await readFile(this.target(key))); }
  async remove(key: string) { await rm(this.target(key), { force: true }); }
}

class UnconfiguredObjectStorage implements StorageService {
  private unavailable(): never { throw new Error('Production object storage is not configured. Configure a durable StorageService adapter before enabling uploads.'); }
  async put(): Promise<void> { this.unavailable(); }
  async get(): Promise<Uint8Array> { return this.unavailable(); }
  async remove(): Promise<void> { this.unavailable(); }
}

export function storage(): StorageService {
  return (process.env.STORAGE_DRIVER || (process.env.NODE_ENV === 'production' ? 'unconfigured' : 'local')) === 'local'
    ? new LocalStorage()
    : new UnconfiguredObjectStorage();
}

export function maximumUploadBytes() {
  const configured = Number(process.env.STORAGE_MAX_BYTES || 15 * 1024 * 1024);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : 15 * 1024 * 1024;
}
