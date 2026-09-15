import { STORED_HAS_VIEWED_TUTORIAL } from "@/definitions/settings";
import { getFromStorage, setInStorage } from "@/utils/local-storage";

/**
 * "Has this device been taught yet?"
 *
 * The first run now teaches on the table itself (see `@/config/table-coach`),
 * so the flag no longer gates a tutorial screen — it decides whether the table
 * coach plays during the run. It keeps the historical storage key, so players
 * who already learned the game are not taught again.
 */
export function hasSeenFirstRun(): boolean {
  return getFromStorage(STORED_HAS_VIEWED_TUTORIAL) === "true";
}

export function markFirstRunSeen(): boolean {
  return setInStorage(STORED_HAS_VIEWED_TUTORIAL, "true");
}
