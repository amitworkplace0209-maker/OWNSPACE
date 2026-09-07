"use client";

import { useId, type ReactNode } from "react";
import { cn } from "cn";
import { Label } from "@/components/ui/label";

export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

/**
 * Labeled form field wrapper. `error` is rendered with role="alert" and is
 * associated with the control via the generated `id`.
 */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const autoId = useId();
  const controlId = htmlFor ?? autoId;
  const errorId = error ? `${controlId}-error` : undefined;
  const hintId = hint ? `${controlId}-hint` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={controlId}>{label}</Label>
      {children}
      {hint && !error ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <FieldError message={error} id={errorId} />
    </div>
  );
}