import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/lib/crypto';
const db = new PrismaClient(),
  key = randomUUID().slice(0, 8),
  password = 'phase4-browser-test-password-123';
let projectId: string, codeId: string, vendorId: string, clientId: string, email: string;
test.beforeAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Dedicated _test database required.');
  email = 'phase4-' + key + '@example.test';
  const owner = await db.user.create({
    data: {
      email,
      firstName: 'Phase4',
      lastName: 'Owner',
      roles: ['OWNER'],
      passwordHash: await hashPassword(password),
    },
  });
  const vendor = await db.contact.create({
    data: { firstName: 'Supplier', lastName: key, types: ['VENDOR'] },
  });
  const client = await db.contact.create({
    data: { firstName: 'Client', lastName: key, types: ['CLIENT'] },
  });
  vendorId = vendor.id;
  clientId = client.id;
  const code = await db.costCode.create({
    data: { code: 'P4-E2E-' + key, name: 'Electrical', type: 'SUBCONTRACT' },
  });
  codeId = code.id;
  const project = await db.project.create({
    data: {
      number: 'P4-E2E-' + key,
      name: 'Purchasing browser project',
      contractAmount: 12000,
      contacts: { create: { contactId: client.id, role: 'CLIENT' } },
    },
  });
  projectId = project.id;
  await db.budget.create({
    data: {
      projectId,
      name: 'Original budget',
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
              costType: 'SUBCONTRACT',
              description: 'Electrical',
              amount: 10000,
            },
          },
        })),
      },
    },
  });
});
test.afterAll(() => db.$disconnect());
test('project purchase order and accepted change order flow into commitment and budget reports', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await page.goto('/projects/' + projectId + '/purchase-orders');
  await page.getByRole('button', { name: 'New purchase / work order' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title', { exact: true }).fill('Electrical PO');
  await dialog.getByLabel('Vendor / subcontractor', { exact: true }).selectOption(vendorId);
  await dialog.getByRole('button', { name: 'Add line', exact: true }).click();
  await dialog.getByLabel('Description', { exact: true }).fill('Electrical scope');
  await dialog.getByLabel('Cost code', { exact: true }).selectOption(codeId);
  await dialog.getByLabel('Unit cost', { exact: true }).fill('10000');
  await dialog.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await page.getByRole('button', { name: 'Approve internally', exact: true }).click();
  await page.getByRole('button', { name: 'Issue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record invoice', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Record invoice', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount (excluding recoverable tax)').fill('4000');
  await dialog.getByLabel('Invoice reference / description').fill('Invoice ABC-123');
  await dialog.getByRole('button', { name: 'Save invoice', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Remaining $6,000.00', { exact: true })).toBeVisible();
  await page.goto('/projects/' + projectId + '/change-orders');
  await page.getByRole('button', { name: 'New change order', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title', { exact: true }).fill('Added outlets');
  await dialog.getByLabel('Client contact', { exact: true }).selectOption(clientId);
  await dialog.getByLabel('Scope', { exact: true }).fill('Install additional outlets.');
  await dialog.getByRole('button', { name: 'Add line', exact: true }).click();
  await dialog
    .locator('.purchasing-line-editor')
    .getByLabel('Description', { exact: true })
    .fill('Internal electrical estimate');
  await dialog.getByLabel('Client description', { exact: true }).fill('Additional outlets');
  await dialog.getByLabel('Cost code', { exact: true }).selectOption(codeId);
  await dialog.getByLabel('Unit cost', { exact: true }).fill('2000');
  await dialog.getByLabel('Markup method', { exact: true }).selectOption('PERCENT_ON_COST');
  await dialog.getByLabel('Markup value', { exact: true }).fill('35');
  await dialog.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await page.getByRole('button', { name: 'Approve internally', exact: true }).click();
  await page.getByRole('button', { name: 'Issue', exact: true }).click();
  await page.getByRole('button', { name: 'View / print document', exact: true }).click();
  await expect(page.locator('.purchasing-document')).toContainText('$3,051.00');
  await expect(page.locator('.purchasing-document')).not.toContainText(
    'Internal electrical estimate',
  );
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.purchasing-document')).toHaveCSS('visibility', 'visible');
  await expect(page.locator('.purchasing-document h1')).toHaveCSS('visibility', 'visible');
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Record client acceptance', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Accepted by (client name)').fill('Client Person');
  await dialog.getByLabel('Acceptance evidence / reference').fill('Signed email approval');
  await dialog.getByRole('button', { name: 'Confirm accept', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.purchasing-card .badge')).toHaveText('ACCEPTED');
  await page.goto('/projects/' + projectId + '/budget');
  const summary = page.locator('.finance-summary');
  await expect(summary).toContainText('$14,700.00');
  await expect(summary).toContainText('$12,000.00');
  await expect(summary).toContainText('$6,000.00');
  await expect(summary).toContainText('$4,000.00');
  await page.getByText('Budget version history', { exact: true }).click();
  await expect(page.getByText(/Version 3/)).toBeVisible();
});
