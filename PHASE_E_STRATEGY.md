# Phase E: Service Migration Strategy

## 🎯 Goal
Replace the in-memory mock store with real Supabase PostgreSQL queries while preserving all business logic, validation, and UI behavior.

---

## 📊 Current Architecture

### Mock Store (`src/services/mock-store.ts`)
- In-memory `Db` object with all data
- `getDb()` - Read current state
- `setDb(update)` - Update state
- `useDb()` - React hook for components
- Simple, synchronous operations

### Services (`src/services/services.ts`)
- **3,331 lines** of business logic
- Already has async signatures (prepared for API)
- All writes go through services
- Components never mutate store directly
- Validation, calculations, audit logs all in services

### Business Logic (`src/lib/`)
- `inventory-calculations.ts` - Stock math
- `payment-calculations.ts` - Payment formulas
- `remittance-calculations.ts` - Manager reconciliation
- `catalog-calculations.ts` - Product targets
- `team.ts` - RBAC helpers
- **These stay unchanged** ✅

---

## 🚧 Migration Strategy

### Phase E will be split into **sub-phases** to avoid breaking the app:

### **E1: Data Fetching Layer** (Hooks & Queries)
- Create React Query hooks for each entity
- Replace `useDb()` with entity-specific hooks
- Keep services writing to Supabase
- Update components to use new hooks

Entities to migrate:
- Branches
- Products
- Inventory (records + movements + batches)
- Sales
- Customers
- Stock Requests
- Targets
- Users (Team)
- Payments
- Expenses
- Manager Remittances
- Owner Remittances
- Customer Payments
- Approvals
- Notifications
- Audit Logs (Activities)
- Onboardings
- User Preferences

### **E2: Service Writers** (CRUD Operations)
For each service, replace `setDb()` with Supabase insert/update/delete:
- `branchService` - Branch CRUD
- `salesService` - Sale creation
- `inventoryService` - Stock additions, adjustments
- `stockRequestService` - Request workflow
- `productService` - Product catalog
- `targetService` - Rep targets
- `teamService` - User management
- `paymentService` - Payment chain
- `expenseService` - Expense tracking
- `remittanceService` - Manager/owner remittances
- `customerService` - Customer management
- `approvalService` - Approval requests
- `sessionService` - User switching (demo only, can remove)
- `onboardingService` - Staff onboarding
- `settingsService` - Preferences & settings

### **E3: Seed Data Migration**
- Convert `src/data/mock-db.ts` seed data to SQL
- Create `supabase/seed.sql` with initial data
- Run seed script to populate production database
- Tenant, branches, products, initial owner user

### **E4: Refactoring & Cleanup**
- Remove mock-store.ts
- Remove mock-auth.ts (already replaced)
- Update components for async data loading
- Add loading states, error handling
- Optimize with React Query caching

---

## 🔑 Key Principles

### 1. **Preserve Business Logic**
All validation, calculation, and permission checks in `services.ts` stay exactly the same. Only the data access layer changes.

### 2. **Keep UI Unchanged**
Components should see minimal changes—just swap hooks. The UI should look and behave identically.

### 3. **Maintain Type Safety**
Database types from `database.types.ts` must match `mock-db.ts` types. We'll create adapter functions if needed.

### 4. **Incremental Migration**
Migrate entity by entity, testing each before moving to the next. Don't try to migrate everything at once.

### 5. **Backward Compatibility**
During migration, some parts may still use mock data while others use Supabase. This is okay temporarily.

---

## 📦 New Files to Create

### Hooks (`src/hooks/`)
- `use-branches.ts` - Branch queries
- `use-products.ts` - Product catalog
- `use-inventory.ts` - Inventory records
- `use-sales.ts` - Sales data
- `use-customers.ts` - Customer queries
- `use-stock-requests.ts` - Stock request workflow
- `use-targets.ts` - Rep targets
- `use-team.ts` - User/team queries
- `use-payments.ts` - Payment data
- `use-expenses.ts` - Expense queries
- `use-remittances.ts` - Manager & owner remittances
- `use-approvals.ts` - Approval requests
- `use-notifications.ts` - App notifications
- `use-audit-logs.ts` - Activity history
- `use-preferences.ts` - User preferences

### Services (Update existing)
- Replace `setDb()` calls with `supabase.from().insert/update/delete`
- Add error handling
- Return results instead of void
- Keep all validation logic

### Utilities
- `src/lib/supabase-helpers.ts` - Common query patterns
- `src/lib/type-adapters.ts` - Transform DB types to app types

---

## 🧪 Testing Strategy

For each entity migration:
1. **Create the hook** with queries
2. **Update one component** to use the hook
3. **Test the component** works
4. **Update the service** writers
5. **Test CRUD operations**
6. **Move to next entity**

Run `npm run dev` and test in browser after each entity.

---

## ⚠️ Challenges & Solutions

### Challenge 1: Synchronous to Async
**Problem:** Mock store is synchronous, Supabase is async  
**Solution:** Use React Query for data fetching, Suspense for loading states

### Challenge 2: Type Mismatches
**Problem:** Database column names use snake_case, app uses camelCase  
**Solution:** Create adapter functions to transform data

