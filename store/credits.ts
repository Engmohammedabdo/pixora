import { create } from 'zustand';

export type CreditsStatus = 'loading' | 'ready' | 'error';

interface CreditsState {
  balance: number;
  status: CreditsStatus;
  /** Timestamp of the last successful write. Used to drop stale writes. */
  updatedAt: number;
  setBalance: (balance: number) => void;
  setError: () => void;
  deductCredits: (amount: number) => void;
  addCredits: (amount: number) => void;
}

export const useCreditsStore = create<CreditsState>((set) => ({
  balance: 0,
  status: 'loading',
  updatedAt: 0,
  setBalance: (balance) => set({ balance, status: 'ready', updatedAt: Date.now() }),
  // Never downgrade a number we already know. A failed background poll must not
  // replace a good balance with an error card — that would flash every 30s on a
  // weak connection. Errors surface only when we never had a number at all.
  setError: () => set((s) => (s.status === 'ready' ? s : { ...s, status: 'error' })),
  deductCredits: (amount) =>
    set((state) => ({ balance: Math.max(0, state.balance - amount), updatedAt: Date.now() })),
  addCredits: (amount) =>
    set((state) => ({ balance: state.balance + amount, updatedAt: Date.now() })),
}));
