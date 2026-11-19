import * as React from "react";
import { cn } from "@/lib/utils";
import type { MaltoseSettings } from "./lib/api";

export function Button({
  variant = "default",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "danger" | "ghost";
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "default" &&
          "bg-primary text-primary-foreground hover:opacity-85",
        variant === "secondary" &&
          "border border-border bg-card text-foreground hover:bg-muted",
        variant === "danger" &&
          "bg-destructive text-destructive-foreground hover:opacity-85",
        variant === "ghost" && "text-muted-foreground hover:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 py-4 first:pt-0">
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        {description && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      <div className="max-w-md">{children}</div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-border",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-card shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-1",
        )}
      />
    </button>
  );
}

export function TextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn("h-9 w-full rounded-lg text-sm text-foreground", className)}
      {...props}
    />
  );
}

export function Toast({
  kind,
  message,
  onDismiss,
}: {
  kind: "success" | "error";
  message: string;
  onDismiss: () => void;
}) {
  React.useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);
  return (
    <div
      className={cn(
        "fixed right-6 top-16 z-50 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg",
        kind === "success"
          ? "bg-primary text-primary-foreground"
          : "bg-destructive text-destructive-foreground",
      )}
      role="status"
    >
      {message}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions}
    </div>
  );
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-5 text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}
