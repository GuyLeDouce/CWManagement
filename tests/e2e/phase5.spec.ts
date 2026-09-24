import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/lib/crypto';
const db = new PrismaClient(),
  key = randomUUID().slice(0, 8),
  password = 'phase5-browser-test-password-123';
let projectId: string,
  otherProjectId: string,
  codeId: string,
  clientEmail: string,
  ownerEmail: string,
  privateFileId: string;
test.beforeAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Isolated _test database required');
  ownerEmail = `p5-owner-${key}@example.test`;
  clientEmail = `p5-client-${key}@example.test`;
  const passwordHash = await hashPassword(password);
  const owner = await db.user.create({
    data: {
      email: ownerEmail,
      firstName: 'Project',
      lastName: 'Manager',
      roles: ['OWNER'],
      passwordHash,
    },
  });
  const client = await db.user.create({
    data: {
      email: clientEmail,
      firstName: 'Jane',
      lastName: 'Client',
      roles: ['CLIENT'],
      passwordHash,
    },
  });
  const contact = await db.contact.create({
    data: {
      firstName: 'Jane',
      lastName: 'Client',
      email: clientEmail,
      types: ['CLIENT'],
      portalUserId: client.id,
    },
  });
  const project = await db.project.create({
    data: {
      name: 'Portal browser project',
      number: 'P5-' + key,
      contractAmount: 20000,
      internalNotes: 'PRIVATE-TEST-SENTINEL',
      contacts: { create: { contactId: contact.id, role: 'CLIENT' } },
    },
  });
  projectId = project.id;
  otherProjectId = (
    await db.project.create({ data: { name: 'Unrelated client project', number: 'OTHER-' + key } })
  ).id;
  const code = await db.costCode.create({
    data: { code: 'P5-' + key, name: 'Fixture allowance', type: 'MATERIAL' },
  });
  codeId = code.id;
  await db.budget.create({
    data: {
      projectId,
      name: 'Contract budget',
      versions: {
        create: [1, 2].map((version) => ({
          version,
          type: version === 1 ? 'ORIGINAL' : 'CURRENT',
          createdById: owner.id,
          lines: {
            create: {
              costCodeId: code.id,
              costCodeSnapshot: code.code,
              costCodeNameSnapshot: code.name,
              costType: 'MATERIAL',
              description: 'Fixtures',
              amount: 8000,
            },
          },
        })),
      },
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
        storageKey: 'private/' + key,
      },
    })
  ).id;
});
test.afterAll(() => db.$disconnect());
test('staff publishes a selection; mobile client decides and approves its allowance adjustment securely', async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await page.goto('/login');
  await page.getByLabel('Email address').fill(ownerEmail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/login/);
  await page.goto(`/projects/${projectId}/clients`);
  await page.getByRole('button', { name: 'Invite / resend / reactivate' }).click();
  await expect(page.getByText('Invitation sent.')).toBeVisible();
  await page.goto(`/projects/${projectId}/selections`);
  await page.getByText('Record an included contract allowance', { exact: true }).click();
  const allowance = page
    .locator('details')
    .filter({ has: page.getByText('Record an included contract allowance', { exact: true }) });
  await allowance.getByLabel('Name', { exact: true }).fill('Plumbing allowance');
  await allowance.getByLabel('Included client allowance').fill('12000');
  await allowance.getByLabel('Internal included cost').fill('8000');
  await allowance.getByLabel('Cost code', { exact: true }).selectOption(codeId);
  await allowance.getByRole('button', { name: 'Save allowance' }).click();
  const editor = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Create selection', exact: true }) });
  await editor.getByLabel('Selection title').fill('Kitchen faucet');
  await editor.getByLabel('Category', { exact: true }).fill('Plumbing');
  await editor
    .getByLabel('Included allowance', { exact: true })
    .selectOption({ label: 'Plumbing allowance · $12000' });
  await editor.getByLabel('Visible to client', { exact: true }).fill('Choose your faucet finish.');
  await editor.getByLabel('Option name', { exact: true }).fill('Brushed brass');
  await editor.getByLabel('Internal unit cost').fill('9800');
  await editor.getByLabel('Markup method').selectOption('FIXED');
  await editor.getByLabel('Internal markup', { exact: true }).fill('4700');
  await editor.getByRole('button', { name: 'Save draft selection' }).click();
  const card = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Kitchen faucet', exact: true }) });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Publish to client' }).click();
  await expect(card.getByText('Published', { exact: true })).toBeVisible();
  const context = await browser.newContext({
    baseURL: 'http://localhost:3000',
    viewport: { width: 390, height: 844 },
  });
  const clientPage = await context.newPage();
  await clientPage.goto('/login');
  await clientPage.getByLabel('Email address').fill(clientEmail);
  await clientPage.getByLabel('Password', { exact: true }).fill(password);
  await clientPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(clientPage).toHaveURL(/\/client$/);
  await clientPage.getByRole('link', { name: /Portal browser project/ }).click();
  await expect(clientPage.getByRole('heading', { name: 'Needs your attention' })).toBeVisible();
  await clientPage.getByRole('link', { name: 'selections', exact: true }).click();
  await expect(clientPage.getByText('Difference:', { exact: false }).first()).toContainText(
    '$2,500.00',
  );
  await clientPage.getByRole('radio').check();
  await clientPage.getByRole('checkbox').check();
  await clientPage.getByRole('button', { name: 'Confirm selection' }).click();
  await expect(
    clientPage.getByText('Your project team is preparing the contract adjustment for review.'),
  ).toBeVisible();
  const selection = await db.selection.findFirstOrThrow({
    where: { projectId, title: 'Kitchen faucet' },
  });
  let revision = await db.changeOrderRevision.findFirstOrThrow({
    where: { changeOrderId: selection.changeOrderId! },
  });
  for (const action of ['review', 'approve', 'issue']) {
    const response = await page.request.post('/api/financial/operations/changes/action', {
      data: { id: revision.id, expectedVersion: revision.version, action },
      headers: { origin: 'http://localhost:3000' },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    revision = await response.json();
  }
  await clientPage.getByRole('link', { name: 'change orders', exact: true }).click();
  await expect(clientPage.getByText('Total: $2,825.00')).toBeVisible();
  await clientPage.getByLabel('Your full name').fill('Jane Client');
  await clientPage.getByRole('checkbox').check();
  await clientPage.getByRole('button', { name: 'Approve change order' }).click();
  await expect(clientPage.getByText(/Accepted /).last()).toBeVisible();
  expect(await db.contractAdjustment.count({ where: { projectId } })).toBe(1);
  expect(await db.budgetVersion.count({ where: { changeOrderRevisionId: revision.id } })).toBe(1);
  const dto = await clientPage.request.get(`/api/client/project?projectId=${projectId}`);
  const responseBody = await dto.text();
  for (const key of [
    'unitCost',
    'markup',
    'internalNotes',
    'PRIVATE-TEST-SENTINEL',
    'storageKey',
    'consumedAmount',
  ])
    expect(responseBody).not.toContain(key);
  for (const path of [
    '/api/state',
    `/api/management/project?id=${projectId}`,
    `/api/client/project?projectId=${otherProjectId}`,
    `/api/client/messages?projectId=${otherProjectId}`,
    `/api/files/${privateFileId}`,
  ]) {
    const r = await clientPage.request.get(path);
    expect([403, 404]).toContain(r.status());
  }
  await clientPage.goto(`/client/projects/${otherProjectId}`);
  await expect(clientPage.getByText('This page could not be found.')).toBeVisible();
  await clientPage.goto(`/projects/${projectId}/budget`);
  await expect(clientPage).toHaveURL(/\/client$/);
  await clientPage.goto(`/client/projects/${projectId}/messages`);
  await clientPage.getByLabel('Subject', { exact: true }).fill('Thank you');
  await clientPage.getByLabel('Your message').fill('Looking forward to the fixtures.');
  await clientPage.getByRole('button', { name: 'Send message' }).click();
  await expect(
    clientPage.getByText('Looking forward to the fixtures.', { exact: true }),
  ).toBeVisible();
  await page.goto(`/projects/${projectId}/messages`);
  await expect(page.getByText('Looking forward to the fixtures.', { exact: true })).toBeVisible();
  await context.close();
});
