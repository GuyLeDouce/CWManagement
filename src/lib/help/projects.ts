import { guide } from './types';
export const projectGuides = [
  guide('getting-started', {
    id: 'quick-start',
    title: 'New to CWManagement?',
    summary:
      'Use CWManagement as the project record, from the first client conversation to closeout. QuickBooks Desktop remains the accounting system.',
    when: 'Start here on your first day, or before setting up a new job.',
    destination: 'projects',
    related: ['create-project', 'create-estimate', 'clock-in', 'roles'],
    steps: [
      'Find or add the client in Contacts. A contact is a business record; it does not automatically receive a login.',
      'Open Projects, create the project and choose a reviewed Project Template. Assign the PM, required team roles and starting dates.',
      'Review the copied schedule, estimate and selection drafts. Replace assumptions with project-specific information.',
      'Build the estimate, review costs and client pricing, then create and inspect the proposal. Issue it before recording acceptance.',
      'Create the budget from the accepted proposal. Confirm the original contract baseline in project settings before accepting later Change Orders.',
      'Prepare allowances and selections. Invite the client separately and publish only the content you want them to see.',
      'Prepare Purchase Orders or Work Orders. Obtain internal approval and issue them to establish commitments. Invite trades separately.',
      'Keep schedule dates, daily logs, photos, messages and deficiencies current. Record employee time through the QR workflow.',
      'Price, issue and obtain approval for changes. Monitor Budget, Committed, Actual, Forecast and Variance during project reviews.',
      'Have authorized staff approve time and reconcile accounting costs. QuickBooks use starts with the controlled pilot, not unrestricted sync.',
      'Review open deficiencies and outstanding work, update project status/dates and archive when appropriate. Full warranty/service operations are not yet built.',
    ],
    next: 'Use the linked guides for the detailed steps. If a button is missing, ask about your permissions rather than using another person’s account.',
    notes: [
      'Templates are starting points. They do not create approvals, invite clients or trades, or import accounting history.',
    ],
  }),
  guide('getting-started', {
    id: 'sign-in',
    title: 'Sign in, reset your password and install the app',
    summary: 'Use your individual Cedar Winds account on desktop or phone.',
    when: 'You receive an invitation, change devices, or cannot remember your password.',
    destination: 'time',
    related: ['clock-in', 'roles'],
    steps: [
      'Open the invitation/setup link sent to your email and set your own password. Never share the invitation link.',
      'Open the normal application address and sign in. Client and trade accounts open their own portals.',
      'Use Forgot password on the login page if needed. Check spam and ask the office if delivery does not arrive.',
      'On iPhone use Safari → Share → Add to Home Screen; on Android use Chrome → Install app or Add to home screen.',
      'Use Sign out on shared devices. Open on desktop, where offered, sends an email link; you can also open the usual address and sign in.',
    ],
    next: 'Your available workspace depends on your account and project access.',
    notes: [
      'QR scans can open the phone browser rather than the installed app. You may need to sign in there too. Internet is required for actions; the app does not silently queue punches offline.',
    ],
  }),
  guide('projects', {
    id: 'create-project',
    title: 'Creating a Project',
    summary:
      'The project wizard gathers the client, site, team and reusable starting structure in one place.',
    when: 'A new job needs its own operational record.',
    destination: 'projects',
    related: ['project-templates', 'copy-project', 'project-team'],
    steps: [
      'Open Projects and choose the create action. Choose the project type and an existing client, or enter the new client details.',
      'Enter a unique project number, clear name, site address and municipality. Select the PM, approximate start and target completion.',
      'Choose an active Project Template, a blank project, or selected structures from an existing project.',
      'For a template with required team roles, assign an active internal user to each role. Review the proposed setup.',
      'Create the project, then open Schedule, Estimate and Selections to check the copied work.',
    ],
    next: 'The project and selected draft structures are created together. The template version and copied content remain recorded.',
    notes: [
      'Numbers are entered in this wizard; do not assume an automatic project-number sequence. Target completion cannot precede the start date. Template use requires permission for each kind of record it creates.',
    ],
  }),
  guide('projects', {
    id: 'project-overview',
    title: 'Using Project Overview',
    summary:
      'Overview brings the project identity, operational follow-up and recent records together.',
    when: 'Preparing a site visit, weekly project review or handover.',
    destination: 'projects',
    related: ['dashboard', 'job-cost', 'project-team'],
    steps: [
      'Find the project through Projects, global search or Recent Projects. Confirm its number, name, client and address.',
      'Read Project information for status, stage, dates and notes. Use the project tabs to open the actual records.',
      'Review upcoming schedule tasks, recent daily logs, time summary and recent photos.',
      'Review the task/decision follow-up and Purchasing & changes cards where your permissions allow them.',
      'Read Recent activity for meaningful project changes; follow up in the relevant document or conversation.',
    ],
    next: 'Turn the review into assigned tasks and deliberate updates rather than relying on a meeting note alone.',
    notes: [
      'Overview is a summary, not a complete history or a replacement for the Budget report. Financial visibility depends on permission.',
    ],
  }),
  guide('projects', {
    id: 'project-team',
    title: 'Project team, contacts, settings and archiving',
    summary:
      'Internal assignments control staff relationships; Project Contacts identify the client, trades and consultants.',
    when: 'Staff responsibilities, client details, dates or the lifecycle change.',
    destination: 'projects',
    related: ['roles', 'contacts', 'client-access', 'trade-access'],
    steps: [
      'Open Project → Settings. Review general information, location, dates, status and stage.',
      'Use Internal assignments to add the staff member and project role; designate the primary relationship where appropriate.',
      'Use Project contacts to select or create a contact and record their role on this job.',
      'Save changes and verify the project header and Overview. Keep internal notes separate from client-visible wording.',
      'Use the project archive action when the project should leave normal active lists. Use the Projects archived filter to find retained records.',
    ],
    next: 'Project relationships are available to the operational workflows. Client and trade portal access still requires a separate explicit invitation/grant.',
    notes: [
      'Status is the lifecycle, such as Active or On hold. Stage is descriptive working context. A Warranty status does not create a warranty module. Original contract changes become restricted once accepted Change Orders exist; use controlled financial changes, not baseline edits.',
    ],
  }),
  guide('projects', {
    id: 'copy-project',
    title: 'Start from an existing Project',
    summary: 'Copy useful structure while leaving the original job and its history intact.',
    when: 'A previous project provides a better starting point than a saved standard.',
    destination: 'projects',
    related: ['create-project', 'save-template'],
    steps: [
      'Start the New project wizard and enter the new client, site, manager and dates.',
      'Choose the existing-project starting option and select a project you can access.',
      'Select the estimate, schedule, selections or proposal structure you want to copy.',
      'Review the new project after creation and replace any project-specific wording retained in free text.',
    ],
    next: 'You receive independent working records, not shared live references.',
    notes: [
      'Client approvals, messages, ActualCosts, commitments, time entries, accounting mappings and portal grants are not copied. Schedules with unsupported template dependency graphs are rejected rather than silently simplified.',
    ],
  }),
  guide('workday', {
    id: 'dashboard',
    title: 'Dashboard, Today and project follow-up',
    summary:
      'The Dashboard combines scoped follow-up with project stage counts, target dates and recent activity.',
    when: 'At the start of the day or before a project review.',
    destination: 'dashboard',
    related: ['my-work', 'search', 'project-overview', 'reports'],
    steps: [
      'Open Dashboard and review the work queue for due tasks, decision follow-up and deficiencies ready for review.',
      'Use Projects by stage to understand the current project mix.',
      'Review Upcoming target dates and Recent project activity.',
      'Open the related project or record to take action; use Locate for employees’ current recorded work state.',
    ],
    next: 'Updates are made in their source workspaces and are reflected when the dashboard reloads.',
    notes: [
      'The dashboard is not a complete executive analytics system or live GPS view. Its queues and counts respect your project access.',
    ],
  }),
  guide('workday', {
    id: 'my-work',
    title: 'Using My Work',
    summary:
      'Find your assigned schedule tasks alongside authorized project-level follow-up and your notifications.',
    when: 'You need to decide what to handle next.',
    destination: 'my-work',
    related: ['dashboard', 'schedule-tasks', 'notifications'],
    steps: [
      'Open My Work. Review the tasks assigned to you and their due dates/status.',
      'Check the selection and deficiency follow-up shown for projects you can access.',
      'Open notifications and linked project records to deal with the work.',
      'Update the source task or record when the action is complete.',
    ],
    next: 'Completed or changed records leave the relevant queue when refreshed.',
    notes: [
      'Project decision/review queues are not necessarily personally assigned to you. My Work is not yet a universal inbox for every approval or message.',
    ],
  }),
  guide('workday', {
    id: 'search',
    title: 'Global search and Recent Projects',
    summary: 'Return to a project or find a known operational record without browsing every list.',
    when: 'You know part of a name or document number.',
    destination: 'projects',
    related: ['my-work', 'contacts'],
    steps: [
      'Use the search box in the management header and type part of the project, contact, purchasing number, Change Order, selection or file name.',
      'Choose an available result to open its workspace.',
      'Use Recent Projects in the sidebar for jobs you recently opened in this browser session.',
    ],
    next: 'The destination performs its own access check; search does not grant new access.',
    notes: [
      'Contact and financial results require the relevant permissions. Recent Projects stores IDs for the current browser session, not a permanent company-wide activity list.',
    ],
  }),
];
