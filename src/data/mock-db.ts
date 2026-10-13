import { seedAuditLogs } from "./auditLogs";
import { seedOwnerRemittances, type OwnerRemittance } from "./remittances";
/**
 * Centralized, relational mock datasets for SalesFlow Pro.
 * Records mirror future PostgreSQL tables: every relationship is expressed through IDs.
 * Derived values (revenue, staff counts, performance) are NEVER stored here —
 * they are computed in src/lib/calculations.ts.
 */

export type Role = "owner" | "manager" | "storekeeper" | "sales_rep";
export type BranchStatus = "active" | "inactive";
export type SaleStatus = "completed" | "pending" | "voided";

/** Tenant doubles as the organization settings record (PRD tenant + editable business profile). */
export type Tenant = {
  id: string;
  name: string;
  currency: "NGN";
  referenceDate: string;
  lastSyncTime: string;
  legalName: string;
  businessEmail: string;
  phone: string;
  timezone: string;
  plan: string;
  createdAt: string;
  updatedAt: string;
};
export type DateFormatPref = "MMM D, YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
export type ReportPeriodPref = "today" | "week" | "month" | "quarter";
/** Per-user display preferences (no secrets). */
export type UserPreference = {
  userId: string;
  dateFormat: DateFormatPref;
  defaultReportPeriod: ReportPeriodPref;
  updatedAt: string;
};
export type Branch = {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  location: string;
  address: string;
  phone: string;
  email: string;
  managerId: string | null;
  status: BranchStatus;
  createdAt: string;
};
export type UserStatus = "active" | "inactive" | "pending";
/** managerId = the manager this member reports to (null for owner/managers). */
export type User = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: Role;
  branchId: string | null;
  managerId: string | null;
  status: UserStatus;
  createdAt: string;
};
export type ProductStatus = "active" | "inactive";
/** unitPrice is the selling price (PRD: selling_price). Branch stock lives in InventoryRecord, never here. */
export type Product = {
  id: string;
  tenantId: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  unitPrice: number;
  unitCost: number;
  lowStockThreshold: number;
  description?: string;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
};
export type Sale = {
  id: string;
  tenantId: string;
  code: string;
  branchId: string;
  salesRepId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  saleDate: string;
  createdAt: string;
  status: SaleStatus;
};
export type PaymentStatus = "submitted" | "acknowledged" | "declined" | "reconciled";
/** Cash and transfer are submitted values; total sales and outstanding are always derived. */
export type Payment = {
  id: string;
  tenantId: string;
  branchId: string;
  salesRepId: string;
  managerId: string;
  period: string;
  cashAmount: number;
  transferAmount: number;
  transferReference?: string;
  status: PaymentStatus;
  submittedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  declinedAt?: string;
  declinedBy?: string;
  declineReason?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};
export type ExpenseCategory =
  "transport" | "logistics" | "office" | "communication" | "maintenance" | "other";
export type ExpenseStatus = "recorded" | "voided";
export type Expense = {
  id: string;
  tenantId: string;
  branchId: string | null;
  managerId?: string;
  ownerId?: string;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  description: string;
  note?: string;
  status: ExpenseStatus;
  createdAt: string;
  updatedAt: string;
};
export type RemittanceStatus = "draft" | "submitted" | "confirmed" | "declined";
/** Amounts are computed by the service at submission and retained as the remittance snapshot. */
export type ManagerRemittance = {
  id: string;
  tenantId: string;
  branchId: string;
  managerId: string;
  period: string;
  totalReceived: number;
  expenseAmount: number;
  netRemittanceDue: number;
  cashAmount: number;
  transferAmount: number;
  outstandingAmount: number;
  transferReference?: string;
  status: RemittanceStatus;
  submittedAt?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  declinedAt?: string;
  declinedBy?: string;
  declineReason?: string;
  note?: string;
  paymentIds: string[];
  expenseIds: string[];
  createdAt: string;
  updatedAt: string;
};
/** Available stock is never stored: quantityOnHand − quantityReserved (see inventory-calculations). */
export type InventoryRecord = {
  id: string;
  tenantId: string;
  branchId: string;
  productId: string;
  quantityOnHand: number;
  quantityReserved: number;
  lowStockThreshold: number;
  reorderLevel: number;
  lastUpdated: string;
};
export type MovementType = "stock_added" | "stock_issued" | "sale" | "adjustment";
/** quantity is a signed delta applied to quantityOnHand. */
export type InventoryMovement = {
  id: string;
  tenantId: string;
  branchId: string;
  productId: string;
  type: MovementType;
  quantity: number;
  referenceType?: "stock_request" | "sale" | "manual";
  referenceId?: string;
  performedBy: string;
  createdAt: string;
  note?: string;
};
/** month is "YYYY-MM" (PRD month + year). Achievement is never stored — it is computed from sales. */
export type Target = {
  id: string;
  tenantId: string;
  scope: "branch" | "rep";
  branchId: string;
  userId: string | null;
  month: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
};
export type StockRequestStatus =
  "pending" | "approved" | "partially_fulfilled" | "fulfilled" | "rejected";
