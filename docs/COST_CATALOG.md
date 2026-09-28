# Cost catalog

CostCode classifies costs. CostCatalogItem describes frequently estimated work/materials, with unit cost, unit, cost code/type, default markup, tax treatment, category, notes, source and optional validated supplier contact. Catalog money uses existing Prisma Decimal and financial-math rules. It is not an estimate, commitment or accounting transaction.

Templates → Cost catalog offers search, edit/deactivate and CSV preview/import. Download the headings from the import dialog. Use exact existing active `costCode` strings; `costType` is LABOUR, MATERIAL, SUBCONTRACT, EQUIPMENT or OTHER. `markupMethod` is NONE, FIXED or PERCENT_ON_COST. `taxable` is true/false. Nonnegative costs/markup support four decimal places. Imports are capped at 500 rows/100 KB, reject invalid rows as a whole, and create new items rather than guessing updates by name.

Estimate quick-add snapshots the catalog values into the current editable estimate revision. Changing catalog costs later never reprices an existing project. An existing estimate row can be saved to the catalog with COST_CATALOG_MANAGE and access to its source project. Read access and maintenance are separate capabilities.

Assembly templates retain explicit component costs/factors, so catalog changes do not silently reprice assemblies either. Review/edit the assembly when company costs change. Selected catalog prices can be multiplied in a version-checked, audited batch; a conflict rolls back the entire batch. Supplier price-history graphs and supplier feeds are not implemented.
