import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = { title: "بهتر بخر", description: "مقایسه تخفیف فروشگاه‌های محلی" };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="fa" dir="rtl" suppressHydrationWarning><body><ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>{children}</ThemeProvider></body></html>;
}
