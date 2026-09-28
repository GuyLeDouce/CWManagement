import { QuickBooksConnection } from '@prisma/client';
import { ensure } from '../errors';
import { buildXml } from './xml';
export function quickBooksUrl() {
  const url = new URL(process.env.APP_URL ?? 'http://localhost:3000');
  ensure(
    url.protocol === 'https:' ||
      (process.env.NODE_ENV !== 'production' &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname)),
    'QuickBooks production endpoints require HTTPS APP_URL.',
  );
  ensure(!url.username && !url.password, 'APP_URL must not contain credentials.');
  return url.origin;
}
export function qwc(
  connection: Pick<QuickBooksConnection, 'username' | 'ownerGuid' | 'fileGuid' | 'intervalMinutes'>,
) {
  const base = quickBooksUrl();
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    buildXml({
      QBWCXML: {
        AppName: 'Cedar Winds CWManagement',
        AppID: '',
        AppURL: base + '/api/quickbooks/web-connector',
        AppDescription: 'Cedar Winds approved purchasing, time and project job costs',
        AppSupport: base + '/quickbooks/setup',
        UserName: connection.username,
        OwnerID: `{${connection.ownerGuid}}`,
        FileID: `{${connection.fileGuid}}`,
        QBType: 'QBFS',
        Scheduler: { RunEveryNMinutes: connection.intervalMinutes },
        IsReadOnly: false,
      },
    })
  );
}
