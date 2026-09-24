# Allowances and selections

Allowance is an included contractual client value before HST, with a separate includedCost baseline and cost-code/type allocation. It is not a ledger. Staff may record an existing contract allowance or link an accepted EstimateLine marked allowance; linked values use shared lineAmounts rules. Optional BudgetLine linkage preserves traceability. Source links must match project and allocation. Published allowances are immutable.

One Selection can use one Allowance, with a unique link preventing double subtraction. Split contractual categories into sub-allowances before publishing if separate decisions are needed. Without an allowance, the full option client price is an additional scope change.

Options include product description, manufacturer/model/finish, URL, lead time, supplier, quantity/unit, cost allocation, private cost/markup and server-calculated clientPrice. The portal excludes supplier identity/cost/markup. Options reference existing CLIENT StoredFile brochures/photos/specs; internal quotes cannot attach. Option allocation and tax treatment must match its allowance.

## Lifecycle

DRAFT → PUBLISHED → APPROVED (zero difference) or APPROVAL_REQUIRED (nonzero difference) → APPROVED after CO acceptance → CLOSED. Undecided published selections can return to DRAFT. Every edit/publication increments an optimistic version; stale decisions fail. Options cannot change while published. Confirmed decisions are final in Phase 5: subsequent corrections require staff discussion and a separate corrective scope/CO, never rewriting evidence. CANCELLED is reserved; no destructive cancellation endpoint exists.

SelectionDecision uniquely records selection, option, authenticated user/contact, time, comment and client-safe display snapshot: title, description, product, attachments, allowance, price and variance. Database triggers protect decisions and decided content. Decided selections cannot be unpublished. One final decision per selection is deliberate policy.

## Financial rules

Prisma.Decimal and shared half-up cent rounding apply. Values are before HST; the CO taxes the difference according to allowance treatment.

| Allowance | Selected price | Contract delta |
| --------- | -------------- | -------------- |
| 12,000    | 12,000         | 0              |
| 12,000    | 14,500         | +2,500         |
| 12,000    | 10,000         | -2,000         |
| none      | 5,000          | +5,000         |

A nonzero decision creates a DRAFT Phase 4 CO in the same transaction. Selling-price delta is selectedPrice minus allowance.amount. Internal budget delta is selectedCost minus allowance.includedCost. For 14,500 selling price / 9,800 cost versus 12,000 allowance / 8,000 cost, the draft has +2,500 contract price and +1,800 internal cost, represented by one signed fixed-markup line. Existing review/approve/issue/accept workflow applies. Decisions never directly create contract adjustments, budgets, actuals or commitments.

Zero-price-variance decisions approve without ledger mutations; purchasing and forecast controls govern internal cost variance. Nonzero choices remain APPROVAL_REQUIRED until CO acceptance. Signed credits retain signed HST and are rejected if resulting budget allocation or current contract would become negative. ORIGINAL budget and contract baseline remain unchanged. Staff may review draft allocations; the issued CO is the final financial approval document.

## Workspace

Project → Selections offers allowance capture, draft editing, options, client-safe attachments, deadlines, publish/unpublish, decisions/comments, CO links and close. Project → Clients previews published content with actions disabled. Dates drive due/overdue display; automated reminders require a future deduplicated scheduled job. No automatic supplier ordering occurs.
