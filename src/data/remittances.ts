export type OwnerRemittancePayeeType = "supplier" | "landlord" | "utility" | "contractor" | "other";
export type OwnerRemittancePaymentMethod = "cash" | "transfer" | "cheque";
export type OwnerRemittance = {
  id: string;
  tenantId: string;
  ownerId: string;
  payeeType: OwnerRemittancePayeeType;
  payeeName: string;
  amount: number;
  paymentMethod: OwnerRemittancePaymentMethod;
  reference?: string;
  remittanceDate: string;
  purpose: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};
