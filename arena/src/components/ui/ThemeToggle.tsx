import { useTheme } from "../../providers/ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      aria-label={`Switch to ${nextTheme} mode`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-transparent text-[var(--text-secondary)] transition hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
      title={`Switch to ${nextTheme} mode`}
      type="button"
      onClick={toggle}
    >
      {theme === "dark" ? (
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4.25" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 2.5V5.5M12 18.5V21.5M21.5 12H18.5M5.5 12H2.5M18.72 5.28 16.6 7.4M7.4 16.6 5.28 18.72M18.72 18.72 16.6 16.6M7.4 7.4 5.28 5.28"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
        </svg>
      ) : (
        <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.18 14.13A8.5 8.5 0 0 1 9.87 3.82a.75.75 0 0 0-.84-.95A9.75 9.75 0 1 0 21.13 14.97a.75.75 0 0 0-.95-.84Z" />
        </svg>
      )}
    </button>
  );
}
