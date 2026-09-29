# Phase 8A implementation audit

Reviewed the local main branch at d2e6377, documentation, schema, deployment configuration, dispatcher, project setup, financial reporting, client/trade projections, file authorization, work queues and help architecture. No uncommitted changes existed at the start.

* Leads and Reports route to PlaceholderScreen. Contact is already separate from User and Company; sales state belongs in a new Opportunity aggregate.
* Project setup already copies versioned templates transactionally. Conversion must use that transaction, with a unique opportunity/project link, rather than create a competing setup service.
* Deficiencies have trade assignment and immutable updates but no client submission/verification lifecycle. Warranty needs its own aggregate with explicit client and trade projections.
* Client Vision uses the real client projection and renderer. Warranty must join that projection and retain disabled preview mutations.
* Financial reports must call jobCost; project scope and margin capabilities must apply before export as well as on-screen.
* Event notifications exist. Scheduled scans, delivery retries and durable deduplication do not. Opt-in configuration must precede delivery.
* StorageService exists, but production has only an unconfigured adapter. Existing file keys and metadata must be retained; switching providers is a migration operation, never an implicit fallback.
* Railway uses stateless containers. Scheduled work requires a database lease and an external cron invocation. No process-local timers.

This is a source/workflow audit, not a claim of user acceptance or production recovery testing. QuickBooks remains implemented with live validation pending; Phase 8A must not alter activation controls.
