# Leads and opportunities

Contacts remain identities; Opportunity represents a potential job. Company is reached through the primary Contact. OpportunityStage and LeadSource are managed company records, never permanent enums or seeded fictitious leads. OPEN/WON/LOST describes outcome independently of the configurable stage. Lost requires a reason. Version checks prevent stale editing and AuditLog retains changes.

CRM_CONFIGURE grants company-wide visibility/configuration. Other CRM_VIEW users see owned opportunities or those with assigned activities. CRM_MANAGE controls changes; only configurators can assign an opportunity to another owner. External roles receive no CRM capability.

The Leads workspace provides stage columns, list, status/search filters, detail editing and dated owned follow-ups. Follow-ups feed Dashboard/My Work and scheduled reminders. Communication notes are internal activity records, not mailbox integration.

Won conversion extends setupProject: project creation, contact promotion from prospect to client, template application, opportunity link and audit are one serializable transaction. The unique project link and retry checks prevent duplicate conversion. Sales notes and accounting/approval data are not copied. Once converted, change the project; retained sales history is not overwritten.

Current limits: no email inbox integration, pre-project estimate/proposal authoring, CRM file upload, drag-and-drop stage movement or marketing automation. Pipeline amounts are entered estimates, not accounting revenue. The first version offers search/status filtering; deeper source/owner breakdown is in Reports.

The workspace supports stage, owner, source, project type and opened-date filters, plus opportunity/value/follow-up sorting. Pipeline cards display the owner. These filters operate only on the server-authorized opportunity set.
