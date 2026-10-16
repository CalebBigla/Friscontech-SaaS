# Phase E: Accelerated Migration Plan

## 🎯 Goal
Complete Phase E migration efficiently to reach Cloudinary, Testing, and Deployment.

## ✅ Current Status
- ✅ Foundation complete (helpers, type adapters, query keys)
- ✅ Branches fully migrated (proven pattern)
- ⏳ 18 entities remaining

## 🚀 Accelerated Strategy

### Approach: Batch Generation by Priority Tiers

Instead of migrating one entity at a time, we'll batch-generate hooks for related entities, then update their components systematically.

---

## 📋 Migration Tiers

### **Tier 1: Critical Foundation** (Do First)
These entities are referenced by almost everything else:

1. **Products** - Required by: Sales, Inventory, Stock Requests, Targets
2. **Users** - Required by: All entities (created_by, assigned_to, managers, etc.)
3. **Preferences** - Simple, user-specific settings

**Why first:** Everything else depends on these.

### **Tier 2: Core Operations** (Do Second)
The heart of the business:

4. **Inventory Records** - Stock levels
5. **Inventory Movements** - Stock history
6. **Stock Batches** - Batch tracking
7. **Sales** - Transaction records
8. **Customers** - Customer accounts

**Why second:** Main business workflows.

### **Tier 3: Workflows & Financial** (Do Third)
Supporting workflows:

9. **Stock Requests** - Rep stock workflow
10. **Payments** - Rep payment chain
11. **Customer Payments** - Customer payment tracking
12. **Expenses** - Manager expenses
13. **Manager Remittances** - Manager reconciliation
14. **Owner Remittances** - Owner payments

**Why third:** Build on core operations.

### **Tier 4: Management & System** (Do Last)
Supporting features:

15. **Targets** - Rep monthly targets
16. **Approval Requests** - Approval workflow
17. **Notifications** - App notifications
18. **Activities (Audit Logs)** - Audit trail
19. **Onboardings** - Staff onboarding

**Why last:** Nice-to-have, not critical path.

---

## 🛠️ Implementation Plan

### Phase 1: Batch Generate Hooks (1-2 hours)
Create React Query hooks for all 18 entities:
- `use-products.ts`
- `use-users.ts`
- `use-preferences.ts`
- `use-inventory.ts`
- `use-sales.ts`
- `use-customers.ts`
- `use-stock-requests.ts`
- `use-payments.ts`
- `use-customer-payments.ts`
- `use-expenses.ts`
- `use-remittances.ts`
- `use-targets.ts`
- `use-approvals.ts`
- `use-notifications.ts`
- `use-audit-logs.ts`
- `use-onboardings.ts`

### Phase 2: Update Type Adapters (30 min)
Add transformers for all entities in `type-adapters.ts`

### Phase 3: Update Components by Tier (3-4 hours)
Update components tier by tier:
- Tier 1: ~20 components
- Tier 2: ~25 components
- Tier 3: ~20 components
- Tier 4: ~15 components

### Phase 4: Remove Mock Store (30 min)
- Delete `src/services/mock-store.ts`
- Delete `src/data/mock-db.ts` (keep types)
- Update services to not reference mock store

---

## 📊 Estimated Timeline

| Task | Time | Status |
|------|------|--------|
| ✅ Foundation | Done | Complete |
| ✅ Branches | Done | Complete |
| Generate all hooks | 1-2h | Next |
| Update type adapters | 30m | Next |
| Tier 1 components | 1h | Pending |
| Tier 2 components | 1.5h | Pending |
| Tier 3 components | 1h | Pending |
| Tier 4 components | 45m | Pending |
| Remove mock store | 30m | Pending |
| **Total Phase E** | **6-8h** | 10% |

---

## 🎯 Success Criteria

Phase E is complete when:
- [ ] All 20 entities have React Query hooks
- [ ] All components updated to use hooks
- [ ] No references to `mock-store.ts`
- [ ] All CRUD operations work with Supabase
- [ ] Loading/error states on all pages
- [ ] Business logic preserved
- [ ] RLS policies enforced

---

## 🚀 After Phase E

Once Phase E is complete, we proceed to:

### **Phase F: Cloudinary Integration** (2-3h)
- Image upload for products
- Profile photos
- Receipt/document uploads
- Guarantor ID uploads

### **Phase G: Testing** (2-3h)
- End-to-end workflow testing
- Create test scenarios
- Verify RLS policies
- Check audit logging

### **Phase H: Deployment** (1-2h)
- Production build
- Environment variables
- Deploy to hosting
- Final smoke tests

---

## 💡 Decision Point

**Option A: Batch Generate All Hooks Now** (Recommended)
- Create all 18 entity hooks in one session
- Then update components systematically
- Faster overall
- Can test complete tiers

**Option B: Continue One-by-One**
- Do products next
- Then users
- Then inventory
- Slower but safer

**Which approach do you prefer?**

For a clean production deployment, I recommend **Option A** - batch generate all hooks, then update components tier by tier. This gets us to Cloudinary and deployment faster.

Ready to proceed with batch generation? 🚀
