import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/lib/crypto';
const db = new PrismaClient(),
  key = randomUUID().slice(0, 8),
  password = 'phase6-browser-password-test-123';
let projectId: string,
  otherId: string,
  contactId: string,
  ownerEmail: string,
  tradeEmail: string,
  clientEmail: string,
  codeId: string,
  privateFileId: string,
  otherContactId: string;
test.beforeAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Isolated _test database required');
  const passwordHash = await hashPassword(password);
  ownerEmail = `p6-owner-${key}@example.test`;
  tradeEmail = `p6-trade-${key}@example.test`;
  clientEmail = `p6-client-${key}@example.test`;
  const owner = await db.user.create({
    data: {
      email: ownerEmail,
      firstName: 'Project',
      lastName: 'Manager',
      roles: ['OWNER'],
      passwordHash,
    },
  });
  const trade = await db.user.create({
    data: {
      email: tradeEmail,
      firstName: 'Alex',
      lastName: 'Electrical',
      roles: ['SUBTRADE'],
      passwordHash,
    },
  });
  await db.user.create({
    data: {
      email: clientEmail,
      firstName: 'Private',
      lastName: 'Client',
      roles: ['CLIENT'],
      passwordHash,
    },
  });
  const contact = await db.contact.create({
    data: {
      firstName: 'Alex',
      lastName: 'Electrical',
      types: ['SUBTRADE'],
      email: tradeEmail,
      portalUserId: trade.id,
    },
  });
  contactId = contact.id;
  const otherContact = await db.contact.create({
    data: { firstName: 'Other', lastName: 'Plumbing', types: ['SUBTRADE'] },
  });
  otherContactId = otherContact.id;
  const project = await db.project.create({
    data: {
      number: 'P6-' + key,
      name: 'Trade browser project ' + key,
      address: '123 Site Road',
      internalNotes: 'PRIVATE-SENTINEL',
      contacts: {
        create: [
          { contactId, role: 'SUBTRADE' },
          { contactId: otherContact.id, role: 'SUBTRADE' },
        ],
      },
    },
  });
  projectId = project.id;
  otherId = (
    await db.project.create({
      data: { number: 'P6-OTHER-' + key, name: 'Other trade project ' + key },
    })
  ).id;
  codeId = (
    await db.costCode.create({
      data: { code: 'P6-' + key, name: 'Electrical', type: 'SUBCONTRACT' },
    })
  ).id;
  await db.projectTask.create({
    data: {
      projectId,
      name: 'Electrical rough in',
      description: 'PRIVATE-SCHEDULE',
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-03'),
      createdById: owner.id,
      assignees: { create: { contactId } },
    },
  });
  await db.projectTask.create({
    data: {
      projectId,
      name: 'Private plumbing task',
      createdById: owner.id,
      assignees: { create: { contactId: otherContact.id } },
    },
  });
  privateFileId = (
    await db.storedFile.create({
      data: {
        projectId,
        uploaderId: owner.id,
        kind: 'DOCUMENT',
        visibility: 'INTERNAL',
        filename: 'private.pdf',
        originalFilename: 'private.pdf',
        mimeType: 'application/pdf',
        size: 1,
        storageKey: randomUUID(),
      },
    })
  ).id;
});
test.afterAll(() => db.$disconnect());
async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/login/);
}
test('staff issues work; mobile trade acknowledges, responds, repairs, uploads and messages; staff verifies', async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await login(page, ownerEmail);
  await page.goto(`/projects/${projectId}/trades`);
  const tradeCard = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Alex Electrical', exact: true }) });
  await tradeCard.getByRole('button', { name: 'Invite to portal' }).click();
  await expect(tradeCard.getByText('Portal active')).toBeVisible();
  async function staffPost(path: string, data: object) {
    const r = await page.request.post('/api/' + path, {
      data,
      headers: { origin: 'http://localhost:3000' },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  }
  let work = await staffPost('financial/operations/purchasing', {
    projectId,
    type: 'WORK_ORDER',
    vendorContactId: contactId,
    title: 'Electrical installation',
    scope: 'Install the agreed electrical scope.',
    internalNotes: 'PRIVATE-WORK',
    lines: [
      {
        costCodeId: codeId,
        costType: 'SUBCONTRACT',
        description: 'Rough in',
        quantity: '1',
        unit: 'lot',
        unitCost: '10000',
        taxable: false,
        sortOrder: 0,
      },
    ],
  });
  for (const action of ['review', 'approve', 'issue'])
    work = await staffPost('financial/operations/purchasing/action', {
      id: work.id,
      expectedVersion: work.version,
      action,
    });
  // A second trade's issued document is in the same project and must remain invisible.
  let other = await staffPost('financial/operations/purchasing', {
    projectId,
    type: 'WORK_ORDER',
    vendorContactId: otherContactId,
    title: 'PRIVATE-PLUMBING-WORK',
    lines: [
      {
        costCodeId: codeId,
        costType: 'SUBCONTRACT',
        description: 'Private price',
        quantity: '1',
        unit: 'lot',
        unitCost: '7654',
        taxable: false,
        sortOrder: 0,
      },
    ],
  });
  for (const action of ['review', 'approve', 'issue'])
    other = await staffPost('financial/operations/purchasing/action', {
      id: other.id,
      expectedVersion: other.version,
      action,
    });
  await page.getByLabel('Assigned trade', { exact: true }).selectOption(contactId);
  await page.getByLabel('Title', { exact: true }).fill('Fixture installation height');
  await page
    .getByLabel('Trade-visible description')
    .fill('Install fixtures 48 inches above finished floor.');
  await page.getByRole('button', { name: 'Create instruction', exact: true }).click();
  const instructionCard = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: /SI-.*Fixture installation height/ }) });
  await instructionCard.getByRole('button', { name: 'Issue instruction' }).click();
  await expect(instructionCard.getByText('Issued · 0/1 acknowledgements')).toBeVisible();
  await page.getByLabel('Record type').selectOption('deficiency');
  await page.getByLabel('Title', { exact: true }).fill('Missing switch trim');
  await page.getByLabel('Trade-visible description').fill('Fit the switch trim in the ensuite.');
  await page.getByLabel('Location', { exact: true }).fill('Ensuite');
  await page.getByRole('button', { name: 'Create deficiency', exact: true }).click();
  await expect(page.getByRole('heading', { name: /DEF-.*Missing switch trim/ })).toBeVisible();
  const context = await browser.newContext({
    baseURL: 'http://localhost:3000',
    viewport: { width: 390, height: 844 },
  });
  const tradePage = await context.newPage();
  await login(tradePage, tradeEmail);
  await expect(tradePage).toHaveURL(/\/trade$/);
  await tradePage.getByRole('link', { name: new RegExp('Trade browser project ' + key) }).click();
  await expect(tradePage.getByRole('heading', { name: 'Needs your attention' })).toBeVisible();
  await tradePage.getByRole('link', { name: 'Work', exact: true }).click();
  await expect(tradePage.getByText('Total $10,000.00', { exact: true })).toBeVisible();
  await expect(tradePage.getByText('PRIVATE-PLUMBING-WORK')).toHaveCount(0);
  await tradePage.getByLabel('Your full name').fill('Alex Electrical');
  await tradePage.getByRole('checkbox').check();
  await tradePage.getByRole('button', { name: 'Acknowledge receipt' }).click();
  await expect(tradePage.getByText(/Acknowledged by Alex Electrical/)).toBeVisible();
  await tradePage.getByRole('link', { name: 'Schedule', exact: true }).click();
  await expect(tradePage.getByRole('heading', { name: 'Electrical rough in' })).toBeVisible();
  await expect(tradePage.getByText('Private plumbing task')).toHaveCount(0);
  await tradePage.getByLabel('Schedule response').selectOption('CONFLICT');
  await tradePage.getByLabel('Comment', { exact: true }).fill('Can we start one day later?');
  await tradePage.getByRole('button', { name: 'Send schedule response' }).click();
  await expect(tradePage.getByText(/Conflict · Can we start/)).toBeVisible();
  await tradePage.getByRole('link', { name: 'Instructions', exact: true }).click();
  await tradePage.getByLabel('Your full name').fill('Alex Electrical');
  await tradePage.getByRole('checkbox').check();
  await tradePage.getByRole('button', { name: 'Acknowledge receipt' }).click();
  await expect(tradePage.locator('.trade-success')).toBeVisible();
  await tradePage.getByRole('link', { name: 'Deficiencies', exact: true }).click();
  await tradePage
    .getByLabel('Completion photo or PDF')
    .setInputFiles({
      name: 'completed.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64',
      ),
    });
  await tradePage.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(tradePage.getByRole('link', { name: 'completed.png' })).toBeVisible();
  await tradePage
    .getByLabel('Completion / progress comment')
    .fill('Trim installed; completion photo attached.');
  await tradePage.getByRole('button', { name: 'Ready for review', exact: true }).click();
  await expect(tradePage.getByText('Cedar Winds will verify your completed work.')).toBeVisible();
  await tradePage.getByRole('link', { name: 'Messages', exact: true }).click();
  await tradePage.getByLabel('Subject', { exact: true }).fill('Ensuite repair complete');
  await tradePage
    .getByLabel('Message', { exact: true })
    .fill('Please verify the trim installation.');
  await tradePage.getByRole('button', { name: 'Send message' }).click();
  await expect(tradePage.getByRole('heading', { name: /Ensuite repair complete/ })).toBeVisible();
  const dto = await tradePage.request.get(`/api/trade/project?projectId=${projectId}`);
  const text = await dto.text();
  for (const key of [
    'PRIVATE',
    'markup',
    'clientPrice',
    'budget',
    'grossMargin',
    'consumedAmount',
    'internalNotes',
    'storageKey',
    'passwordHash',
  ])
    expect(text).not.toContain(key);
  for (const path of [
    '/api/state',
    `/api/management/project?id=${projectId}`,
    `/api/client/project?projectId=${projectId}`,
    `/api/trade/project?projectId=${otherId}`,
    `/api/files/${privateFileId}`,
  ])
    expect([403, 404]).toContain((await tradePage.request.get(path)).status());
  const ackWrong = await tradePage.request.post('/api/trade/acknowledge', {
    data: { projectId, id: other.id, kind: 'work', typedName: 'Alex' },
    headers: { origin: 'http://localhost:3000' },
  });
  expect(ackWrong.status()).toBe(404);
  await tradePage.goto('/desktop');
  await expect(tradePage).toHaveURL(/\/trade$/);
  await tradePage.goto('/client');
  await expect(tradePage).toHaveURL(/\/trade$/);
  await page.reload();
  await expect(page.getByText(/Acknowledged /).first()).toBeVisible();
  const deficiency = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: /DEF-.*Missing switch trim/ }) });
  await deficiency
    .getByLabel('Verification / reopening comment')
    .fill('Inspected on site and complete.');
  await deficiency.getByRole('button', { name: 'Verify and close' }).click();
  await expect(deficiency.getByText('Closed · Ensuite')).toBeVisible();
  await expect(page.getByText('Please verify the trim installation.')).toBeVisible();
  const clientContext = await browser.newContext({ baseURL: 'http://localhost:3000' });
  const clientPage = await clientContext.newPage();
  await login(clientPage, clientEmail);
  await clientPage.goto('/trade');
  await expect(clientPage).toHaveURL(/\/client$/);
  expect((await clientPage.request.get(`/api/trade/project?projectId=${projectId}`)).status()).toBe(
    403,
  );
  await clientContext.close();
  await context.close();
});
