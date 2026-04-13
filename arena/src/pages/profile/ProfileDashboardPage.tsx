import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DashboardShell from "../../components/layout/DashboardShell.jsx";
import Avatar from "../../components/profile/Avatar";
import CircularProgress from "../../components/profile/CircularProgress";
import ActivityHeatmap from "../../components/profile/ActivityHeatmap";
import BadgeDisplay from "../../components/profile/BadgeDisplay";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  buildActivityHeatmap,
  calculateAcceptanceRate,
  calculateBestStreak,
  calculateCurrentStreak,
  formatJoinedDate,
} from "../../lib/formatters.js";
import {
  getMyActivity,
  getMySubmissions,
  getPublicProfile,
  hydrateSubmissionRows,
  getUserSubmissionsById,
  resolveSubmissionOutcome,
  type PublicProfile,
  type SubmissionRow,
} from "../../services/profileService";

type ActivityRow = { date: string; count: number };
type FeedTab = "recent-ac" | "all";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function isAcceptedSubmission(submission: SubmissionRow) {
  return resolveSubmissionOutcome(submission).includes("accepted");
}

function deriveActivityFromSubmissions(submissions: SubmissionRow[]): ActivityRow[] {
  const counts = new Map<string, number>();
  submissions.forEach((submission) => {
    const iso = String(submission.created_at || "").slice(0, 10);
    if (!iso) return;
    counts.set(iso, (counts.get(iso) || 0) + 1);
  });

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, count]) => ({ date, count }));
}

function deriveSolvedStats(submissions: SubmissionRow[]) {
  const accepted = new Map<string, string>();

  submissions.forEach((submission) => {
    const status = resolveSubmissionOutcome(submission);
    if (!status.includes("accepted")) return;
    if (!submission.problem_id) return;
    if (!accepted.has(submission.problem_id)) {
      accepted.set(submission.problem_id, String(submission.difficulty || "").toLowerCase());
    }
  });

  let easy = 0;
  let medium = 0;
  let hard = 0;

  accepted.forEach((difficulty) => {
    if (difficulty === "easy") easy += 1;
    else if (difficulty === "medium") medium += 1;
    else if (difficulty === "hard") hard += 1;
  });

  return {
    total: accepted.size,
    easy,
    medium,
    hard,
  };
}

function buildFullYearHeatmap(activity: ActivityRow[]) {
  const counts = new Map<string, number>();
  activity.forEach((entry) => {
    if (entry?.date) {
      counts.set(entry.date.slice(0, 10), Number(entry.count || 0));
    }
  });

  const days = [];
  const today = new Date();
  for (let index = 364; index >= 0; index -= 1) {
    const current = new Date(today);
    current.setDate(today.getDate() - index);
    const iso = current.toISOString().slice(0, 10);
    const count = counts.get(iso) || 0;
    days.push({
      date: iso,
      count,
      level: count >= 5 ? 4 : count >= 3 ? 3 : count >= 2 ? 2 : count >= 1 ? 1 : 0,
    });
  }
  return days;
}

function rankLabel(rank?: number | null) {
  if (!rank || rank <= 0) return "Unranked";
  return `Rank #${rank.toLocaleString()}`;
}

function statValue(value: string | number | null | undefined, fallback = "--") {
  if (value == null || value === "") return fallback;
  return value;
}

