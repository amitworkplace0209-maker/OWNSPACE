import type { PaymentMethod } from "@/types";

export const paymentMethodLabels: Record<PaymentMethod | "other", string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  upi: "UPI",
  wallet: "Wallet",
  other: "Other",
};