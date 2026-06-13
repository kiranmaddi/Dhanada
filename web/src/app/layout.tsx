import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dhanada",
  description: "Smart gift tracking for your events",
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
