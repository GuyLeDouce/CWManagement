import { Capability, Prisma, Role, User } from '@prisma/client';
import { AppError, ensure } from './errors';
import { db, Tx } from './db';
export type Actor = User;
export function has(user: Pick<User, 'roles'>, ...roles: Role[]) {
  return roles.some((role) => user.roles.includes(role));
}
export function requireRole(user: Actor, ...roles: Role[]) {
  ensure(has(user, ...roles), 'You do not have permission to do this.', 403);
}
const roleCapabilities: Partial<Record<Role, Capability[]>> = {
  OWNER: Object.values(Capability),
  ADMIN: [
    'PROJECT_VIEW_ALL',
    'PROJECT_CREATE',
    'PROJECT_EDIT',
    'PROJECT_ASSIGN',
    'PROJECT_CONTACT_MANAGE',
    'PROJECT_SCHEDULE_EDIT',
    'DAILY_LOG_CREATE',
    'DAILY_LOG_EDIT',
    'FILE_UPLOAD',
    'FILE_VIEW_INTERNAL',
    'CONTACT_MANAGE',
    'NOTIFICATION_MANAGE',
    'SETTINGS_MANAGE',
    'COST_CODE_VIEW',
    'COST_CODE_MANAGE',
  ],
  CONTROLLER: [
    'PROJECT_VIEW_ALL',
    'PROJECT_EDIT',
    'PROJECT_ASSIGN',
    'PROJECT_CONTACT_MANAGE',
    'PROJECT_SCHEDULE_EDIT',
    'DAILY_LOG_CREATE',
    'DAILY_LOG_EDIT',
    'FILE_UPLOAD',
    'FILE_VIEW_INTERNAL',
    'PROJECT_FINANCIALS_VIEW',
    'PROJECT_FINANCIALS_EDIT',
    'TIME_EDIT',
    'ACCOUNTING_ACCESS',
    'NOTIFICATION_MANAGE',
    'COST_CODE_VIEW',
    'COST_CODE_MANAGE',
    'ESTIMATE_VIEW',
    'PROPOSAL_VIEW',
    'BUDGET_VIEW',
    'BUDGET_EDIT',
    'JOB_COST_VIEW',
    'ACTUAL_COST_VIEW',
    'ACTUAL_COST_MANAGE',
    'FINANCIAL_MARGIN_VIEW',
  ],
  PM: [
    'PROJECT_VIEW_ASSIGNED',
    'PROJECT_CREATE',
    'PROJECT_EDIT',
    'PROJECT_ASSIGN',
    'PROJECT_CONTACT_MANAGE',
    'PROJECT_SCHEDULE_EDIT',
    'DAILY_LOG_CREATE',
    'DAILY_LOG_EDIT',
    'FILE_UPLOAD',
    'FILE_VIEW_INTERNAL',
    'TIME_APPROVE',
    'NOTIFICATION_MANAGE',
    'PROJECT_FINANCIALS_VIEW',
    'PROPOSAL_VIEW',
    'BUDGET_VIEW',
    'JOB_COST_VIEW',
    'COST_CODE_VIEW',
  ],
  PROJECT_MANAGER: [
    'PROJECT_VIEW_ASSIGNED',
    'PROJECT_CREATE',
    'PROJECT_EDIT',
    'PROJECT_ASSIGN',
    'PROJECT_CONTACT_MANAGE',
    'PROJECT_SCHEDULE_EDIT',
    'DAILY_LOG_CREATE',
    'DAILY_LOG_EDIT',
    'FILE_UPLOAD',
    'FILE_VIEW_INTERNAL',
    'TIME_APPROVE',
    'NOTIFICATION_MANAGE',
    'PROJECT_FINANCIALS_VIEW',
    'PROPOSAL_VIEW',
    'BUDGET_VIEW',
    'JOB_COST_VIEW',
    'COST_CODE_VIEW',
  ],
  ESTIMATOR: [
    'PROJECT_VIEW_ASSIGNED',
    'PROJECT_FINANCIALS_VIEW',
    'ESTIMATE_CREATE',
    'ESTIMATE_VIEW',
    'ESTIMATE_EDIT',
    'ESTIMATE_APPROVE_INTERNAL',
    'PROPOSAL_VIEW',
    'PROPOSAL_CREATE',
    'PROPOSAL_ISSUE',
    'COST_CODE_VIEW',
    'FINANCIAL_MARGIN_VIEW',
  ],
  DESIGNER: ['PROJECT_VIEW_ASSIGNED', 'DAILY_LOG_CREATE', 'FILE_UPLOAD', 'FILE_VIEW_INTERNAL'],
  OFFICE: [
    'PROJECT_VIEW_ALL',
    'PROJECT_EDIT',
    'PROJECT_CONTACT_MANAGE',
    'PROJECT_SCHEDULE_EDIT',
    'DAILY_LOG_CREATE',
    'DAILY_LOG_EDIT',
    'FILE_UPLOAD',
    'FILE_VIEW_INTERNAL',
    'CONTACT_MANAGE',
    'NOTIFICATION_MANAGE',
  ],
  SHOP: ['PROJECT_VIEW_ASSIGNED', 'TIME_CLOCK'],
  SITE: ['PROJECT_VIEW_ASSIGNED', 'TIME_CLOCK'],
  FIELD: [
    'PROJECT_VIEW_ASSIGNED',
    'DAILY_LOG_CREATE',
    'FILE_UPLOAD',
    'FILE_VIEW_INTERNAL',
    'TIME_CLOCK',
  ],
  CLIENT: ['CLIENT_PORTAL_ACCESS'],
  SUBTRADE: ['PROJECT_VIEW_ASSIGNED'],
  VENDOR: ['PROJECT_VIEW_ASSIGNED'],
};
const purchasingOperations: Capability[] = [
  'PURCHASE_ORDER_VIEW',
  'PURCHASE_ORDER_CREATE',
  'PURCHASE_ORDER_EDIT',
  'WORK_ORDER_VIEW',
  'WORK_ORDER_CREATE',
  'WORK_ORDER_EDIT',
  'CHANGE_ORDER_VIEW',
  'CHANGE_ORDER_CREATE',
  'CHANGE_ORDER_EDIT',
  'COMMITMENT_VIEW',
];
const purchasingControl: Capability[] = [
  ...purchasingOperations,
  'PURCHASE_ORDER_APPROVE',
  'PURCHASE_ORDER_ISSUE',
  'WORK_ORDER_APPROVE',
  'WORK_ORDER_ISSUE',
  'CHANGE_ORDER_APPROVE_INTERNAL',
  'CHANGE_ORDER_ISSUE',
  'CHANGE_ORDER_ACCEPT',
  'COMMITMENT_MANAGE',
  'ACTUAL_COST_RECONCILE',
];
roleCapabilities.CONTROLLER!.push(...purchasingControl);
roleCapabilities.PM!.push(...purchasingOperations);
roleCapabilities.PROJECT_MANAGER!.push(...purchasingOperations);
roleCapabilities.ESTIMATOR!.push(
  'CHANGE_ORDER_VIEW',
  'CHANGE_ORDER_CREATE',
  'CHANGE_ORDER_EDIT',
  'CHANGE_ORDER_APPROVE_INTERNAL',
);
const portalManagement: Capability[] = [
  'CLIENT_ACCESS_MANAGE',
  'CLIENT_CONTENT_PUBLISH',
  'SELECTION_VIEW',
  'SELECTION_CREATE',
  'SELECTION_EDIT',
  'SELECTION_PUBLISH',
  'SELECTION_APPROVE_INTERNAL',
  'CLIENT_MESSAGE_VIEW',
  'CLIENT_MESSAGE_SEND',
];
for (const role of ['ADMIN', 'CONTROLLER', 'PM', 'PROJECT_MANAGER'] as Role[])
  roleCapabilities[role]!.push(...portalManagement);
