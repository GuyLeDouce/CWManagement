# Proposals

A proposal family has numbered revisions. Each revision snapshots project/client/company identity, client-visible section/line wording, quantities, units, client prices, subtotal, tax, total, and terms. Internal cost, markup, and margin are deliberately absent from proposal snapshots and output.

Draft proposals may be issued; only issued proposals may be marked accepted. Issued/accepted revisions are preserved and a subsequent change creates a new revision. Acceptance records time, internal accepting user, and display name, and can create the internal budget once.

The proposal preview uses print-specific branded HTML and the browser's standards-based Print/Save as PDF engine. This keeps document generation dependency-free and modular while retaining stable snapshot content; server-rendered binary PDF and signature infrastructure are future enhancements.

## Company language

Proposal templates retain reusable introduction/scope/exclusions/assumptions/terms. The creation editor can populate wording from the library or the project's setup snapshot. Staff review captured wording for project-specific information before saving a reusable template. Client identity, prices and approvals are never captured into reusable proposal structure. Existing source-estimate locking and issued snapshots remain unchanged.