function buildBadgeSummary(profile: PublicProfile | null, bestStreak: number) {
  const solved = Number(profile?.solved_total || 0);
  const easy = Number(profile?.solved_easy || 0);
  const medium = Number(profile?.solved_medium || 0);
  const hard = Number(profile?.solved_hard || 0);

  const earned = [
    solved >= 1,
    solved >= 10,
    solved >= 50,
    solved >= 100,
    bestStreak >= 7,
    bestStreak >= 30,
    easy >= 20,
    medium >= 15,
    hard >= 10,
  ].filter(Boolean).length;

  if (hard >= 10) {
    return { earned, title: "Hardcore", description: "Solved 10 hard problems." };
  }
  if (bestStreak >= 30) {
    return { earned, title: "Unstoppable", description: "Maintained a 30 day streak." };
  }
  if (solved >= 100) {
    return { earned, title: "Centurion", description: "Solved 100 problems." };
  }
  if (medium >= 15) {
    return { earned, title: "Getting Serious", description: "Cleared 15 medium problems." };
  }
  if (easy >= 20) {
    return { earned, title: "Easy Mode", description: "Built a strong easy-problem base." };
  }
  if (solved >= 10) {
    return { earned, title: "Warming Up", description: "Solved 10 problems." };
  }
  if (solved >= 1) {
    return { earned, title: "First Blood", description: "Completed the first accepted solution." };
  }
  return { earned, title: "No badges yet", description: "Solve problems to unlock milestone badges." };
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--arena-border)]/30 py-3 last:border-b-0">
      <span className="text-sm text-arena-muted">{label}</span>
      <span className="text-sm font-medium text-arena-text">{value}</span>
    </div>
  );
}

function FeedTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cx(
        "rounded-xl border px-4 py-2 text-sm font-medium transition",
        active
          ? "border-[var(--arena-border-strong)] bg-[var(--arena-surface-strong)] text-arena-text"
          : "border-[var(--arena-border)] bg-[var(--arena-surface)] text-arena-muted hover:bg-[var(--arena-surface-soft)] hover:text-arena-text",
      )}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default function ProfileDashboardPage() {
  const { username = "" } = useParams();
  const { user: authedUser, isAdmin, isOwner } = useAuth();
  const isOwnProfile = Boolean(authedUser?.username && authedUser.username === username);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [feedTab, setFeedTab] = useState<FeedTab>("recent-ac");

  // Admin action modal (only visible to owner)
  const [adminModal, setAdminModal] = useState<"add" | "remove" | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMsg, setAdminMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const adminPassRef = useRef<HTMLInputElement>(null);

  async function handleAdminAction() {
    if (!adminPassword || !profile) return;
    setAdminLoading(true);
    try {
      const { adminApi } = await import("../../lib/adminApiClient.js");
      if (adminModal === "add") {
        await adminApi.team.add({
          identifier: profile.username,
          password: adminPassword,
          permissions: { can_manage_problems: true, can_view_users: true, can_manage_admins: false },
        });
        setAdminMsg({ text: `${profile.username} admin qilindi!`, ok: true });
        setProfile((p) => p ? { ...p, is_admin: true } : p);
      } else {
        await adminApi.team.remove(profile.id, adminPassword);
        setAdminMsg({ text: `${profile.username} admin huquqidan mahrum qilindi.`, ok: true });
        setProfile((p) => p ? { ...p, is_admin: false, is_owner: false } : p);
      }
      setAdminModal(null);
      setAdminPassword("");
      setTimeout(() => setAdminMsg(null), 4000);
    } catch (err: any) {
      setAdminMsg({ text: err.message || "Xato yuz berdi", ok: false });
      setTimeout(() => setAdminMsg(null), 4000);
      setAdminModal(null);
    } finally {
      setAdminLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      try {
        const publicProfile = await getPublicProfile(username);
        const [activityRows, submissionRows] = await Promise.all([
          isOwnProfile ? getMyActivity().catch(() => []) : Promise.resolve([]),
          isOwnProfile
            ? getMySubmissions().catch(() => [])
            : getUserSubmissionsById(publicProfile.id).catch(() => []),
        ]);
        const hydratedSubmissions = await hydrateSubmissionRows(submissionRows || []);

        if (!cancelled) {
          setProfile(publicProfile);
          setActivity(activityRows || []);
          setSubmissions(hydratedSubmissions);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isOwnProfile, username]);

  const derivedActivity = useMemo(() => deriveActivityFromSubmissions(submissions), [submissions]);
  const derivedSolved = useMemo(() => deriveSolvedStats(submissions), [submissions]);
  const visibleActivity = activity.length ? activity : derivedActivity;
  const activityDays = useMemo(() => buildActivityHeatmap(visibleActivity), [visibleActivity]);
  const fullYearActivity = useMemo(() => buildFullYearHeatmap(visibleActivity), [visibleActivity]);
  const acceptance = useMemo(() => calculateAcceptanceRate(submissions), [submissions]);
  const derivedCurrentStreak = useMemo(() => calculateCurrentStreak(activityDays), [activityDays]);
  const derivedBestStreak = useMemo(() => calculateBestStreak(activityDays), [activityDays]);
  const currentStreak = Number(profile?.streak ?? derivedCurrentStreak ?? 0);
  const bestStreak = Number(profile?.longest_streak ?? derivedBestStreak ?? 0);

  const solvedTotals = useMemo(
    () => ({
      total: Math.max(Number(profile?.solved_total ?? 0), derivedSolved.total),
      easy: Math.max(Number(profile?.solved_easy ?? 0), derivedSolved.easy),
      medium: Math.max(Number(profile?.solved_medium ?? 0), derivedSolved.medium),
      hard: Math.max(Number(profile?.solved_hard ?? 0), derivedSolved.hard),
    }),
    [derivedSolved.easy, derivedSolved.hard, derivedSolved.medium, derivedSolved.total, profile],
  );

  const problemTotals = useMemo(
    () => ({
      easy: { solved: solvedTotals.easy, total: Number(profile?.problem_bank_easy ?? 0) },
      medium: { solved: solvedTotals.medium, total: Number(profile?.problem_bank_medium ?? 0) },
      hard: { solved: solvedTotals.hard, total: Number(profile?.problem_bank_hard ?? 0) },
    }),
    [
      profile?.problem_bank_easy,
      profile?.problem_bank_hard,
      profile?.problem_bank_medium,
      solvedTotals.easy,
      solvedTotals.hard,
      solvedTotals.medium,
    ],
  );

  const totalSubmissions = useMemo(
    () => Math.max(submissions.length, fullYearActivity.reduce((sum, day) => sum + day.count, 0)),
    [fullYearActivity, submissions.length],
  );

  const activeDays = useMemo(
    () => fullYearActivity.filter((day) => day.count > 0).length,
    [fullYearActivity],
  );

  const languages = useMemo(() => {
    const counts = new Map<string, number>();
    submissions.forEach((submission) => {
      const language = String(submission.language || "").trim();
      if (!language) return;
      counts.set(language, (counts.get(language) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5);
  }, [submissions]);

  const acceptedSubmissions = useMemo(
    () => submissions.filter((submission) => isAcceptedSubmission(submission)),
    [submissions],
  );

  const visibleSubmissions = feedTab === "recent-ac" ? acceptedSubmissions : submissions;
  const badgeSummary = useMemo(
    () =>
      buildBadgeSummary(
        profile
          ? {
              ...profile,
              solved_total: solvedTotals.total,
              solved_easy: solvedTotals.easy,
              solved_medium: solvedTotals.medium,
              solved_hard: solvedTotals.hard,
            }
          : null,
        bestStreak,
      ),
    [bestStreak, profile, solvedTotals.easy, solvedTotals.hard, solvedTotals.medium, solvedTotals.total],
  );

  const canManageThisUser = isOwner && !isOwnProfile && !profile?.is_owner;

  return (
    <DashboardShell
      eyebrow="Profile"
      title={`@${username}`}
      subtitle={isOwnProfile ? "Track your Arena progress, streaks, and badges." : "Public Arena profile and competitive stats."}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {/* Admin toast message */}
          {adminMsg && (
            <span className={`text-xs px-3 py-1.5 rounded-full ${adminMsg.ok ? "text-green-400 bg-green-400/10 border border-green-400/20" : "text-red-400 bg-red-400/10 border border-red-400/20"}`}>
              {adminMsg.text}
            </span>
          )}

          <Link
            className="inline-flex items-center rounded-full border border-[var(--arena-border)] bg-[var(--arena-surface)] px-4 py-2 text-sm font-medium text-arena-text hover:bg-[var(--arena-surface-strong)]"
            to={`/profile/${encodeURIComponent(username)}/submissions`}
          >
            View submissions
          </Link>
          {isOwnProfile ? (
            <Link
              className="inline-flex items-center rounded-full border border-[var(--arena-border)] bg-[var(--arena-surface)] px-4 py-2 text-sm font-medium text-arena-text hover:bg-[var(--arena-surface-strong)]"
              to="/profile/settings"
            >
              Edit profile
            </Link>
          ) : null}
          {isOwnProfile && isAdmin ? (
            <Link
              className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/40 bg-purple-900/20 px-4 py-2 text-sm font-medium text-purple-300 hover:bg-purple-800/30 hover:border-purple-400/60 transition-colors"
              to="/admin/problems"
            >
              ⚙ Admin Panel
            </Link>
          ) : null}

          {/* Owner: add/remove admin button on other profiles */}
          {canManageThisUser && status === "ready" ? (
            profile?.is_admin ? (
              <button
                onClick={() => { setAdminModal("remove"); setAdminPassword(""); setTimeout(() => adminPassRef.current?.focus(), 50); }}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-900/20 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-800/30 transition-colors"
              >
                Admin olib tashlash
              </button>
            ) : (
              <button
                onClick={() => { setAdminModal("add"); setAdminPassword(""); setTimeout(() => adminPassRef.current?.focus(), 50); }}
                className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-900/20 px-4 py-2 text-sm font-medium text-blue-300 hover:bg-blue-800/30 transition-colors"
              >
                + Admin qilish
              </button>
            )
          ) : null}
        </div>
      }
    >
      {/* Admin password modal */}
      {adminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">
              {adminModal === "add" ? `@${profile?.username} ni admin qilish` : `@${profile?.username} dan admin huquqini olish`}
            </h3>
            <p className="text-sm text-gray-400 mb-4">Admin panel parolini kiriting</p>
            <input
              ref={adminPassRef}
              type="password"
              placeholder="Admin panel paroli"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdminAction()}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAdminModal(null)} className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-lg text-sm transition-colors">
                Bekor
              </button>
              <button
                onClick={handleAdminAction}
                disabled={adminLoading || !adminPassword}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 text-white ${adminModal === "add" ? "bg-blue-600 hover:bg-blue-500" : "bg-red-600 hover:bg-red-500"}`}
              >
                {adminLoading ? "..." : adminModal === "add" ? "Admin qilish" : "Olib tashlash"}
              </button>
            </div>
          </div>
        </div>
      )}
      {status === "loading" ? (
        <div className="flex items-center justify-center rounded-2xl border border-[var(--arena-border)] bg-[var(--arena-surface)] p-12 backdrop-blur-md">
          <div className="flex items-center gap-3 text-arena-muted">
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Loading profile...
          </div>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="rounded-2xl border border-[var(--arena-border)] bg-[var(--arena-surface)] p-6 text-arena-muted backdrop-blur-md">Failed to load profile.</div>
      ) : null}

      {status === "ready" && profile ? (
        <div className="space-y-6">
          <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
            <article className="rounded-3xl border border-[var(--arena-border)] bg-[var(--arena-surface)] p-6 shadow-[var(--arena-shadow)] backdrop-blur-md">
              <div className="flex flex-col gap-5">
                <div className="flex items-center gap-4">
                  <Avatar username={profile.username} src={profile.avatar_url || null} size="lg" />
                  <div className="min-w-0">
                    <div className="truncate text-2xl font-bold tracking-[-0.04em] text-arena-text">
                      {profile.display_name || profile.username}
                    </div>
                    <div className="mt-1 truncate text-sm text-arena-muted">@{profile.username}</div>
                    <div className="mt-3 text-lg font-semibold text-arena-text">{rankLabel(profile.global_rank)}</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--arena-border)] bg-[var(--arena-surface-soft)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-arena-muted">
                    Community Stats
                  </div>
                  <div className="mt-2">
                    <InfoRow label="Solved" value={solvedTotals.total} />
                    <InfoRow label="Submissions" value={totalSubmissions} />
                    <InfoRow label="Acceptance" value={acceptance != null ? `${acceptance}%` : "--"} />
                    <InfoRow label="Current streak" value={`${currentStreak} days`} />
                    <InfoRow label="Best streak" value={`${bestStreak} days`} />
                    <InfoRow label="Joined" value={formatJoinedDate(profile.created_at)} />
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--arena-border)] bg-[var(--arena-surface-soft)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-arena-muted">
                    Languages
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {languages.length ? (
                      languages.map(([language, count]) => (
                        <span
                          key={language}
                          className="inline-flex items-center rounded-full border border-[var(--arena-border)] bg-[var(--arena-surface-strong)] px-3 py-1 text-sm text-arena-text"
                        >
                          {language} <span className="ml-2 text-arena-muted">{count}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-arena-muted">No submission language data yet.</span>
                    )}
                  </div>
                  {profile.bio ? <p className="mt-4 text-sm leading-relaxed text-arena-text/80">{profile.bio}</p> : null}
                </div>
              </div>
            </article>

            <article className="rounded-3xl border border-[var(--arena-border)] bg-[var(--arena-surface)] p-6 shadow-[var(--arena-shadow)] backdrop-blur-md">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="flex items-center justify-center">
                  <CircularProgress data={problemTotals} size={230} />
                </div>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-[var(--arena-success)]/20 bg-[var(--arena-success)]/10 px-4 py-3">
                    <div className="text-sm font-semibold text-[var(--arena-success)]">Easy</div>
                    <div className="mt-1 text-xl font-bold text-arena-text">
                      {problemTotals.easy.solved}/{problemTotals.easy.total}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--arena-warning)]/20 bg-[var(--arena-warning)]/10 px-4 py-3">
                    <div className="text-sm font-semibold text-[var(--arena-warning)]">Medium</div>
                    <div className="mt-1 text-xl font-bold text-arena-text">
                      {problemTotals.medium.solved}/{problemTotals.medium.total}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--arena-danger)]/20 bg-[var(--arena-danger)]/10 px-4 py-3">
                    <div className="text-sm font-semibold text-[var(--arena-danger)]">Hard</div>
                    <div className="mt-1 text-xl font-bold text-arena-text">
                      {problemTotals.hard.solved}/{problemTotals.hard.total}
                    </div>
                  </div>
                </div>
              </div>
            </article>

            <article className="rounded-3xl border border-[var(--arena-border)] bg-[var(--arena-surface)] p-6 shadow-[var(--arena-shadow)] backdrop-blur-md">
              <div className="flex h-full flex-col justify-between gap-5">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.12em] text-arena-muted">Badges</div>
                  <div className="mt-4 text-5xl font-bold tracking-[-0.05em] text-arena-text">{badgeSummary.earned}</div>
                  <div className="mt-2 text-sm text-arena-muted">Earned milestone badges</div>
                </div>

                <div className="rounded-2xl border border-[var(--arena-border)] bg-[var(--arena-surface-soft)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-arena-muted">
                    Featured Badge
                  </div>
                  <div className="mt-3 text-xl font-semibold text-arena-text">{badgeSummary.title}</div>
                  <div className="mt-2 text-sm leading-relaxed text-arena-muted">{badgeSummary.description}</div>
                </div>
              </div>
            </article>
          </section>

          <section className="rounded-3xl border border-[var(--arena-border)] bg-[var(--arena-surface)] p-6 shadow-[var(--arena-shadow)] backdrop-blur-md">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-arena-text">
                  {totalSubmissions} submissions in the past year
                </div>
                <div className="mt-1 text-sm text-arena-muted">
                  Visual activity by day for this profile.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full border border-[var(--arena-border)] bg-[var(--arena-surface-soft)] px-3 py-1 text-arena-muted">
                  Total active days: <span className="font-medium text-arena-text">{activeDays}</span>
                </span>
                <span className="rounded-full border border-[var(--arena-border)] bg-[var(--arena-surface-soft)] px-3 py-1 text-arena-muted">
                  Max streak: <span className="font-medium text-arena-text">{bestStreak}</span>
                </span>
                <span className="rounded-full border border-[var(--arena-border)] bg-[var(--arena-surface-soft)] px-3 py-1 text-arena-muted">
                  Current: <span className="font-medium text-arena-text">{currentStreak}</span>
                </span>
              </div>
            </div>
            <ActivityHeatmap days={fullYearActivity} totalSubmissions={totalSubmissions} />
          </section>

          <section className="rounded-3xl border border-[var(--arena-border)] bg-[var(--arena-surface)] p-6 shadow-[var(--arena-shadow)] backdrop-blur-md">
            <BadgeDisplay
              solvedCount={solvedTotals.total}
              currentStreak={currentStreak}
              bestStreak={bestStreak}
              easySolved={solvedTotals.easy}
              mediumSolved={solvedTotals.medium}
              hardSolved={solvedTotals.hard}
            />
          </section>

          <section className="rounded-3xl border border-[var(--arena-border)] bg-[var(--arena-surface)] p-6 shadow-[var(--arena-shadow)] backdrop-blur-md">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <FeedTabButton active={feedTab === "recent-ac"} label="Recent AC" onClick={() => setFeedTab("recent-ac")} />
                <FeedTabButton active={feedTab === "all"} label="All Submissions" onClick={() => setFeedTab("all")} />
              </div>
              <Link
                className="text-xs font-semibold text-arena-primaryStrong hover:underline"
                to={`/profile/${encodeURIComponent(username)}/submissions`}
              >
                Open detailed table
              </Link>
            </div>

            <div className="divide-y divide-[var(--arena-border)]/30 overflow-hidden rounded-2xl border border-[var(--arena-border)] bg-[var(--arena-surface-strong)]">
              {visibleSubmissions.slice(0, 10).map((submission, index) => {
                const accepted = isAcceptedSubmission(submission);
                return (
                  <div
                    key={`${submission.problem_id}-${index}`}
                    className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-[var(--arena-surface-soft)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-arena-text">
                        {submission.problem_title || submission.problem_id}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-arena-muted">
                        <span>{statValue(submission.language, "Unknown")}</span>
                        <span>|</span>
                        <span>{submission.created_at ? new Date(submission.created_at).toLocaleDateString() : "--"}</span>
                        <span>|</span>
                        <span>{statValue(submission.difficulty, "--")}</span>
                      </div>
                    </div>
                    <div
                      className={cx(
                        "inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-semibold",
                        accepted 
                          ? "bg-[var(--arena-success)]/10 text-[var(--arena-success)] border border-[var(--arena-success)]/20" 
                          : "bg-[var(--arena-danger)]/10 text-[var(--arena-danger)] border border-[var(--arena-danger)]/20",
                      )}
                    >
                      {accepted ? "Accepted" : statValue(submission.verdict || submission.status, "Pending")}
                    </div>
                  </div>
                );
              })}

              {visibleSubmissions.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-arena-muted">
                  {feedTab === "recent-ac"
                    ? "No accepted submissions yet."
                    : "No submissions have been recorded for this user yet."}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
