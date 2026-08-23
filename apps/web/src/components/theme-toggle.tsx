"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const nextTheme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const label = theme === "system" ? "خودکار" : isDark ? "تیره" : "روشن";

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="theme-toggle"
      aria-label="تغییر پوسته"
      title="تغییر پوسته"
      onClick={() => setTheme(nextTheme)}
    >
      <span aria-hidden="true">{isDark ? "☀" : "☾"}</span>
      <span className="theme-toggle-label">{label}</span>
    </Button>
  );
}
