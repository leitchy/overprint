import { create } from 'zustand';

interface Toast {
  id: string;
  message: string;
}

interface ToastState {
  toasts: Toast[];
}

interface ToastActions {
  addToast: (message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

let nextId = 0;

export const useToastStore = create<ToastState & ToastActions>()((set) => ({
  toasts: [],

  addToast: (message, duration = 2000) => {
    const id = String(++nextId);
    set((state) => ({ toasts: [...state.toasts, { id, message }] }));
    setTimeout(() => {
      useToastStore.getState().removeToast(id);
    }, duration);
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
