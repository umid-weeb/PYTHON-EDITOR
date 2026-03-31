import { create } from "zustand";

export interface AIReviewData {
  overall_score: number;
  time_complexity: {
    detected: string;
    optimal: string;
    suggestion: string;
  };
  space_complexity: {
    detected: string;
    suggestion: string;
  };
  edge_cases: string[];
  code_style: string[];
  alternative?: string;
}

type ProblemStoreState = {
  aiHint: string | null;
  isHintLoading: boolean;
  aiReview: AIReviewData | null;
  isReviewLoading: boolean;
  setAiHint: (value: string | null) => void;
  setHintLoading: (value: boolean) => void;
  setAiReview: (value: AIReviewData | null) => void;
  setReviewLoading: (value: boolean) => void;
  resetHint: () => void;
};

export const useProblemStore = create<ProblemStoreState>((set) => ({
  aiHint: null,
  isHintLoading: false,
  aiReview: null,
  isReviewLoading: false,
  setAiHint: (value) => set({ aiHint: value }),
  setHintLoading: (value) => set({ isHintLoading: value }),
  setAiReview: (value) => set({ aiReview: value }),
  setReviewLoading: (value) => set({ isReviewLoading: value }),
  resetHint: () => set({ aiHint: null, isHintLoading: false, aiReview: null, isReviewLoading: false }),
}));
