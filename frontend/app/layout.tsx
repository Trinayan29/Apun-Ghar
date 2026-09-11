import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rent — Phase 0",
  description: "Student and professional rental platform foundation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
