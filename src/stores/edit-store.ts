import { atom } from "nanostores";
import { useStore } from "@nanostores/react";

export type EditScope = "main" | "popup" | "panel";

interface EditTarget {
  id: string;
  scope: EditScope;
}

// 框架无关的原子 store：React 组件用 useEditStore()，
// 非 React 代码可直接 editTargetStore.get()/set()。
export const editTargetStore = atom<EditTarget | null>(null);

export function startEdit(id: string, scope: EditScope): void {
  editTargetStore.set({ id, scope });
}

export function cancelEdit(): void {
  editTargetStore.set(null);
}

export function isEditing(id: string, scope: EditScope): boolean {
  const t = editTargetStore.get();
  return t !== null && t.id === id && t.scope === scope;
}

// React 订阅 hook（保持与原 zustand 版相同的使用形态）
export function useEditStore(): {
  editingId: string | null;
  scope: EditScope | null;
  startEdit: (id: string, scope: EditScope) => void;
  cancelEdit: () => void;
  isEditing: (id: string, scope: EditScope) => boolean;
} {
  const target = useStore(editTargetStore);
  return {
    editingId: target?.id ?? null,
    scope: target?.scope ?? null,
    startEdit,
    cancelEdit,
    isEditing,
  };
}
