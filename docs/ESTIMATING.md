# Estimating

Creating a proposal snapshot locks its source estimate revision as `READY`. Pricing changes require a new estimate revision, keeping the eventual budget aligned with the proposal's original costs.

`Estimate` is a project-scoped numbered family; `EstimateRevision` owns a complete historical set of sections and lines. Creating a revision copies sections, cost-code snapshots, quantities, costs, markup, tax flags, and client wording. Accepted revisions are never overwritten. Draft/internal-review revisions use an optimistic `version` checked on every line mutation.

Estimate sections control presentation only. Cost Code and Cost Type control job costing. Supported cost types are Labour, Material, Subcontract, Equipment, and Other. Units are short free-form labels.

All authoritative calculations run on the server with Prisma Decimal. Line cost is quantity × unit cost, rounded half-up to cents. Markup methods are none, fixed dollars, or percentage markup on cost. Client price is cost plus markup. Gross profit is client price minus cost; gross margin is gross profit divided by client price. Included taxable client-price lines receive the centrally configured tax rate.
