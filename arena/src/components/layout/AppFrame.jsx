import Navbar from "./Navbar.tsx";

export default function AppFrame({ children }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[image:var(--page-background)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_8%,var(--accent-subtle),transparent_20%),radial-gradient(circle_at_84%_12%,rgba(34,197,94,0.08),transparent_18%)] blur-2xl" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:56px_56px] opacity-50 [mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.35),transparent_78%)]" />
      <Navbar />
      <div className="relative z-10 pt-[var(--h-navbar)]">{children}</div>
    </div>
  );
}
