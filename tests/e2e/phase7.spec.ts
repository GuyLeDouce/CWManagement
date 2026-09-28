import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/lib/crypto';
import { configure, configureSchema } from '../../src/lib/quickbooks/admin';
import { buildXml, parseXml, object } from '../../src/lib/quickbooks/xml';
const db = new PrismaClient(),
  key = randomUUID().slice(0, 8),
  password = 'phase7-browser-test-password-123';
let email: string, connectionId: string, connectorPassword: string;
test.beforeAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Isolated _test database required');
  email = `p7-owner-${key}@example.test`;
  const actor = await db.user.create({
    data: {
      firstName: 'Accounting',
      lastName: 'Operator',
      email,
      passwordHash: await hashPassword(password),
      roles: ['OWNER'],
    },
  });
  const c = await configure(
    actor,
    configureSchema.parse({ name: 'Browser QB ' + key, username: 'browser-' + key }),
  );
  connectionId = c.id;
  connectorPassword = c.password!;
});
test.afterAll(() => db.$disconnect());
test('Controller configures discovery, downloads QWC, verifies a fixture connector run and queues discovery', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/login/);
  await page.goto('/financials/quickbooks');
  await expect(page.getByRole('heading', { name: 'Accounting connection' })).toBeVisible();
  const chooser = page.getByLabel('Connection', { exact: true });
  if (await chooser.count()) await chooser.selectOption(connectionId);
  await expect(page.getByRole('heading', { name: 'NEVER_CONNECTED' })).toBeVisible();
  const qwc = await page.request.get('/api/quickbooks/qwc?id=' + connectionId);
  expect(qwc.status()).toBe(200);
  const file = await qwc.text();
  expect(file).toContain('<UserName>browser-' + key + '</UserName>');
  expect(file).not.toContain(connectorPassword);
  const call = async (method: string, args: object) => {
    const body = buildXml({
      'soap:Envelope': {
        '@_xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/',
        'soap:Body': { [method]: { '@_xmlns': 'http://developer.intuit.com', ...args } },
      },
    });
    const res = await page.request.post('/api/quickbooks/web-connector', {
      headers: { 'Content-Type': 'text/xml', SOAPAction: 'http://developer.intuit.com/' + method },
      data: body,
    });
    expect(res.status()).toBe(200);
    const env = object(parseXml(await res.text(), true).Envelope);
    return object(object(env.Body)[method + 'Response'])[method + 'Result'];
  };
  const auth = object(
    await call('authenticate', { strUserName: 'browser-' + key, strPassword: connectorPassword }),
  );
  const ticket = (auth.string as string[])[0];
  const xml = String(
    await call('sendRequestXML', {
      ticket,
      strHCPResponse: '',
      strCompanyFileName: 'C:\\Test\\Browser.qbw',
      qbXMLCountry: 'CA',
      qbXMLMajorVers: 16,
      qbXMLMinorVers: 0,
    }),
  );
  const msgs = object(object(parseXml(xml).QBXML).QBXMLMsgsRq),
    request = object(msgs.CompanyQueryRq);
  await call('receiveResponseXML', {
    ticket,
    response: buildXml({
      QBXML: {
        QBXMLMsgsRs: {
          CompanyQueryRs: {
            '@_requestID': request['@_requestID'],
            '@_statusCode': '0',
            '@_statusSeverity': 'Info',
            CompanyRet: { CompanyName: 'Browser Company ' + key },
          },
        },
      },
    }),
    hresult: '',
    message: '',
  });
  await call('closeConnection', { ticket });
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await expect(
    page.getByText('Browser Company ' + key + ' · DISCOVERY', { exact: false }),
  ).toBeVisible();
  await page.getByLabel(/I verified this company/).check();
  await page.getByRole('button', { name: 'Save connection', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Queue list discovery' }).click();
  await expect(page.getByText('Customer — PENDING', { exact: true })).toBeVisible();
  expect(
    (await db.quickBooksConnection.findUniqueOrThrow({ where: { id: connectionId } }))
      .boundCompanyHash,
  ).toBeTruthy();
});
