import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

/**
 * Faqat admin foydalanuvchilar uchun route guard.
 * - Kirilmagan bo'lsa → /login ga yo'naltiradi
 * - Admin emas bo'lsa → /problems ga yo'naltiradi (403)
 */
export default function AdminRoute({ children }) {
  const location = useLocation();
  const { isAuthenticated, isAdmin, status } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/problems" replace />;
  }

  return children;
}
