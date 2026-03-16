import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

export default function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const username = user?.username || "";

  return (
    <header className="fixed top-0 left-0 right-0 z-[10000] flex h-14 items-center justify-between border-b border-gray-800 bg-[#0b1220] px-6">
      <div
        className="cursor-pointer text-lg font-bold text-white"
        onClick={() => navigate("/zone")}
      >
        Pyzone Arena
      </div>
      <nav className="flex items-center gap-6 text-sm text-gray-300">
        <button
          type="button"
          className="cursor-pointer hover:text-white transition"
          onClick={() => navigate("/zone")}
        >
          Problems
        </button>
        {username ? (
          <>
            <button
              type="button"
              className="cursor-pointer hover:text-white transition"
              onClick={() => navigate(`/profile/${encodeURIComponent(username)}`)}
            >
              Profile
            </button>
            <button
              type="button"
              className="cursor-pointer hover:text-white transition"
              onClick={() => navigate("/leaderboard")}
            >
              Rating
            </button>
            <button
              type="button"
              className="cursor-pointer hover:text-white transition"
              onClick={() => navigate("/profile/settings")}
            >
              Settings
            </button>
            <button
              type="button"
              className="cursor-pointer hover:text-white transition"
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
            <button
              type="button"
              className="cursor-pointer hover:text-white transition"
              onClick={() => navigate("/login")}
            >
              Login
            </button>
            <button
              type="button"
              className="cursor-pointer hover:text-white transition"
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

