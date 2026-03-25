import { userApi } from "../lib/apiClient.js";

export type PublicProfile = {
  id: number;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  country?: string | null;
  created_at?: string | null;
  solved_total?: number;
  solved_easy?: number;
  solved_medium?: number;
  solved_hard?: number;
  rating?: number | null;
  global_rank?: number | null;
};

export type SubmissionRow = {
  problem_id: string;
  problem_title?: string | null;
  difficulty?: string | null;
  language?: string | null;
  verdict?: string | null;
  status?: string | null;
  runtime_ms?: number | null;
  memory_kb?: number | null;
  created_at?: string | null;
};

export async function getPublicProfile(username: string): Promise<PublicProfile> {
  return userApi.getPublicProfile(username);
}

export async function getMyActivity(): Promise<Array<{ date: string; count: number }>> {
  return userApi.getActivity();
}

export async function getMySubmissions(): Promise<SubmissionRow[]> {
  return userApi.getSubmissions();
}

export async function getUserStatsById(userId: number): Promise<{
  user_id: number;
  username: string;
  solved_count: number;
  easy_solved: number;
  medium_solved: number;
  hard_solved: number;
  rating: number;
}> {
  return userApi.getUserStatsById(userId);
}

export async function getUserSubmissionsById(userId: number): Promise<SubmissionRow[]> {
  return userApi.getUserSubmissionsById(userId);
}

