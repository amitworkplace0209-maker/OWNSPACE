"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import {
  financeBillSchema,
  financeBudgetSchema,
  financeCategorySchema,
  financeHoldingSchema,
  financeRecurringSchema,
  financeTransactionSchema,
  parseForm,
} from "@/lib/schemas";
import { nextRecurringDate, occurrencesBetween } from "@/lib/finance-logic";
import { logActivity } from "@/lib/activity";

export type FinanceFormState = { error?: string; data?: { id: string } };

export async function createFinanceCategoryAction(
  _prev: FinanceFormState,
  formData: FormData
): Promise<FinanceFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(financeCategorySchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("finance_categories")
    .insert({ user_id: user.id, ...parsed.data })
    .select("id")
    .single();
  if (error) return { error: friendlyError(error, "Could not create the category.") };

  await logActivity({
    userId: user.id,
    activityType: "system",
    entityType: "notification",
    entityId: data?.id ?? null,
    summary: "Created a finance category",
    metadata: { name: parsed.data.name, type: parsed.data.type },
  });

  revalidateFinancePaths();
  return { data: data ? { id: data.id } : undefined };
}

export async function deleteFinanceCategoryAction(categoryId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase.from("finance_categories").delete().eq("user_id", user.id).eq("id", categoryId);
  if (error) return { error: friendlyError(error, "Could not delete the category.") };
  revalidateFinancePaths();
  return {};
}

export async function createFinanceTransactionAction(
  _prev: FinanceFormState,
  formData: FormData
): Promise<FinanceFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(financeTransactionSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("finance_transactions")
    .insert({ user_id: user.id, ...parsed.data })
    .select("id")
    .single();
  if (error) return { error: friendlyError(error, "Could not save the transaction.") };

  await logActivity({
    userId: user.id,
    projectId: parsed.data.project_id,
    activityType: "system",
    entityType: "notification",
    entityId: data?.id ?? null,
    summary: `Recorded ${parsed.data.type} transaction`,
    metadata: { amount: parsed.data.amount, date: parsed.data.transaction_date },
  });

  revalidateFinancePaths();
  return { data: data ? { id: data.id } : undefined };
}

export async function updateFinanceTransactionAction(
  transactionId: string,
  _prev: FinanceFormState,
  formData: FormData
): Promise<FinanceFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(financeTransactionSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { error } = await supabase
    .from("finance_transactions")
    .update({ ...parsed.data })
    .eq("user_id", user.id)
    .eq("id", transactionId);
  if (error) return { error: friendlyError(error, "Could not update the transaction.") };

  revalidateFinancePaths();
  return { data: { id: transactionId } };
}

export async function deleteFinanceTransactionAction(transactionId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("finance_transactions")
    .delete()
    .eq("user_id", user.id)
    .eq("id", transactionId);
  if (error) return { error: friendlyError(error, "Could not delete the transaction.") };
  revalidateFinancePaths();
  return {};
}
// ---------------------------------------------------------------------------
// Migration 020 budgets, bills, recurring, holdings
// ---------------------------------------------------------------------------

/**
 * Every finance figure shows on the dashboard, /lab and the project's own
 * finance tab, so a mutation has to invalidate all of them. Revalidating only
 * /finance left the other two showing a balance that no longer existed.
 */
function revalidateFinancePaths(): void {
  revalidatePath("/finance");
  revalidatePath("/lab");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  revalidatePath("/projects", "layout");
}

export async function saveBudgetAction(
  budgetId: string | null,
  _prev: FinanceFormState,
  formData: FormData
): Promise<FinanceFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(financeBudgetSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  // 23505 from finance_budgets_unique means this scope already has a budget
  // for that month. Updating it in place is what the user meant, so this is
  // resolved rather than reported as an error.
  if (budgetId) {
    const { error } = await supabase
      .from("finance_budgets")
      .update(parsed.data)
      .eq("user_id", user.id)
      .eq("id", budgetId);
    if (error) return { error: friendlyError(error, "Could not update the budget.") };
    revalidateFinancePaths();
    return { data: { id: budgetId } };
  }

  const { data, error } = await supabase
    .from("finance_budgets")
    .insert({ ...parsed.data, user_id: user.id })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("finance_budgets")
        .select("id")
        .eq("user_id", user.id)
        .eq("month", parsed.data.month)
        .is("category_id", parsed.data.category_id)
        .is("project_id", parsed.data.project_id)
        .maybeSingle();
      if (existing) {
        await supabase
          .from("finance_budgets")
          .update({ amount: parsed.data.amount })
          .eq("id", existing.id);
        revalidateFinancePaths();
        return { data: { id: existing.id } };
      }
    }
    return { error: friendlyError(error, "Could not save the budget.") };
  }

  revalidateFinancePaths();
  return { data: { id: data.id } };
}

export async function deleteBudgetAction(budgetId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("finance_budgets")
    .delete()
    .eq("user_id", user.id)
    .eq("id", budgetId);
  if (error) return { error: friendlyError(error, "Could not delete the budget.") };
  revalidateFinancePaths();
  return {};
}

