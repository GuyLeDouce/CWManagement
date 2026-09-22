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
  ADMIN: ['PROJECT_VIEW_ALL', 'PROJECT_CREATE', 'PROJECT_EDIT', 'CONTACT_MANAGE', 'SETTINGS_MANAGE'],
  CONTROLLER: ['PROJECT_VIEW_ALL', 'PROJECT_FINANCIALS_VIEW', 'PROJECT_FINANCIALS_EDIT', 'TIME_EDIT', 'ACCOUNTING_ACCESS'],
  PM: ['PROJECT_VIEW_ASSIGNED', 'PROJECT_CREATE', 'PROJECT_EDIT', 'TIME_APPROVE'],
  PROJECT_MANAGER: ['PROJECT_VIEW_ASSIGNED', 'PROJECT_CREATE', 'PROJECT_EDIT', 'TIME_APPROVE'],
  ESTIMATOR: ['PROJECT_VIEW_ASSIGNED', 'PROJECT_FINANCIALS_VIEW', 'ESTIMATE_CREATE'],
  DESIGNER: ['PROJECT_VIEW_ASSIGNED'],
  OFFICE: ['PROJECT_VIEW_ALL', 'CONTACT_MANAGE'],
  SHOP: ['PROJECT_VIEW_ASSIGNED', 'TIME_CLOCK'],
  SITE: ['PROJECT_VIEW_ASSIGNED', 'TIME_CLOCK'],
  FIELD: ['PROJECT_VIEW_ASSIGNED', 'TIME_CLOCK'],
  CLIENT: ['CLIENT_PORTAL_ACCESS'],
  SUBTRADE: ['PROJECT_VIEW_ASSIGNED'],
  VENDOR: ['PROJECT_VIEW_ASSIGNED'],
};
export function roleGrants(user: Pick<User, 'roles'>, capability: Capability) {
  return user.roles.some((role) => roleCapabilities[role]?.includes(capability));
}
export async function can(user: Actor, capability: Capability, tx: Tx = db) {
  const override = await tx.userCapability.findUnique({
    where: { userId_capability: { userId: user.id, capability } },
  });
  return override?.granted ?? roleGrants(user, capability);
}
export async function requireCapability(user: Actor, capability: Capability, tx: Tx = db) {
  ensure(await can(user, capability, tx), 'You do not have permission to do this.', 403);
}
export async function capabilities(user: Actor, tx: Tx = db) {
  const overrides = await tx.userCapability.findMany({ where: { userId: user.id } });
  return Object.values(Capability).filter((capability) => {
    const override = overrides.find((item) => item.capability === capability);
    return override?.granted ?? roleGrants(user, capability);
  });
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
  requireRole(user, 'OWNER', 'PM');
  if (has(user, 'OWNER')) return;
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
