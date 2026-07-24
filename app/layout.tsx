import type { Metadata } from "next";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Kamikaze Ball",
  description:
    "The world's first verifiable arcade. Drain-to-win pinball with on-chain tournaments and power-up tug-of-war.",
  openGraph: {
    images: ["/assets/sprites/logo.png"],
  },
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
