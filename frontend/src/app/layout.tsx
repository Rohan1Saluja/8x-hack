import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "8x — AI Meeting Intelligence";
const description =
  "Turn conversations into grounded summaries, decisions, action items, and evidence-backed answers.";

export const metadata: Metadata = {
  metadataBase: new URL("https://8x-fathom-ui.vercel.app"),
  title: { default: title, template: "%s — 8x" },
  description,
  applicationName: "8x",
  openGraph: {
    title,
    description,
    siteName: "8x",
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
        alt: "8x — AI Meeting Intelligence. Great conversations. Clear next moves.",
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

