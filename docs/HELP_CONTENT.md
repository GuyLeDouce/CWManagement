# HOW TO content and maintenance

The in-app operating manual is static, version-controlled application content, not developer documentation rendered into a portal. No help database, migration or external content service is required.

## Structure

- `src/lib/help/types.ts`: article/section metadata, category descriptions and the common purpose/when/steps/next/notes structure.
- Topic modules (`projects`, `templates`, `financial`, `operations`, `time-admin`, `quickbooks`, `workflows`) provide internal articles. `index.ts` combines them.
- `portals.ts` contains separate client and trade instructions. Portal help does not import the internal article index or internal data loaders.
- `navigation.ts` supplies partial-token search, capability-gated action destinations, recommendation ordering and contextual help targets.
- `HelpCentre` renders the shared accessible presentation, category navigation, article contents, related/previous/next links and print views. `InternalHelp` and `PortalHelp` select the correct content.
- `src/app/help.css` provides the responsive layout and print rules, scoped to help so document/QR printing remains intact.

## Routes and identity boundaries

Internal help uses the existing authenticated internal catch-all at `/how-to`, `/how-to/[category]`, `/how-to/[category]/[article]` and `/how-to/manual`. Unknown help paths render an explicit guide-not-found view with a recovery link. All internal users can read help, regardless of operational capability.

Clients use `/client/help`; trades use `/trade/help`, with equivalent category/article/manual suffixes. Existing server identity guards run before help is rendered. Help does not require a project grant because it contains no project data; accessing actual portal records still requires the normal grants. Cross-portal and external-to-internal requests retain their redirects. Each portal header links to its own help.

## Add or update an article

1. Inspect the actual component and service workflow, not just historical phase specifications. Document button names and supported states accurately.
2. Add a unique stable `id`, category, plain-language title/summary, keywords, relevant role metadata, human-readable update date and related article IDs.
3. Use numbered steps for actions and separate notes/callouts for limitations, visibility and financial effects. Keep examples generic. Never include credentials, real client data or fake screenshots.
4. Add optional extra sections for calculations or terminology. Callout kinds are `tip`, `important`, `financial`, `client`, `trade`, `locked`.
5. Use a destination key from the central allowlist, never an arbitrary internal action URL in article text. Links are offered only with an effective capability. A project guide links to Projects because it has no chosen project context.
6. Add topic-specific search keywords and related links. Search normalizes accents/case/punctuation, requires each query token to match, supports partial matches and ranks titles/keywords above body text. It performs no network search and logs no queries.
7. For contextual help, map a workspace or project tab in `navigation.ts`. One help link appears per major workspace, outside individual rows.
8. Run help/unit tests and relevant browser coverage. Preview mobile and print views when changing presentation.

Material user-facing workflow changes should update the matching HOW TO guide in the same PR/commit. Trivial visual changes do not require content edits. Preserve stable IDs where possible so bookmarks continue working.

## Recommendations and permissions

All internal guides remain readable; recommendations emphasize field time, estimating, project work or accounting based on role/effective capabilities. Article role metadata records intended readers, not authorization. Direct action links are capability-filtered, with all server-side operational authorization unchanged. An Owner's explicitly denied capability must not be bypassed by help links.

## Print

Print guide uses browser printing on the article. Full manual renders every article grouped by category before printing; no hidden lazy-loaded pages are omitted. The print stylesheet removes the app header/sidebar, controls, help navigation, related links and search. Category headings start new pages. Client/trade printing contains only that portal's guide.

## Audited limits that the manual must retain

Reports/Leads are placeholders; production file upload needs durable storage implementation; folder templates are checklists; schedule shifts do not cascade and there is no critical-path/calendar editor; proposal New revision copies the existing snapshot without a full repricing editor; Mark accepted records the staff actor; Included, not Optional alone, controls estimate totals; supplier selection is not offered in the catalog form; QuickBooks live validation remains pending, with taxable POs and unsupported Bill forms blocked. Do not turn a future requirement into a how-to instruction.

## Initial validation

The initial manual contains 106 internal articles across 25 categories, five client guides and seven trade guides. Validation passed: lint, typecheck, 95 unit tests, 103 isolated PostgreSQL integration tests, 33 focused QuickBooks tests, 19 browser workflows and the production build (including Prisma generation). The focused QuickBooks count overlaps the unit/integration suites. Seven help unit tests and six help browser workflows cover search, routes, recommendations, capability-filtered links, mobile navigation, portal separation and printable content. Desktop/mobile layouts were visually reviewed from actual browser captures. No schema change or migration was needed. These automated results do not establish live QuickBooks compatibility.

Phase 8A guides live in business.ts; client/trade warranty guides remain in the separate portals.ts bundle. Material CRM, service, report and reminder changes must update these guides alongside the implementation.
