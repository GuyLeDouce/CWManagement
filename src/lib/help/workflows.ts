import { guide, type HelpArticle } from './types';
const workflows: [string, string, string[], string[]][] = [
  [
    'new-cottage',
    'New Cottage: lead to active project',
    [
      'Record the prospect/client and company details in Contacts. The separate Leads screen is not a full lead-management tool yet.',
      'Create the project with its actual client, PM, dates and reviewed cottage template; Cedar Winds must create its own real standard first.',
      'Check schedule tasks, estimate quantities and private selection drafts.',
      'Create and issue the proposal; record genuine acceptance, create the cost budget and confirm the original contract baseline.',
      'Update project status when appropriate, invite the client/trades separately, publish reviewed content and issue approved purchasing.',
      'Use the project review to check the next two to three weeks, decisions, cost exposure and assigned actions.',
    ],
    ['create-project', 'create-proposal', 'accept-proposal', 'client-access'],
  ],
  [
    'estimate-to-proposal',
    'Create an Estimate and Proposal',
    [
      'Open the project Estimate and choose the editable revision.',
      'Add selected template items, catalog lines and assemblies; customize quantities, costs, markup and client descriptions.',
      'Check included/optional lines, allowances and HST.',
      'Create a proposal from that exact revision, populate wording, preview and issue.',
    ],
    ['create-estimate', 'estimate-pricing', 'create-proposal'],
  ],
  [
    'proposal-to-budget',
    'Turn an accepted Proposal into a Budget',
    [
      'Confirm the issued proposal is the version actually accepted.',
      'Use Mark accepted and retain the client evidence in the project record.',
      'Use Create budget on the accepted proposal.',
      'Review Original/Current cost allocations and verify the separate original contract value in project settings.',
    ],
    ['accept-proposal', 'job-cost', 'contract-summary'],
  ],
  [
    'issue-subcontract',
    'Issue a subcontractor Work Order',
    [
      'Find the correct trade Contact/Company and associate the contact with the project.',
      'Create a Work Order in Purchase Orders; apply reviewed scope wording and enter classified agreed costs.',
      'Review, approve and issue.',
      'Invite the exact recipient to the Trade Portal, share relevant drawings and track the current revision’s acknowledgement.',
    ],
    ['work-orders', 'scope-templates', 'trade-access'],
  ],
  [
    'handle-selection',
    'Handle a client Selection',
    [
      'Create the source-linked contractual allowance where applicable and prepare a selection with clear options/deadline.',
      'Publish the reviewed selection and have the client confirm their option.',
      'Review the immutable decision and any generated draft Change Order.',
      'Issue and obtain acceptance for a nonzero price difference; check selection approval and record ordering through the appropriate purchasing process.',
    ],
    ['estimate-allowances', 'selection-options', 'selection-decisions'],
  ],
  [
    'process-change',
    'Process a Change Order',
    [
      'Describe the change and reason, then calculate internal cost and client price separately.',
      'Review/approve internally and issue the client-safe revision.',
      'Obtain portal approval or record valid acceptance with evidence.',
      'Check Current Contract, the new budget version and any related purchasing revision needed for the actual work.',
    ],
    ['change-orders', 'change-approval', 'purchasing-revisions'],
  ],
  [
    'publish-update',
    'Publish a client Project Update',
    [
      'Write the detailed dated Daily Log for staff.',
      'Prepare a separate client summary through Clients publishing controls.',
      'Publish appropriate photos/files separately and confirm their visibility.',
      'Preview the client update and use a client conversation for questions.',
    ],
    ['daily-logs', 'client-publishing', 'file-visibility'],
  ],
  [
    'add-subcontractor',
    'Add a new subcontractor',
    [
      'Search Contacts to avoid a duplicate. Create the company and named Subtrade contact if needed.',
      'Add the contact’s project role.',
      'Invite that specific contact through Project → Trades.',
      'Issue their Work Order, release relevant schedule tasks and share suitable documents.',
    ],
    ['contacts', 'trade-access', 'trade-schedule'],
  ],
  [
    'handle-deficiency',
    'Handle a Deficiency from report to close',
    [
      'Create the punch item with clear location, description, due date and assigned trade.',
      'Share appropriate photos.',
      'Review the trade’s completion evidence and Ready for review state.',
      'Verify and close, or reopen with specific feedback.',
    ],
    ['deficiencies', 'trade-documents'],
  ],
  [
    'approve-week',
    'Approve employee time for the week',
    [
      'Open Verify for the completed Monday–Sunday week.',
      'Filter and review employee/project/task/code/travel entries; close forgotten shifts and correct errors with reasons.',
      'Approve only reviewed current versions.',
      'Have accounting finalize the approved batch or use the separately controlled QuickBooks path.',
    ],
    ['approve-time', 'forgotten-shifts', 'time-export'],
  ],
  [
    'sync-purchase',
    'Sync one PO with QuickBooks',
    [
      'Confirm binding, pilot scope, mappings and pre-flight.',
      'Choose a genuinely eligible issued zero-tax PO and preview its request.',
      'Queue it, then run Update Selected on the accounting PC.',
      'Compare Vendor, Job, Items, amounts and returned transaction identity in both systems; record the live result.',
    ],
    ['qb-pilot', 'qb-po', 'qb-recovery'],
  ],
  [
    'import-bill',
    'Import one QuickBooks Bill',
    [
      'Create/verify the small test Bill in Desktop and run the configured Bill query.',
      'Review staged lines, mappings and commitment matches in CWManagement.',
      'Preview and apply the reviewed version with a reason in Pilot.',
      'Confirm Actual Cost and remaining commitment; modify the test Bill in Desktop and verify reconciliation without duplication.',
    ],
    ['qb-bills', 'qb-modified-bills', 'commitment-fulfillment'],
  ],
];
export const workflowGuides: HelpArticle[] = workflows.map(([id, title, steps, related]) =>
  guide('workflows', {
    id,
    title,
    summary: `Follow the connected workflow: ${title.toLowerCase()}.`,
    when: 'Use this checklist alongside the linked detailed guides; permissions and document states still apply.',
    steps,
    next: 'Confirm the outcome in the source records and retain approvals/evidence with the project.',
    related,
    destination:
      id.includes('bill') || id === 'sync-purchase'
        ? 'quickbooks'
        : id === 'approve-week'
          ? 'verify'
          : 'projects',
  }),
);