/** PRD core: id, tenant_id, rep_id, product_id, qty, status, fulfilled_by — extended for the branch-aware workflow. */
export type StockRequest = {
  id: string;
  tenantId: string;
  branchId: string;
  repId: string;
  productId: string;
  quantityRequested: number;
  quantityApproved?: number;
  quantityFulfilled?: number;
  status: StockRequestStatus;
  priority: "Normal" | "High";
  requestedAt: string;
  approvedAt?: string;
  fulfilledAt?: string;
  rejectedAt?: string;
  approvedBy?: string;
  fulfilledBy?: string;
  processedBy?: string;
  note?: string;
  rejectionReason?: string;
  /** set when several products were requested in one submission */
  batchId?: string;
  /** rep confirms receipt after fulfillment */
  acknowledgedAt?: string;
  acknowledgedBy?: string;
};
export type ApprovalType = "stock_addition" | "product_deactivation" | "team_member";
export type ApprovalStatus = "pending" | "approved" | "rejected";
/**
 * Permission request raised by one role for another to review (Storekeeper → Manager, Manager → Owner).
 * Emergency stock additions are applied immediately and stay "pending" until reviewed afterwards.
 */
export type ApprovalRequest = {
  id: string;
  tenantId: string;
  type: ApprovalType;
  status: ApprovalStatus;
  branchId: string | null;
  requestedBy: string;
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  note?: string;
  emergency?: boolean;
  emergencyReason?: string;
  appliedAt?: string;
  productId?: string;
  quantity?: number;
  member?: { name: string; email: string; role: Role; branchId: string | null };
};
export type AuditEntity =
  | "product"
  | "sale"
  | "payment"
  | "expense"
  | "remittance"
  | "stock_request"
  | "target"
  | "team_member"
  | "branch"
  | "inventory"
  | "settings"
  | "session";
/** Audit log entry (see src/data/auditLogs.ts): actorId = user_id, createdAt = timestamp, subject = description. */
export type Activity = {
  id: string;
  tenantId: string;
  action: string;
  subject: string;
  actorId: string;
  createdAt: string;
  entity: AuditEntity;
  entityId?: string;
  emergency?: boolean;
  metadata?: {
    branchId?: string;
    productId?: string;
    targetId?: string;
    requestId?: string;
    salesRepId?: string;
    managerId?: string;
    period?: string;
    amount?: number;
    cashAmount?: number;
    transferAmount?: number;
    paymentMethod?: "cash" | "transfer" | "cash_and_transfer" | "none";
    transferReference?: string;
    outstandingAmount?: number;
    declineReason?: string;
    expenseId?: string;
    remittanceId?: string;
    payeeName?: string;
    purpose?: string;
    reference?: string;
    category?: ExpenseCategory;
    totalReceived?: number;
    expenseAmount?: number;
    netRemittanceDue?: number;
    reason?: string;
  };
};
export type Escalation = {
  id: string;
  tenantId: string;
  branchId: string;
  type: string;
  detail: string;
  createdAt: string;
  tone: "danger" | "warning" | "neutral";
  status: "open" | "resolved";
};

export type Db = {
  tenant: Tenant;
  branches: Branch[];
  users: User[];
  products: Product[];
  sales: Sale[];
  inventory: InventoryRecord[];
  inventoryMovements: InventoryMovement[];
  targets: Target[];
  stockRequests: StockRequest[];
  payments: Payment[];
  activities: Activity[];
  escalations: Escalation[];
  preferences: UserPreference[];
  approvals: ApprovalRequest[];
  expenses: Expense[];
  remittances: ManagerRemittance[];
  ownerRemittances: OwnerRemittance[];
};

const T = "tenant-001";
const REF = "2026-09-28";

const tenant: Tenant = {
  id: T,
  name: "Westfield Retail",
  currency: "NGN",
  referenceDate: REF,
  lastSyncTime: "09:14",
  legalName: "Westfield Retail Limited",
  businessEmail: "admin@westfieldretail.ng",
  phone: "+234 802 555 0100",
  timezone: "Africa/Lagos",
  plan: "Growth",
  createdAt: "2025-01-15",
  updatedAt: "2026-08-02T10:00:00",
};

const b = (
  id: string,
  name: string,
  code: string,
  location: string,
  address: string,
  managerId: string | null,
  status: BranchStatus = "active",
): Branch => ({
  id,
  tenantId: T,
  name,
  code,
  location,
  address,
  managerId,
  status,
  createdAt: "2025-01-10",
  phone: `+234 80${id.slice(-1)} 555 01${id.slice(-2)}`,
  email: `${code.split("-")[0]!.toLowerCase()}@westfield.ng`,
});