export async function saveBillAction(
  billId: string | null,
  _prev: FinanceFormState,
  formData: FormData
): Promise<FinanceFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(financeBillSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const table = billId
    ? await supabase
        .from("finance_bills")
        .update(parsed.data)
        .eq("user_id", user.id)
        .eq("id", billId)
        .select("id")
        .single()
    : await supabase
        .from("finance_bills")
        .insert({ ...parsed.data, user_id: user.id })
        .select("id")
        .single();

  if (table.error || !table.data) {
    return { error: friendlyError(table.error, "Could not save the bill.") };
  }

  revalidateFinancePaths();
  return { data: { id: table.data.id } };
}

export async function deleteBillAction(billId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("finance_bills")
    .delete()
    .eq("user_id", user.id)
    .eq("id", billId);
  if (error) return { error: friendlyError(error, "Could not delete the bill.") };
  revalidateFinancePaths();
  return {};
}

export type BillPaymentFormState = { error?: string; data?: { transactionId: string } };

/**
 * Marks a bill paid and records the payment as a real transaction.
 *
 * Doing both in one action is the point: a bill marked paid with no matching
 * expense leaves the ledger understating what was actually spent, which is the
 * single worst failure mode for a money page.
 */
export async function payBillAction(
  billId: string,
  paidOn?: string
): Promise<BillPaymentFormState> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: bill, error: billError } = await supabase
    .from("finance_bills")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", billId)
    .maybeSingle();
  if (billError || !bill) return { error: "Bill not found." };

  const date = paidOn ?? new Date().toISOString().slice(0, 10);

  const { data: transaction, error: txError } = await supabase
    .from("finance_transactions")
    .insert({
      user_id: user.id,
      category_id: bill.category_id,
      project_id: bill.project_id,
      type: "expense",
      amount: Number(bill.amount),
      description: bill.name,
      payment_method: bill.payment_method,
      notes: bill.notes,
      transaction_date: date,
      // Recorded so a later sweep can tell this row was generated, not typed.
      source: "bill",
      bill_id: bill.id,
    })
    .select("id")
    .single();
  if (txError || !transaction) {
    return { error: friendlyError(txError, "Could not record the payment.") };
  }

  const { error: updateError } = await supabase
    .from("finance_bills")
    .update({ status: "paid", last_paid_on: date })
    .eq("user_id", user.id)
    .eq("id", billId);
  if (updateError) {
    // The transaction exists; rolling it back keeps the two in step rather than
    // leaving a payment in the ledger that the bill does not know about.
    await supabase.from("finance_transactions").delete().eq("id", transaction.id);
    return { error: friendlyError(updateError, "Could not update the bill.") };
  }

  await logActivity({
    userId: user.id,
    projectId: bill.project_id,
    activityType: "finance",
    entityType: "finance_transaction",
    entityId: transaction.id,
    summary: `Paid ${bill.name}`,
    metadata: { amount: Number(bill.amount), date },
  });

  revalidateFinancePaths();
  return { data: { transactionId: transaction.id } };
}

export async function skipBillAction(
  billId: string,
  month: string
): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("finance_bills")
    .update({ status: "skipped", last_paid_on: `${month}-01` })
    .eq("user_id", user.id)
    .eq("id", billId);
  if (error) return { error: friendlyError(error, "Could not skip the bill.") };
  revalidateFinancePaths();
  return {};
}

export async function saveRecurringAction(
  recurringId: string | null,
  _prev: FinanceFormState,
  formData: FormData
): Promise<FinanceFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(financeRecurringSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const result = recurringId
    ? await supabase
        .from("finance_recurring")
        .update(parsed.data)
        .eq("user_id", user.id)
        .eq("id", recurringId)
        .select("id")
        .single()
    : await supabase
        .from("finance_recurring")
        .insert({ ...parsed.data, user_id: user.id })
        .select("id")
        .single();

  if (result.error || !result.data) {
    return { error: friendlyError(result.error, "Could not save the schedule.") };
  }

  revalidateFinancePaths();
  return { data: { id: result.data.id } };
}

export async function deleteRecurringAction(id: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("finance_recurring")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id);
  if (error) return { error: friendlyError(error, "Could not delete the schedule.") };
  revalidateFinancePaths();
  return {};
}

export type GenerateResult = { error?: string; generated?: number; reminders?: number };

/**
 * Posts every recurring occurrence that has come due.
 *
 * Guarded by `last_generated_on`, so running it twice in a row is a no-op 
 * without that, a double click would post rent twice.
 */
