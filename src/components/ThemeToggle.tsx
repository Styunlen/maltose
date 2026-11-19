"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Dark-mode toggle. Persists to localStorage ("theme"), falls back to
 * prefers-color-scheme. The inline script in MainLayout sets the class before
 * first paint to avoid a flash of the wrong theme.
 */
export default function ThemeToggle() {
  const [mounted, setMounted] = React.useState(false);
  const [theme, setTheme] = React.useState<Theme>("light");

  React.useEffect(() => {
    setTheme(getInitialTheme());
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("theme", theme);
  }, [mounted, theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const label =
    theme === "dark" ? "切换到浅色模式" : "切换到深色模式";
  const title = theme === "dark" ? "浅色模式" : "深色模式";

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 rounded-xl hover:bg-primary/20 hover:text-primary transition-all duration-200"
      onClick={toggle}
      aria-label={mounted ? label : "切换主题"}
      title={mounted ? title : "切换主题"}
    >
      {!mounted ? (
        <Moon data-icon="inline-start" className="opacity-0" />
      ) : theme === "dark" ? (
        <Sun data-icon="inline-start" />
      ) : (
        <Moon data-icon="inline-start" />
      )}
    </Button>
  );
}
