import { getFromStorage, setInStorage } from "@/utils/local-storage";
import { STORED_HAPTICS_ENABLED } from "@/definitions/settings";

let enabled = getFromStorage(STORED_HAPTICS_ENABLED) !== "false";

function vibrate(pattern: number | number[]) {
  const nav: any = navigator;
  if (!enabled) return;
  if (typeof nav !== "undefined" && typeof nav.vibrate === "function") {
    try { nav.vibrate(pattern); } catch { /* noop */ }
  }
}

export function setEnabled(value: boolean) {
  enabled = value;
  setInStorage(STORED_HAPTICS_ENABLED, value.toString());
}

export function flip() {
  vibrate(15);
}

export function bump() {
  vibrate(35);
}

export function nudge() {
  vibrate(10);
}

export function powerUp() {
  vibrate([15, 30, 15]);
}

export function aiSave() {
  vibrate(25);
}

export function drainVictory() {
  vibrate([40, 60, 90]);
}
