import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Novel Writer V3 - AI Story Engine",
  description: "Production novel drafting engine designed for writing 100-500+ chapter novels with persistent memory graphs.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
