import { arenaApi, userApi } from "../lib/apiClient.js";

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
  level?: string | null;
  goal?: string | null;
  weekly_hours?: string | null;
  streak?: number;
  longest_streak?: number;
  streak_freeze?: number;
  timezone?: string | null;
  problem_bank_total?: number;
  problem_bank_easy?: number;
  problem_bank_medium?: number;
  problem_bank_hard?: number;
  is_admin?: boolean;
  is_owner?: boolean;
};

export type SubmissionRow = {
  submission_id?: string | null;
  problem_id: string;
  problem_slug?: string | null;
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
  streak: number;
  longest_streak: number;
}> {
  return userApi.getUserStatsById(userId);
}

export async function getUserSubmissionsById(userId: number): Promise<SubmissionRow[]> {
  return userApi.getUserSubmissionsById(userId);
}

function normalizeLiveStatus(payload: {
  status?: string | null;
  verdict?: string | null;
}) {
  const verdict = String(payload.verdict || "").trim();
  const status = String(payload.status || "").trim().toLowerCase();
  if (verdict.toLowerCase() === "accepted") return "accepted";
  if (verdict) return verdict;
  if (status === "completed") return "completed";
  return status || null;
}

export function resolveSubmissionOutcome(submission: {
  status?: string | null;
  verdict?: string | null;
}) {
  return String(submission.verdict || submission.status || "").trim().toLowerCase();
}

function needsLiveRefresh(submission: SubmissionRow) {
  const status = resolveSubmissionOutcome(submission);
  return Boolean(
    submission.submission_id &&
      (!status || status === "pending" || status === "queued" || status === "running" || status === "completed")
  );
}

export async function hydrateSubmissionRows(rows: SubmissionRow[]): Promise<SubmissionRow[]> {
  const pending = rows.filter(needsLiveRefresh).slice(0, 50);
  if (pending.length === 0) return rows;

  const updates = await Promise.all(
    pending.map(async (row) => {
      try {
        const live = await arenaApi.getSubmission(String(row.submission_id));
        return [
          String(row.submission_id),
          {
            status: normalizeLiveStatus(live),
            verdict: live?.verdict || row.verdict || null,
            runtime_ms: live?.runtime_ms ?? row.runtime_ms ?? null,
            memory_kb: live?.memory_kb ?? row.memory_kb ?? null,
          },
        ] as const;
      } catch {
        return [String(row.submission_id), null] as const;
      }
    })
  );

  const updateMap = new Map(updates);
  return rows.map((row) => {
    const key = String(row.submission_id || "");
    const next = updateMap.get(key);
    return next ? { ...row, ...next } : row;
  });
}

