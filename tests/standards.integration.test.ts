import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { projectProjection } from '../src/lib/client-projections';
import { saveSpecification, specificationSchema } from '../src/lib/specifications';
import {
  saveTemplate,
  applyTemplate,
  applySchema,
  saveCatalog,
  importCatalog,
  addCatalog,
  catalogAddSchema,
  selectionsFromEstimate,
  previewTemplateCsv,
  bulkCatalog,
  catalogBulkSchema,
} from '../src/lib/standards';
import { templateSchema, catalogSchema } from '../src/lib/standards-schema';
import { setupProject, setupSchema, captureTemplate } from '../src/lib/project-setup';
import { globalSearch, updateSchedule, scheduleBulkSchema } from '../src/lib/productivity';
import { createProposal, proposalSchema, proposalAction } from '../src/lib/financial';
beforeAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Isolated _test database required');
  await db.settings.upsert({ where: { id: 'company' }, create: {}, update: {} });
});
afterAll(() => db.$disconnect());
async function fixture() {
  const key = randomUUID();
  const actor = await db.user.create({
    data: {
      firstName: 'Standards',
      lastName: 'Owner',
      email: key + '@example.test',
      roles: ['OWNER'],
    },
  });
  const code = await db.costCode.create({
    data: { code: key, name: 'Test material', type: 'MATERIAL' },
  });
  const client = await db.contact.create({
    data: { firstName: 'Test', lastName: 'Client', types: ['CLIENT'] },
  });
  const template = await saveTemplate(
    actor,
    templateSchema.parse({
      kind: 'PROJECT',
      name: key,
      content: {
        stage: 'Planning',
        folders: ['Drawings', 'Contracts'],
        scope: 'Reviewed scope wording',
        lines: [
          {
            description: 'Material allowance',
            section: 'Finishes',
            costCodeId: code.id,
            costType: 'MATERIAL',
            unitCost: '100',
            quantity: '2',
            allowance: true,
          },
        ],
        tasks: [
          { key: 'a', name: 'Foundation', offsetDays: 10, durationDays: 4 },
          { key: 'b', name: 'Frame', predecessor: 'a', lagDays: 2, durationDays: 5 },
        ],
        selections: [
          {
            title: 'Flooring',
            category: 'Interior',
            options: [
              {
                description: 'Option A',
                costCodeId: code.id,
                costType: 'MATERIAL',
                unitCost: '50',
              },
            ],
          },
        ],
      },
    }),
  );
  return { actor, code, client, template, key };
}
async function project(f: Awaited<ReturnType<typeof fixture>>) {
  return setupProject(
    f.actor,
    setupSchema.parse({
      number: randomUUID(),
      name: 'Template project',
      managerId: f.actor.id,
      contactId: f.client.id,
      startDate: '2026-10-01',
      templateId: f.template.id,
      templateVersion: f.template.version,
    }),
  );
}
describe('Company standards and safe project setup', () => {
  it('bulk catalog changes are version checked and roll back the entire batch on conflict', async () => {
    const f = await fixture();
    const item = await saveCatalog(
      f.actor,
      catalogSchema.parse({
        name: 'Bulk',
        costCodeId: f.code.id,
        costType: 'MATERIAL',
        unit: 'ea',
        unitCost: '10.125',
      }),
    );
    await bulkCatalog(
      f.actor,
      catalogBulkSchema.parse({ items: [{ id: item.id, version: 1 }], factor: '1.1' }),
    );
    expect(
      (await db.costCatalogItem.findUniqueOrThrow({ where: { id: item.id } })).unitCost.toString(),
    ).toBe('11.1375');
    await expect(
      bulkCatalog(
        f.actor,
        catalogBulkSchema.parse({ items: [{ id: item.id, version: 1 }], factor: '2' }),
      ),
    ).rejects.toThrow('changed');
  });
  it('requires project-template team roles and assigns only active internal people', async () => {
    const f = await fixture();
    const t = await saveTemplate(
      f.actor,
      templateSchema.parse({
        kind: 'PROJECT',
        name: 'Team',
        content: {
          teamRoles: ['ESTIMATOR'],
          tasks: [{ key: 'price', name: 'Prepare estimate', assigneeRole: 'ESTIMATOR' }],
        },
      }),
    );
    const input = setupSchema.parse({
      name: 'Team project',
      number: randomUUID(),
      managerId: f.actor.id,
      startDate: '2026-01-01',
      templateId: t.id,
      templateVersion: t.version,
    });
    await expect(setupProject(f.actor, input)).rejects.toThrow('Assign a team member');
    const p = await setupProject(f.actor, {
      ...input,
      team: [{ role: 'ESTIMATOR', userId: f.actor.id }],
    });
    expect(
      await db.projectTaskAssignee.count({
        where: { userId: f.actor.id, task: { projectId: p.id } },
      }),
    ).toBe(1);
  });
  it('keeps specifications private until publishing and allowlists client fields', async () => {
    const f = await fixture(),
      p = await project(f);
    const s = await saveSpecification(
      f.actor,
      specificationSchema.parse({
        projectId: p.id,
        title: 'Roofing',
        category: 'Exterior',
        description: 'Reviewed product',
      }),
    );
    expect((await projectProjection(db, p.id)).specifications).toHaveLength(0);
    await saveSpecification(
      f.actor,
      specificationSchema.parse({
        id: s.id,
        version: s.version,
        projectId: p.id,
        title: s.title,
        category: s.category,
        description: s.description,
        clientVisible: true,
      }),
    );
    const projected = (await projectProjection(db, p.id)).specifications;
    expect(projected).toHaveLength(1);
    expect(Object.keys(projected[0]).sort()).toEqual([
      'category',
      'description',
      'id',
      'title',
      'updatedAt',
    ]);
    await expect(
      saveSpecification(
        f.actor,
        specificationSchema.parse({
          id: s.id,
          version: s.version,
          projectId: p.id,
          title: 'Stale',
          category: 'Exterior',
          description: '',
        }),
      ),
    ).rejects.toThrow('changed');
  });
  it('previews schedule/estimate CSV and blocks dependency errors before saving', async () => {
    const f = await fixture();
    const estimate = await previewTemplateCsv(f.actor, {
      kind: 'ESTIMATE',
      csv: `section,description,costCode,costType,quantity,unit,unitCost\nFraming,Material,${f.code.code},MATERIAL,2,ea,10\n`,
    });
    expect(estimate.errors).toHaveLength(0);
    expect(estimate.content.lines[0].costCodeId).toBe(f.code.id);
    const schedule = await previewTemplateCsv(f.actor, {
      kind: 'SCHEDULE',
      csv: 'key,name,predecessor\na,Foundation,b\nb,Frame,a\n',
    });
    expect(schedule.errors[0].message).toContain('cycle');
  });
  it('creates a complete private project atomically without financial or portal effects', async () => {
    const f = await fixture(),
      p = await project(f);
    const tasks = await db.projectTask.findMany({
      where: { projectId: p.id },
      orderBy: { sortOrder: 'asc' },
      include: { predecessors: true },
    });
    expect(tasks).toHaveLength(2);
    expect(tasks[1].startDate?.toISOString().slice(0, 10)).toBe('2026-10-17');
    expect(tasks[1].predecessors[0].predecessorId).toBe(tasks[0].id);
    expect(tasks.every((t) => !t.clientVisible)).toBe(true);
    expect(
      await db.estimateLine.count({ where: { revision: { estimate: { projectId: p.id } } } }),
    ).toBe(1);
    expect(await db.selection.count({ where: { projectId: p.id, status: 'DRAFT' } })).toBe(1);
    expect(await db.budget.count({ where: { projectId: p.id } })).toBe(0);
    expect(await db.commitment.count({ where: { projectId: p.id } })).toBe(0);
    expect(await db.clientProjectAccess.count({ where: { projectId: p.id } })).toBe(0);
    expect((p.setupDefaults as { folders: string[] }).folders).toEqual(['Drawings', 'Contracts']);
  });
  it('template edits and archive do not change existing project or application snapshots', async () => {
    const f = await fixture(),
      p = await project(f);
    const before = await db.templateApplication.findFirstOrThrow({ where: { projectId: p.id } });
    await saveTemplate(
      f.actor,
      templateSchema.parse({
        id: f.template.id,
        expectedVersion: 1,
        kind: 'PROJECT',
        name: 'Changed',
        active: false,
        content: {},
      }),
    );
    expect(await db.projectTask.count({ where: { projectId: p.id } })).toBe(2);
    expect(
      (await db.templateApplication.findUniqueOrThrow({ where: { id: before.id } })).snapshot,
    ).toEqual(before.snapshot);
    await expect(project(f)).rejects.toThrow('template changed');
  });
  it('partial imports and concurrent retry copy once and preserve locked revisions', async () => {
    const f = await fixture(),
      p = await project(f);
    const rev = await db.estimateRevision.findFirstOrThrow({
      where: { estimate: { projectId: p.id } },
    });
    const t = await saveTemplate(
      f.actor,
      templateSchema.parse({
        kind: 'ASSEMBLY',
        name: 'Wall',
        content: {
          lines: [
            {
              description: 'Labour',
              costCodeId: f.code.id,
              costType: 'LABOUR',
              quantity: '0.5',
              unitCost: '50',
            },
            {
              description: 'Material',
              costCodeId: f.code.id,
              costType: 'MATERIAL',
              quantity: '2',
              unitCost: '3',
            },
          ],
        },
      }),
    );
    const input = applySchema.parse({
      projectId: p.id,
      templateId: t.id,
      expectedVersion: 1,
      requestKey: randomUUID(),
      startDate: '2026-10-01',
      revisionId: rev.id,
      revisionVersion: rev.version,
      lineIndexes: [1],
      baseQuantity: '2400',
    });
    await Promise.all([applyTemplate(f.actor, input), applyTemplate(f.actor, input)]);
    const lines = await db.estimateLine.findMany({ where: { revisionId: rev.id } });
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.description === 'Material')?.quantity.toString()).toBe('4800');
    await db.estimateRevision.update({ where: { id: rev.id }, data: { status: 'READY' } });
    await expect(applyTemplate(f.actor, { ...input, requestKey: randomUUID() })).rejects.toThrow(
      'locked',
    );
  });
  it('catalog CSV previews all rows and commits none when a code is invalid', async () => {
    const f = await fixture();
    const bad = `name,costCode,costType,unit,unitCost\nReal,${f.code.code},MATERIAL,ea,10\nBad,missing,MATERIAL,ea,5\n`;
    expect((await importCatalog(f.actor, { csv: bad, commit: false })).errors).toHaveLength(1);
    await expect(importCatalog(f.actor, { csv: bad, commit: true })).rejects.toThrow('preview');
    expect(await db.costCatalogItem.count({ where: { costCodeId: f.code.id } })).toBe(0);
    const csv = `name,costCode,costType,unit,unitCost\nReal,${f.code.code},MATERIAL,ea,10\n`;
    expect((await importCatalog(f.actor, { csv, commit: true })).imported).toBe(1);
  });
  it('catalog quick-add snapshots costs and leaves earlier estimates unchanged', async () => {
    const f = await fixture(),
      p = await project(f),
      rev = await db.estimateRevision.findFirstOrThrow({
        where: { estimate: { projectId: p.id } },
      });
    const item = await saveCatalog(
      f.actor,
      catalogSchema.parse({
        name: 'Standard item',
        costCodeId: f.code.id,
        costType: 'MATERIAL',
        unit: 'ea',
        unitCost: '20',
      }),
    );
    await addCatalog(
      f.actor,
      catalogAddSchema.parse({
        projectId: p.id,
        revisionId: rev.id,
        revisionVersion: rev.version,
        catalogId: item.id,
        quantity: '3',
      }),
    );
    await saveCatalog(
      f.actor,
      catalogSchema.parse({
        id: item.id,
        expectedVersion: 1,
        name: 'Standard item',
        costCodeId: f.code.id,
        costType: 'MATERIAL',
        unit: 'ea',
        unitCost: '40',
      }),
    );
    expect(
      (
        await db.estimateLine.findFirstOrThrow({
          where: { revisionId: rev.id, description: 'Standard item' },
        })
      ).unitCost.toString(),
    ).toBe('20');
  });
  it('duplicates only chosen structures and captures reusable content without identities or evidence', async () => {
    const f = await fixture(),
      p = await project(f);
    const captured = await captureTemplate(f.actor, {
      projectId: p.id,
      name: 'Saved',
      kind: 'PROJECT',
    });
    expect(JSON.stringify(captured)).not.toContain(f.client.id);
    expect(captured.content.tasks).toHaveLength(2);
    const copy = await setupProject(
      f.actor,
      setupSchema.parse({
        number: randomUUID(),
        name: 'Copy',
        managerId: f.actor.id,
        startDate: '2027-01-01',
        sourceProjectId: p.id,
        copy: ['SCHEDULE'],
      }),
    );
    expect(await db.projectTask.count({ where: { projectId: copy.id } })).toBe(2);
    expect(await db.estimate.count({ where: { projectId: copy.id } })).toBe(0);
    expect(await db.projectContact.count({ where: { projectId: copy.id } })).toBe(0);
  });
  it('rejects external and field edits and enforces source and destination project access', async () => {
    const f = await fixture(),
      p = await project(f);
    for (const role of ['CLIENT', 'SUBTRADE', 'FIELD'] as const) {
      const user = await db.user.create({
        data: {
          firstName: 'Restricted',
          lastName: 'User',
          email: randomUUID() + '@example.test',
          roles: [role],
        },
      });
      await expect(
        saveTemplate(user, templateSchema.parse({ kind: 'SCHEDULE', name: 'Denied', content: {} })),
      ).rejects.toThrow('permission');
    }
    const pm = await db.user.create({
      data: {
        firstName: 'PM',
        lastName: 'Unassigned',
        email: randomUUID() + '@example.test',
        roles: ['PROJECT_MANAGER'],
      },
    });
    await expect(
      captureTemplate(pm, { projectId: p.id, name: 'Denied', kind: 'SCHEDULE' }),
    ).rejects.toThrow('unavailable');
    expect((await globalSearch(pm, 'Template project')).results).toHaveLength(0);
    await expect(
      updateSchedule(
        pm,
        scheduleBulkSchema.parse({ projectId: p.id, ids: ['missing'], shiftDays: 1 }),
      ),
    ).rejects.toThrow('unavailable');
  });
  it('turns accepted estimate allowances into draft selections exactly once', async () => {
    const f = await fixture(),
      p = await project(f),
      rev = await db.estimateRevision.findFirstOrThrow({
        where: { estimate: { projectId: p.id } },
      });
    expect((await selectionsFromEstimate(f.actor, p.id)).created).toBe(0);
    const proposal = await createProposal(
      f.actor,
      proposalSchema.parse({
        estimateRevisionId: rev.id,
        clientId: f.client.id,
        title: 'Test proposal',
      }),
    );
    await proposalAction(f.actor, proposal.revisions[0].id, 'issue');
    await proposalAction(f.actor, proposal.revisions[0].id, 'accept');
    expect((await selectionsFromEstimate(f.actor, p.id)).created).toBe(1);
    expect((await selectionsFromEstimate(f.actor, p.id)).created).toBe(0);
    const allowance = await db.allowance.findFirstOrThrow({ where: { projectId: p.id } });
    expect(allowance.amount.toString()).toBe('200');
    expect(allowance.estimateLineId).toBeTruthy();
  });
});
