export default function ResizeHandle({ orientation = "vertical", id, className = "", ...props }) {
  const isVertical = orientation === "vertical";

  return (
    <div
      id={id}
      className={[
        "group relative flex shrink-0 items-center justify-center rounded-full transition-colors duration-150",
        isVertical ? "z-10 w-4 cursor-col-resize" : "z-10 h-4 cursor-row-resize",
        className,
      ].join(" ")}
      {...props}
    >
      <div
        className={[
          "rounded-full bg-[var(--arena-border)] transition-colors duration-150 group-hover:bg-[var(--arena-border-strong)] group-active:bg-[var(--arena-border-strong)]",
          isVertical ? "h-full w-px" : "h-px w-full",
        ].join(" ")}
      />
    </div>
  );
}
