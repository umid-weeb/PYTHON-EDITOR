import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DashboardShell from "../../components/layout/DashboardShell.jsx";
import Avatar from "../../components/profile/Avatar";
import RatingBadge from "../../components/profile/RatingBadge";
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
  getUserSubmissionsById,
  type PublicProfile,
  type SubmissionRow,
} from "../../services/profileService";

type ActivityRow = { date: string; count: number };
type FeedTab = "recent-ac" | "all";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function isAcceptedSubmission(submission: SubmissionRow) {
  return String(submission.status || submission.verdict || "").toLowerCase().includes("accepted");
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
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-3 last:border-b-0">
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
          ? "border-white/15 bg-white/10 text-arena-text"
          : "border-white/10 bg-[#0b1220] text-arena-muted hover:bg-white/5 hover:text-arena-text",
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
  const { user: authedUser } = useAuth();
  const isOwnProfile = Boolean(authedUser?.username && authedUser.username === username);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [feedTab, setFeedTab] = useState<FeedTab>("recent-ac");

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

        if (!cancelled) {
          setProfile(publicProfile);
          setActivity(activityRows || []);
          setSubmissions(submissionRows || []);
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
  const visibleActivity = activity.length ? activity : derivedActivity;
  const activityDays = useMemo(() => buildActivityHeatmap(visibleActivity), [visibleActivity]);
  const fullYearActivity = useMemo(() => buildFullYearHeatmap(visibleActivity), [visibleActivity]);
  const acceptance = useMemo(() => calculateAcceptanceRate(submissions), [submissions]);
  const derivedCurrentStreak = useMemo(() => calculateCurrentStreak(activityDays), [activityDays]);
  const derivedBestStreak = useMemo(() => calculateBestStreak(activityDays), [activityDays]);
  const currentStreak = Number(profile?.streak ?? derivedCurrentStreak ?? 0);
  const bestStreak = Number(profile?.longest_streak ?? derivedBestStreak ?? 0);

  const problemTotals = useMemo(
    () => ({
      easy: { solved: Number(profile?.solved_easy ?? 0), total: 150 },
      medium: { solved: Number(profile?.solved_medium ?? 0), total: 300 },
      hard: { solved: Number(profile?.solved_hard ?? 0), total: 150 },
    }),
    [profile],
  );

  const totalSubmissions = useMemo(
    () => fullYearActivity.reduce((sum, day) => sum + day.count, 0),
    [fullYearActivity],
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
  const badgeSummary = useMemo(() => buildBadgeSummary(profile, bestStreak), [profile, bestStreak]);

  return (
    <DashboardShell
      eyebrow="Profile"
      title={`@${username}`}
      subtitle={isOwnProfile ? "Track your Arena progress, streaks, and badges." : "Public Arena profile and competitive stats."}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-arena-text hover:bg-white/10"
            to={`/profile/${encodeURIComponent(username)}/submissions`}
          >
            View submissions
          </Link>
          {isOwnProfile ? (
            <Link
              className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-arena-text hover:bg-white/10"
              to="/profile/settings"
            >
              Edit profile
            </Link>
          ) : null}
        </div>
      }
    >
      {status === "loading" ? (
        <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-12">
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
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-arena-muted">Failed to load profile.</div>
      ) : null}

      {status === "ready" && profile ? (
        <div className="space-y-6">
          <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
            <article className="rounded-3xl border border-white/10 bg-[#121826] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
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

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-arena-muted">
                    Community Stats
                  </div>
                  <div className="mt-2">
                    <InfoRow label="Solved" value={Number(profile.solved_total || 0)} />
                    <InfoRow label="Submissions" value={totalSubmissions} />
                    <InfoRow label="Acceptance" value={acceptance != null ? `${acceptance}%` : "--"} />
                    <InfoRow label="Current streak" value={`${currentStreak} days`} />
                    <InfoRow label="Best streak" value={`${bestStreak} days`} />
                    <InfoRow label="Joined" value={formatJoinedDate(profile.created_at)} />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-arena-muted">
                    Languages
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {languages.length ? (
                      languages.map(([language, count]) => (
                        <span
                          key={language}
                          className="inline-flex items-center rounded-full border border-white/10 bg-[#0b1220] px-3 py-1 text-sm text-arena-text"
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

            <article className="rounded-3xl border border-white/10 bg-[#121826] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="flex items-center justify-center">
                  <CircularProgress data={problemTotals} size={230} />
                </div>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                    <div className="text-sm font-semibold text-emerald-300">Easy</div>
                    <div className="mt-1 text-xl font-bold text-arena-text">
                      {problemTotals.easy.solved}/{problemTotals.easy.total}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3">
                    <div className="text-sm font-semibold text-amber-300">Medium</div>
                    <div className="mt-1 text-xl font-bold text-arena-text">
                      {problemTotals.medium.solved}/{problemTotals.medium.total}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3">
                    <div className="text-sm font-semibold text-rose-300">Hard</div>
                    <div className="mt-1 text-xl font-bold text-arena-text">
                      {problemTotals.hard.solved}/{problemTotals.hard.total}
                    </div>
                  </div>
                </div>
              </div>
            </article>

            <article className="rounded-3xl border border-white/10 bg-[#121826] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
              <div className="flex h-full flex-col justify-between gap-5">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.12em] text-arena-muted">Badges</div>
                  <div className="mt-4 text-5xl font-bold tracking-[-0.05em] text-arena-text">{badgeSummary.earned}</div>
                  <div className="mt-2 text-sm text-arena-muted">Earned milestone badges</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-arena-muted">
                    Featured Badge
                  </div>
                  <div className="mt-3 text-xl font-semibold text-arena-text">{badgeSummary.title}</div>
                  <div className="mt-2 text-sm leading-relaxed text-arena-muted">{badgeSummary.description}</div>
                </div>
              </div>
            </article>
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#121826] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
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
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-arena-muted">
                  Total active days: <span className="font-medium text-arena-text">{activeDays}</span>
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-arena-muted">
                  Max streak: <span className="font-medium text-arena-text">{bestStreak}</span>
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-arena-muted">
                  Current: <span className="font-medium text-arena-text">{currentStreak}</span>
                </span>
              </div>
            </div>
            <ActivityHeatmap days={fullYearActivity} totalSubmissions={totalSubmissions} />
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#121826] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <BadgeDisplay
              solvedCount={Number(profile.solved_total || 0)}
              currentStreak={currentStreak}
              bestStreak={bestStreak}
              easySolved={Number(profile.solved_easy || 0)}
              mediumSolved={Number(profile.solved_medium || 0)}
              hardSolved={Number(profile.solved_hard || 0)}
            />
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#121826] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
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

            <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]">
              {visibleSubmissions.slice(0, 10).map((submission, index) => {
                const accepted = isAcceptedSubmission(submission);
                return (
                  <div
                    key={`${submission.problem_id}-${index}`}
                    className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-white/5 sm:flex-row sm:items-center sm:justify-between"
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
                        accepted ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300",
                      )}
                    >
                      {accepted ? "Accepted" : statValue(submission.status || submission.verdict, "Pending")}
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