const problems: [string, string, string[], string[]][] = [
  [
    'missing-project',
    'I cannot see a Project',
    [
      'Check Projects filters, including archived records.',
      'Ask an administrator to check your active account, project assignment and view capability.',
      'For time choices, also check employee/jobsite availability; a project schedule assignment is not automatically a clocking permission.',
    ],
    ['roles', 'project-team'],
  ],
  [
    'client-missing-content',
    'A client cannot see content',
    [
      'Check that the client is signed in to the deliberately linked account and has active project access.',
      'Check explicit publishing: client task wording, client summary, CLIENT file visibility or published selection.',
      'For a Change Order, check issued state and the named client. Use Client preview to compare.',
    ],
    ['client-access', 'client-publishing'],
  ],
  [
    'trade-missing-work',
    'A trade cannot see a Work Order',
    [
      'Check active trade project access and the exact recipient Contact on the issued revision.',
      'Draft, review and approved-but-unissued documents stay private. Another contact at the same company does not inherit access.',
      'Check that attached files are TRADE-classified and deliberately shared to that recipient.',
    ],
    ['trade-access', 'trade-documents'],
  ],
  [
    'missing-commitment',
    'A PO is not affecting Committed cost',
    [
      'Confirm it was issued, not only internally approved.',
      'Check cancellation and fulfillment: fully consumed work has zero remaining commitment.',
      'Review the budget row’s Cost Code/Cost Type and the commitment register.',
    ],
    ['purchase-orders', 'commitment-fulfillment'],
  ],
  [
    'bill-not-consuming',
    'A Bill did not reduce the commitment',
    [
      'Check that it actually applied, rather than remaining staged/review-required.',
      'Inspect the commitment link; matching amount/vendor alone is not enough.',
      'Use authorized QuickBooks Bill reconciliation for an explicit match. Resolve overages through purchasing revision before retrying.',
    ],
    ['qb-bills', 'qb-reconciliation'],
  ],
  [
    'qb-blocked',
    'QuickBooks says BLOCKED or reconciliation required',
    [
      'Read the blocker and current mode. Check pilot scope, company binding, mapping freshness and source approval.',
      'Taxable PO export and unsupported Bill formats are deliberately blocked; do not change facts to bypass them.',
      'If a write may have reached QuickBooks, verify the actual transaction rather than blindly resending.',
    ],
    ['qb-recovery', 'qb-po'],
  ],
  [
    'clock-problems',
    'I cannot clock in or my punch did not confirm',
    [
      'Check internet access and scan the current active Shop QR to start the day.',
      'Check assigned work modes, active project availability and allowed tasks with the office.',
      'Resolve an existing open shift or invalid timezone. For site arrival use the Truck QR.',
      'After a timeout, refresh to check whether the action reached the server before retrying.',
    ],
    ['clock-in', 'site-travel', 'forgotten-shifts'],
  ],
  [
    'login-problems',
    'Password, invitation or login problems',
    [
      'Use Forgot password from the login page and check inbox/spam. The response does not disclose whether an unrelated account exists.',
      'For a portal invitation, ask the project team to verify the email and resend or reactivate access.',
      'Ask an administrator to check active account/email delivery if setup mail never arrives. Share a safe error reference, never your password.',
    ],
    ['sign-in', 'client-access', 'trade-access'],
  ],
  [
    'upload-problems',
    'File upload is unavailable',
    [
      'Read the error before retrying; confirm the file size/type and your project upload permission.',
      'Production uploads require an implemented durable storage adapter. The development local-disk adapter is deliberately refused in production.',
      'Ask the application operator about storage availability. Do not treat metadata or a failed request as a successfully stored file.',
    ],
    ['files-photos', 'trade-documents'],
  ],
  [
    'stale-record',
    'A record changed or cannot be edited',
    [
      'Refresh and reread the current version; another person may have saved a change.',
      'Check whether the document is issued, accepted or otherwise locked. Use its revision/correction workflow instead of trying to overwrite history.',
      'For template date errors check unique task keys, predecessor existence and cycles.',
    ],
    ['estimate-revisions', 'purchasing-revisions', 'schedule-templates'],
  ],
];
export const troubleshootingGuides = problems.map(([id, title, steps, related]) =>
  guide('troubleshooting', {
    id,
    title,
    summary: 'Work through these checks before repeating the action.',
    when: title,
    steps,
    related,
    next: 'If still blocked, send the office the screen, action, time and safe error/reference. Exclude passwords, private accounting payloads and credentials.',
  }),
);

