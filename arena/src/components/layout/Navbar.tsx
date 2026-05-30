import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import UserMenu from "../UserMenu.tsx";

const NAV_ITEMS = [
  { to: "/online-editor", label: "Editor" },
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
  const showExitToMain = location.pathname.startsWith("/problems/") || location.pathname === "/online-editor";

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");
  const navButtonClass = (path: string) =>
    [
      "inline-flex h-14 shrink-0 items-center border-b-2 px-3 text-sm transition",
      isActive(path)
        ? "border-arena-primary font-medium text-white"
        : "border-transparent text-arena-muted hover:text-white",
    ].join(" ");

  return (
    <header className="fixed inset-x-0 top-0 z-[10000] border-b border-arena-border bg-[#0b1220]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1500px] items-center gap-4 px-4 md:px-6">
        <Link className="flex shrink-0 items-center text-lg font-bold text-white" to="/problems">
          Pyzone<span className="text-arena-primary">Arena</span>
        </Link>

        <div className="hidden h-4 w-px shrink-0 bg-arena-border md:block" />

        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.to}
              className={navButtonClass(item.to)}
              type="button"
              onClick={() => navigate(item.to)}
            >
              {item.label}
            </button>
          ))}
          {username ? (
            <button
              className={navButtonClass("/profile")}
              type="button"
              onClick={() => navigate(`/profile/${encodeURIComponent(username)}`)}
            >
              Profile
            </button>
          ) : null}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {showExitToMain ? (
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-gray-200 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              <span aria-hidden="true">{"<-"}</span>
              <span>Asosiy Muharrir</span>
            </a>
          ) : null}
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
