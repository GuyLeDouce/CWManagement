# Client and Trade Portal Boundaries

Portal users are authenticated `User` records linked deliberately to a contact or authorized trade identity. Creating a contact never creates access.

Client queries will be separate allowlisted projections: project overview, published schedule/progress, selected photos/files, selections, allowances, change orders awaiting approval, messages, permitted invoice/payment summaries, and warranty submissions. They exclude costs, margins, employee/payroll data, vendor pricing, internal notes, accounting records, and every unrelated project.

Trade queries likewise expose only assigned projects and explicitly released schedule, scope, purchase/work orders, drawings/files, site instructions, deficiencies, and upload endpoints. Authorization is enforced in every server query and mutation. Download URLs are short-lived and project-scoped. Audit logs record approvals, uploads, and material communication events.
