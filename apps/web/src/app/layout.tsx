import type { Metadata } from "next";
import { NotifyProvider } from "@maraki/ui";
import { BoardFiltersProvider } from "@/modules/catalog/BoardFiltersProvider";
import { SportNav } from "@/modules/catalog/SportNav";
import { BetSlip } from "@/modules/slip/BetSlip";
import { SlipProvider } from "@/modules/slip/SlipProvider";
import { AuthProvider } from "@/modules/identity/AuthProvider";
import { Header } from "@/modules/shell/Header";
import "@maraki/ui/notify.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maraki Bet",
  description: "Modular sportsbook powered by OddsPapi",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="orange" suppressHydrationWarning>
      <body>
        <NotifyProvider>
          <SlipProvider>
            <AuthProvider>
              <BoardFiltersProvider>
                <div className="book">
                  <Header />
                  <div className="book-body">
                    <SportNav />
                    <div className="stage">{children}</div>
                    <BetSlip />
                  </div>
                </div>
              </BoardFiltersProvider>
            </AuthProvider>
          </SlipProvider>
        </NotifyProvider>
      </body>
    </html>
  );
}
