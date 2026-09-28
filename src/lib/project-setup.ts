import { z } from 'zod';
import { ProjectAssignmentRole } from '@prisma/client';
import { transaction, db, json, audit, Tx } from './db';
import { Actor, can, requireCapability, requireProjectAccess } from './permissions';
import { ensure } from './errors';
import { isExternal } from './external-identity';
import { applyContent } from './standards';
import { standardContent, StandardContent } from './standards-schema';
import { publishProjectEvent } from './activity';

export const setupSchema = z
  .object({
    team: z
      .array(z.object({ role: z.enum(ProjectAssignmentRole), userId: z.string().min(1) }).strict())
      .max(20)
      .default([]),
    name: z.string().trim().min(1).max(200),
    number: z.string().trim().min(1).max(40),
    projectType: z.string().max(100).default(''),
    address: z.string().max(500).default(''),
    municipality: z.string().max(100).default(''),
    contactId: z.string().optional(),
    newClient: z
      .object({
        firstName: z.string().min(1).max(100),
        lastName: z.string().min(1).max(100),
        email: z.union([z.email(), z.literal('')]),
      })
      .optional(),
    managerId: z.string().min(1),
    startDate: z.iso.date(),
    targetCompletion: z.iso.date().optional(),
    templateId: z.string().optional(),
    templateVersion: z.number().int().positive().optional(),
    sourceProjectId: z.string().optional(),
    copy: z.array(z.enum(['ESTIMATE', 'SCHEDULE', 'SELECTION', 'PROPOSAL'])).default([]),
  })
  .strict()
  .refine(
    (v) => !v.targetCompletion || v.targetCompletion >= v.startDate,
    'Target completion cannot precede the start date.',
  )
  .refine(
    (v) => !(v.templateId && v.sourceProjectId),
    'Choose either a template or an existing project.',
  );

