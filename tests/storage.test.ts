import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { storage } from '../src/lib/storage';

let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  delete process.env.STORAGE_LOCAL_ROOT;
});

describe('storage abstraction', () => {
  it('stores, reads, and removes opaque local-development objects', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'cwmanagement-storage-'));
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_ROOT = root;
    const service = storage(), bytes = new TextEncoder().encode('site photo bytes');
    await service.put({ key: 'project-123/file-456', bytes, contentType: 'text/plain' });
    expect(new TextDecoder().decode(await service.get('project-123/file-456'))).toBe('site photo bytes');
    await service.remove('project-123/file-456');
    await expect(service.get('project-123/file-456')).rejects.toThrow();
  });

  it('rejects path traversal keys', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'cwmanagement-storage-'));
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_ROOT = root;
    await expect(storage().put({ key: '../outside', bytes: new Uint8Array(), contentType: 'text/plain' })).rejects.toThrow('Invalid storage key');
  });
});
