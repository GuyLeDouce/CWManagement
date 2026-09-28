# Site instructions

SiteInstruction is project operational direction, distinct from a client Change Order or purchasing commitment. Settings.siteInstructionPrefix and nextSiteInstructionNumber allocate numbers transactionally. No ledger is updated by instruction creation, issuance, acknowledgement or comments.

Staff require SITE_INSTRUCTION_CREATE to create/edit a draft, SITE_INSTRUCTION_VIEW to read the internal workspace, and SITE_INSTRUCTION_ISSUE to issue/close/cancel, always with project access. Recipients are explicit project trade Contacts. Optional links to an issued own PO/WO, project task and TRADE file attachments are validated.

State machine: DRAFT → ISSUED → ACKNOWLEDGED → CLOSED. ISSUED can also close without all receipts; DRAFT/ISSUED/ACKNOWLEDGED may be CANCELLED. ACKNOWLEDGED means every named recipient has a receipt. Each receipt is separately immutable and idempotent. Trade never edits or closes an instruction.

Issuance stores number, title, description, date, acknowledgement requirement and safe attachment references as a snapshot. Issued content and recipients are protected by database triggers. Changes require a new numbered instruction with replacesId referencing its predecessor. The preceding instruction remains historical; staff deliberately closes/cancels it when the replacement becomes authoritative. This avoids silently rewriting previously received direction.

Trade questions use scoped project conversations; contextual instruction messages and evidence uploads are supported by the service. Only the instruction's recipients on an active project grant can see or acknowledge it. File evidence is retained and cannot be unpublished to erase a receipt.

Cost impacts must be discussed with Cedar Winds, priced and authorized through the existing PO/WO revision and client CO workflow where applicable. A trade comment is never financial approval.
