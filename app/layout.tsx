import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Kamikaze Ball",
  description:
    "The world's first verifiable arcade. Drain-to-win pinball with on-chain tournaments and power-up tug-of-war.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    images: ["/assets/sprites/logo.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0d1f",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