export async function generateRecurringTransactionsAction(): Promise<GenerateResult> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: due, error: fetchError } = await supabase
    .from("finance_recurring")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .lte("next_due_on", today);
  if (fetchError) return { error: friendlyError(fetchError, "Could not read schedules.") };

  let generated = 0;
  let reminders = 0;

  for (const rule of (due ?? []) as Array<Record<string, unknown>>) {
    const cursor = String(rule.next_due_on);
    const repeatUntil = (rule.repeat_until as string | null) ?? null;
    // Bounded: a schedule left dormant for years should not generate a
    // thousand rows in one pass.
    const dates = occurrencesBetween(cursor, rule.repeat_rule as never, Number(rule.repeat_interval ?? 1), {
      from: cursor,
      until: repeatUntil,
      limit: 12,
    });

    const rows = dates
      .filter((date) => date <= today)
      .map((date) => ({
        user_id: user.id,
        category_id: (rule.category_id as string | null) ?? null,
        project_id: (rule.project_id as string | null) ?? null,
        type: rule.type as "income" | "expense",
        amount: Number(rule.amount),
        description: (rule.description as string | null) ?? String(rule.name),
        payment_method: (rule.payment_method as string | null) ?? null,
        transaction_date: date,
        source: "recurring",
        recurring_id: rule.id as string,
      }));

    if (rows.length > 0) {
      const { error } = await supabase.from("finance_transactions").insert(rows);
      if (!error) generated += rows.length;
    }

    // A lead-time reminder for the *next* occurrence, not for rows already
    // posted. Guarded by `last_reminded_for`: without it every sweep run
    // inserted another reminder for the same payment and they piled up.
    const leadDays = rule.remind_days_before;
    const lastRemindedFor = (rule.last_reminded_for as string | null) ?? null;

    if (leadDays !== null && leadDays !== undefined) {
      const upcoming = dates.length > 0 ? dates[dates.length - 1] : cursor;
      const afterThat = nextRecurringDate(
        upcoming,
        rule.repeat_rule as never,
        Number(rule.repeat_interval ?? 1),
        (rule.repeat_days as number[]) ?? []
      );

      if (afterThat && afterThat !== lastRemindedFor) {
        const remindOn = new Date(`${afterThat}T00:00:00`);
        remindOn.setDate(remindOn.getDate() - Number(leadDays));

        await supabase.from("reminders").insert({
          user_id: user.id,
          project_id: (rule.project_id as string | null) ?? null,
          title: `${rule.name} is due`,
          note: `Scheduled payment of ${Number(rule.amount)} is due on ${afterThat}.`,
          remind_at: remindOn.toISOString(),
          advance_minutes: 0,
          status: "pending",
          is_enabled: true,
          priority: "high",
          notification_channels: ["in_app"],
        });
        reminders += 1;
        await supabase
          .from("finance_recurring")
          .update({ last_reminded_for: afterThat })
          .eq("id", rule.id as string);
      }
    }

    const advanced = dates.length > 0
      ? nextRecurringDate(dates[dates.length - 1], rule.repeat_rule as never, Number(rule.repeat_interval ?? 1), (rule.repeat_days as number[]) ?? [])
      : nextRecurringDate(cursor, rule.repeat_rule as never, Number(rule.repeat_interval ?? 1), (rule.repeat_days as number[]) ?? []);

    await supabase
      .from("finance_recurring")
      .update({
        next_due_on: advanced,
        last_generated_on: dates.length > 0 ? dates[dates.length - 1] : cursor,
      })
      .eq("id", rule.id as string);
  }

  if (generated > 0 || reminders > 0) revalidateFinancePaths();
  return { generated, reminders };
}

export async function saveHoldingAction(
  holdingId: string | null,
  _prev: FinanceFormState,
  formData: FormData
): Promise<FinanceFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(financeHoldingSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const result = holdingId
    ? await supabase
        .from("finance_holdings")
        .update(parsed.data)
        .eq("user_id", user.id)
        .eq("id", holdingId)
        .select("id")
        .single()
    : await supabase
        .from("finance_holdings")
        .insert({ ...parsed.data, user_id: user.id })
        .select("id")
        .single();

  if (result.error || !result.data) {
    return { error: friendlyError(result.error, "Could not save the holding.") };
  }

  revalidateFinancePaths();
  return { data: { id: result.data.id } };
}

/** Records today's price for one holding, so P/L can be recomputed. */
export async function updateHoldingPriceAction(
  holdingId: string,
  currentPrice: number
): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  if (!Number.isFinite(currentPrice) || currentPrice < 0) {
    return { error: "Enter a price of zero or more." };
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from("finance_holdings")
    .update({ current_price: currentPrice })
    .eq("user_id", user.id)
    .eq("id", holdingId);
  if (error) return { error: friendlyError(error, "Could not update the price.") };

  revalidateFinancePaths();
  return {};
}

export async function deleteHoldingAction(holdingId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("finance_holdings")
    .delete()
    .eq("user_id", user.id)
    .eq("id", holdingId);
  if (error) return { error: friendlyError(error, "Could not delete the holding.") };
  revalidateFinancePaths();
  return {};
}

/** Deletes several transactions at once, for the list's bulk action. */
export async function bulkDeleteTransactionsAction(
  ids: string[]
): Promise<{ error?: string; affected?: number }> {
  const user = await getUserOrRedirect();
  if (ids.length === 0) return { affected: 0 };
  const supabase = await createClient();

  const { error } = await supabase
    .from("finance_transactions")
    .delete()
    .eq("user_id", user.id)
    .in("id", ids);
  if (error) return { error: friendlyError(error, "Could not delete the transactions.") };

  revalidateFinancePaths();
  return { affected: ids.length };
}