const branches: Branch[] = [
  b(
    "branch-001",
    "Ikeja Branch",
    "IKJ-001",
    "Ikeja, Lagos",
    "14 Obafemi Awolowo Way, Ikeja",
    "user-002",
  ),
  b(
    "branch-002",
    "Victoria Island Branch",
    "VI-002",
    "Victoria Island, Lagos",
    "7 Adeola Odeku Street, VI",
    "user-003",
  ),
  b(
    "branch-003",
    "Lekki Branch",
    "LKK-003",
    "Lekki Phase 1, Lagos",
    "22 Admiralty Way, Lekki",
    "user-004",
  ),
  b("branch-004", "Ajah Branch", "AJH-004", "Ajah, Lagos", "3 Addo Road, Ajah", "user-005"),
  b(
    "branch-005",
    "Lagos Island Branch",
    "LIS-005",
    "Lagos Island, Lagos",
    "41 Broad Street, Lagos Island",
    "user-006",
  ),
  b(
    "branch-006",
    "Yaba Hub",
    "YAB-006",
    "Yaba, Lagos",
    "9 Herbert Macaulay Way, Yaba",
    "user-007",
    "inactive",
  ),
];

const u = (id: string, name: string, role: Role, branchId: string | null): User => ({
  id,
  tenantId: T,
  name,
  role,
  branchId,
  status: "active",
  managerId: null,
  createdAt: `202${Number(id.slice(-2)) % 3 === 0 ? 4 : 5}-${String(1 + (Number(id.slice(-2)) % 12)).padStart(2, "0")}-${String(3 + (Number(id.slice(-2)) % 24)).padStart(2, "0")}T09:00:00`,
  email: `${name.split(" ")[0]!.toLowerCase()}.${name.split(" ")[1]!.toLowerCase()}@westfield.ng`,
});

const users: User[] = [
  u("user-001", "Marcus Delaney", "owner", null),
  u("user-002", "Amara Okonkwo", "manager", "branch-001"),
  u("user-003", "Folake Adebayo", "manager", "branch-002"),
  u("user-004", "Leo Rahman", "manager", "branch-003"),
  u("user-005", "Nneka Obi", "manager", "branch-004"),
  u("user-006", "Ibrahim Musa", "manager", "branch-005"),
  u("user-007", "Seun Ajayi", "manager", "branch-006"),
  u("user-008", "Kemi Balogun", "manager", null),
  u("user-009", "Uche Nwosu", "manager", null),
  u("user-010", "Tobi Adeyemi", "sales_rep", "branch-001"),
  u("user-011", "Chioma Eze", "sales_rep", "branch-001"),
  u("user-012", "David Okafor", "sales_rep", "branch-001"),
  u("user-013", "Zainab Bello", "sales_rep", "branch-002"),
  u("user-014", "Emeka Johnson", "sales_rep", "branch-002"),
  u("user-015", "Halima Yusuf", "sales_rep", "branch-003"),
  u("user-016", "Chidi Eze", "sales_rep", "branch-003"),
  u("user-017", "Bola Martins", "sales_rep", "branch-004"),
  u("user-018", "Grace Etim", "sales_rep", "branch-004"),
  u("user-019", "Samuel Ogun", "sales_rep", "branch-005"),
  u("user-020", "Ada Nnamdi", "sales_rep", "branch-005"),
  u("user-021", "Kunle Peters", "sales_rep", "branch-006"),
  u("user-022", "Ruth Akpan", "storekeeper", "branch-001"),
  u("user-023", "Yemi Cole", "storekeeper", "branch-002"),
  u("user-024", "Musa Danladi", "storekeeper", "branch-003"),
  u("user-025", "Joy Uzor", "storekeeper", "branch-005"),
  {
    ...u("user-026", "Tunde Bakare", "sales_rep", "branch-001"),
    status: "pending",
    createdAt: "2026-09-24T10:30:00",
  },
  {
    ...u("user-027", "Efe Omoregie", "sales_rep", "branch-002"),
    status: "inactive",
    createdAt: "2025-02-14T09:00:00",
  },
];
// Staff report to the manager of their branch.
for (const x of users)
  if ((x.role === "sales_rep" || x.role === "storekeeper") && x.branchId)
    x.managerId = users.find((m) => m.role === "manager" && m.branchId === x.branchId)?.id ?? null;

