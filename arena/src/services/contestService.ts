
export type ContestStatus = "upcoming" | "running" | "finished";

export type ContestListItem = {
  id: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  status: ContestStatus;
};

export type ContestProblemItem = {
  problem_id: string;
  problem_slug: string;
  title: string | null;
  difficulty: string | null;
  sort_order: number;
};

export type ContestDetail = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: ContestStatus;
  problems: ContestProblemItem[];
};

export type ContestLeaderboardRow = {
  username: string;
  solved: number;
  penalty_minutes: number;
};

// Deprecated in favor of contestApi in apiClient.js
export const contestService = null as any;
