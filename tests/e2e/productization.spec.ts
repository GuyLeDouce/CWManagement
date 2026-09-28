import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/lib/crypto';
import { saveTemplate, saveCatalog } from '../../src/lib/standards';
import { templateSchema, catalogSchema } from '../../src/lib/standards-schema';
const db = new PrismaClient(),
  key = randomUUID().slice(0, 8),
  password = 'product-browser-only-password-123';
let email: string, ownerId: string, clientId: string, templateId: string;
test.beforeAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Isolated _test database required');
  email = `product-${key}@example.test`;
  const owner = await db.user.create({
    data: {
      email,
      firstName: 'Product',
      lastName: key,
      roles: ['OWNER'],
      passwordHash: await hashPassword(password),
    },
  });
  ownerId = owner.id;
  await db.settings.upsert({ where: { id: 'company' }, create: {}, update: {} });
  clientId = (
    await db.contact.create({ data: { firstName: 'Pilot', lastName: key, types: ['CLIENT'] } })
  ).id;
  const code = await db.costCode.create({
    data: { code: `PRODUCT-${key}`, name: 'Test classification', type: 'MATERIAL' },
  });
  const line = {
    description: `Framing ${key}`,
    costCodeId: code.id,
    costType: 'MATERIAL',
    unitCost: '100',
  };
  templateId = (
    await saveTemplate(
      owner,
      templateSchema.parse({
        kind: 'PROJECT',
        name: `Cottage standard ${key}`,
        content: {
          stage: 'Preconstruction',
          lines: [line],
          tasks: [
            { key: 'foundation', name: `Foundation ${key}`, offsetDays: 10, durationDays: 5 },
          ],
          selections: [
            {
              title: `Fixtures ${key}`,
              category: 'Plumbing',
              options: [{ ...line, description: 'Fixture option' }],
            },
          ],
        },
      }),
    )
  ).id;
  await saveCatalog(
    owner,
    catalogSchema.parse({
      name: `Catalog framing ${key}`,
      costCodeId: code.id,
      costType: 'MATERIAL',
      unit: 'ea',
      unitCost: '10',
    }),
  );
  await saveTemplate(
    owner,
    templateSchema.parse({
      kind: 'ASSEMBLY',
      name: `Wall assembly ${key}`,
      content: { lines: [{ ...line, description: `Assembly component ${key}`, quantity: '0.5' }] },
    }),
  );
});
test.afterAll(() => db.$disconnect());
test('company standard → project wizard → catalog and assembly → schedule → publish selection', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/login/);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Project type', { exact: true }).fill('Cottage');
  await dialog.getByLabel('Client', { exact: true }).selectOption(clientId);
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByLabel('Project name', { exact: true }).fill(`Product cottage ${key}`);
  await dialog.getByLabel('Project number', { exact: true }).fill(`PC-${key}`);
  await dialog.getByLabel('Site address').fill('Test site');
  await dialog.getByLabel('Project manager').selectOption(ownerId);
  await dialog.getByLabel('Approximate start').fill('2026-10-01');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByLabel('Project template', { exact: true }).selectOption(templateId);
  await expect(dialog.getByText(/1 schedule tasks/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\//);
  const projectUrl = page.url();
  await page.goto(projectUrl + '/estimate');
  await expect(page.getByLabel(`Edit description Framing ${key}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add from cost catalog', exact: true }).click();
  await page.getByLabel('Find catalog item').fill(`Catalog framing ${key}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(
    page.getByLabel(`Edit quantity Catalog framing ${key}`, { exact: true }),
  ).toBeVisible();
  await page.getByLabel(`Edit quantity Catalog framing ${key}`, { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Save row', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save row', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use template', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Template', { exact: true })
    .selectOption({ label: `Wall assembly ${key} · Version 1` });
  await page.getByLabel('Base quantity').fill('2400');
  await page.getByRole('button', { name: 'Add selected content', exact: true }).click();
  await expect(
    page.getByLabel(`Edit quantity Assembly component ${key}`, { exact: true }),
  ).toHaveValue('1200');
  await page.goto(projectUrl + '/schedule');
  await page.getByLabel(`Status Foundation ${key}`, { exact: true }).selectOption('IN_PROGRESS');
  await expect(page.getByLabel(`Status Foundation ${key}`, { exact: true })).toHaveValue(
    'IN_PROGRESS',
  );
  await page.goto(projectUrl + '/selections');
  await expect(page.getByText(`Fixtures ${key}`, { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Publish to client', exact: true }).click();
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
});
