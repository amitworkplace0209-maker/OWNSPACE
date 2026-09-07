"use client";

import { useEffect, useRef } from "react";
import { processDueRemindersAction } from "@/lib/actions/notifications";

/**
 * Fires once on dashboard mount to convert due pending reminders into
 * notifications. purely a background sweep; failures are ignored.
 */
export function ReminderSweep() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void processDueRemindersAction();
  }, []);

  return null;
}