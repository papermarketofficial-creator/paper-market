import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LearningModeState {
  isOn: boolean;
  toggle: () => void;
  setOn: (value: boolean) => void;
}

export const useLearningModeStore = create<LearningModeState>()(
  persist(
    (set) => ({
      isOn: true, // default ON so new users get educational hints
      toggle: () => set((state) => ({ isOn: !state.isOn })),
      setOn: (value) => set({ isOn: value }),
    }),
    {
      name: "paper-market-learning-mode",
    }
  )
);
