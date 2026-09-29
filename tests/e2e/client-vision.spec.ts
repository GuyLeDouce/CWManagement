import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/lib/crypto';
const db = new PrismaClient(),
  key = randomUUID(),
  email = `vision-${key}@example.test`,
  password = 'vision-browser-test-only-password';
let projectId: string, contactId: string;
test.beforeAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Isolated test database required');
  const owner = await db.user.create({
    data: {
      email,
      firstName: 'Vision',
      lastName: 'Owner',
      roles: ['OWNER'],
      passwordHash: await hashPassword(password),
    },
  });
  const contact = await db.contact.create({
    data: { firstName: 'Example', lastName: 'Client', types: ['CLIENT'] },
  });
  contactId = contact.id;
  const p = await db.project.create({
    data: {
      number: key,
      name: 'Client Vision browser project',
      address: 'Example project site',
      clientVisibleNotes: 'Welcome to your project.',
      internalNotes: 'PRIVATE-VISION-SENTINEL',
      contacts: { create: { contactId, role: 'CLIENT' } },
    },
  });
  projectId = p.id;
  const code = await db.costCode.create({
    data: { code: key, name: 'Fixtures', type: 'MATERIAL' },
  });
  const selection = await db.selection.create({
    data: {
      projectId,
      title: 'Choose fixtures',
      category: 'Fixtures',
      createdById: owner.id,
      options: {
        create: {
          name: 'Client option',
          quantity: 1,
          unitCost: 9800,
          markupMethod: 'FIXED',
          markupValue: 4700,
          clientPrice: 14500,
          costCodeId: code.id,
          costType: 'MATERIAL',
          attachmentIds: [],
        },
      },
    },
  });
  await db.selection.update({
    where: { id: selection.id },
    data: { publishedAt: new Date(), status: 'PUBLISHED' },
  });
  await db.changeOrder.create({
    data: {
      projectId,
      number: 'VISION-' + key,
      revisions: {
        create: {
          revision: 0,
          title: 'Client change',
          clientId: contactId,
          status: 'ISSUED',
          issuedAt: new Date(),
          createdById: owner.id,
          taxRate: 0.13,
          snapshot: {
            number: 'CO-VISION',
            revision: 0,
            title: 'Client change',
            scope: 'Published scope',
            scheduleDays: 1,
            issuedAt: new Date().toISOString(),
            subtotal: '27000',
            tax: '3510',
            total: '30510',
            taxRate: '0.13',
            lines: [],
          },
        },
      },
    },
  });
  await db.projectTask.create({
    data: {
      projectId,
      name: 'PRIVATE-VISION-SENTINEL',
      clientTitle: 'Published milestone',
      clientVisible: true,
      createdById: owner.id,
      milestone: true,
    },
  });
  await db.conversation.create({
    data: {
      projectId,
      subject: 'Shared discussion',
      audience: 'CLIENT',
      messages: { create: { authorId: owner.id, body: 'Published message' } },
    },
  });
});
test.afterAll(() => db.$disconnect());
async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/login/);
}
test('eye opens read-only Client Vision in a new tab without changing staff session', async ({
  page,
}) => {
  await login(page);
  await page.goto(`/projects/${projectId}/schedule`);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Preview Client View', exact: true }).click();
  const preview = await popupPromise;
  const writes: string[] = [];
  preview.on('request', (r) => {
    if (r.method() === 'POST') writes.push(r.url());
  });
  await expect(
    preview.getByRole('heading', { name: 'Client Vision browser project', exact: true }),
  ).toBeVisible();
  await expect(preview.getByText('CLIENT VIEW PREVIEW', { exact: true })).toBeVisible();
  await expect(preview.locator('.sidebar')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/schedule$`));
  expect(await preview.evaluate(() => window.opener === null)).toBe(true);
  await expect(preview.getByText('Example project site')).toBeVisible();
  await preview.getByRole('link', { name: 'selections', exact: true }).click();
  await expect(
    preview.getByRole('button', { name: 'Confirm selection - Preview only' }),
  ).toBeDisabled();
  await preview.getByLabel('Viewing as').selectOption(contactId);
  await expect(preview).toHaveURL(new RegExp('contactId=' + contactId));
  await expect(preview.getByLabel('Viewing as')).toHaveValue(contactId);
  await preview.getByRole('link', { name: 'change orders', exact: true }).click();
  await expect(preview.getByRole('button', { name: 'Approve - Preview only' })).toBeDisabled();
  await expect(preview.getByText('Total: $30,510.00', { exact: true })).toBeVisible();
  await expect(preview.getByText('HST:', { exact: false })).toHaveCount(0);
  await preview.getByRole('link', { name: 'messages', exact: true }).click();
  await expect(preview.getByText('Published message')).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Reply - Preview only' })).toBeDisabled();
  await expect(preview.getByRole('button', { name: 'Send message', exact: true })).toHaveCount(0);
  const payload = await preview.request.get(
    `/api/client-management/preview?projectId=${projectId}&contactId=${contactId}`,
  );
  const body = await payload.text();
  for (const field of [
    'PRIVATE-VISION-SENTINEL',
    'unitCost',
    'markupValue',
    'storageKey',
    'costTotal',
  ])
    expect(body).not.toContain(field);
  expect(writes).toEqual([]);
  await preview.setViewportSize({ width: 390, height: 844 });
  await preview.getByRole('link', { name: 'home', exact: true }).click();
  await expect(
    preview.getByRole('heading', { name: 'Client Vision browser project', exact: true }),
  ).toBeVisible();
  expect(
    await preview.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await expect(preview).toHaveURL(
    (url) =>
      url.pathname.replace(/\/$/, '') === `/client-preview/projects/${projectId}` &&
      url.searchParams.get('contactId') === contactId,
  );
  await expect(preview.getByRole('heading', { name: 'Needs your attention' })).toBeVisible();
  await preview.screenshot({ path: 'test-results/client-vision-mobile.png' });
  await preview.setViewportSize({ width: 1440, height: 1000 });
  await expect(preview.getByRole('heading', { name: 'Needs your attention' })).toBeVisible();
  await preview.screenshot({ path: 'test-results/client-vision-desktop.png' });
  await expect(preview.getByRole('link', { name: 'Manage Client Visibility' })).toHaveAttribute(
    'href',
    `/projects/${projectId}/clients`,
  );
  await page.reload();
  await expect(page.getByRole('link', { name: 'Preview Client View', exact: true })).toBeVisible();
});
test('project tax override changes presentation in the shared portal', async ({ page }) => {
  await login(page);
  await page.goto(`/projects/${projectId}/settings`);
  await page.getByLabel('Client financial display').selectOption('SHOW_TAX_BREAKDOWN');
  await page.getByRole('button', { name: 'Save Client View settings' }).click();
  await expect(page.getByText('Client View settings saved.', { exact: true })).toBeVisible();
  await page.goto(`/client-preview/projects/${projectId}/change-orders?contactId=${contactId}`);
  await expect(page.getByText('HST: $3,510.00', { exact: true })).toBeVisible();
  await expect(page.getByText('Subtotal: $27,000.00', { exact: true })).toBeVisible();
});
