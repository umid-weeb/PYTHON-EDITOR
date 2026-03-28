import { useResizableSplit } from "../../hooks/useResizableSplit.js";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import ResizeHandle from "./ResizeHandle.jsx";

function Surface({ children }) {
  return (
    <div className="h-full min-h-0 min-w-0 overflow-hidden border border-[color:var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-md)] backdrop-blur-[10px]">
      {children}
    </div>
  );
}

export default function ArenaLayout({
  viewer,
  editor,
  testCases,
  result,
  authModal,
}) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  const root = useResizableSplit({ 
    id: "arena-workspace-panels-v1", 
    defaultRatio: 48,
    direction: isMobile ? "vertical" : "horizontal",
    minPixels: 260,
    disabled: isMobile
  });

  const right = useResizableSplit({ 
    id: "arena-right-column-v5", 
    defaultRatio: 56,
    direction: "vertical",
    minPixels: 150
  });

  const bottom = useResizableSplit({ 
    id: "arena-bottom-row-v5", 
    defaultRatio: 50,
    direction: "horizontal",
    minPixels: 150
  });

  return (
    <div className="mx-auto flex h-[calc(100vh-var(--h-navbar)-16px)] w-[min(1500px,calc(100vw-20px))] max-w-full flex-col py-[10px] max-[860px]:w-[min(100vw-12px,100%)]">
      <div 
        ref={root.containerRef}
        className={`flex flex-1 min-h-0 min-w-0 ${isMobile ? "flex-col overflow-y-auto" : "flex-row overflow-hidden"}`}
      >
        {/* Viewer / Description Area */}
        <div style={{ flex: isMobile ? "0 0 auto" : `${root.ratio} 1 0%`, minHeight: isMobile ? "300px" : 0, minWidth: 0 }}>
          <Surface>{viewer}</Surface>
        </div>

        {!isMobile && (
          <ResizeHandle 
            id="arena-main-handle" 
            orientation="vertical" 
            {...root.handleProps} 
          />
        )}

        {/* Right Pane (Editor + Tests + Results) */}
        <div 
          style={{ flex: isMobile ? "1 1 auto" : `${100 - root.ratio} 1 0%`, minHeight: 0, minWidth: 0 }}
          className="flex flex-col"
        >
          <div ref={right.containerRef} className="flex flex-col flex-1 min-h-0">
            {/* Editor */}
            <div style={{ flex: `${right.ratio} 1 0%`, minHeight: 0 }}>
              <Surface>{editor}</Surface>
            </div>

            <ResizeHandle 
              id="arena-editor-result-handle" 
              orientation="horizontal" 
              {...right.handleProps} 
            />

            {/* Bottom Row (Tests & Result Tabs) */}
            <div 
              style={{ flex: `${100 - right.ratio} 1 0%`, minHeight: 0 }}
              className="flex"
            >
              <div ref={bottom.containerRef} className="flex flex-1 min-h-0">
                <div style={{ flex: `${bottom.ratio} 1 0%`, minWidth: 0 }}>
                  <Surface>{testCases}</Surface>
                </div>

                <ResizeHandle 
                  id="arena-tests-result-handle" 
                  orientation="vertical" 
                  {...bottom.handleProps} 
                />

                <div style={{ flex: `${100 - bottom.ratio} 1 0%`, minWidth: 0 }}>
                  <Surface>{result}</Surface>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {authModal}
    </div>
  );
}