const p = (
  id: string,
  name: string,
  sku: string,
  category: string,
  unitPrice: number,
  unitCost: number,
  unit = "Piece",
): Product => ({
  id,
  tenantId: T,
  name,
  sku,
  category,
  unit,
  unitPrice,
  unitCost,
  lowStockThreshold: unitPrice > 800_000 ? 5 : 15,
  status: "active",
  createdAt: `2025-0${1 + (Number(id.slice(-3)) % 9)}-1${Number(id.slice(-1)) % 9}`,
  updatedAt: "2026-08-02",
});
const products: Product[] = [
  p("product-001", "iPhone 15 Pro", "APL-IP15P", "Phones", 1_250_000, 1_040_000),
  p("product-002", "Galaxy S24", "SMS-S24", "Phones", 980_000, 812_000),
  p("product-003", "AirPods Pro", "APL-APP2", "Audio", 120_000, 88_000),
  p("product-004", "AirPods Max", "APL-APM", "Audio", 450_000, 356_000),
  p("product-005", "Smart Watch S9", "APL-SW9", "Wearables", 320_000, 247_000),
  p("product-006", "MacBook Air M3", "APL-MBA3", "Computers", 1_650_000, 1_395_000),
  p("product-007", "USB-C Charger 30W", "ACC-C30", "Accessories", 25_000, 14_500),
  p("product-008", "JBL Flip 6", "JBL-F6", "Audio", 95_000, 71_000),
  p("product-009", "Samsung Galaxy A15", "SMS-A15", "Phones", 185_000, 148_000),
  p("product-010", "Tecno Spark 30", "TCN-SP30", "Phones", 165_000, 129_000),
  p("product-011", "Oraimo Power Bank 20,000mAh", "ORM-PB20", "Accessories", 28_000, 19_500),
  p("product-012", "HP EliteBook 840 G8", "HP-EB840", "Computers", 890_000, 724_000),
  {
    ...p("product-013", "Dell Latitude 5420", "DEL-LT5420", "Computers", 760_000, 615_000),
    status: "inactive",
    description: "Discontinued by supplier — kept for sales history.",
    updatedAt: "2026-09-04",
  },
  {
    ...p(
      "product-014",
      "Oraimo FreePods 4 (5-pack)",
      "ORM-FP4-5",
      "Audio",
      140_000,
      102_000,
      "Pack",
    ),
    description: "Retail pack of five wireless earbuds.",
  },
];

// ---------- deterministic seed helpers (pure arithmetic, safe at module scope) ----------
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Product mix weights: cheap items sell far more often.
const productWeights = [0.07, 0.07, 0.24, 0.08, 0.12, 0.03, 0.26, 0.13];
const branchDemand: Record<string, number> = {
  "branch-001": 1.25,
  "branch-002": 1.1,
  "branch-003": 0.95,
  "branch-004": 0.8,
  "branch-005": 1.0,
  "branch-006": 0.7,
};

