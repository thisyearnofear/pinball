// Polyfills for WalletConnect compatibility
import { Buffer } from 'buffer';
if (typeof window !== 'undefined') {
    if (!window.Buffer) {
        window.Buffer = Buffer;
    }
    if (!window.process) {
        window.process = {
            env: {},
            browser: true,
            version: ''
        };
    }
}

import { createApp } from "vue";
import i18nInstance from "./i18n";
import App from "./App.vue";

const app = createApp( App );

app.use( i18nInstance );
app.mount( "#app" );
