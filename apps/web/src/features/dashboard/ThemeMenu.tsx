"use client";
import { DropdownMenu } from "radix-ui";
import { useTheme } from "next-themes";

const choices = [
  { value: "light", label: "روشن" },
  { value: "dark", label: "تیره" },
  { value: "system", label: "سیستم" },
];

export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu.Root dir="rtl">
      <DropdownMenu.Trigger aria-label="ظاهر" className="theme-button">
        ظاهر
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="account-menu theme-menu"
          align="end"
          sideOffset={8}
          aria-label="ظاهر برنامه"
        >
          <DropdownMenu.Label>ظاهر برنامه</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={theme} onValueChange={setTheme}>
            {choices.map(({ value, label }) => (
              <DropdownMenu.RadioItem key={value} value={value}>
                <span className="theme-choice-indicator" aria-hidden="true">
                  <DropdownMenu.ItemIndicator>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m5 12 4 4L19 6" />
                    </svg>
                  </DropdownMenu.ItemIndicator>
                </span>
                {label}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
