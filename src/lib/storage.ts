import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensure } from './errors';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

export type StoredObject = { key: string; bytes: Uint8Array; contentType: string };
export interface StorageService {
  put(object: StoredObject): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}

class LocalStorage implements StorageService {
  private readonly root: string;
  constructor() {
    ensure(
      process.env.NODE_ENV !== 'production',
      'Local file storage is disabled in production.',
      503,
    );
    this.root = path.resolve(
      /* turbopackIgnore: true */ process.env.STORAGE_LOCAL_ROOT || '.data/uploads',
    );
  }
  private target(key: string) {
    ensure(/^[a-z0-9-]+\/[a-z0-9-]+$/i.test(key), 'Invalid storage key.');
    const target = path.resolve(this.root, key);
    ensure(target.startsWith(`${this.root}${path.sep}`), 'Invalid storage key.');
    return target;
  }
  async put(object: StoredObject) {
    const target = this.target(object.key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, object.bytes);
  }
  async get(key: string) {
    return new Uint8Array(await readFile(this.target(key)));
  }
  async remove(key: string) {
    await rm(this.target(key), { force: true });
  }
}

class UnconfiguredObjectStorage implements StorageService {
  private unavailable(): never {
    throw new Error(
      'Production object storage is not configured. Configure a durable StorageService adapter before enabling uploads.',
    );
  }
  async put(): Promise<void> {
    this.unavailable();
  }
  async get(): Promise<Uint8Array> {
    return this.unavailable();
  }
  async remove(): Promise<void> {
    this.unavailable();
  }
}

export function storageDriver() {
  return (
    process.env.STORAGE_DRIVER || (process.env.NODE_ENV === 'production' ? 'unconfigured' : 'local')
  );
}
export function storageConfigured() {
  return storageDriver() === 'local'
    ? process.env.NODE_ENV !== 'production'
    : storageDriver() === 's3' &&
        [
          'STORAGE_S3_BUCKET',
          'STORAGE_S3_REGION',
          'STORAGE_S3_ACCESS_KEY_ID',
          'STORAGE_S3_SECRET_ACCESS_KEY',
        ].every((k) => !!process.env[k]);
}
export class S3Storage implements StorageService {
  private client: S3Client;
  private bucket: string;
  constructor() {
    ensure(storageConfigured(), 'Object storage is not configured.', 503);
    const endpoint = process.env.STORAGE_S3_ENDPOINT;
    ensure(
      !endpoint || new URL(endpoint).protocol === 'https:',
      'Object storage requires HTTPS.',
      503,
    );
    this.bucket = process.env.STORAGE_S3_BUCKET!;
    this.client = new S3Client({
      region: process.env.STORAGE_S3_REGION!,
      endpoint,
      forcePathStyle: process.env.STORAGE_S3_PATH_STYLE === 'true',
      credentials: {
        accessKeyId: process.env.STORAGE_S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY!,
      },
      maxAttempts: 3,
    });
  }
  private key(key: string) {
    ensure(/^[a-z0-9-]+\/[a-z0-9-]+$/i.test(key), 'Invalid storage key.');
    return key;
  }
  async put(object: StoredObject) {
    ensure(object.bytes.length <= maximumUploadBytes(), 'File exceeds upload limit.', 413);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(object.key),
        Body: object.bytes,
        ContentType: object.contentType,
      }),
    );
  }
  async get(key: string) {
    const r = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.key(key) }),
    );
    ensure(r.Body, 'File unavailable.', 404);
    return r.Body.transformToByteArray();
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(key) }));
  }
}
export function storage(provider = storageDriver()): StorageService {
  if (provider === 's3') return new S3Storage();
  return provider === 'local' ? new LocalStorage() : new UnconfiguredObjectStorage();
}

export function maximumUploadBytes() {
  const configured = Number(process.env.STORAGE_MAX_BYTES || 15 * 1024 * 1024);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : 15 * 1024 * 1024;
}
