import { Separator } from "react-resizable-panels";

export default function ResizeHandle({ orientation = "vertical" }) {
  const isVertical = orientation === "vertical";

  return (
    <Separator
      className={[
        "group relative flex shrink-0 items-center justify-center transition-colors",
        isVertical ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
      ].join(" ")}
    >
      <div
        className={[
          "bg-[var(--border)] transition-colors duration-150 group-hover:bg-[var(--accent)] group-focus:bg-[var(--accent)]",
          isVertical ? "h-full w-full" : "h-full w-full",
        ].join(" ")}
      />
    </Separator>
  );
}
