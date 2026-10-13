"use client";

import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

export function ThemeToggle({
  className = "",
  variant = "button",
}: {
  className?: string;
  variant?: "button" | "tab" | "compact";
}) {
  function toggle() {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    root.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be blocked; the theme still changes for this visit.
    }
  }

  if (variant === "compact") {
    return (
      <button
        type="button"
        id="header-theme-toggle"
        onClick={toggle}
        aria-label="Switch between light and dark theme"
        title="Switch between light and dark theme"
        className={`flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs font-semibold text-foreground transition-all duration-150 hover:border-[var(--hp-brand)] hover:bg-[var(--hp-soft)] hover:text-[var(--hp-brand)] active:translate-y-px active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${className}`}
      >
        <Moon className="size-3.5 shrink-0 dark:hidden text-[var(--hp-brand)]" aria-hidden="true" />
        <Sun className="hidden size-3.5 shrink-0 dark:block text-[var(--hp-gold)]" aria-hidden="true" />
        <span className="hidden sm:inline text-[11px]">Theme</span>
      </button>
    );
  }

  if (variant === "tab") {
    return (
      <button
        type="button"
        id="header-theme-toggle"
        onClick={toggle}
        aria-label="Switch between light and dark theme"
        title="Switch between light and dark theme"
        className={`flex min-h-10 shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 border-r border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-all duration-150 hover:bg-[var(--hp-gold-soft)] hover:text-[var(--hp-gold-ink)] active:translate-y-px active:scale-[0.98] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-3.5 sm:text-sm ${className}`}
      >
        <Moon className="size-4 shrink-0 dark:hidden text-[var(--hp-brand)]" aria-hidden="true" />
        <Sun className="hidden size-4 shrink-0 dark:block text-[var(--hp-gold)]" aria-hidden="true" />
        <span className="hidden md:inline">Theme</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark theme"
      title="Switch between light and dark theme"
      className={`inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-[var(--hp-brand)] transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${className}`}
    >
      <Moon className="size-4 dark:hidden" aria-hidden />
      <Sun className="hidden size-4 dark:block" aria-hidden />
    </button>
  );
}