function seedSales(): Sale[] {
  const rand = rng(42);
  const out: Sale[] = [];
  let n = 1;
  const reps = users.filter((x) => x.role === "sales_rep" && x.status === "active");
  for (let day = 119; day >= 0; day--) {
    const date = addDays(REF, -day);
    for (const branch of branches) {
      if (branch.id === "branch-006" && date > "2026-08-15") continue; // deactivated mid-August
      const branchReps = reps.filter((r) => r.branchId === branch.id);
      const count = Math.round((1 + rand() * 3) * (branchDemand[branch.id] ?? 1));
      for (let i = 0; i < count; i++) {
        let pick = rand(),
          idx = 0;
        while (idx < productWeights.length - 1 && pick > productWeights[idx]!) {
          pick -= productWeights[idx]!;
          idx++;
        }
        const product = products[idx]!;
        const rep = branchReps[Math.floor(rand() * branchReps.length)]!;
        const hour = 9 + Math.floor(rand() * 10),
          minute = Math.floor(rand() * 60);
        const statusRoll = rand();
        out.push({
          id: `sale-${String(n).padStart(5, "0")}`,
          tenantId: T,
          code: `SAL-${10000 + n}`,
          branchId: branch.id,
          salesRepId: rep.id,
          productId: product.id,
          quantity: product.unitPrice > 900_000 ? 1 : 1 + Math.floor(rand() * 4),
          unitPrice: product.unitPrice,
          saleDate: date,
          createdAt: `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
          status:
            day <= 1 && statusRoll < 0.15 ? "pending" : statusRoll > 0.975 ? "voided" : "completed",
        });
        n++;
      }
    }
  }
  return out;
}

function seedPayments(sales: Sale[]): Payment[] {
  const cases: {
    repId: string;
    status: PaymentStatus;
    submittedDay: string;
    cashShare: number;
    transferShare: number;
    declineReason?: string;
  }[] = [
    {
      repId: "user-011",
      status: "acknowledged",
      submittedDay: "21",
      cashShare: 0.35,
      transferShare: 0.45,
    },
    {
      repId: "user-012",
      status: "submitted",
      submittedDay: "24",
      cashShare: 0.4,
      transferShare: 0.3,
    },
    {
      repId: "user-013",
      status: "declined",
      submittedDay: "19",
      cashShare: 0.3,
      transferShare: 0.5,
      declineReason: "Please verify the transfer reference against the bank receipt.",
    },
    {
      repId: "user-015",
      status: "reconciled",
      submittedDay: "16",
      cashShare: 0.25,
      transferShare: 0.65,
    },
  ];
  return cases.flatMap((row, index) => {
    const rep = users.find((user) => user.id === row.repId);
    const branch = branches.find((item) => item.id === rep?.branchId);
    if (!rep?.branchId || !branch?.managerId) return [];
    const total = sales
      .filter(
        (sale) =>
          sale.tenantId === T &&
          sale.salesRepId === rep.id &&
          sale.status === "completed" &&
          sale.saleDate.startsWith("2026-09"),
      )
      .reduce((sum, sale) => sum + sale.quantity * sale.unitPrice, 0);
    const submittedAt = `2026-09-${row.submittedDay}T15:00:00`;
    const reviewedAt = `2026-09-${String(Number(row.submittedDay) + 1).padStart(2, "0")}T10:00:00`;
    return [
      {
        id: `PAY-${String(3001 + index)}`,
        tenantId: T,
        branchId: rep.branchId,
        salesRepId: rep.id,
        managerId: branch.managerId,
        period: "2026-09",
        cashAmount: Math.round(total * row.cashShare),
        transferAmount: Math.round(total * row.transferShare),
        transferReference: `TRF-SEP-${3001 + index}`,
        status: row.status,
        submittedAt,
        ...(row.status === "acknowledged" || row.status === "reconciled"
          ? { acknowledgedAt: reviewedAt, acknowledgedBy: branch.managerId }
          : {}),
        ...(row.status === "reconciled"
          ? { confirmedAt: "2026-09-18T11:00:00", confirmedBy: "user-001" }
          : {}),
        ...(row.status === "declined"
          ? {
              declinedAt: reviewedAt,
              declinedBy: branch.managerId,
              declineReason: row.declineReason,
            }
          : {}),
        createdAt: submittedAt,
        updatedAt: row.status === "reconciled" ? "2026-09-18T11:00:00" : reviewedAt,
      },
    ];
  });
}

function seedPaymentAuditLogs(payments: Payment[]): Activity[] {
  const events: {
    payment: Payment;
    actorId: string;
    action: string;
    createdAt: string;
    detail: string;
  }[] = [];
  for (const payment of payments) {
    events.push({
      payment,
      actorId: payment.salesRepId,
      action: "Payment submitted",
      createdAt: payment.submittedAt,
      detail: `${payment.period} payment submitted`,
    });
    if (payment.acknowledgedAt && payment.acknowledgedBy)
      events.push({
        payment,
        actorId: payment.acknowledgedBy,
        action: "Payment acknowledged",
        createdAt: payment.acknowledgedAt,
        detail: `${payment.period} payment acknowledged`,
      });
    if (payment.declinedAt && payment.declinedBy)
      events.push({
        payment,
        actorId: payment.declinedBy,
        action: "Payment declined",
        createdAt: payment.declinedAt,
        detail: payment.declineReason ?? "Payment declined",
      });
    if (payment.confirmedAt && payment.confirmedBy)
      events.push({
        payment,
        actorId: payment.confirmedBy,
        action: "Payment confirmed",
        createdAt: payment.confirmedAt,
        detail: `${payment.period} payment confirmed and reconciled`,
      });
  }
  return events.map((event, index) => ({
    id: `pay-aud-${index + 1}`,
    tenantId: T,
    action: event.action,
    subject: `${event.payment.id} · ${event.detail}`,
    actorId: event.actorId,
    createdAt: event.createdAt,
    entity: "payment",
    entityId: event.payment.id,
    metadata: {
      branchId: event.payment.branchId,
      salesRepId: event.payment.salesRepId,
      managerId: event.payment.managerId,
      period: event.payment.period,
      cashAmount: event.payment.cashAmount,
      transferAmount: event.payment.transferAmount,
    },
  }));
}

function seedExpenses(): Expense[] {
  const rows: Omit<Expense, "tenantId" | "managerId" | "createdAt" | "updatedAt">[] = [
    {
      id: "EXP-4101",
      branchId: "branch-001",
      category: "transport",
      amount: 18_500,
      expenseDate: "2026-09-08",
      description: "Local delivery and branch errands",
      status: "recorded",
    },
    {
      id: "EXP-4102",
      branchId: "branch-001",
      category: "communication",
      amount: 12_000,
      expenseDate: "2026-09-15",
      description: "Field team data bundles",
      note: "September team lines",
      status: "recorded",
    },
    {
      id: "EXP-4103",
      branchId: "branch-001",
      category: "maintenance",
      amount: 9_500,
      expenseDate: "2026-09-18",
      description: "Receipt printer service",
      status: "voided",
    },
    {
      id: "EXP-4104",
      branchId: "branch-002",
      category: "logistics",
      amount: 24_000,
      expenseDate: "2026-09-12",
      description: "Inter-branch stock transfer",
      status: "recorded",
    },
    {
      id: "EXP-4105",
      branchId: "branch-003",
      category: "office",
      amount: 15_000,
      expenseDate: "2026-09-20",
      description: "Branch stationery restock",
      status: "recorded",
    },
    {
      id: "EXP-4106",
      branchId: "branch-005",
      category: "other",
      amount: 7_500,
      expenseDate: "2026-08-27",
      description: "Water for the sales floor",
      status: "recorded",
    },
  ];
  return rows.flatMap((row) => {
    const branch = branches.find((item) => item.id === row.branchId && item.tenantId === T);
    if (!branch?.managerId) return [];
    const createdAt = `${row.expenseDate}T14:00:00`;
    return [{ ...row, tenantId: T, managerId: branch.managerId, createdAt, updatedAt: createdAt }];
  });
}

function seedExpenseAuditLogs(expenses: Expense[]): Activity[] {
  const events = expenses.flatMap((expense) => [
    { expense, action: "EXPENSE_CREATED", createdAt: expense.createdAt },
    ...(expense.status === "voided"
      ? [{ expense, action: "EXPENSE_VOIDED", createdAt: expense.updatedAt }]
      : []),
  ]);
  return events.map(({ expense, action, createdAt }, index) => ({
    id: `expense-aud-${index + 1}`,
    tenantId: T,
    action,
    subject: `${expense.id} · ${expense.description}`,
    actorId: expense.ownerId ?? expense.managerId ?? "user-001",
    createdAt,
    entity: "expense",
    entityId: expense.id,
    metadata: {
      ...(expense.branchId ? { branchId: expense.branchId } : {}),
      ...(expense.managerId ? { managerId: expense.managerId } : {}),
      expenseId: expense.id,
      amount: expense.amount,
      category: expense.category,
    },
  }));
}

const branchTargetBase: Record<string, number> = {
  "branch-001": 48_000_000,
  "branch-002": 44_000_000,
  "branch-003": 45_000_000,
  "branch-004": 32_000_000,
  "branch-005": 40_000_000,
  "branch-006": 26_000_000,
};

function seedTargets(): Target[] {
  const out: Target[] = [];
  const months = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
  for (const month of months) {
    for (const branch of branches) {
      const amount = branchTargetBase[branch.id] ?? 0;
      out.push({
        id: `target-${branch.id}-${month}`,
        tenantId: T,
        scope: "branch",
        branchId: branch.id,
        userId: null,
        month,
        amount,
        createdAt: `${month}-01T08:00:00`,
        updatedAt: `${month}-01T08:00:00`,
      });
      const reps = users.filter(
        (x) => x.role === "sales_rep" && x.status === "active" && x.branchId === branch.id,
      );
      for (const rep of reps) {
        out.push({
          id: `target-${rep.id}-${month}`,
          tenantId: T,
          scope: "rep",
          branchId: branch.id,
          userId: rep.id,
          month,
          amount: Math.round(amount / reps.length / 100_000) * 100_000,
          createdAt: `${month}-01T08:00:00`,
          updatedAt: `${month}-01T08:00:00`,
        });
      }
    }
  }
  return out;
}

function seedInventory(): InventoryRecord[] {
  const rand = rng(7);
  const out: InventoryRecord[] = [];
  for (const branch of branches) {
    for (const product of products) {
      const roll = rand();
      const threshold = product.lowStockThreshold;
      const onHand =
        roll < 0.08
          ? 0
          : roll < 0.2
            ? Math.floor(threshold * rand())
            : threshold + 4 + Math.floor(rand() * 80);
      const reserved = onHand > threshold && rand() < 0.3 ? 1 + Math.floor(rand() * 3) : 0;
      const hour = 8 + Math.floor(rand() * 10),
        minute = Math.floor(rand() * 60);
      out.push({
        id: `inv-${branch.id.slice(-3)}-${product.id.slice(-3)}`,
        tenantId: T,
        branchId: branch.id,
        productId: product.id,
        quantityOnHand: onHand,
        quantityReserved: reserved,
        lowStockThreshold: threshold,
        reorderLevel: threshold * 2,
        lastUpdated: `${addDays(REF, -1 - Math.floor(rand() * 6))}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
      });
    }
  }
  return out;
}

const sr = (x: Omit<StockRequest, "tenantId">): StockRequest => ({ tenantId: T, ...x });
const stockRequests: StockRequest[] = [
  sr({
    id: "SR-1093",
    branchId: "branch-005",
    repId: "user-019",
    productId: "product-011",
    quantityRequested: 30,
    status: "pending",
    priority: "Normal",
    requestedAt: "2026-09-28T09:02:00",
    note: "Weekend promo stand",
  }),
  sr({
    id: "SR-1092",
    branchId: "branch-001",
    repId: "user-010",
    productId: "product-005",
    quantityRequested: 42,
    status: "pending",
    priority: "Normal",
    requestedAt: "2026-09-28T08:56:00",
    note: "Corporate order for Access Bank staff",
  }),
  sr({
    id: "SR-1091",
    branchId: "branch-003",
    repId: "user-016",
    productId: "product-004",
    quantityRequested: 15,
    status: "pending",
    priority: "High",
    requestedAt: "2026-09-28T08:32:00",
  }),
  sr({
    id: "SR-1088",
    branchId: "branch-002",
    repId: "user-014",
    productId: "product-001",
    quantityRequested: 12,
    status: "pending",
    priority: "Normal",
    requestedAt: "2026-09-28T08:10:00",
  }),
  sr({
    id: "SR-1090",
    branchId: "branch-001",
    repId: "user-010",
    productId: "product-003",
    quantityRequested: 20,
    quantityApproved: 20,
    status: "approved",
    priority: "Normal",
    requestedAt: "2026-09-27T14:05:00",
    approvedAt: "2026-09-27T15:20:00",
    approvedBy: "user-022",
    processedBy: "user-022",
  }),
  sr({
    id: "SR-1089",
    branchId: "branch-002",
    repId: "user-013",
    productId: "product-007",
    quantityRequested: 60,
    quantityApproved: 60,
    status: "approved",
    priority: "High",
    requestedAt: "2026-09-27T10:40:00",
    approvedAt: "2026-09-27T11:02:00",
    approvedBy: "user-023",
    processedBy: "user-023",
    note: "Bulk order — Lekki Tech Hub",
  }),
  sr({
    id: "SR-1087",
    branchId: "branch-003",
    repId: "user-015",
    productId: "product-009",
    quantityRequested: 25,
    quantityApproved: 25,
    quantityFulfilled: 10,
    status: "partially_fulfilled",
    priority: "Normal",
    requestedAt: "2026-09-26T09:15:00",
    approvedAt: "2026-09-26T10:00:00",
    approvedBy: "user-024",
    fulfilledAt: "2026-09-26T16:30:00",
    fulfilledBy: "user-024",
    processedBy: "user-024",
  }),
  sr({
    id: "SR-1086",
    branchId: "branch-001",
    repId: "user-011",
    productId: "product-008",
    quantityRequested: 12,
    quantityApproved: 12,
    quantityFulfilled: 12,
    status: "fulfilled",
    priority: "Normal",
    requestedAt: "2026-09-26T08:45:00",
    approvedAt: "2026-09-26T09:10:00",
    approvedBy: "user-022",
    fulfilledAt: "2026-09-26T11:25:00",
    fulfilledBy: "user-022",
    processedBy: "user-022",
    acknowledgedAt: "2026-09-26T12:02:00",
    acknowledgedBy: "user-011",
  }),
  sr({
    id: "SR-1085",
    branchId: "branch-004",
    repId: "user-017",
    productId: "product-006",
    quantityRequested: 5,
    status: "rejected",
    priority: "Normal",
    requestedAt: "2026-09-25T13:20:00",
    rejectedAt: "2026-09-25T15:05:00",
    processedBy: "user-005",
    rejectionReason: "Request not authorized — laptops need manager sign-off",
  }),
  sr({
    id: "SR-1084",
    branchId: "branch-005",
    repId: "user-020",
    productId: "product-010",
    quantityRequested: 15,
    quantityApproved: 15,
    quantityFulfilled: 15,
    status: "fulfilled",
    priority: "Normal",
    requestedAt: "2026-09-24T09:30:00",
    approvedAt: "2026-09-24T10:12:00",
    approvedBy: "user-025",
    fulfilledAt: "2026-09-24T12:40:00",
    fulfilledBy: "user-025",
    processedBy: "user-025",
    acknowledgedAt: "2026-09-24T13:15:00",
    acknowledgedBy: "user-020",
  }),
  sr({
    id: "SR-1083",
    branchId: "branch-002",
    repId: "user-014",
    productId: "product-003",
    quantityRequested: 10,
    quantityApproved: 10,
    quantityFulfilled: 10,
    status: "fulfilled",
    priority: "Normal",
    requestedAt: "2026-09-23T11:00:00",
    approvedAt: "2026-09-23T11:30:00",
    approvedBy: "user-023",
    fulfilledAt: "2026-09-23T14:10:00",
    fulfilledBy: "user-023",
    processedBy: "user-023",
    acknowledgedAt: "2026-09-23T15:00:00",
    acknowledgedBy: "user-014",
  }),
  sr({
    id: "SR-1081",
    branchId: "branch-001",
    repId: "user-010",
    productId: "product-011",
    quantityRequested: 18,
    quantityApproved: 18,
    quantityFulfilled: 18,
    status: "fulfilled",
    priority: "Normal",
    requestedAt: "2026-09-25T09:10:00",
    approvedAt: "2026-09-25T09:40:00",
    approvedBy: "user-022",
    fulfilledAt: "2026-09-25T11:05:00",
    fulfilledBy: "user-022",
    processedBy: "user-022",
  }),
  sr({
    id: "SR-1082",
    branchId: "branch-001",
    repId: "user-012",
    productId: "product-001",
    quantityRequested: 8,
    status: "rejected",
    priority: "High",
    requestedAt: "2026-09-22T10:20:00",
    rejectedAt: "2026-09-22T12:00:00",
    processedBy: "user-022",
    rejectionReason: "Product unavailable",
  }),
];

const storekeeperOf = (branchId: string) =>
  users.find((x) => x.role === "storekeeper" && x.branchId === branchId)?.id ??
  branches.find((x) => x.id === branchId)?.managerId ??
  "user-001";

/** Movement history explaining recent inventory changes (sales, request issues, deliveries). */
function seedMovements(sales: Sale[], inventory: InventoryRecord[]): InventoryMovement[] {
  const out: Omit<InventoryMovement, "id">[] = [];
  for (const s of sales) {
    if (s.status !== "completed" || s.saleDate < addDays(REF, -2)) continue;
    out.push({
      tenantId: T,
      branchId: s.branchId,
      productId: s.productId,
      type: "sale",
      quantity: -s.quantity,
      referenceType: "sale",
      referenceId: s.id,
      performedBy: s.salesRepId,
      createdAt: s.createdAt,
    });
  }
  for (const r of stockRequests) {
    if (!r.quantityFulfilled || !r.fulfilledAt) continue;
    out.push({
      tenantId: T,
      branchId: r.branchId,
      productId: r.productId,
      type: "stock_issued",
      quantity: -r.quantityFulfilled,
      referenceType: "stock_request",
      referenceId: r.id,
      performedBy: r.fulfilledBy ?? storekeeperOf(r.branchId),
      createdAt: r.fulfilledAt,
    });
  }
  inventory.forEach((i, idx) => {
    if (idx % 3 !== 0 || i.quantityOnHand === 0) return;
    out.push({
      tenantId: T,
      branchId: i.branchId,
      productId: i.productId,
      type: "stock_added",
      quantity: 12 * (1 + (idx % 4)),
      referenceType: "manual",
      performedBy: storekeeperOf(i.branchId),
      createdAt: i.lastUpdated,
      note: "Supplier delivery received",
    });
  });
  return out
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((m, n) => ({ ...m, id: `mov-${String(n + 1).padStart(5, "0")}` }));
}

export function createSeedDb(): Db {
  const sales = seedSales();
  const inventory = seedInventory();
  const movements = seedMovements(sales, inventory);
  const targets = seedTargets();
  const payments = seedPayments(sales);
  const expenses = seedExpenses();
  return {
    tenant,
    branches: branches.map((x) => ({ ...x })),
    users: users.map((x) => ({ ...x })),
    products,
    sales,
    inventory,
    inventoryMovements: movements,
    targets,
    payments,
    expenses,
    remittances: [],
    ownerRemittances: seedOwnerRemittances.map((item) => ({ ...item })),
    stockRequests: stockRequests.map((x) => ({ ...x })),
    activities: [
      ...seedPaymentAuditLogs(payments),
      ...seedExpenseAuditLogs(expenses),
      ...seedAuditLogs(
        {
          tenantId: T,
          branches,
          users,
          products,
          sales,
          stockRequests,
          inventoryMovements: movements,
          targets,
        },
        REF,
      ),
    ],
    preferences: [],
    approvals: [
      {
        id: "APR-2003",
        tenantId: T,
        type: "stock_addition",
        status: "pending",
        branchId: "branch-001",
        requestedBy: "user-022",
        requestedAt: "2026-09-28T08:40:00",
        productId: "product-009",
        quantity: 40,
        note: "Supplier delivery #4471 received",
      },
      {
        id: "APR-2002",
        tenantId: T,
        type: "product_deactivation",
        status: "pending",
        branchId: "branch-001",
        requestedBy: "user-022",
        requestedAt: "2026-09-27T16:20:00",
        productId: "product-004",
        note: "Slow mover — supplier ending the line",
      },
      {
        id: "APR-2001",
        tenantId: T,
        type: "team_member",
        status: "pending",
        branchId: "branch-001",
        requestedBy: "user-002",
        requestedAt: "2026-09-27T11:05:00",
        member: {
          name: "Ngozi Umeh",
          email: "ngozi.umeh@westfield.ng",
          role: "sales_rep",
          branchId: "branch-001",
        },
        note: "Covering weekend shifts",
      },
    ],
    escalations: [
      {
        id: "esc-001",
        tenantId: T,
        branchId: "branch-004",
        type: "Target dispute",
        detail: "Q4 target review requested by manager",
        createdAt: "2026-09-28T07:14:00",
        tone: "danger",
        status: "open",
      },
      {
        id: "esc-002",
        tenantId: T,
        branchId: "branch-006",
        type: "Stock delay",
        detail: "Delivery #882 is four hours overdue",
        createdAt: "2026-09-28T04:14:00",
        tone: "warning",
        status: "open",
      },
      {
        id: "esc-003",
        tenantId: T,
        branchId: "branch-003",
        type: "Submission",
        detail: "3 sales reports still outstanding",
        createdAt: "2026-09-28T03:14:00",
        tone: "neutral",
        status: "open",
      },
    ],
  };
}
