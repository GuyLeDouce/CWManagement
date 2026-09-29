import { internalGuides } from '../../src/lib/help';
import { test, expect, type Page } from '@playwright/test';
import { PrismaClient, type Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/lib/crypto';
const db = new PrismaClient(),
  key = randomUUID().slice(0, 8),
  password = 'help-browser-test-only-password';
const email = (role: string) => `help-${role.toLowerCase()}-${key}@example.test`;
test.beforeAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Isolated _test database required');
  const passwordHash = await hashPassword(password);
  for (const role of ['OWNER', 'FIELD', 'CLIENT', 'SUBTRADE'] as Role[])
    await db.user.create({
      data: { email: email(role), firstName: 'Help', lastName: role, roles: [role], passwordHash },
    });
  await db.settings.upsert({ where: { id: 'company' }, create: {}, update: {} });
});
test.afterAll(() => db.$disconnect());
async function login(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email(role));
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
test('Owner help search, deep link, related guide, permitted destination and manual print', async ({
  page,
}) => {
  await login(page, 'OWNER');
  await page.getByRole('link', { name: 'HOW TO', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'How can we help?' })).toBeVisible();
  await page.screenshot({ path: 'test-results/help-desktop.png' });
  await page.getByRole('searchbox', { name: 'Search CWManagement help' }).fill('estimate');
  await page
    .locator('.help-results')
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: 'Creating an Estimate', exact: true }) })
    .click();
  await expect(page).toHaveURL(/\/how-to\/estimating\/create-estimate$/);
  await page
    .locator('.help-related')
    .getByRole('link')
    .filter({ hasText: 'Quantity, cost, markup' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Markup is not margin', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Go to Projects', exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('link', { name: 'How to: Creating a Project' })).toBeVisible();
  await page.goto('/how-to/manual');
  await expect(page.getByRole('heading', { name: 'CWManagement operating manual' })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.help-topbar')).toBeHidden();
  await expect(
    page.getByRole('heading', { name: 'Creating an Estimate', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.help-manual-article')).toHaveCount(internalGuides.length);
});
test('Mobile category navigation and unknown guide', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'OWNER');
  await page.goto('/how-to');
  await expect(page.getByRole('heading', { name: 'How can we help?' })).toBeVisible();
  await page.screenshot({ path: 'test-results/help-mobile.png' });
  await page.getByLabel('Help category', { exact: true }).selectOption('schedule');
  await page
    .locator('.help-results')
    .getByRole('link')
    .filter({ hasText: 'Timeline, inline status' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Timeline, inline status and bulk date shifts' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto('/how-to/schedule/not-a-guide');
  await expect(page.getByRole('heading', { name: 'Guide not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Return to Help' }).click();
  await expect(page.getByRole('heading', { name: 'How can we help?' })).toBeVisible();
});
test('Field staff can read internal help but get no accounting action links', async ({ page }) => {
  await login(page, 'FIELD');
  await page.goto('/how-to');
  await expect(page.getByRole('heading', { name: 'How can we help?' })).toBeVisible();
  await expect(page.locator('.help-recommended')).toContainText('Clocking in');
  await page.goto('/how-to/quickbooks/qb-po');
  await expect(
    page.getByRole('heading', { name: 'Preview and queue a Purchase Order for QuickBooks' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open QuickBooks', exact: true })).toHaveCount(0);
});
for (const [role, portal, other] of [
  ['CLIENT', 'client', 'trade'],
  ['SUBTRADE', 'trade', 'client'],
])
  test(`${role} help stays in its own portal`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, role);
    await page.getByRole('link', { name: 'Help', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${portal}/help$`));
    await expect(page.getByRole('heading', { name: 'How can we help?' })).toBeVisible();
    await page.goto(`/${portal}/help/using-portal/welcome`);
    await expect(
      page.getByRole('heading', {
        name: portal === 'client' ? 'Welcome to your Client Portal' : 'Welcome to the Trade Portal',
      }),
    ).toBeVisible();
    await expect(page.locator('a[href^="/how-to"]')).toHaveCount(0);
    await page.goto('/how-to');
    await expect(page).toHaveURL(new RegExp(`/${portal}$`));
    await page.goto(`/${other}/help`);
    await expect(page).toHaveURL(new RegExp(`/${portal}$`));
  });

test('Help routes require authentication', async ({ page }) => {
  for (const route of ['/how-to', '/client/help', '/trade/help']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login/);
  }
});
