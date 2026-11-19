export const HOME_EFFECTS_STORAGE_KEY = "maltose:home-effects";
export const HOME_EFFECTS_EVENT = "maltose:home-effects";
const HOME_EFFECTS_ENABLED_VALUE = "enabled";
const HOME_EFFECTS_DISABLED_VALUE = "disabled";
const DEFAULT_HOME_EFFECTS_ENABLED = true;

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

export function parseHomeEffectsPreference(value: string | null): boolean {
  return value !== HOME_EFFECTS_DISABLED_VALUE;
}

export function serializeHomeEffectsPreference(enabled: boolean): string {
  return enabled
    ? HOME_EFFECTS_ENABLED_VALUE
    : HOME_EFFECTS_DISABLED_VALUE;
}

export function readHomeEffectsPreference(storage: ReadableStorage): boolean {
  try {
    return parseHomeEffectsPreference(
      storage.getItem(HOME_EFFECTS_STORAGE_KEY),
    );
  } catch (error) {
    void error;
    return DEFAULT_HOME_EFFECTS_ENABLED;
  }
}

export function writeHomeEffectsPreference(
  storage: WritableStorage,
  enabled: boolean,
): boolean {
  try {
    storage.setItem(
      HOME_EFFECTS_STORAGE_KEY,
      serializeHomeEffectsPreference(enabled),
    );
    return true;
  } catch (error) {
    void error;
    return false;
  }
}

export function getHomeEffectsSnapshot(): boolean {
  if (typeof window === "undefined") return DEFAULT_HOME_EFFECTS_ENABLED;
  return readHomeEffectsPreference(window.localStorage);
}

export function setHomeEffectsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;

  writeHomeEffectsPreference(window.localStorage, enabled);
  document.documentElement.dataset.maltoseHomeEffects = enabled
    ? "on"
    : "off";
  window.dispatchEvent(
    new CustomEvent(HOME_EFFECTS_EVENT, { detail: { enabled } }),
  );
}

export function subscribeHomeEffects(
  listener: (enabled?: boolean) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onStorageChange: EventListener = () => listener();
  const onCustomChange: EventListener = (event) => {
    const enabled =
      event instanceof CustomEvent &&
      typeof event.detail?.enabled === "boolean"
        ? event.detail.enabled
        : undefined;
    listener(enabled);
  };
  window.addEventListener("storage", onStorageChange);
  window.addEventListener(HOME_EFFECTS_EVENT, onCustomChange);

  return () => {
    window.removeEventListener("storage", onStorageChange);
    window.removeEventListener(HOME_EFFECTS_EVENT, onCustomChange);
  };
}
