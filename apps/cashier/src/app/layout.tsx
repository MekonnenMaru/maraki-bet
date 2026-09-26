import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import { NotifyProvider } from "@maraki/ui";
import { AuthProvider } from "@/modules/auth/AuthProvider";
import { Shell } from "@/modules/shell/Shell";
import "@maraki/ui/notify.css";
import "./globals.css";

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const display = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Maraki Cashier",
  description: "Shop cashier desk for MarakiBET",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`} suppressHydrationWarning>
      <body>
        <NotifyProvider>
          <AuthProvider>
            <Shell>{children}</Shell>
          </AuthProvider>
        </NotifyProvider>
      </body>
    </html>
  );
}