async function capture(
  tx: Tx,
  actor: Actor,
  projectId: string,
  kinds: string[],
): Promise<StandardContent> {
  const project = await requireProjectAccess(actor, projectId, tx);
  const content = standardContent.parse({});
  if (kinds.includes('ESTIMATE')) {
    await requireCapability(actor, 'ESTIMATE_VIEW', tx);
    const revision = await tx.estimateRevision.findFirst({
      where: { estimate: { projectId } },
      orderBy: { createdAt: 'desc' },
      include: { lines: { include: { section: true }, orderBy: { sortOrder: 'asc' } } },
    });
    content.lines =
      revision?.lines.map((l) => ({
        description: l.description,
        section: l.section?.name || 'General',
        costCodeId: l.costCodeId,
        costType: l.costType,
        quantity: String(l.quantity),
        unit: l.unit,
        unitCost: String(l.unitCost),
        markupMethod: l.markupMethod,
        markupValue: String(l.markupValue),
        taxable: l.taxable,
        optional: l.optional,
        allowance: l.allowance,
        clientDescription: l.clientDescription || '',
      })) || [];
  }
  if (kinds.includes('SCHEDULE')) {
    const tasks = await tx.projectTask.findMany({
      where: { projectId, archivedAt: null },
      include: { predecessors: true },
      orderBy: { sortOrder: 'asc' },
    });
    ensure(
      tasks.every(
        (t) =>
          t.predecessors.length <= 1 && t.predecessors.every((d) => d.type === 'FINISH_TO_START'),
      ),
      'This schedule has multiple or non-finish-to-start dependencies. Simplify a copy before saving a template; dependencies will not be silently dropped.',
    );
    const base = project.startDate || tasks.find((t) => t.startDate)?.startDate;
    content.tasks = tasks.map((t) => ({
      key: t.id,
      name: t.name,
      description: t.description || '',
      phase: '',
      offsetDays: base && t.startDate ? Math.round((+t.startDate - +base) / 86400000) : 0,
      durationDays:
        t.startDate && t.endDate
          ? Math.max(0, Math.round((+t.endDate - +t.startDate) / 86400000))
          : 0,
      predecessor: t.predecessors[0]?.predecessorId || '',
      lagDays: t.predecessors[0]?.lagDays || 0,
      milestone: t.milestone,
      assigneeRole: '',
    }));
  }
  if (kinds.includes('SELECTION')) {
    await requireCapability(actor, 'SELECTION_VIEW', tx);
    content.specifications = await tx.projectSpecification.findMany({
      where: { projectId },
      select: { title: true, description: true, category: true },
    });
    const selections = await tx.selection.findMany({
      where: { projectId },
      include: { options: true },
    });
    content.selections = selections.map((s) => ({
      title: s.title,
      category: s.category,
      description: s.description || '',
      deadlineOffset:
        project.startDate && s.deadline
          ? Math.round((+s.deadline - +project.startDate) / 86400000)
          : 0,
      required: s.required,
      options: s.options
        .filter((o) => o.active)
        .map((o) => ({
          description: o.name,
          section: s.category,
          costCodeId: o.costCodeId,
          costType: o.costType,
          quantity: String(o.quantity),
          unit: o.unit || 'ea',
          unitCost: String(o.unitCost),
          markupMethod: o.markupMethod,
          markupValue: String(o.markupValue),
          taxable: o.taxable,
          optional: false,
          allowance: false,
          clientDescription: o.description || '',
        })),
    }));
  }
  if (kinds.includes('PROPOSAL')) {
    await requireCapability(actor, 'PROPOSAL_VIEW', tx);
    const p = await tx.proposalRevision.findFirst({
      where: { proposal: { projectId } },
      orderBy: { createdAt: 'desc' },
    });
    if (p)
      Object.assign(content, {
        introduction: p.introduction || '',
        scope: p.scope || '',
        exclusions: p.exclusions || '',
        assumptions: p.assumptions || '',
        terms: p.terms || '',
      });
  }
  return content;
}
export async function captureTemplate(
  actor: Actor,
  input: {
    projectId: string;
    name: string;
    kind: 'PROJECT' | 'ESTIMATE' | 'SCHEDULE' | 'SELECTION' | 'PROPOSAL';
  },
) {
  await requireCapability(actor, 'TEMPLATE_MANAGE');
  const content = await transaction((tx) =>
    capture(
      tx,
      actor,
      input.projectId,
      input.kind === 'PROJECT' ? ['ESTIMATE', 'SCHEDULE', 'SELECTION', 'PROPOSAL'] : [input.kind],
    ),
  );
  // The editor reviews wording before saving; identities, decisions, attachments and financial ledgers are never captured.
  return {
    name: input.name,
    kind: input.kind,
    description: 'Review project-specific wording before saving.',
    active: true,
    content,
  };
}
export async function setupProject(actor: Actor, input: z.infer<typeof setupSchema>) {
  return transaction(async (tx) => {
    await requireCapability(actor, 'PROJECT_CREATE', tx);
    await requireCapability(actor, 'PROJECT_ASSIGN', tx);
    const manager = await tx.user.findUnique({ where: { id: input.managerId } });
    ensure(manager?.active && !isExternal(manager), 'Choose an active Cedar Winds team member.');
    let contactId = input.contactId;
    if (input.newClient) {
      await requireCapability(actor, 'CONTACT_MANAGE', tx);
      ensure(!contactId, 'Choose an existing client or create one.');
      contactId = (
        await tx.contact.create({
          data: { ...input.newClient, email: input.newClient.email || null, types: ['CLIENT'] },
        })
      ).id;
    }
    if (contactId) {
      await requireCapability(actor, 'PROJECT_CONTACT_MANAGE', tx);
      ensure(
        await tx.contact.findFirst({
          where: { id: contactId, active: true, types: { has: 'CLIENT' } },
        }),
        'Choose an active Client contact.',
      );
    }
    let content = standardContent.parse({});
    const template = input.templateId
      ? await tx.companyTemplate.findUnique({ where: { id: input.templateId } })
      : null;
    if (input.templateId) {
      await requireCapability(actor, 'TEMPLATE_VIEW', tx);
      ensure(
        template?.active &&
          template.kind === 'PROJECT' &&
          template.version === input.templateVersion,
        'Project template changed. Select it again.',
        409,
      );
      content = standardContent.parse(template.content);
    }
    if (input.sourceProjectId)
      content = await capture(tx, actor, input.sourceProjectId, input.copy);
    for (const role of content.teamRoles)
      ensure(
        role === 'PRIMARY_PROJECT_MANAGER' || input.team.some((t) => t.role === role),
        `Assign a team member for ${role.toLowerCase().replaceAll('_', ' ')}.`,
      );
    for (const member of input.team) {
      const u = await tx.user.findUnique({ where: { id: member.userId } });
      ensure(u?.active && !isExternal(u), 'Team members must be active internal users.');
    }
    const settings = await tx.settings.findUniqueOrThrow({ where: { id: 'company' } });
    const project = await tx.project.create({
      data: {
        number: input.number,
        name: input.name,
        projectType: input.projectType,
        address: input.address,
        municipality: input.municipality,
        province: settings.defaultProvince,
        status: 'PRECONSTRUCTION',
        stage: content.stage || null,
        startDate: new Date(input.startDate + 'T12:00:00Z'),
        targetCompletion: input.targetCompletion
          ? new Date(input.targetCompletion + 'T12:00:00Z')
          : null,
        setupDefaults: json({
          folders: content.folders,
          proposal: {
            introduction: content.introduction,
            scope: content.scope,
            exclusions: content.exclusions,
            assumptions: content.assumptions,
            terms: content.terms,
          },
          dailyLog: content.dailyLog,
          communication: content.communication,
        }),
        assignments: {
          create: [
            { userId: manager.id, role: 'PRIMARY_PROJECT_MANAGER', primary: true },
            ...(manager.id !== actor.id
              ? [{ userId: actor.id, role: 'SECONDARY_PROJECT_MANAGER' as const }]
              : []),
          ],
        },
        ...(contactId
          ? { contacts: { create: { contactId, role: 'CLIENT', primary: true } } }
          : {}),
      },
    });
    for (const member of input.team)
      await tx.projectAssignment.upsert({
        where: {
          projectId_userId_role: {
            projectId: project.id,
            userId: member.userId,
            role: member.role,
          },
        },
        update: {},
        create: { projectId: project.id, userId: member.userId, role: member.role },
      });
    await applyContent(tx, actor, project.id, content, { startDate: input.startDate });
    if (template)
      await tx.templateApplication.create({
        data: {
          templateId: template.id,
          templateVersion: template.version,
          projectId: project.id,
          requestKey: `setup:${project.id}`,
          snapshot: json(content),
          createdById: actor.id,
        },
      });
    await publishProjectEvent(tx, {
      projectId: project.id,
      actorId: actor.id,
      entity: 'Project',
      entityId: project.id,
      action: 'PROJECT_CREATED',
      description: `Created ${project.number}${template ? ` from ${template.name}` : ''}.`,
    });
    return project;
  });
}
export async function setupOptions(actor: Actor) {
  await requireCapability(actor, 'PROJECT_CREATE');
  const [users, clients, templates, settings] = await Promise.all([
    db.user.findMany({
      where: { active: true, NOT: { roles: { hasSome: ['CLIENT', 'SUBTRADE', 'VENDOR'] } } },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.contact.findMany({
      where: { active: true, types: { has: 'CLIENT' } },
      select: { id: true, firstName: true, lastName: true },
    }),
    (await can(actor, 'TEMPLATE_VIEW'))
      ? db.companyTemplate.findMany({
          where: { active: true, kind: 'PROJECT' },
          select: { id: true, name: true, version: true, description: true, content: true },
        })
      : [],
    db.settings.findUnique({ where: { id: 'company' }, select: { defaultProvince: true } }),
  ]);
  return { users, clients, templates, settings };
}
export const defaultsSchema = z
  .object({
    defaultProvince: z.string().min(1).max(40),
    defaultMarkupMethod: z.enum(['NONE', 'FIXED', 'PERCENT_ON_COST']),
    defaultMarkupValue: z.string().regex(/^\d{1,6}(\.\d{1,4})?$/),
  })
  .strict();
export async function companyDefaults(actor: Actor, input?: z.infer<typeof defaultsSchema>) {
  await requireCapability(actor, 'SETTINGS_MANAGE');
  if (!input)
    return db.settings.findUnique({
      where: { id: 'company' },
      select: { defaultProvince: true, defaultMarkupMethod: true, defaultMarkupValue: true },
    });
  return transaction(async (tx) => {
    const before = await tx.settings.findUnique({ where: { id: 'company' } });
    const saved = await tx.settings.update({ where: { id: 'company' }, data: input });
    await audit(tx, actor.id, 'COMPANY_DEFAULTS_UPDATED', 'Settings', 'company', before, saved);
    return { saved: true };
  });
}
