import { describe, expect, it } from 'vitest';
import { contactSchema, projectSchema } from '../src/lib/management';
import { roleGrants } from '../src/lib/permissions';

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
  });
});
