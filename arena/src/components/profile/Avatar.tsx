import { useMemo, useState } from "react";
import { API_BASE_URL } from "../../lib/apiClient.js";

type Props = {
  username?: string | null;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function buildInitials(username?: string | null) {
  const source = String(username || "User").trim();
  if (!source) return "U";
  const chunks = source.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (chunks.length >= 2) return `${chunks[0][0]}${chunks[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function resolveSrc(candidate?: string | null) {
  if (!candidate) return "";
  if (candidate.startsWith("http://") || candidate.startsWith("https://") || candidate.startsWith("data:")) {
    return candidate;
  }
  
  // Ensure we have a leading slash for relative paths
  const path = candidate.startsWith("/") ? candidate : `/${candidate}`;
  
  try {
    // API_BASE_URL is imported from apiClient.js
    return `${API_BASE_URL}${path}`;
  } catch {
    return candidate;
  }
}

export default function Avatar({ username, src, size = "md", className }: Props) {
  const [hasError, setHasError] = useState(false);
  const initials = useMemo(() => buildInitials(username), [username]);
  const finalSrc = useMemo(() => resolveSrc(src), [src]);
  const dim = size === "sm" ? "h-9 w-9" : size === "lg" ? "h-20 w-20" : "h-12 w-12";

  const showImage = finalSrc && !hasError;

  return (
    <div
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "border border-white/10 bg-white/5 text-arena-text shadow-[0_18px_60px_rgba(0,0,0,0.45)]",
        dim,
        className
      )}
    >
      {showImage ? (
        <img
          alt={`${username || "User"} avatar`}
          className="h-full w-full object-cover"
          src={finalSrc}
          onError={() => setHasError(true)}
        />
      ) : (
        <span className="text-sm font-semibold tracking-[0.08em]">{initials}</span>
      )}
    </div>
  );
}
