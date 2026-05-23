import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "",
  images: { unoptimized: true },

  // Skip SSR analysis for packages with broken ESM exports
  serverExternalPackages: [],

  transpilePackages: [
    "@rainbow-me/rainbowkit",
    "wagmi",
    "viem",
    "zcanvas",
  ],

  turbopack: {
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
  },

  webpack(config, { isServer }) {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        "matter-js": "commonjs matter-js",
        "matter-attractors": "commonjs matter-attractors",
        "zcanvas": "commonjs zcanvas",
      });
    }
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || "placeholder-org",
  project: process.env.SENTRY_PROJECT || "placeholder-project",

  silent: true,
  widenClientFileUpload: true,
});
