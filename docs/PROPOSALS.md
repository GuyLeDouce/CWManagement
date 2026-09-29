# Proposals

A proposal family has numbered revisions. Each revision snapshots project/client/company identity, client-visible section/line wording, quantities, units, client prices, subtotal, tax, total, and terms. Internal cost, markup, and margin are deliberately absent from proposal snapshots and output.

Draft proposals may be issued; only issued proposals may be marked accepted. Issued/accepted revisions are preserved and a subsequent change creates a new revision. The current Mark accepted action records time and the signed-in staff member?s identity/name; it does not collect a separate client-entered name or portal signature. Create budget is a separate action available after acceptance and can establish the internal budget once.

The proposal preview uses print-specific branded HTML and the browser's standards-based Print/Save as PDF engine. This keeps document generation dependency-free and modular while retaining stable snapshot content; server-rendered binary PDF and signature infrastructure are future enhancements.

## Company language

Proposal templates retain reusable introduction/scope/exclusions/assumptions/terms. The creation editor can populate wording from the library or the project's setup snapshot. Staff review captured wording for project-specific information before saving a reusable template. Client identity, prices and approvals are never captured into reusable proposal structure. Existing source-estimate locking and issued snapshots remain unchanged.

## Current editor boundary

New revision copies the existing proposal snapshot and its source estimate into a new draft; the current UI does not edit that copied wording or reselect its estimate. Changed pricing/wording requires creating a new proposal from the corrected estimate/text and clearly identifying the replacement offer. Do not describe this as a full draft proposal repricing editor.
