import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FieldError, FilterSelect } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Customer, CustomerPaymentMethod } from "@/data/mock-db";
import { getCustomerOrders } from "@/lib/customer-calculations";
import { formatNaira } from "@/lib/format";
import { useLiveWorkspace } from "@/hooks/use-live-workspace";
import { useCreateCustomer, useSetCustomerCreditLimit, useUpdateCustomer } from "@/hooks/use-customers";
import { useRecordCustomerPayment } from "@/hooks/use-customer-payments";
import { getAccessScope } from "@/lib/session";
import {
  runWrite,
  validateCreditLimit,
  validateCustomerPayment,
  validateCustomerWrite,
  type CustomerInput,
  type FieldErrors,
} from "@/lib/validation";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1.5">{children}</div>
      <FieldError message={error} />
    </div>
  );
}

const blank: CustomerInput = { name: "", contactPerson: "", phone: "", email: "", address: "" };

export function CustomerFormDialog({
  open,
  onOpenChange,
  actorId,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  actorId: string;
  customer?: Customer | undefined;
  onSaved?: (c: Customer) => void;
}) {
  const { db } = useLiveWorkspace();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const [form, setForm] = useState<CustomerInput>(blank);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm(
      customer
        ? {
            name: customer.name,
            contactPerson: customer.contactPerson,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
          }
        : blank,
    );
    setErrors({});
  }, [open, customer]);
  const set =
    (k: keyof CustomerInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    const fields = {
      p_name: form.name.trim(),
      p_contact_person: form.contactPerson.trim(),
      p_phone: form.phone.trim(),
      p_email: form.email.trim() || null,
      p_address: form.address.trim(),
    };
    const result = await runWrite(validateCustomerWrite(db, getAccessScope(db, actorId), form, customer), () =>
      customer
        ? updateCustomer.mutateAsync({ p_customer_id: customer.id, ...fields })
        : createCustomer.mutateAsync(fields),
    );
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    toast.success(customer ? "Customer updated" : "Customer added");
    onSaved?.(result.data);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit customer" : "Add customer"}</DialogTitle>
          <DialogDescription>
            Registered customers buy on account. Balances are calculated automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name or business name *" error={errors.name}>
              <Input value={form.name} onChange={set("name")} aria-label="Customer name" />
            </Field>
          </div>
          <Field label="Contact person" error={errors.contactPerson}>
            <Input
              value={form.contactPerson}
              onChange={set("contactPerson")}
              aria-label="Contact person"
            />
          </Field>
          <Field label="Phone *" error={errors.phone}>
            <Input value={form.phone} onChange={set("phone")} aria-label="Phone" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Email" error={errors.email}>
              <Input type="email" value={form.email} onChange={set("email")} aria-label="Email" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Address" error={errors.address}>
              <Textarea value={form.address} onChange={set("address")} aria-label="Address" />
            </Field>
          </div>
        </div>
        <FieldError message={errors.form} />
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={save}>
            {busy ? "Saving…" : customer ? "Save changes" : "Add customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RecordCustomerPaymentDialog({
  open,
  onOpenChange,
  actorId,
  customer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  actorId: string;
  customer: Customer;
}) {
  const { db } = useLiveWorkspace();
  const recordPayment = useRecordCustomerPayment();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<CustomerPaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [orderId, setOrderId] = useState("none");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(db.tenant.referenceDate);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setAmount("");
    setMethod("cash");
    setReference("");
    setOrderId("none");
    setNote("");
    setDate(db.tenant.referenceDate);
    setErrors({});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const openOrders = getCustomerOrders(db, customer.id).filter((o) => o.paymentStatus !== "paid");
  const save = async () => {
    setBusy(true);
    const input = {
      customerId: customer.id,
      amount: Number(amount),
      method,
      reference,
      paymentDate: date,
      note,
      ...(orderId !== "none" ? { orderId } : {}),
    };
    const result = await runWrite(validateCustomerPayment(db, getAccessScope(db, actorId), input), () =>
      recordPayment.mutateAsync({
        p_customer_id: input.customerId,
        p_amount: input.amount,
        p_method: input.method,
        p_reference: input.reference.trim() || null,
        p_payment_date: input.paymentDate,
        p_order_id: input.orderId ?? null,
        p_note: input.note.trim() || null,
      }),
    );
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    toast.success("Payment recorded · sent to manager for acknowledgement");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {customer.name}. Credits the account only after the owner confirms it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (₦) *" error={errors.amount}>
            <Input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Amount"
            />
          </Field>
          <Field label="Date *" error={errors.paymentDate}>
            <Input
              type="date"
              max={db.tenant.referenceDate}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Payment date"
            />
          </Field>
          <Field label="Method *" error={errors.method}>
            <FilterSelect
              label="Method"
              className="w-full"
              value={method}
              onChange={(v) => setMethod(v as CustomerPaymentMethod)}
              options={[
                { value: "cash", label: "Cash" },
                { value: "transfer", label: "Transfer" },
              ]}
            />
          </Field>
          <Field label={`Reference${method === "transfer" ? " *" : ""}`} error={errors.reference}>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              aria-label="Reference"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Link to order (optional)">
              <FilterSelect
                label="Order"
                className="w-full"
                value={orderId}
                onChange={setOrderId}
                options={[
                  { value: "none", label: "Apply to oldest unpaid orders" },
                  ...openOrders.map((o) => ({
                    value: o.orderId,
                    label: `${o.orderId} · ${formatNaira(o.total - o.paid)} due`,
                  })),
                ]}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Note">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
            </Field>
          </div>
        </div>
        <FieldError message={errors.customerId ?? errors.form} />
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !(Number(amount) > 0)} onClick={save}>
            {busy ? "Saving…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreditLimitDialog({
  open,
  onOpenChange,
  actorId,
  customer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  actorId: string;
  customer: Customer;
}) {
  const { db } = useLiveWorkspace();
  const setCreditLimit = useSetCustomerCreditLimit();
  const [value, setValue] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setValue(customer.creditLimit ? String(customer.creditLimit) : "");
      setErrors({});
    }
  }, [open, customer]);
  const save = async () => {
    setBusy(true);
    const limit = value === "" ? null : Number(value);
    const result = await runWrite(validateCreditLimit(db, getAccessScope(db, actorId), limit), () =>
      // A zero limit clears it, as before.
      setCreditLimit.mutateAsync({ p_customer_id: customer.id, p_credit_limit: limit ? limit : null }),
    );
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    toast.success("Credit limit updated");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Credit limit</DialogTitle>
          <DialogDescription>Leave empty for no limit.</DialogDescription>
        </DialogHeader>
        <Field label="Limit (₦)" error={errors.creditLimit ?? errors.form}>
          <Input
            type="number"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Credit limit"
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
