import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "Mavri — AI Meeting Intelligence";
const description =
  "Turn conversations into grounded summaries, decisions, action items, and evidence-backed answers.";

export const metadata: Metadata = {
  metadataBase: new URL("https://mavri-ai.vercel.app"),
  title: { default: title, template: "%s — Mavri" },
  description,
  applicationName: "Mavri",
  openGraph: {
    title,
    description,
    siteName: "Mavri",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Mavri — AI Meeting Intelligence. Great conversations. Clear next moves.",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#13171d",
  colorScheme: "dark",
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

