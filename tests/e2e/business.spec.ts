import { test, expect, Page } from '@playwright/test';
import { PrismaClient, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/lib/crypto';
const db = new PrismaClient(),
  key = randomUUID().slice(0, 8),
  password = 'business-browser-test-password';
let projectId: string,
  ownerId: string,
  clientId: string,
  tradeId: string,
  stageId: string,
  secondStage: string;
const email = (r: string) => `business-${key}-${r.toLowerCase()}@example.test`;
test.beforeAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Isolated database required');
  await db.settings.upsert({ where: { id: 'company' }, create: {}, update: {} });
  const users = [];
  for (const role of ['OWNER', 'PM', 'CLIENT', 'SUBTRADE', 'CONTROLLER'] as Role[])
    users.push(
      await db.user.create({
        data: {
          email: email(role),
          firstName: 'Business',
          lastName: role,
          roles: [role],
          passwordHash: await hashPassword(password),
        },
      }),
    );
  ownerId = users[0].id;
  const client = await db.contact.create({
    data: {
      firstName: 'Business',
      lastName: 'Client ' + key,
      types: ['CLIENT'],
      portalUserId: users[2].id,
    },
  });
  clientId = client.id;
  const trade = await db.contact.create({
    data: {
      firstName: 'Business',
      lastName: 'Trade ' + key,
      types: ['SUBTRADE'],
      portalUserId: users[3].id,
    },
  });
  tradeId = trade.id;
  const p = await db.project.create({
    data: {
      number: 'BUS-' + key,
      name: 'Service browser ' + key,
      contacts: {
        create: [
          { contactId: client.id, role: 'CLIENT' },
          { contactId: trade.id, role: 'SUBTRADE' },
        ],
      },
      assignments: { create: { userId: users[1].id, role: 'PRIMARY_PROJECT_MANAGER' } },
      portalAccess: { create: { userId: users[2].id, contactId: client.id, invitedById: ownerId } },
      tradeAccess: { create: { userId: users[3].id, contactId: trade.id, invitedById: ownerId } },
    },
  });
  projectId = p.id;
  stageId = (await db.opportunityStage.create({ data: { name: 'Qualified ' + key } })).id;
  secondStage = (
    await db.opportunityStage.create({ data: { name: 'Proposal ' + key, sortOrder: 1 } })
  ).id;
  await db.projectTask.create({
    data: {
      projectId,
      name: 'Browser report task ' + key,
      createdById: ownerId,
      endDate: new Date('2026-10-01'),
    },
  });
});
test.afterAll(() => db.$disconnect());
async function login(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email(role));
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
test('CRM creates opportunity, follows up, moves stage and converts through project wizard', async ({
  page,
}) => {
  await login(page, 'OWNER');
  await page.goto('/leads');
  await page.getByRole('button', { name: 'New opportunity', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Opportunity title').fill('Won cottage ' + key);
  await modal.getByLabel('Contact', { exact: true }).selectOption(clientId);
  await modal.getByLabel('Owner', { exact: true }).selectOption(ownerId);
  await modal.getByLabel('Stage', { exact: true }).selectOption(stageId);
  await modal.getByRole('button', { name: 'Save opportunity' }).click();
  await page.getByRole('button', { name: new RegExp('Won cottage ' + key) }).click();
  await modal.getByLabel('Next action').fill('Review plans');
  await modal.getByLabel('Due', { exact: true }).fill('2026-10-01T10:00');
  await modal.getByRole('button', { name: 'Add follow-up' }).click();
  await page.getByRole('button', { name: new RegExp('Won cottage ' + key) }).click();
  await modal.getByLabel('Stage', { exact: true }).selectOption(secondStage);
  await modal.getByLabel('Status', { exact: true }).selectOption('WON');
  await modal.getByRole('button', { name: 'Save opportunity' }).click();
  await page.getByLabel('Opportunity status').selectOption('WON');
  await page.getByRole('button', { name: new RegExp('Won cottage ' + key) }).click();
  await modal.getByRole('button', { name: 'Convert to project' }).click();
  await modal.getByRole('button', { name: 'Continue' }).click();
  await modal.getByLabel('Project number').fill('CONV-' + key);
  await modal.getByRole('button', { name: 'Continue' }).click();
  await modal.getByRole('button', { name: 'Continue' }).click();
  await modal.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\//);
  await expect(
    page.getByRole('heading', { name: new RegExp('CONV-' + key + '.*Won cottage ' + key) }),
  ).toBeVisible();
});
test('warranty client submission, staff assignment, trade evidence, staff review and client verification', async ({
  browser,
}) => {
  const client = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    staff = await browser.newPage(),
    trade = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await login(client, 'CLIENT');
  await client.goto(`/client/projects/${projectId}/warranty`);
  await client.getByRole('button', { name: 'New service request' }).click();
  await client.getByLabel('Title', { exact: true }).fill('Adjust door ' + key);
  await client.getByLabel('Description', { exact: true }).fill('Entry door needs adjustment.');
  await client.getByRole('button', { name: 'Submit request' }).click();
  await expect(client.getByRole('heading', { name: 'Adjust door ' + key })).toBeVisible();
  await login(staff, 'PM');
  await staff.goto(`/projects/${projectId}/warranty`);
  const card = staff.locator('.service-card').filter({ hasText: 'Adjust door ' + key });
  await card.getByLabel('Action', { exact: true }).selectOption('accept');
  await card.getByRole('button', { name: 'Save update' }).click();
  await expect(card.locator('.badge')).toHaveText('Accepted');
  await card.locator('summary').filter({ hasText: 'Assignment, appointment' }).click();
  await card.getByLabel('Trade', { exact: true }).selectOption(tradeId);
  await card.getByLabel('Trade-safe scope').fill('Adjust entry door');
  await card.getByLabel('Action', { exact: true }).selectOption('assign');
  await card.getByRole('button', { name: 'Save update' }).click();
  await expect(card.locator('.badge')).toHaveText('Assigned');
  await login(trade, 'SUBTRADE');
  await trade.goto(`/trade/projects/${projectId}/warranty`);
  const work = trade.locator('.service-card');
  await expect(work.getByText('Adjust entry door', { exact: true })).toBeVisible();
  await work.locator('input[type=file]').setInputFiles({
    name: 'completion.png',
    mimeType: 'image/png',
    buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
  });
  await expect(work.getByRole('link', { name: 'completion.png' })).toBeVisible();
  await work.getByLabel('Action', { exact: true }).selectOption('ready');
  await work.getByRole('button', { name: 'Save update' }).click();
  await expect(work.locator('.badge')).toHaveText('Ready for review');
  await staff.reload();
  await card.getByLabel('Action', { exact: true }).selectOption('complete');
  await card.getByRole('button', { name: 'Save update' }).click();
  await expect(card.locator('.badge')).toHaveText('Ready for client');
  await client.reload();
  await client.getByLabel('Action', { exact: true }).selectOption('verify');
  await client.getByRole('button', { name: 'Save update' }).click();
  await expect(client.locator('.service-card .badge')).toHaveText('Client verified');
  await staff.reload();
  await card.getByLabel('Action', { exact: true }).selectOption('close');
  await card.getByRole('button', { name: 'Save update' }).click();
  await expect(card.locator('.badge')).toHaveText('Closed');
  await client.close();
  await staff.close();
  await trade.close();
});
test('PM filters schedule report and opens the project', async ({ page }) => {
  await login(page, 'PM');
  await page.goto('/reports');
  await page.getByLabel('Report', { exact: true }).selectOption('tasks');
  await page.getByLabel('Project', { exact: true }).selectOption(projectId);
  await page.getByRole('button', { name: 'Run report' }).click();
  await expect(page.getByRole('cell', { name: 'Browser report task ' + key })).toBeVisible();
  await page.getByRole('link', { name: 'Open record' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}/schedule`);
});

test('Owner reviews readiness and repeats one safe diagnostic without enabling reminders', async ({
  page,
}) => {
  await login(page, 'OWNER');
  await page.goto('/admin');
  const panel = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Production readiness', exact: true }) })
    .first();
  await expect(panel.getByText(/Configuration is not live validation/)).toBeVisible();
  const button = panel.getByRole('button', { name: 'Run / repeat internal test' });
  await button.click();
  await expect(panel.getByRole('status').filter({ hasText: 'Scheduler test:' })).toContainText(
    '1 new notification',
  );
  await button.click();
  await expect(panel.getByRole('status').filter({ hasText: 'Scheduler test:' })).toContainText(
    '0 new notification',
  );
});

test('Controller opens readiness without gaining employee administration', async ({ page }) => {
  await login(page, 'CONTROLLER');
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'Production readiness', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Next expected scheduler contact:', { exact: false })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Employees & permissions', exact: true }),
  ).toHaveCount(0);
  const r = await page.request.get('/api/admin');
  expect(r.status()).toBe(403);
});
