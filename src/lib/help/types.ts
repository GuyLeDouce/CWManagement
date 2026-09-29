export type HelpAudience = 'internal' | 'client' | 'trade';
export type HelpSection = {
  heading: string;
  paragraphs?: string[];
  steps?: string[];
  kind?: 'tip' | 'important' | 'financial' | 'client' | 'trade' | 'locked';
};
export type HelpArticle = {
  id: string;
  category: string;
  title: string;
  summary: string;
  keywords: string[];
  roles: string[];
  updated: string;
  related: string[];
  destination?: string;
  sections: HelpSection[];
};
export type GuideInput = {
  updated?: string;
  id: string;
  title: string;
  summary: string;
  when: string;
  steps: string[];
  next: string;
  notes?: string[];
  kind?: HelpSection['kind'];
  keywords?: string[];
  related?: string[];
  destination?: string;
  roles?: string[];
  extra?: HelpSection[];
};
export function guide(category: string, g: GuideInput): HelpArticle {
  return {
    id: g.id,
    category,
    title: g.title,
    summary: g.summary,
    keywords: g.keywords || [],
    roles: g.roles || [],
    updated: g.updated || '2026-09-28',
    related: g.related || [],
    destination: g.destination,
    sections: [
      { heading: 'What this does', paragraphs: [g.summary] },
      { heading: 'When to use it', paragraphs: [g.when] },
      { heading: 'How to do it', steps: g.steps },
      ...(g.extra || []),
      { heading: 'What happens next', paragraphs: [g.next] },
      ...(g.notes?.length
        ? [
            {
              heading: 'Important notes',
              paragraphs: g.notes,
              kind: g.kind || ('important' as const),
            },
          ]
        : []),
    ],
  };
}
export const categories = [
  ['business','Sales, service & reporting','Manage opportunities, warranty, reports and scheduled follow-up.'],
  ['getting-started', 'Getting started', 'Your first day and the Cedar Winds project workflow.'],
  ['workday', 'Dashboard & My Work', 'Find the next action, search and return to recent projects.'],
  ['projects', 'Projects', 'Set up a project, its people and its working information.'],
  [
    'templates',
    'Templates & company standards',
    'Reuse successful work without changing existing projects.',
  ],
  ['catalog', 'Cost Catalog & assemblies', 'Build a reliable library of commonly estimated work.'],
  ['schedule', 'Schedule', 'Plan dates, responsibilities and milestones.'],
  ['estimating', 'Estimating', 'Build internal costs and client pricing efficiently.'],
  ['proposals', 'Proposals', 'Prepare, issue and record acceptance of a client offer.'],
  ['budget', 'Budget & job costing', 'Understand commitments, actuals and expected final cost.'],
  ['purchasing', 'Purchase & Work Orders', 'Approve trade scope and track the commitment.'],
  ['changes', 'Change Orders', 'Document client changes, credits and approvals.'],
  [
    'selections',
    'Selections & allowances',
    'Guide client decisions and their financial differences.',
  ],
  ['clients', 'Clients & Client Portal', 'Invite clients and publish deliberately.'],
  [
    'trades',
    'Trades & Trade Portal',
    'Share work, instructions and deficiencies with the right trade.',
  ],
  ['contacts', 'Contacts & companies', 'Maintain your directory and project relationships.'],
  [
    'site-records',
    'Files, photos & daily logs',
    'Keep a useful and appropriately shared site record.',
  ],
  ['time', 'Time tracking', 'Clock in, travel, switch work and check your hours.'],
  ['approval', 'Time approval & export', 'Review completed time and prepare accounting batches.'],
  ['quickbooks', 'QuickBooks Desktop', 'Discover, map and run the controlled accounting pilot.'],
  [
    'communication',
    'Notifications & messages',
    'Keep decisions and conversations with the project.',
  ],
  ['reports', 'Reports', 'Find the reporting tools that are available today.'],
  ['administration', 'Settings & administration', 'Manage people, defaults, codes and access.'],
  ['workflows', 'End-to-end workflows', 'Follow a complete business process across screens.'],
  ['troubleshooting', 'Troubleshooting', 'Find the next check when something does not work.'],
  ['glossary', 'Glossary', 'Plain-language definitions of the terms you will see.'],
].map(([id, title, summary]) => ({ id, title, summary }));
