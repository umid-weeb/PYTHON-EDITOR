import { Separator } from "react-resizable-panels";

export default function ResizeHandle({ orientation = "vertical" }) {
  const isVertical = orientation === "vertical";

  return (
    <Separator
      className={[
        "group relative z-[10] flex shrink-0 items-center justify-center transition-colors bg-[var(--bg-surface)] hover:bg-[var(--accent-subtle)]/30",
        isVertical ? "w-2 cursor-col-resize active:transition-none" : "h-2 cursor-row-resize active:transition-none",
      ].join(" ")}
    >
      <div
        className={[
          "rounded-[var(--radius-pill)] bg-[var(--border)] transition-all duration-200 group-hover:bg-[var(--accent)] group-active:bg-[var(--accent)]",
          isVertical ? "h-6 w-[2px] group-hover:h-full group-active:h-full" : "w-6 h-[2px] group-hover:w-full group-active:w-full",
        ].join(" ")}
      />
      
      {/* Invisible larger hit area for easier dragging */}
      <div className={`absolute ${isVertical ? 'w-4 h-full' : 'h-4 w-full'} z-[-1]`} />
    </Separator>
  );
}
