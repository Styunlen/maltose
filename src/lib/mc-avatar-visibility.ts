export const MC_AVATAR_VISIBILITY_STORAGE_KEY = "maltose:mc-avatar-visible";
export const MC_AVATAR_VISIBILITY_EVENT = "maltose:mc-avatar-visibility-change";
export const MC_AVATAR_VISIBLE_VALUE = "visible";
export const MC_AVATAR_HIDDEN_VALUE = "hidden";

const DEFAULT_MC_AVATAR_VISIBLE = true;

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

export function parseMcAvatarVisibility(value: string | null): boolean {
  return value === MC_AVATAR_HIDDEN_VALUE ? false : DEFAULT_MC_AVATAR_VISIBLE;
}

export function serializeMcAvatarVisibility(visible: boolean): string {
  return visible ? MC_AVATAR_VISIBLE_VALUE : MC_AVATAR_HIDDEN_VALUE;
}

export function readMcAvatarVisibility(storage: ReadableStorage): boolean {
  try {
    return parseMcAvatarVisibility(
      storage.getItem(MC_AVATAR_VISIBILITY_STORAGE_KEY),
    );
  } catch (error) {
    void error;
    return DEFAULT_MC_AVATAR_VISIBLE;
  }
}

export function writeMcAvatarVisibility(
  storage: WritableStorage,
  visible: boolean,
): boolean {
  try {
    storage.setItem(
      MC_AVATAR_VISIBILITY_STORAGE_KEY,
      serializeMcAvatarVisibility(visible),
    );
    return true;
  } catch (error) {
    void error;
    return false;
  }
}

export function getMcAvatarVisibleSnapshot(): boolean {
  if (typeof window === "undefined") return DEFAULT_MC_AVATAR_VISIBLE;
  return readMcAvatarVisibility(window.localStorage);
}

export function setMcAvatarVisible(visible: boolean): void {
  if (typeof window === "undefined") return;

  writeMcAvatarVisibility(window.localStorage, visible);
  document.documentElement.dataset.mcAvatar = visible ? "visible" : "hidden";
  window.dispatchEvent(
    new CustomEvent(MC_AVATAR_VISIBILITY_EVENT, { detail: { visible } }),
  );
}

export function subscribeMcAvatarVisibility(listener: (visible?: boolean) => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onStorageChange: EventListener = () => listener();
  const onCustomChange: EventListener = (event) => {
    const visible = event instanceof CustomEvent && typeof event.detail?.visible === "boolean"
      ? event.detail.visible
      : undefined;
    listener(visible);
  };
  window.addEventListener("storage", onStorageChange);
  window.addEventListener(MC_AVATAR_VISIBILITY_EVENT, onCustomChange);

  return () => {
    window.removeEventListener("storage", onStorageChange);
    window.removeEventListener(MC_AVATAR_VISIBILITY_EVENT, onCustomChange);
  };
}
