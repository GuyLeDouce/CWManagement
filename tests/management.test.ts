import { describe, expect, it } from 'vitest';
import { contactSchema, projectSchema } from '../src/lib/management';
import { roleGrants } from '../src/lib/permissions';
import { dailyLogSchema, projectTaskSchema } from '../src/lib/operations';

describe('CWManagement domain validation', () => {
  it('normalizes a valid project payload', () => {
    const project = projectSchema.parse({
      number: ' 26-014 ',
      name: ' Smith Cottage ',
      status: 'PRECONSTRUCTION',
      startDate: '2026-10-01',
      targetCompletion: '',
      contractAmount: '125000.50',
    });
    expect(project.number).toBe('26-014');
    expect(project.contractAmount).toBe(125000.5);
    expect(project.targetCompletion).toBeNull();
  });

  it('keeps contacts separate from authenticated users', () => {
    const contact = contactSchema.parse({ firstName: 'Jane', lastName: 'Smith', types: ['CLIENT'] });
    expect(contact).not.toHaveProperty('userId');
    expect(contact.types).toEqual(['CLIENT']);
  });

  it('derives baseline capabilities from multiple roles', () => {
    expect(roleGrants({ roles: ['PROJECT_MANAGER'] }, 'TIME_APPROVE')).toBe(true);
    expect(roleGrants({ roles: ['FIELD'] }, 'PROJECT_FINANCIALS_VIEW')).toBe(false);
    expect(roleGrants({ roles: ['OWNER'] }, 'SETTINGS_MANAGE')).toBe(true);
    expect(roleGrants({ roles: ['PROJECT_MANAGER'] }, 'PROJECT_SCHEDULE_EDIT')).toBe(true);
    expect(roleGrants({ roles: ['FIELD'] }, 'FINANCIAL_MARGIN_VIEW')).toBe(false);
    expect(roleGrants({ roles: ['ESTIMATOR'] }, 'FINANCIAL_MARGIN_VIEW')).toBe(true);
    expect(roleGrants({ roles: ['PROJECT_MANAGER'] }, 'ESTIMATE_VIEW')).toBe(false);
  });

  it('validates schedule dates without conflating task domains', () => {
    const task = projectTaskSchema.parse({ projectId: 'project-1', name: 'Frame second floor', startDate: '2026-10-10', endDate: '2026-10-15' });
    expect(task.status).toBe('NOT_STARTED');
    expect(task.userIds).toEqual([]);
    expect(() => projectTaskSchema.parse({ projectId: 'project-1', name: 'Invalid', startDate: '2026-10-15', endDate: '2026-10-10' })).toThrow('Finish date');
  });

  it('requires useful content in a daily log', () => {
    expect(() => dailyLogSchema.parse({ projectId: 'project-1', date: '2026-10-10' })).toThrow('at least one');
    expect(dailyLogSchema.parse({ projectId: 'project-1', date: '2026-10-10', workCompleted: 'Installed windows.' }).workCompleted).toBe('Installed windows.');
  });
});
