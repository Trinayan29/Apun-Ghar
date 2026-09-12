import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/store/AppStore";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Apun-Ghar — Find a place that feels right",
  description: "UI prototype: PGs, rooms and homes near your college or workplace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-dvh w-full bg-paper text-ink">
          <AppProvider>{children}</AppProvider>
        </div>
      </body>
    </html>
  );
}
