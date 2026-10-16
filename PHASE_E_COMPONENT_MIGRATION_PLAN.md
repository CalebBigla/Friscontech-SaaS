# Phase E: Component Migration Plan

## Status: Task #17 - Update all component files

All hooks are ready. Now migrating 60+ component files from mock-store to Supabase hooks.

## Migration Priority (by dependency order)

### ✅ Already Migrated (4 files)
1. **Branches** - Complete (E1.1)
   - ✅ branches-page.tsx
   - ✅ branch-details-page.tsx
   - ✅ branch-form-dialog.tsx
   - ✅ deactivate-dialog.tsx

### 🎯 Phase 1: Core Data (no dependencies)
2. **Products** (3 files) - uses `use-products`
   - products-page.tsx
   - product-form-dialog.tsx
   - product-import-dialog.tsx

3. **Team/Users** (5 files) - uses `use-users`
   - team-page.tsx
   - team-member-dialog.tsx
   - team-member-detail.tsx
   - team-performance.tsx
   - (app-shell.tsx already references getDb, keep for now)

4. **Customers** (3 files) - uses `use-customers`
   - customers-page.tsx
   - customer-detail-page.tsx
   - customer-dialogs.tsx

### 🎯 Phase 2: Inventory & Stock
5. **Inventory** (5 files) - uses `use-inventory`
   - inventory-page.tsx
   - stock-movements-page.tsx
   - add-stock-dialog.tsx
   - adjust-stock-dialog.tsx
   - stock-levels.tsx

6. **Stock Requests** (3 files) - uses `use-stock-requests`
   - stock-request-page.tsx
   - stock-request-dialog.tsx
   - stock-request-review.tsx

7. **Expiry** (2 files) - uses `use-inventory` (batches)
   - expiry-page.tsx
   - expiry-alerts.tsx

### 🎯 Phase 3: Sales & Financials
8. **Sales** (4 files) - uses `use-sales`
   - sales-page.tsx
   - sale-form.tsx
   - sale-detail.tsx
   - sales-history.tsx

9. **Targets** (3 files) - uses `use-targets`
   - targets-page.tsx
   - target-dialog.tsx
   - target-progress.tsx

10. **Payments** (5 files) - uses `use-payments`, `use-customer-payments`
    - payments-page.tsx
    - payment-submission-dialog.tsx
    - payment-review-dialog.tsx
    - customer-payment-dialog.tsx
    - payment-chain-view.tsx

11. **Expenses** (3 files) - uses `use-expenses`
    - expenses-page.tsx
    - expense-dialog.tsx
    - expense-void-dialog.tsx

12. **Remittances** (4 files) - uses `use-remittances`
    - remittances-page.tsx
    - manager-remittance-form.tsx
    - owner-remittance-dialog.tsx
    - remittance-review.tsx

### 🎯 Phase 4: Workflows & System
13. **Approvals** (2 files) - uses `use-approvals`
    - approvals-page.tsx
    - approval-review-dialog.tsx

14. **Notifications** (2 files) - uses `use-notifications`
    - notification-bell.tsx (in app-shell)
    - notification-center.tsx

15. **Audit** (1 file) - uses `use-audit-logs`
    - audit-log-page.tsx

16. **Onboarding** (4 files) - uses `use-onboardings`
    - onboarding-invite-dialog.tsx
    - onboarding-form-page.tsx
    - guarantor-form-page.tsx
    - onboarding-review.tsx

### 🎯 Phase 5: Aggregated Views
17. **Dashboards** (4 files) - uses multiple hooks
    - owner-dashboard.tsx
    - manager-dashboard.tsx
    - rep-dashboard.tsx
    - storekeeper-dashboard.tsx

18. **Reports** (4 files) - uses multiple hooks
    - reports-page.tsx
    - sales-report.tsx
    - inventory-report.tsx
    - team-report.tsx

19. **Settings** (3 files) - uses `use-preferences`
    - settings-page.tsx
    - general-settings.tsx
    - user-preferences.tsx

## Migration Pattern (per component)

```typescript
// BEFORE (mock-store):
import { getDb, setDb } from '@/services/mock-store';
const db = getDb();
const items = db.products; // sync

// AFTER (Supabase):
import { useProducts } from '@/hooks/use-products';
const { data: products, isLoading, error } = useProducts(tenantId);

// Handle loading state:
if (isLoading) return <LoadingSpinner />;
if (error) return <ErrorMessage error={error} />;
```

## Common Updates Needed
- Replace `getDb()` with appropriate hook
- Add loading/error states to UI
- Replace `setDb()` mutations with hook mutations
- Update imports from mock-store to hooks
- Convert synchronous logic to async/await where needed
- Use React Query's cache for derived data instead of recalculating

## Estimated Effort
- ~60 component files
- Average 15-20 minutes per file
- Total: 15-20 hours (2-3 work days)

## Current Status
- ✅ 4 files complete (branches)
- ⏳ 56 files remaining
