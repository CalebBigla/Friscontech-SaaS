<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep Phase 1 frontend-only with tenant-scoped mock records in `src/data`; this preserves realistic relationships while deferring persistence.
- Keep dashboard controls reusable through shared UI components; this prevents role dashboards from diverging as later phases are added.
- Mock data lives in `src/data/mock-db.ts` (relational, ID-linked, no derived values); all business math lives in `src/lib/calculations.ts`; so pages never duplicate numbers.
- Writes go through `src/services/services.ts` (async, API-shaped) over the store in `src/services/mock-store.ts`; so swapping to a real API touches one file.
- Demo RBAC scope comes from `src/lib/session.ts` (`getAccessScope`); so every page filters data by role the same way.
- Use Instrument Sans for the product interface and IBM Plex Sans Light only for subdued supporting copy; this keeps hierarchy clear without weakening primary information.

- Inventory/stock-request math lives in `src/lib/inventory-calculations.ts` (available = onHand − reserved, status, value, availability, timelines); so stock numbers are never computed in components.
- `applyInventoryChange` in `src/services/services.ts` is the only writer of `quantityOnHand` and always appends an `inventoryMovements` row, refusing negatives; so every stock change is traceable (sales, stock issues, additions, adjustments).
- Stock requests: approval never touches stock; only fulfillment deducts, with `partially_fulfilled` when issued < approved; so the workflow stays auditable.
- Role-specific navigation lives in `app-shell.tsx` (`sectionsFor`), pages are gated with `RoleGate` and data comes from role-scoped selectors (`getAccessScope`, `lib/audit.ts`); so hidden modules are also unreachable by URL.
- Product and rep-target selectors live in `src/lib/catalog-calculations.ts` (target achievement = rep's completed sales in the month, status from pace); so targets never store achieved values.
- Products are soft-deactivated (`status`), never deleted; services refuse inactive products for new sales, stock requests and stock additions so history stays intact.
- Team is a view over `db.users` via `src/lib/team.ts` (`canAccessMember`, `getTeamMembers`) and writes via `teamService`; so managers never receive other teams' users and users are only soft-deactivated.
- Reports (`src/lib/reports.ts`) only compose existing Sales/Targets/Inventory/Team selectors, scoped by `canViewReports` + `branchIds`; so reports never become a second source of truth.
- Audit history is one dataset (`db.activities`, model in `src/data/auditLogs.ts`) written only via `createAuditLog` in services and read only via role-scoped selectors in `src/lib/audit.ts`; so no module keeps its own log and rows are filtered before reaching the UI.
- Organization settings live on `db.tenant`, per-user preferences in `db.preferences`, written via `settingsService` (owner-only for tenant fields); passwords are never stored in app data.
