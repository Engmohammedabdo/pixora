import { create } from 'zustand';

interface CreditsState {
  balance: number;
  loading: boolean;
  setBalance: (balance: number) => void;
  deductCredits: (amount: number) => void;
  addCredits: (amount: number) => void;
  setLoading: (loading: boolean) => void;
}

export const useCreditsStore = create<CreditsState>((set) => ({
  balance: 0,
  loading: true,
  setBalance: (balance) => set({ balance, loading: false }),
  deductCredits: (amount) =>
    set((state) => ({ balance: Math.max(0, state.balance - amount) })),
  addCredits: (amount) =>
    set((state) => ({ balance: state.balance + amount })),
  setLoading: (loading) => set({ loading }),
}));