roleCapabilities.ESTIMATOR!.push('SELECTION_VIEW', 'SELECTION_CREATE', 'SELECTION_EDIT');
export function roleGrants(user: Pick<User, 'roles'>, capability: Capability) {
  if (user.roles.includes('CLIENT')) return capability === 'CLIENT_PORTAL_ACCESS';
  return user.roles.some((role) => roleCapabilities[role]?.includes(capability));
}
export async function can(user: Actor, capability: Capability, tx: Tx = db) {
  if (user.roles.includes('CLIENT')) return capability === 'CLIENT_PORTAL_ACCESS' && user.active;
  const override = await tx.userCapability.findUnique({
    where: { userId_capability: { userId: user.id, capability } },
  });
  return override?.granted ?? roleGrants(user, capability);
}
export async function requireCapability(user: Actor, capability: Capability, tx: Tx = db) {
  ensure(await can(user, capability, tx), 'You do not have permission to do this.', 403);
}
export async function capabilities(user: Actor, tx: Tx = db) {
  if (user.roles.includes('CLIENT')) return ['CLIENT_PORTAL_ACCESS'] as Capability[];
  const overrides = await tx.userCapability.findMany({ where: { userId: user.id } });
  return Object.values(Capability).filter((capability) => {
    const override = overrides.find((item) => item.capability === capability);
    return override?.granted ?? roleGrants(user, capability);
  });
}
export async function projectScope(user: Actor, tx: Tx = db): Promise<Prisma.ProjectWhereInput> {
  if (await can(user, 'PROJECT_VIEW_ALL', tx)) return {};
  await requireCapability(user, 'PROJECT_VIEW_ASSIGNED', tx);
  return {
    OR: [
      { assignments: { some: { userId: user.id } } },
      { employees: { some: { userId: user.id } } },
      { managers: { some: { pmId: user.id } } },
    ],
  };
}
export async function requireProjectAccess(user: Actor, projectId: string, tx: Tx = db) {
  const project = await tx.project.findFirst({
    where: { id: projectId, ...(await projectScope(user, tx)) },
  });
  ensure(project, 'Project not found or unavailable.', 404);
  return project;
}
export function modes(user: Pick<User, 'roles'>) {
  return user.roles.filter((r) => ['SHOP', 'SITE', 'OFFICE'].includes(r));
}
export async function requireManagement(
  user: Actor,
  capability: 'locate' | 'verify' | 'info' | 'send',
  tx: Tx = db,
) {
  const accepted: Role[] =
    capability === 'verify'
      ? ['OWNER', 'PM']
      : capability === 'locate'
        ? ['OWNER', 'PM', 'CONTROLLER']
        : ['OWNER', 'CONTROLLER'];
  requireRole(user, ...accepted);
  if (
    has(user, 'CONTROLLER') &&
    !has(user, 'OWNER') &&
    (capability === 'info' ||
      capability === 'send' ||
      (capability === 'locate' && !has(user, 'PM')))
  ) {
    ensure(
      await tx.workDay.findFirst({ where: { userId: user.id, endedAt: null } }),
      'Clock in at the shop before opening controller tools.',
      403,
    );
  }
}
export function segmentScope(user: Actor): Prisma.TimeSegmentWhereInput {
  if (has(user, 'OWNER', 'CONTROLLER')) return {};
  if (has(user, 'PM'))
    return {
      user: { managers: { some: { pmId: user.id } } },
      jobsite: { managers: { some: { pmId: user.id } } },
    };
  return { userId: user.id };
}
export async function canApprove(tx: Tx, user: Actor, employeeId: string, jobsiteId: string) {
  await requireCapability(user, 'TIME_APPROVE', tx);
  if (await can(user, 'PROJECT_VIEW_ALL', tx)) return;
  const [employee, job] = await Promise.all([
    tx.pmEmployee.findUnique({ where: { pmId_employeeId: { pmId: user.id, employeeId } } }),
    tx.pmJobsite.findUnique({ where: { pmId_jobsiteId: { pmId: user.id, jobsiteId } } }),
  ]);
  if (!employee || !job)
    throw new AppError(403, 'This employee and project are outside your approval assignments.');
}
export async function allowedSelection(
  tx: Tx,
  userId: string,
  jobsiteId: string,
  taskId?: string | null,
  needsTask = false,
) {
  const job = await tx.project.findFirst({
    where: { id: jobsiteId, active: true, employees: { some: { userId } } },
  });
  ensure(job, 'This project is not available to this employee.', 403);
  if (needsTask) ensure(taskId, 'Please select a task.');
  if (taskId)
    ensure(
      await tx.task.findFirst({
        where: {
          id: taskId,
          active: true,
          employees: { some: { userId } },
          jobs: { some: { jobsiteId } },
        },
      }),
      'This task is not available for this employee and project.',
      403,
    );
  return job;
}