const terms: Record<string, string> = {
  'Actual Cost':
    'An incurred project cost recorded in the normalized cost ledger; reversed entries retain history without remaining active cost.',
  Allowance:
    'Client value already included in the contract for a later choice. It has a separate internal included-cost baseline.',
  Assembly:
    'A reusable group of estimate components whose quantities equal base quantity × component factor.',
  Budget:
    'Internal expected cost. Original preserves the accepted baseline; Current is the latest approved cost snapshot.',
  Capability:
    'A specific permission, such as issuing a PO, that can be refined separately from the role bundle.',
  'Change Order':
    'A client contract modification. Acceptance applies separate client-price and internal-budget adjustments.',
  'Client Price':
    'The selling price offered to the client, distinct from Cedar Winds’ internal cost.',
  Commitment:
    'An obligation to spend. Reports show the remaining amount after linked actuals consume it.',
  Contact:
    'A person in the business directory, not automatically an authenticated user or portal member.',
  'Cost Catalog': 'The company’s library of reusable priced items and defaults.',
  'Cost Code': 'A financial classification shared across project cost records.',
  'Cost Type': 'Labour, Material, Subcontract, Equipment or Other within financial classification.',
  Estimate:
    'Versioned expected costs, markup and client pricing before the contractual offer is issued.',
  Forecast:
    'Expected final cost. Current calculation takes the greater of current budget and actual + remaining commitment + forecast adjustment.',
  HST: 'Tax shown separately from pre-tax client pricing; not internal profit or budget cost.',
  Margin: 'Profit divided by selling price. It is different from percentage markup on cost.',
  Markup: 'The fixed amount or percentage of cost added to cost to calculate selling price.',
  Milestone:
    'A significant schedule checkpoint, commonly represented with zero duration in templates.',
  'Portal grant':
    'Explicit, revocable access for an external identity to a particular project; record-level limits still apply.',
  Proposal: 'A client-facing snapshot of scope, selling prices and terms derived from an estimate.',
  'Purchase Order': 'A supplier-facing purchase document; its issued value creates commitment.',
  'QuickBooks mapping':
    'An explicit link between a CW identity/classification and the correct accounting record.',
  Reconciliation:
    'A reviewed process for resolving source, mapping or commitment differences while preserving history.',
  Revision: 'A preserved document version, used instead of overwriting issued history.',
  Selection:
    'A client decision among reviewed options, potentially linked to an included allowance.',
  Specification: 'Information-only project wording, separate from a financial client choice.',
  Template: 'A reusable company starting point copied into independent project records.',
  Variance: 'Current Budget minus Forecast in job costing. A negative value indicates overrun.',
  'Work Order':
    'A subcontract/trade scope document that uses the purchasing approval and commitment workflow.',
};
export const glossary: HelpArticle = {
  id: 'terms',
  category: 'glossary',
  title: 'CWManagement glossary',
  summary: 'Plain-language definitions for everyday project work.',
  keywords: ['definition', 'terminology', 'vocabulary'],
  roles: [],
  updated: '2026-09-28',
  related: ['quick-start', 'job-cost'],
  sections: Object.entries(terms)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([heading, text]) => ({ heading, paragraphs: [text] })),
};
