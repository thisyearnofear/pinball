import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

const dirLib    = `${__dirname}/node_modules`;
const dirSrc    = `${__dirname}/src`;
const dirAssets = `${dirSrc}/assets`;
const dest      = `${__dirname}/dist`;

export default defineConfig({
    base: "./",
    plugins: [
        react(),
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
                manualChunks: {
                    vendor_ethers: ['ethers'],
                    vendor_physics: ['matter-js'],
                    vendor_farcaster: ['@farcaster/miniapp-sdk']
                }
            }
        }
    },
    test: {
        include: [ "tests/**/*.spec.ts" ],
        exclude: [ "backend/**", "contracts/**", "apps/**", "dist/**", "node_modules/**" ],
        environment: "jsdom",
    },
    define: {
        global: 'globalThis',
    },
    optimizeDeps: {
        include: ['buffer', 'ethers'],
        esbuildOptions: {
            define: {
                global: 'globalThis',
            }
        }
    }
});
