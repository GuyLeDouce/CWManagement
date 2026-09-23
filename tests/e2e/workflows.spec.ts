import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { previousWeek } from '../../src/lib/time';
import { hashPassword, randomToken } from '../../src/lib/crypto';
const db = new PrismaClient();
const run = randomUUID().slice(0, 8),
  password = 'A-test-password-only-1234';
let email: string, shop: string, truck: string, ownerEmail: string, employeeId: string;
test.beforeAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Browser tests require a dedicated database ending in _test.');
  email = `browser-${run}@example.test`;
  ownerEmail = `browser-owner-${run}@example.test`;
  const user = await db.user.create({
    data: {
      email,
      firstName: 'Jamie',
      lastName: 'Field',
      roles: ['SHOP', 'SITE', 'OFFICE'],
      earliestStart: '00:00',
      timezone: ' ',
      passwordHash: await hashPassword(password),
    },
  });
  employeeId = user.id;
  await db.user.create({
    data: {
      email: ownerEmail,
      firstName: 'Nelson',
      lastName: 'Evans',
      roles: ['OWNER', 'ADMIN'],
      passwordHash: await hashPassword(password),
    },
  });
  const task = await db.task.create({ data: { name: `Framing ${run}` } });
  const job = await db.project.create({
    data: {
      name: `Ross Renovation ${run}`,
      number: `E2E-${run}`,
      tasks: { create: { taskId: task.id } },
      employees: { create: { userId: user.id } },
    },
  });
  await db.employeeTask.create({ data: { userId: user.id, taskId: task.id } });
  const vehicle = await db.truck.create({ data: { name: `Truck ${run}` } });
  shop = randomToken();
  truck = randomToken();
  await db.qrCode.create({ data: { type: 'SHOP', label: 'Shop entrance', token: shop } });
  await db.qrCode.create({
    data: { type: 'TRUCK', label: 'Truck 01', token: truck, truckId: vehicle.id },
  });
  const code = await db.accountingCode.create({
    data: { code: `E2E-LAB-${run}`, description: 'Labour' },
  });
  const start = new Date(+previousWeek(new Date(), 'America/Toronto').start + 12 * 3600000),
    end = new Date(+start + 3600000);
  const day = await db.workDay.create({
    data: {
      userId: user.id,
      date: 'test',
      timezone: 'America/Toronto',
      originalStart: start,
      paidStart: start,
      endedAt: end,
    },
  });
  await db.timeSegment.create({
    data: {
      userId: user.id,
      workDayId: day.id,
      type: 'SHOP',
      jobsiteId: job.id,
      taskId: task.id,
      accountingCodeId: code.id,
      originalStart: start,
      originalEnd: end,
      effectiveStart: start,
      end,
      status: 'PENDING_PM_APPROVAL',
    },
  });
});
test.afterAll(() => db.$disconnect());

