import { Separator } from "react-resizable-panels";

export default function ResizeHandle({ orientation = "vertical" }) {
  const isVertical = orientation === "vertical";

  return (
    <Separator
      className={[
        "group relative z-[1] flex shrink-0 items-center justify-center transition-colors",
        isVertical ? "w-3 cursor-col-resize" : "h-3 cursor-row-resize",
      ].join(" ")}
    >
      <div
        className={[
          "rounded-[var(--radius-pill)] bg-[var(--border-strong)] transition-colors duration-150 group-hover:bg-[var(--accent)] group-focus:bg-[var(--accent)]",
          isVertical ? "h-full w-[2px]" : "h-[2px] w-full",
        ].join(" ")}
      />
      <div
        className={[
          "pointer-events-none absolute rounded-[var(--radius-pill)] bg-[var(--accent-subtle)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100",
          isVertical ? "h-14 w-[6px]" : "h-[6px] w-14",
        ].join(" ")}
      />
    </Separator>
  );
}
