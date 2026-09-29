import type { HelpArticle } from './types';
const destinations: Record<string, { href: string; label: string; any?: string[] }> = {
  dashboard: {
    href: '/',
    label: 'Open Dashboard',
    any: ['PROJECT_VIEW_ALL', 'PROJECT_VIEW_ASSIGNED'],
  },
  projects: {
    href: '/projects',
    label: 'Go to Projects',
    any: ['PROJECT_VIEW_ALL', 'PROJECT_VIEW_ASSIGNED'],
  },
  templates: {
    href: '/templates',
    label: 'Open Templates',
    any: ['TEMPLATE_VIEW', 'COST_CATALOG_VIEW'],
  },
  'my-work': {
    href: '/my-work',
    label: 'Open My Work',
    any: ['PROJECT_VIEW_ALL', 'PROJECT_VIEW_ASSIGNED'],
  },
  financials: {
    href: '/financials',
    label: 'Open Financials',
    any: [
      'COST_CODE_VIEW',
      'COST_CODE_MANAGE',
      'PURCHASE_ORDER_VIEW',
      'WORK_ORDER_VIEW',
      'CHANGE_ORDER_VIEW',
      'QUICKBOOKS_VIEW',
    ],
  },
  quickbooks: {
    href: '/financials/quickbooks',
    label: 'Open QuickBooks',
    any: ['QUICKBOOKS_VIEW'],
  },
  contacts: { href: '/contacts', label: 'Open Contacts', any: ['CONTACT_MANAGE'] },
  admin: { href: '/admin', label: 'Open Settings', any: ['SETTINGS_MANAGE'] },
  time: { href: '/time', label: 'Open Time', any: ['TIME_CLOCK'] },
  verify: { href: '/verify', label: 'Open Verify', any: ['TIME_APPROVE'] },
  locate: { href: '/locate', label: 'Open Locate', any: ['TIME_APPROVE', 'ACCOUNTING_ACCESS'] },
  send: { href: '/send', label: 'Open Send', any: ['ACCOUNTING_ACCESS'] },
  notifications: { href: '/notifications', label: 'Open Notifications' },
};
export function helpDestination(key: string | undefined, capabilities: readonly string[]) {
  const d = key ? destinations[key] : undefined;
  return d && (!d.any || d.any.some((c) => capabilities.includes(c)))
    ? { href: d.href, label: d.label }
    : undefined;
}
export function articleHref(base: string, a: HelpArticle) {
  return `${base}/${a.category}/${a.id}`;
}
const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
export function searchHelp(articles: readonly HelpArticle[], query: string) {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (!tokens.length) return [...articles];
  return articles
    .map((a) => {
      const title = normalize(a.title),
        keywords = normalize(a.keywords.join(' '));
      const text = normalize(
        [
          a.title,
          a.summary,
          a.category,
          a.keywords.join(' '),
          ...a.sections.flatMap((s) => [s.heading, ...(s.paragraphs || []), ...(s.steps || [])]),
        ].join(' '),
      );
      const score = tokens.every((t) => text.includes(t))
        ? tokens.reduce((n, t) => n + (title.includes(t) ? 8 : keywords.includes(t) ? 5 : 1), 0)
        : 0;
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.a.title.localeCompare(b.a.title))
    .map((x) => x.a);
}
export function recommendedHelp(
  articles: readonly HelpArticle[],
  roles: readonly string[],
  caps: readonly string[],
) {
  const ids = roles.includes('OWNER')
    ? ['quick-start', 'project-templates', 'qb-pilot']
    : caps.includes('QUICKBOOKS_VIEW')
      ? ['qb-overview', 'time-export', 'qb-reconciliation']
      : caps.includes('ESTIMATE_EDIT')
        ? ['create-estimate', 'catalog-quick-add', 'assemblies']
        : roles.some((role) => role === 'FIELD' || role === 'SHOP')
          ? ['clock-in', 'site-travel', 'my-hours']
          : caps.includes('PROJECT_VIEW_ASSIGNED') || caps.includes('PROJECT_VIEW_ALL')
            ? ['my-work', 'create-project', 'schedule-tasks']
            : ['clock-in', 'site-travel', 'my-hours'];
  return ids.map((id) => articles.find((a) => a.id === id)).filter((a): a is HelpArticle => !!a);
}
export const contextualArticles: Record<string, string> = {
  '': 'dashboard',
  projects: 'create-project',
  templates: 'template-library',
  'my-work': 'my-work',
  schedule: 'schedule-tasks',
  financials: 'cost-codes',
  contacts: 'contacts',
  time: 'clock-in',
  scan: 'clock-in',
  reports: 'reports',
  notifications: 'notifications',
  locate: 'locate',
  verify: 'approve-time',
  send: 'time-export',
  info: 'reports',
  admin: 'company-defaults',
  visits: 'admin-import-audit',
};
export const projectContext: Record<string, string> = {
  overview: 'project-overview',
  schedule: 'schedule-tasks',
  estimate: 'create-estimate',
  proposals: 'create-proposal',
  budget: 'job-cost',
  'purchase-orders': 'purchase-orders',
  'change-orders': 'change-orders',
  selections: 'selection-options',
  clients: 'client-access',
  trades: 'trade-access',
  messages: 'messages',
  'daily-logs': 'daily-logs',
  files: 'files-photos',
  photos: 'files-photos',
  time: 'my-hours',
  settings: 'project-team',
};
