import type { Metadata } from "next";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Mezo Pinball Arcade",
  description:
    "Retro-style pinball game with on-chain tournaments for MUSD prizes on the Mezo ecosystem.",
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
