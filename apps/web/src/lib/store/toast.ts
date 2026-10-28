'use client';

import { create } from 'zustand';

export interface ToastItem {
  id: number;
  msg: string;
}

interface ToastState {
  toasts: ToastItem[];
  push(msg: string): void;
  remove(id: number): void;
}

let seq = 0;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (msg) => set((s) => ({ toasts: [...s.toasts, { id: ++seq, msg }] })),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Show a toast from anywhere (event handlers, async callbacks). */
export const toast = (msg: string) => useToasts.getState().push(msg);
