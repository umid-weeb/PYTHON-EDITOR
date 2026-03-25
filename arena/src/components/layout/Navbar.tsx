import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const username = user?.username || "";

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");

  const navButtonClass = (path: string) =>
    `cursor-pointer transition ${isActive(path) ? "text-white font-medium" : "hover:text-white"}`;

  return (
    <header className="fixed top-0 left-0 right-0 z-[10000] flex h-14 items-center justify-between border-b border-gray-800 bg-[#0b1220] px-6">
      <div className="cursor-pointer text-lg font-bold text-white" onClick={() => navigate("/problems")}>
        Pyzone Arena
      </div>
      <nav className="flex items-center gap-4 text-sm text-gray-300">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-gray-200 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
          onClick={() => {
            window.location.href = "/";
          }}
        >
          <span aria-hidden="true">{"<-"}</span>
          <span>Back to Editor</span>
        </button>
        <button type="button" className={navButtonClass("/problems")} onClick={() => navigate("/problems")}>
          Problems
        </button>
        <button type="button" className={navButtonClass("/roadmap")} onClick={() => navigate("/roadmap")}>
          Roadmap
        </button>
        <button type="button" className={navButtonClass("/contest")} onClick={() => navigate("/contest")}>
          Contest
        </button>
        <button type="button" className={navButtonClass("/leaderboard")} onClick={() => navigate("/leaderboard")}>
          Leaderboard
        </button>
        {username ? (
          <>
            <button
              type="button"
              className={navButtonClass("/profile")}
              onClick={() => navigate(`/profile/${encodeURIComponent(username)}`)}
            >
              Profile
            </button>
            <button
              type="button"
              className="cursor-pointer transition hover:text-white"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <button type="button" className="cursor-pointer transition hover:text-white" onClick={() => navigate("/login")}>
              Login
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-full bg-arena-primary/20 px-4 py-1.5 text-arena-primaryStrong transition hover:bg-arena-primary/30 hover:text-white"
              onClick={() => navigate("/register")}
            >
              Sign up
            </button>
          </>
        )}
      </nav>
    </header>
  );
}
