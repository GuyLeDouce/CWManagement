import { guide } from './types';
// Deliberately separate from the internal manual: external bundles import only these guides.
export const clientGuides = [
  guide('using-portal', {
    id: 'welcome',
    title: 'Welcome to your Client Portal',
    summary: 'Follow your Cedar Winds project, review decisions and stay in touch with your team.',
    when: 'You are new to the portal or need to find your project.',
    steps: [
      'Use your invitation email to set up your password, then sign in at the normal application login.',
      'Choose your project from the welcome page. Only projects Cedar Winds has shared with your account appear.',
      'Start with Home and Needs your attention, then open Schedule, Selections, Change orders, Updates, Photos, Documents or Messages.',
      'If a project is missing, contact Cedar Winds to check your invitation. Use Forgot password on the login page for password help.',
    ],
    next: 'New published updates and decisions appear as the team releases them.',
    related: ['follow-project', 'choose-selection', 'approve-change', 'contact-team'],
    notes: [
      'An empty section may mean nothing has been published yet. Your portal is specific to your authorized projects.',
    ],
  }),
  guide('using-portal', {
    id: 'follow-project',
    title: 'Schedule, updates, photos and documents',
    summary: 'See the project information your Cedar Winds team has shared.',
    when: 'Checking progress or finding a drawing or document.',
    steps: [
      'Open the project and choose Schedule to review shared dates and milestones.',
      'Use Updates for published progress summaries.',
      'Open Photos for shared images and captions, or Documents for published files.',
      'Open a file through its link while signed in. Ask your team if an expected item is missing.',
    ],
    next: 'The team controls which information is published and can clarify changes through Messages.',
    related: ['contact-team', 'welcome'],
    notes: [
      'Not every working schedule item or internal file is published. Dates may change; contact your team with questions.',
    ],
  }),
  guide('decisions', {
    id: 'choose-selection',
    title: 'Choose and confirm a Selection',
    summary: 'Review the options and confirm the detail you want for your project.',
    when: 'A published selection needs your decision.',
    steps: [
      'Open Selections and read the description, deadline and included allowance. Specifications on this page are information, not choices.',
      'Review each option, product details, shared photos/specs, selected value and difference. Prices shown are before HST.',
      'Choose your option, add any useful comment and read/check the confirmation acknowledgement.',
      'Confirm only when you are ready. Wait for the saved decision before leaving the page.',
    ],
    next: 'A price difference is prepared as a separate Change Order for review and approval. Your initial choice does not silently change the contract.',
    related: ['approve-change', 'contact-team'],
    notes: [
      'A $12,000 allowance with a $14,500 choice means a $2,500 difference; a $10,000 choice means a $2,000 credit, before applicable tax. Confirmed choices cannot simply be replaced—contact Cedar Winds if a correction is needed.',
    ],
  }),
  guide('decisions', {
    id: 'approve-change',
    title: 'Review, approve or decline a Change Order',
    summary: 'Review a proposed change to scope, price and any stated schedule impact.',
    when: 'A Change Order appears for your approval.',
    steps: [
      'Open Change orders and read the number/revision, scope, attachments, subtotal, HST, total and schedule impact.',
      'Ask a question through the discussion/message action if anything is unclear.',
      'When ready, enter your typed name and acknowledgement as requested and choose Approve.',
      'If you do not agree, use the available decline/discussion action and explain the concern. Wait for confirmation.',
    ],
    next: 'Approval records your authenticated decision for that exact revision and applies the agreed change once. Declining does not approve it.',
    related: ['choose-selection', 'contact-team'],
    notes: [
      'This is a recorded portal approval, not a claim of third-party digital-signature certification. If the connection drops, refresh to check the recorded state before retrying.',
    ],
  }),
  guide('using-portal', {
    id: 'contact-team',
    title: 'Messages, notices and account help',
    summary: 'Keep project questions and replies together with Cedar Winds.',
    when: 'You need clarification or want to follow up on a decision.',
    steps: [
      'Open the project Messages section, select a thread or create a clear subject and message.',
      'For a selection or Change Order question, use its discussion action where offered so the context stays attached.',
      'Read replies and the From your team notices on Home. Mark notices read after reviewing them.',
      'For account trouble, use Forgot password or ask Cedar Winds to check your invitation/access. Sign out on shared devices.',
    ],
    next: 'Your team receives a notice. Email may alert you, but return to the portal to read and take the actual action.',
    related: ['welcome', 'approve-change'],
    notes: [
      'General project client conversations may be visible to other authorized clients on that project. A message does not replace the formal approval button. Do not send passwords.',
    ],
  }),
];
export const tradeGuides = [
  guide('using-portal', {
    id: 'welcome',
    title: 'Welcome to the Trade Portal',
    summary: 'Find your assigned work, site information and outstanding actions.',
    when: 'You have received a Cedar Winds invitation.',
    steps: [
      'Set your password from the secure invitation email and sign in. Choose the project from Your projects.',
      'Use Home to review Needs your attention, site information, issued work and outstanding items.',
      'Use Schedule, Work, Documents, Instructions, Deficiencies, Uploads and Messages as available for your role/work.',
      'If the project or an expected order is missing, ask Cedar Winds to check the exact invited contact and issued recipient.',
    ],
    next: 'Your access is limited to the records shared or assigned to your identity.',
    related: [
      'work-receipt',
      'schedule-response',
      'documents-uploads',
      'deficiency-repair',
      'messages',
    ],
    notes: [
      'Another person at the same company does not automatically share your access. Use Forgot password at login if needed and sign out on shared devices.',
    ],
  }),
  guide('work', {
    id: 'work-receipt',
    title: 'Review and acknowledge a Work Order or PO',
    summary: 'Confirm receipt of the issued scope and documents addressed to you.',
    when: 'Work shows an acknowledgement request.',
    steps: [
      'Open Work and read the current document number/revision, scope, dates, quantities, agreed values, terms and attachments.',
      'Ask Cedar Winds about unclear scope before proceeding.',
      'Use Acknowledge on the current issued revision and enter the requested receipt details.',
      'Check the saved acknowledgement. Review and acknowledge a newly issued revision separately.',
    ],
    next: 'A receipt is retained for the exact revision you saw; older history stays available.',
    related: ['messages', 'instructions'],
    notes: [
      'Receipt is not permission to add cost or change scope. Historical superseded/cancelled revisions are not the current work authorization.',
    ],
  }),
  guide('work', {
    id: 'schedule-response',
    title: 'Confirm a schedule date or report a conflict',
    summary: 'Tell Cedar Winds whether the assigned/released dates work for you.',
    when: 'A task needs confirmation or your availability changes.',
    steps: [
      'Open Schedule and read the shared task title, dates, status and trade instructions.',
      'Choose Confirmed, Conflict or Question and add a useful comment.',
      'Submit and wait for confirmation.',
      'Review Cedar Winds’ follow-up before assuming dates have changed.',
    ],
    next: 'The response is recorded for staff review; you have not edited the master schedule.',
    related: ['messages', 'welcome'],
    notes: [
      'Only relevant assigned/released tasks appear. Report a conflict promptly rather than changing the date in a message and assuming it was accepted.',
    ],
  }),
  guide('work', {
    id: 'instructions',
    title: 'Site Instructions and questions',
    summary: 'Read formal directions sent to your trade.',
    when: 'An instruction appears in Needs your attention or Instructions.',
    steps: [
      'Open Instructions and read the issued wording, related work and attachments.',
      'Acknowledge receipt when requested.',
      'Use a related conversation to ask questions or identify possible scope/cost concerns.',
      'Upload requested evidence through the authorized related-record upload flow.',
    ],
    next: 'Cedar Winds sees your receipt or question and controls further direction.',
    related: ['messages', 'documents-uploads'],
    notes: [
      'You cannot rewrite or close an instruction. An instruction/comment is not automatic authorization for extra cost; obtain the proper reviewed purchasing change.',
    ],
  }),
  guide('work', {
    id: 'deficiency-repair',
    title: 'Repair a Deficiency and submit it for review',
    summary: 'Show Cedar Winds that an assigned punch item is ready for inspection.',
    when: 'A deficiency is assigned to you.',
    steps: [
      'Open Deficiencies and read the location, description, priority, due date and shared photos.',
      'Mark work in progress where offered, then complete the correction.',
      'Upload a clear completion photo/file linked to the deficiency.',
      'Add the requested comment and choose Ready for review.',
      'If reopened, read the feedback and repeat the corrective review process.',
    ],
    next: 'Cedar Winds verifies and closes the item. Your submission does not close it automatically.',
    related: ['documents-uploads', 'messages'],
    notes: [
      'Only your assigned deficiencies appear. A connectivity error is not a saved completion—refresh and check the status.',
    ],
  }),
  guide('using-portal', {
    id: 'documents-uploads',
    title: 'Drawings, documents and completion uploads',
    summary: 'Use the shared project files and submit evidence against the right work item.',
    when: 'You need current drawings or must send a photo, certificate or shop drawing.',
    steps: [
      'Open Documents and check filename, description, upload date and revision label where supplied.',
      'Open the protected file link while signed in. Ask Cedar Winds which revision governs if unclear.',
      'Use Uploads, choose the appropriate related work/instruction/deficiency and enter a useful caption/description.',
      'Choose a supported JPEG, PNG, WebP or PDF file within the displayed size limit and submit.',
      'Wait for confirmation and check the uploaded record.',
    ],
    next: 'Cedar Winds can review the file and its uploader/related work.',
    related: ['deficiency-repair', 'instructions'],
    notes: [
      'Upload availability depends on storage configuration. Executables and disguised file types are not accepted. Do not upload a bill expecting it to enter accounting automatically; this is document evidence, not invoice submission into the ledger.',
    ],
  }),
  guide('using-portal', {
    id: 'messages',
    title: 'Message Cedar Winds and troubleshoot access',
    summary: 'Keep your trade’s project questions in its own conversations.',
    when: 'You need clarification, have a conflict or cannot find expected work.',
    steps: [
      'Open Messages and select or create a thread with a clear subject.',
      'Choose related work/instruction/deficiency when useful, then write the message and attach only permitted shared evidence where offered.',
      'Read replies in the same thread.',
      'If access disappears, contact Cedar Winds to check the project grant, assigned recipient and document issue state.',
    ],
    next: 'The appropriate staff are notified. Other trades do not see your trade-scoped conversation.',
    related: ['work-receipt', 'schedule-response', 'welcome'],
    notes: [
      'No action is silently queued offline. Do not send passwords or assume a message approves extra work.',
    ],
  }),
];
