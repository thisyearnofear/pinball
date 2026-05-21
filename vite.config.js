import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const dirLib    = `${__dirname}/node_modules`;
const dirSrc    = `${__dirname}/src`;
const dirAssets = `${dirSrc}/assets`;
const dest      = `${__dirname}/dist`;

export default defineConfig({
    base: "./",
    plugins: [
        react(),
        nodePolyfills({
            include: ["buffer", "process"],
            globals: {
                Buffer: true,
                global: true,
                process: true,
            },
        }),
        viteStaticCopy({
            targets: [
                {
                    src: `${dirLib}/pathseg/pathseg.js`,
                    dest: "./",
                },
                {
                    src: "public/.well-known/*",
                    dest: ".well-known",
                }
            ]
        }),
    ],
    resolve: {
        alias: {
            "@": path.resolve( __dirname, "./src" ),
            "@@": path.resolve( __dirname, "./public/assets" ),
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        if (id.includes('ethers')) return 'vendor_ethers';
                        if (id.includes('matter-js')) return 'vendor_physics';
                        if (id.includes('@farcaster')) return 'vendor_farcaster';
                        if (id.includes('@rainbow-me') || id.includes('wagmi') || id.includes('viem')) return 'vendor_wallet';
                        if (id.includes('metamask-sdk')) return 'vendor_metamask';
                    }
                }
            }
        }
    },
    test: {
        include: [ "tests/**/*.spec.ts" ],
        exclude: [ "backend/**", "contracts/**", "apps/**", "dist/**", "node_modules/**" ],
        environment: "jsdom",
    },
});
