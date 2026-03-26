import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import UserMenu from "../UserMenu.tsx";
import ThemeToggle from "../ui/ThemeToggle.tsx";

const NAV_ITEMS = [
  { to: "/problems", label: "Problems" },
  { to: "/roadmap", label: "Roadmap" },
  { to: "/contest", label: "Contest" },
  { to: "/leaderboard", label: "Leaderboard" },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const username = user?.username || "";
  const showBackToProblems = location.pathname.startsWith("/problems/") && location.pathname !== "/problems";

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <header className="fixed inset-x-0 top-0 z-[var(--z-nav)] border-b border-[color:var(--border)] bg-[color:var(--bg-surface)]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[var(--h-navbar)] w-full max-w-[1400px] items-center gap-3 px-4 md:px-5">
        <Link
          className="flex shrink-0 items-center text-[15px] font-bold tracking-[-0.02em] text-[var(--text-primary)]"
          to="/problems"
        >
          Pyzone<span className="text-[var(--accent)]">Arena</span>
        </Link>

        <div className="hidden h-4 w-px shrink-0 bg-[color:var(--border)] md:block" />

        <nav className="flex min-w-0 flex-1 items-center gap-[2px] overflow-x-auto text-[13px]">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.to}
              className={[
                "inline-flex h-[var(--h-navbar)] shrink-0 items-center border-b-2 px-3 transition",
                isActive(item.to)
                  ? "border-[color:var(--accent)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              ].join(" ")}
              type="button"
              onClick={() => navigate(item.to)}
            >
              {item.label}
            </button>
          ))}
          {username ? (
            <button
              className={[
                "inline-flex h-[var(--h-navbar)] shrink-0 items-center border-b-2 px-3 transition",
                isActive("/profile")
                  ? "border-[color:var(--accent)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              ].join(" ")}
              type="button"
              onClick={() => navigate(`/profile/${encodeURIComponent(username)}`)}
            >
              Profile
            </button>
          ) : null}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {showBackToProblems ? (
            <button
              className="hidden h-[var(--h-btn-md)] items-center rounded-[var(--radius-xs)] border border-[color:var(--border)] bg-[var(--bg-subtle)] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] md:inline-flex"
              type="button"
              onClick={() => navigate("/problems")}
            >
              Back to Problems
            </button>
          ) : null}
          <ThemeToggle />
          <UserMenu
            user={user}
            onProfile={() => navigate(`/profile/${encodeURIComponent(username)}`)}
            onRating={() => navigate("/leaderboard")}
            onSettings={() => navigate("/profile/settings")}
            onLogout={async () => {
              await logout();
              navigate("/login");
            }}
            onLogin={() => navigate("/login")}
            onRegister={() => navigate("/register")}
          />
        </div>
      </div>
    </header>
  );
}
