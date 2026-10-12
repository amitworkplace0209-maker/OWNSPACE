import {
  BadgeIndianRupee,
  Banknote,
  Bike,
  Briefcase,
  Car,
  ChartPie,
  Clapperboard,
  CreditCard,
  Droplets,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  House,
  Landmark,
  PiggyBank,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  UtensilsCrossed,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { FINANCE_KINDS, type FinanceCategoryType, type FinanceKind } from "@/types";

/**
 * The books a category can belong to.
 *
 * The kind is what makes each category page different: a household category
 * answers "what does the house cost me", an account answers "how much money do I
 * have", an investment answers "what is it worth now", a liability answers "how
 * much is left to pay". A category with no kind is still fully reported — it
 * just gets the plain income/expense treatment.
 */
export type KindMeta = {
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
  /** What this book's headline number is. */
  headline: string;
  /** The transaction type its categories carry. Accounts are their own type. */
  categoryType: FinanceCategoryType;
  accent: string;
};

export const KIND_META: Record<FinanceKind, KindMeta> = {
  income: {
    label: "Income",
    short: "Aaamdani",
    description: "Everything that came in — salary, business, rent from a tenant.",
    icon: BadgeIndianRupee,
    headline: "Total earned",
    categoryType: "income",
    accent: "text-success",
  },
  expense: {
    label: "Everyday spending",
    short: "Kharche",
    description: "Daily life outside the house and investments — food out, travel, shopping.",
    icon: ShoppingBag,
    headline: "Total spent",
    categoryType: "expense",
    accent: "text-destructive",
  },
  household: {
    label: "Household",
    short: "Ghar",
    description: "The running cost of the house — rent, kirana, bijli, pani, gas, repairs.",
    icon: House,
    headline: "House cost",
    categoryType: "expense",
    accent: "text-primary",
  },
  cash_bank: {
    label: "Cash & bank",
    short: "Hisab",
    description: "Where your money actually sits. Each one carries its own balance forward.",
    icon: Landmark,
    headline: "Current balance",
    categoryType: "account",
    accent: "text-cyan-500",
  },
  investment: {
    label: "Investment",
    short: "Nivesh",
    description: "Money put to work — mutual funds, stocks, FD, PPF, gold.",
    icon: TrendingUp,
    headline: "Current value",
    categoryType: "expense",
    accent: "text-emerald-500",
  },
  liability: {
    label: "Liability",
    short: "Udhaar",
    description: "What you owe — home loan, vehicle loan, credit card, personal loan.",
    icon: HandCoins,
    headline: "Still owed",
    categoryType: "expense",
    accent: "text-amber-500",
  },
};

export type DefaultCategory = {
  name: string;
  kind: FinanceKind;
  type: FinanceCategoryType;
  icon: string;
  color: string;
  /** One line on what belongs in this category. Shown under the name. */
  hint: string;
};

/**
 * The starter set. Twenty-eight categories across the six books.
 *
 * These are seeded once per user and are ordinary rows afterwards — editable,
 * deletable, and a user can add whatever else their household actually spends
 * on. The seed is a starting point, not a constraint: a category the user made
 * themselves gets the same monthly and yearly report as any of these.
 */
export const DEFAULT_FINANCE_CATEGORIES: DefaultCategory[] = [
  // --- Hisab: where the money sits. These are accounts, not buckets. ---
  { name: "Cash in hand", kind: "cash_bank", type: "account", icon: "banknote", color: "#22c55e", hint: "Notes and coins physically with you" },
  { name: "Bank account", kind: "cash_bank", type: "account", icon: "landmark", color: "#0ea5e9", hint: "Savings or current account balance" },
  { name: "UPI & wallet", kind: "cash_bank", type: "account", icon: "smartphone", color: "#8b5cf6", hint: "PhonePe, Paytm, GPay, bank wallet" },
  { name: "Credit card", kind: "cash_bank", type: "account", icon: "credit-card", color: "#f43f5e", hint: "Card balance — starts negative" },

  // --- Income ---
  { name: "Salary", kind: "income", type: "income", icon: "briefcase", color: "#16a34a", hint: "Take-home from a job" },
  { name: "Business income", kind: "income", type: "income", icon: "receipt", color: "#22c55e", hint: "Freelance, consulting, shop" },
  { name: "Interest & dividend", kind: "income", type: "income", icon: "trending-up", color: "#0d9488", hint: "FD interest, MF dividend" },
  { name: "Rental income", kind: "income", type: "income", icon: "home", color: "#65a30d", hint: "Rent received from a tenant" },

  // --- Ghar: the running cost of the house ---
  { name: "Rent", kind: "household", type: "expense", icon: "home", color: "#ef4444", hint: "House or flat rent" },
  { name: "Kirana", kind: "household", type: "expense", icon: "shopping-cart", color: "#f97316", hint: "Groceries, vegetables, milk" },
  { name: "Bijli bill", kind: "household", type: "expense", icon: "zap", color: "#eab308", hint: "Electricity" },
  { name: "Pani & gas", kind: "household", type: "expense", icon: "droplets", color: "#06b6d4", hint: "Water, piped gas, cylinder" },
  { name: "Internet & mobile", kind: "household", type: "expense", icon: "smartphone", color: "#3b82f6", hint: "Broadband, recharge" },
  { name: "Ghar maintenance", kind: "household", type: "expense", icon: "wrench", color: "#78716c", hint: "Repairs, painting, service" },
  { name: "School fees", kind: "household", type: "expense", icon: "graduation-cap", color: "#8b5cf6", hint: "Tuition, admission, school" },
  { name: "Soc. / maintenance charge", kind: "household", type: "expense", color: "#a16207", icon: "landmark", hint: "Apartment society dues" },

  // --- Nivesh: money put to work ---
  { name: "Mutual funds & SIP", kind: "investment", type: "expense", icon: "chart-pie", color: "#10b981", hint: "SIP instalments, lumpsum" },
  { name: "Stocks", kind: "investment", type: "expense", icon: "trending-up", color: "#059669", hint: "Equity shares bought" },
  { name: "FD & PPF", kind: "investment", type: "expense", icon: "piggy-bank", color: "#0d9488", hint: "Fixed deposit, public provident" },
  { name: "Gold & silver", kind: "investment", type: "expense", icon: "badge-indian-rupee", color: "#ca8a04", hint: "Jewellery, coins, ETFs" },

  // --- Udhaar: what you owe ---
  { name: "Home loan", kind: "liability", type: "expense", icon: "landmark", color: "#b45309", hint: "Loan taken against a property" },
  { name: "Vehicle loan", kind: "liability", type: "expense", icon: "car", color: "#c2410c", hint: "Car or bike finance" },
  { name: "Personal loan", kind: "liability", type: "expense", icon: "briefcase", color: "#a16207", hint: "Unsecured loan from a bank" },
  { name: "EMI", kind: "liability", type: "expense", icon: "receipt", color: "#d97706", hint: "Anything paid monthly against a loan" },

  // --- Baaki kharche: life outside the house ---
  { name: "Eating out", kind: "expense", type: "expense", icon: "utensils-crossed", color: "#db2777", hint: "Restaurants, chai, takeaway" },
  { name: "Travel", kind: "expense", type: "expense", icon: "plane", color: "#0ea5e9", hint: "Trips, fuel, cabs, tickets" },
  { name: "Shopping", kind: "expense", type: "expense", icon: "shopping-bag", color: "#7c3aed", hint: "Clothes, electronics, home goods" },
  { name: "Health", kind: "expense", type: "expense", icon: "heart-pulse", color: "#e11d48", hint: "Medicine, doctor, gym" },
  { name: "Entertainment", kind: "expense", type: "expense", icon: "clapperboard", color: "#9333ea", hint: "Movies, subscriptions, events" },
  { name: "Two-wheeler fuel", kind: "expense", type: "expense", icon: "bike", color: "#0891b2", hint: "Petrol, diesel, servicing" },
  { name: "Gifts & donations", kind: "expense", type: "expense", icon: "hand-coins", color: "#c026d3", hint: "Presents, charity, festivals" },
];

/** icon name -> component, for the seeded names above and anything a user types. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  banknote: Banknote,
  landmark: Landmark,
  smartphone: Smartphone,
  "credit-card": CreditCard,
  briefcase: Briefcase,
  receipt: Receipt,
  "trending-up": TrendingUp,
  home: Home,
  house: House,
  "shopping-cart": ShoppingCart,
  zap: Zap,
  droplets: Droplets,
  wrench: Wrench,
  "graduation-cap": GraduationCap,
  "chart-pie": ChartPie,
  "piggy-bank": PiggyBank,
  "badge-indian-rupee": BadgeIndianRupee,
  car: Car,
  bike: Bike,
  "utensils-crossed": UtensilsCrossed,
  plane: Plane,
  "shopping-bag": ShoppingBag,
  "heart-pulse": HeartPulse,
  clapperboard: Clapperboard,
  "hand-coins": HandCoins,
};

/**
 * Looks an icon up for rendering.
 *
 * Returns the component itself rather than JSX so a caller can write `<Icon />`,
 * and reads from the map with a plain index — a call that *returns* a component
 * trips React's static-components rule, which is right: a component built during
 * render loses its identity every pass.
 */
export function categoryIcon(name: string | null | undefined): LucideIcon {
  return (name && CATEGORY_ICONS[name]) || FALLBACK_CATEGORY_ICON;
}

/** Used when a category has no icon, or one this build does not know. */
export const FALLBACK_CATEGORY_ICON: LucideIcon = Receipt;

/** The icon names offered when creating a category. */
export const CATEGORY_ICON_CHOICES = Object.keys(CATEGORY_ICONS);

/** The books, in the order they appear on the category board. */
export const KIND_ORDER: FinanceKind[] = [...FINANCE_KINDS];

/**
 * The kinds whose categories are containers of money rather than buckets of it.
 *
 * A transaction form must offer the accounts in its category picker, but must
 * not offer them when creating an income or expense category — there is no such
 * thing as an "expense account".
 */
export const ACCOUNT_KINDS: FinanceKind[] = ["cash_bank"];