test('financial totals, proposal print content, and accepted budgets remain consistent', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(ownerEmail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api/financial/${path}`, {
      headers: { Origin: 'http://localhost:3000' },
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const project = await db.project.findUniqueOrThrow({ where: { number: `E2E-${run}` } });
  const code = await post('cost-codes', { code: `FIN-${run}`, name: 'Finishes', type: 'MATERIAL' });
  const estimate = await post('estimates', { projectId: project.id, name: 'Browser estimate' });
  const source = await db.estimateRevision.findUniqueOrThrow({
    where: { id: estimate.revisions[0].id },
    include: { sections: true },
  });
  const line = {
    revisionId: source.id,
    sectionId: source.sections[0].id,
    costCodeId: code.id,
    costType: 'MATERIAL',
    description: 'Internal finish cost',
    clientDescription: 'Finish package',
    quantity: '3',
    unit: 'EA',
    unitCost: '33.335',
    markupMethod: 'FIXED',
    markupValue: '10',
    taxable: true,
    optional: false,
    allowance: false,
    included: true,
    sortOrder: 0,
    expectedVersion: source.version,
  };
  await post('estimate-lines', line);
  await post('estimate-lines', {
    ...line,
    description: 'Untaxed item',
    quantity: '1',
    unitCost: '50',
    markupMethod: 'NONE',
    markupValue: '0',
    taxable: false,
    expectedVersion: source.version + 1,
  });
  await page.goto(`/projects/${project.id}/estimate`);
  await expect(page.locator('.finance-summary')).toContainText('$174.31');
  await expect(page.locator('.finance-summary')).toContainText('$14.30');
  await post('proposals', {
    estimateRevisionId: source.id,
    title: 'Browser proposal',
    introduction: 'Welcome to your project.',
    scope: 'Install finish package.',
    exclusions: 'Appliances excluded.',
    assumptions: 'Site ready.',
    terms: 'Payment upon completion.',
    expiryDate: '2026-12-31',
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add line', exact: true })).toBeDisabled();
  await page.goto(`/projects/${project.id}/proposals`);
  await page.getByRole('button', { name: 'View / print' }).click();
  const document = page.locator('.proposal-document');
  for (const text of [
    'Welcome to your project.',
    'Install finish package.',
    'Appliances excluded.',
    'Site ready.',
    'Payment upon completion.',
    '2026-12-31',
    '$174.31',
  ])
    await expect(document).toContainText(text);
  await expect(document).not.toContainText('Internal finish cost');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Issue', exact: true }).click();
  await page.getByRole('button', { name: 'Mark accepted', exact: true }).click();
  await page.getByRole('button', { name: 'Create budget', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved.');
  await page.goto(`/projects/${project.id}/budget`);
  await expect(page.locator('.finance-summary')).toContainText('$150.01');
});
test('mobile employee completes site workflow and My Hours stays available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/scan/${shop}`);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Good morning, Jamie.' })).toBeVisible();
  await page.getByRole('button', { name: 'Site', exact: true }).click();
  await expect(page.getByRole('button', { name: 'CLOCK IN', exact: true })).toBeDisabled();
  await page
    .getByLabel('Project', { exact: true })
    .selectOption({ label: `Ross Renovation ${run}` });
  await page.screenshot({ path: 'test-results/mobile-clock.png', fullPage: true });
  await page.getByRole('button', { name: 'CLOCK IN', exact: true }).click();
  await expect(page.getByText('TRAVEL', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open My Hours' }).click();
  await expect(page.getByRole('heading', { name: 'My hours' })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.goto(`/scan/${truck}`);
  await expect(page.getByRole('button', { name: 'ARRIVED', exact: true })).toBeDisabled();
  await page.getByLabel('Task', { exact: true }).selectOption({ label: `Framing ${run}` });
  await expect(page.getByRole('button', { name: 'ARRIVED', exact: true })).toBeEnabled();
  await page.context().setOffline(true);
  await expect(
    page.getByText('Internet connection required to record time.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'ARRIVED', exact: true })).toBeDisabled();
  await page.context().setOffline(false);
  await page.getByRole('button', { name: 'ARRIVED', exact: true }).click();
  await expect(page.getByRole('button', { name: 'SWITCH', exact: true })).toBeVisible();
  await expect(page.getByText('Framing ' + run, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'CLOCK OUT', exact: true }).click();
  await expect(page.getByText("You're clocked out. Enjoy the rest of your day!")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
test('owner dashboard, admin permissions, and desktop layout', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(ownerEmail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.screenshot({ path: 'test-results/owner-dashboard.png', fullPage: true });
  await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'A well-organized workday.' })).toBeVisible();
  await page.getByRole('button', { name: 'QR codes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create QR code', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Time & report settings', exact: true }).click();
  await expect(page.getByLabel('Company timezone')).toHaveValue('America/Toronto');
  await page.goto('/verify');
  await page.getByRole('combobox', { name: 'Employee', exact: true }).selectOption(employeeId);
  await expect(page.getByText('PENDING PM APPROVAL', { exact: true })).toHaveCount(1);
  await expect(page.getByText('PENDING PM APPROVAL', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select all eligible', exact: true }).click();
  await page.getByRole('button', { name: 'Approve 1 selected', exact: true }).click();
  await expect(page.getByText('1 records approved.', { exact: true })).toBeVisible();
  await page.goto('/send');
  await page.getByRole('combobox', { name: 'Employee', exact: true }).selectOption(employeeId);
  await expect(page.getByText('PM APPROVED', { exact: true })).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Sort accounting records' }).selectOption('jobsite');
  await page.getByRole('button', { name: 'Select all eligible', exact: true }).click();
  await page.getByRole('button', { name: 'Finalize 1 & create CSV', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Download finalized CSV' })).toHaveAttribute(
    'href',
    /export\/download/,
  );
});
test('unauthenticated API access and cross-origin punches are rejected', async ({ request }) => {
  expect((await request.get('/api/hours')).status()).toBe(401);
  expect(
    (
      await request.post('/api/punch', {
        data: {},
        headers: { origin: 'https://untrusted.example' },
      })
    ).status(),
  ).toBe(403);
});
test('an invalid saved timezone shows a warning and leaves Admin accessible', async ({ page }) => {
  await db.user.update({
    where: { email: ownerEmail },
    data: { timezone: 'NULL', roles: ['OWNER', 'ADMIN', 'OFFICE'] },
  });
  try {
    await page.goto('/login');
    await page.getByLabel('Email address').fill(ownerEmail);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Open My Hours' }).click();
    await expect(
      page.getByText('A timezone setting needs attention.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'We couldn’t load this page.' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'A well-organized workday.' })).toBeVisible();
  } finally {
    await db.user.update({
      where: { email: ownerEmail },
      data: { timezone: null, roles: ['OWNER', 'ADMIN'] },
    });
  }
});
test('malformed stored passwords return an ordinary login rejection', async ({ request }) => {
  const brokenEmail = `broken-hash-${run}@example.test`;
  const user = await db.user.create({
    data: {
      email: brokenEmail,
      firstName: 'Recovery',
      lastName: 'Test',
      roles: ['OWNER'],
      passwordHash: 'a-plain-password',
    },
  });
  try {
    const response = await request.post('/api/auth/login', {
      headers: { Origin: 'http://localhost:3000' },
      data: { email: brokenEmail, password: 'a-plain-password' },
    });
    expect(response.status()).toBe(401);
    expect((await response.json()).error).toBe('Email or password is incorrect.');
    expect(response.headers()['set-cookie']).toBeUndefined();
  } finally {
    await db.user.delete({ where: { id: user.id } });
  }
});
test('PWA manifest, icon, and public offline page are available', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
  const icon = await request.get('/icons/icon-512.png');
  expect(icon.headers()['content-type']).toContain('image/png');
  const sw = await request.get('/sw.js');
  expect(sw.headers()['cache-control']).toContain('no-store');
  expect(await (await request.get('/offline.html')).text()).toContain(
    'Internet connection required to record time.',
  );
});
