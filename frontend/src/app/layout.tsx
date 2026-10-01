import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "8x · Meeting workspace",
  description: "Your meetings, with the evidence attached.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="m-0 bg-background font-sans text-sm leading-[1.6] text-ink">
        {children}
      </body>
    </html>
  );
}
