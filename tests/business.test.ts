import { describe, it, expect, vi, afterEach } from 'vitest';
import { reportCsv, groupReportRows } from '../src/lib/portfolio-reports';
import { S3Client } from '@aws-sdk/client-s3';
import { opportunitySchema } from '../src/lib/crm';
import { validateTradeUpload } from '../src/lib/trade-uploads';
import { storageConfigured, storage } from '../src/lib/storage';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe('business inputs, exports and storage', () => {
  it('groups money using Decimal arithmetic', () => {
    expect(
      groupReportRows(
        [
          { stage: 'Design', value: '0.10' },
          { stage: 'Design', value: '0.20' },
        ],
        'stage',
        'value',
      ),
    ).toEqual([{ stage: 'Design', records: 2, value: '0.30' }]);
  });
  it('uses private S3 commands behind the same storage interface', async () => {
    for (const [k, v] of Object.entries({
      STORAGE_DRIVER: 's3',
      STORAGE_S3_BUCKET: 'test-bucket',
      STORAGE_S3_REGION: 'test-region',
      STORAGE_S3_ACCESS_KEY_ID: 'test-key',
      STORAGE_S3_SECRET_ACCESS_KEY: 'test-secret',
      STORAGE_S3_ENDPOINT: 'https://storage.example.test',
    }))
      vi.stubEnv(k, v);
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockImplementation(async () => ({
        Body: { transformToByteArray: async () => new Uint8Array([1, 2]) },
      }));
    const adapter = storage();
    await adapter.put({
      key: 'project/file',
      bytes: new Uint8Array([1, 2]),
      contentType: 'application/pdf',
    });
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'project/file',
      ContentType: 'application/pdf',
    });
    expect(send.mock.calls[0][0].input).not.toHaveProperty('ACL');
    expect(await adapter.get('project/file')).toEqual(new Uint8Array([1, 2]));
    await adapter.remove('project/file');
    expect(send).toHaveBeenCalledTimes(3);
    await expect(adapter.get('../private')).rejects.toBeTruthy();
  });
  it('preserves Decimal text and neutralizes spreadsheet formulas', () => {
    const csv = reportCsv([
      { name: '=HYPERLINK("evil")', amount: '123456789.12', credit: '-2000.00', href: '/private' },
    ]);
    expect(csv).toContain('123456789.12');
    expect(csv).toContain('"-2000.00"');
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain('/private');
  });
  it('rejects invalid probabilities, negative pipeline values and missing loss data at service validation', () => {
    const base = { title: 'Job', contactId: 'c', stageId: 's', ownerId: 'u' };
    expect(() => opportunitySchema.parse({ ...base, probability: 101 })).toThrow();
    expect(() => opportunitySchema.parse({ ...base, estimatedValue: '-1' })).toThrow();
  });
  it('verifies file signatures and rejects traversal and oversized evidence', () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    expect(validateTradeUpload('photo.png', 'image/png', png)).toBe('image/png');
    expect(() => validateTradeUpload('../photo.png', 'image/png', png)).toThrow();
    expect(() => validateTradeUpload('file.pdf', 'application/pdf', png)).toThrow();
    vi.stubEnv('STORAGE_MAX_BYTES', '4');
    expect(() => validateTradeUpload('photo.png', 'image/png', png)).toThrow();
  });
  it('fails closed when production object storage is absent or legacy local bytes are requested', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STORAGE_DRIVER', 'unconfigured');
    expect(storageConfigured()).toBe(false);
    expect(() => storage('local')).toThrow();
  });
});
