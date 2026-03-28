export default function ResizeHandle({ orientation = "vertical", id, ...props }) {
  const isVertical = orientation === "vertical";

  return (
    <div
      id={id}
      className={[
        "group relative flex shrink-0 items-center justify-center bg-[var(--bg-surface)] transition-colors hover:bg-[var(--accent-subtle)]/30",
        isVertical ? "w-2 z-10" : "h-2 z-10",
        props.className || ""
      ].join(" ")}
      {...props}
    >
      <div
        className={[
          "rounded-[var(--radius-pill)] bg-[var(--border)] transition-all duration-200 group-hover:bg-[var(--accent)] group-active:bg-[var(--accent)]",
          isVertical ? "h-8 w-[2px] group-hover:h-full" : "w-8 h-[2px] group-hover:w-full",
        ].join(" ")}
      />
    </div>
  );
}
