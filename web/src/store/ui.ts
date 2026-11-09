import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Длительность в мс. 0 — тост останется до закрытия вручную. */
  duration?: number;
}

export interface ToastItem extends Omit<ToastOptions, 'variant'> {
  id: string;
  variant: ToastVariant;
}

interface UiState {
  sidebarOpen: boolean;
  toasts: ToastItem[];
  modal: { id: string; payload?: unknown } | null;

  setSidebarOpen: (open: boolean) => void;
  pushToast: (toast: ToastOptions) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
  openModal: (id: string, payload?: unknown) => void;
  closeModal: () => void;
}

let toastSequence = 0;

function createToastId(): string {
  toastSequence += 1;
  return `toast-${Date.now()}-${toastSequence}`;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  toasts: [],
  modal: null,

  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

  pushToast: (options) => {
    const id = createToastId();
    const toast: ToastItem = {
      id,
      title: options.title,
      description: options.description,
      variant: options.variant ?? 'info',
      duration: options.duration ?? 4500,
    };

    // Держим на экране не больше пяти тостов, чтобы не перекрывать UI.
    set((state) => ({ toasts: [...state.toasts, toast].slice(-5) }));
    return id;
  },

  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  clearToasts: () => set({ toasts: [] }),

  openModal: (id, payload) => set({ modal: { id, payload } }),
  closeModal: () => set({ modal: null }),
}));

/** Императивный API для тостов — удобно вызывать из query-клиента и хуков */
export const toast = {
  success: (title: string, description?: string) =>
    useUiStore.getState().pushToast({ title, description, variant: 'success' }),
  error: (title: string, description?: string) =>
    useUiStore.getState().pushToast({ title, description, variant: 'error', duration: 6000 }),
  warning: (title: string, description?: string) =>
    useUiStore.getState().pushToast({ title, description, variant: 'warning' }),
  info: (title: string, description?: string) =>
    useUiStore.getState().pushToast({ title, description, variant: 'info' }),
};
