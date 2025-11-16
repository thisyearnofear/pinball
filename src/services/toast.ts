import { reactive } from 'vue';

export type ToastType = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  text: string;
  type: ToastType;
}

const list = reactive<ToastItem[]>([]);

export function useToasts(): ToastItem[] {
  return list;
}

export function showToast(text: string, type: ToastType = 'info', duration = 4000): void {
  const id = Date.now() + Math.floor(Math.random() * 1000);
  list.push({ id, text, type });
  setTimeout(() => {
    const idx = list.findIndex(t => t.id === id);
    if (idx !== -1) list.splice(idx, 1);
  }, duration);
}