/**
 * Nimiq provider service — wraps @nimiq/mini-app-sdk for NIM-native operations.
 *
 * The SDK's init() waits for Nimiq Pay to inject the Nimiq provider into the
 * WebView. Outside Nimiq Pay (browser, dev), init() will time out and we
 * gracefully report NIM as unavailable.
 *
 * This module is intentionally separate from the EVM wallet layer (WalletPort)
 * because NIM lives on the Nimiq chain (non-EVM) and uses a completely
 * different provider interface.
 */
import type { NimiqProvider } from "@nimiq/mini-app-sdk";

let cachedProvider: NimiqProvider | null = null;
let initPromise: Promise<NimiqProvider | null> | null = null;

/**
 * Attempt to initialize the Nimiq provider. Returns null if not running
 * inside Nimiq Pay (e.g. standalone browser).
 */
export async function getNimiqProvider(): Promise<NimiqProvider | null> {
  if (cachedProvider) return cachedProvider;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const { init } = await import("@nimiq/mini-app-sdk");
      const provider = await init({ timeout: 3000 });
      cachedProvider = provider;
      return provider;
    } catch {
      return null;
    }
  })();

  return initPromise;
}

/**
 * Whether the app is running inside Nimiq Pay (synchronous heuristic).
 * Nimiq Pay injects window.nimiqPay before page scripts run.
 */
export function isInsideNimiqPay(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as any).nimiqPay);
}

/**
 * Get the user's Nimiq accounts (NQ addresses). Returns empty array if
 * not inside Nimiq Pay or user denies.
 */
export async function getNimAccounts(): Promise<string[]> {
  const provider = await getNimiqProvider();
  if (!provider) return [];
  try {
    const result = await provider.listAccounts();
    if (Array.isArray(result)) return result;
    return [];
  } catch {
    return [];
  }
}

/**
 * Get the user's preferred language from Nimiq Pay, or undefined.
 */
export function getNimiqLanguage(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as any).nimiqPay?.language;
}