### Challenge 3: Nested Data
**Problem:** Mock store has nested objects, PostgreSQL uses foreign keys  
**Solution:** Use Supabase joins and `select` with relationships

### Challenge 4: Calculations
**Problem:** Mock store allows derived data in state  
**Solution:** Calculate on read from raw database values (already done in `lib/calculations.ts`)

### Challenge 5: Optimistic Updates
**Problem:** Mock store updates instantly, API has latency  
**Solution:** Use React Query's optimistic updates and invalidation

---

## 📝 Migration Order (Entity Priority)

### Phase E1: Core Entities (Start Here)
1. **Branches** - Foundation for multi-tenancy
2. **Products** - Required for sales and inventory
3. **Users (Team)** - Already have auth, add queries
4. **Preferences** - User settings

### Phase E2: Inventory & Sales
5. **Inventory Records** - Stock levels
6. **Inventory Movements** - Stock history
7. **Stock Batches** - Batch tracking
8. **Sales** - Sales transactions
9. **Stock Requests** - Rep stock workflow

### Phase E3: Financial
10. **Payments** - Rep payment chain
11. **Expenses** - Manager expenses
12. **Manager Remittances** - Manager reconciliation
13. **Customers** - Customer accounts
14. **Customer Payments** - Customer payment tracking
15. **Owner Remittances** - Owner payments

### Phase E4: Operations
16. **Targets** - Rep monthly targets
17. **Approvals** - Approval workflow
18. **Notifications** - App notifications
19. **Audit Logs (Activities)** - Audit trail
20. **Onboardings** - Staff onboarding

---

## 🚀 Phase E1 Action Plan

### Step 1: Setup React Query (if not already)
- Verify `@tanstack/react-query` is installed
- QueryClient already exists in `__root.tsx`

### Step 2: Create Supabase Helper Functions
- `src/lib/supabase-helpers.ts` - Common patterns
- Error handling wrapper
- Type transformers

### Step 3: Create First Hook - Branches
- `src/hooks/use-branches.ts`
- `useBranches()` - Get all branches (tenant-scoped)
- `useBranch(id)` - Get single branch
- `useCreateBranch()` - Mutation
- `useUpdateBranch()` - Mutation
- `useDeactivateBranch()` - Mutation

### Step 4: Update Branch Pages
- Replace `const db = useDb()` with `const { data: branches } = useBranches()`
- Handle loading states
- Test branch list and detail pages

### Step 5: Update Branch Service
- Replace `setDb()` in `branchService` with Supabase calls
- Keep all validation logic
- Test branch creation, updates

---

## 💡 Example: Branch Migration

### Before (Mock Store)
```typescript
// Component
const db = useDb();
const branches = db.branches;

// Service
async create(input) {
  const errors = validateBranch(getDb(), input);
  if (errors) return { ok: false, errors };
  
  setDb(d => ({
    ...d,
    branches: [...d.branches, newBranch]
  }));
  
  return { ok: true };
}
```

### After (Supabase)
```typescript
// Hook
export function useBranches() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['branches', user?.tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('tenant_id', user.tenantId);
      if (error) throw error;
      return data.map(transformBranch);
    }
  });
}

// Component
const { data: branches, isLoading } = useBranches();
if (isLoading) return <Spinner />;

// Service (keep validation!)
async create(input) {
  const errors = validateBranch(getDb(), input); // temp: still uses mock for validation
  if (errors) return { ok: false, errors };
  
  const { data, error } = await supabase
    .from('branches')
    .insert({
      tenant_id: user.tenantId,
      name: input.name,
      code: input.code,
      // ... map fields
    })
    .select()
    .single();
    
  if (error) return { ok: false, error: error.message };
  
  // Invalidate cache
  queryClient.invalidateQueries(['branches']);
  
  return { ok: true, data: transformBranch(data) };
}
```

---

## 📅 Estimated Timeline

- **E1.1: Branches** - 2-3 hours
- **E1.2: Products** - 2-3 hours
- **E1.3: Users/Team** - 2-3 hours
- **E1.4: Preferences** - 1-2 hours
- **E2: Inventory & Sales** - 4-6 hours
- **E3: Financial** - 4-6 hours
- **E4: Operations** - 4-6 hours
- **Seed Data Migration** - 2-3 hours
- **Testing & Cleanup** - 3-4 hours

**Total: 24-36 hours of focused work**

---

## ✅ Success Criteria

Phase E is complete when:
- [ ] All `useDb()` calls replaced with entity-specific hooks
- [ ] All `setDb()` calls replaced with Supabase mutations
- [ ] All pages load data from PostgreSQL
- [ ] All CRUD operations work end-to-end
- [ ] Business logic unchanged (validation, calculations)
- [ ] UI behavior unchanged (look and feel)
- [ ] Loading states and error handling added
- [ ] React Query caching working
- [ ] Seed data in production database
- [ ] Mock store files removed
- [ ] All tests passing

---

## 🎯 Let's Start with E1.1: Branches

This is the safest starting point because:
- Branches are foundational
- Small number of fields
- Clear CRUD operations
- No complex relationships yet

Ready to create the branches hook and migrate branch pages?
