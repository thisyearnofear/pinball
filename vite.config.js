import { defineConfig } from "vite";
import path from "path";
import vue from "@vitejs/plugin-vue";
import { viteStaticCopy } from "vite-plugin-static-copy";

const dirLib    = `${__dirname}/node_modules`;
const dirSrc    = `${__dirname}/src`;
const dirAssets = `${dirSrc}/assets`;
const dest      = `${__dirname}/dist`;

// https://vitejs.dev/config/
export default defineConfig({
    base: "./",
    plugins: [
        vue(),
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
    define: {
        global: 'globalThis',
        process: {
            env: {},
            browser: true,
            version: ''
        }
    },
    optimizeDeps: {
        esbuildOptions: {
            define: {
                global: 'globalThis',
                process: JSON.stringify({
                    env: {},
                    browser: true,
                    version: ''
                })
            }
        },
        include: [
            'buffer',
            '@walletconnect/web3-provider',
            'web3-provider-engine',
            'ethereumjs-util',
            'readable-stream'
        ]
    }
});
