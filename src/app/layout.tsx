import type { Metadata } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/outfit/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Melon",
  description: "Career roadmaps that remember every advising session.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
