import { Group as ResizablePanelGroup, Panel } from "react-resizable-panels";
import { useSplitLayout } from "../../hooks/useSplitLayout.js";
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
  const rootLayout = useSplitLayout({ 
    id: isMobile ? "arena-workspace-mobile-v1" : "arena-workspace-panels-v1", 
    defaultLayout: isMobile ? [40, 60] : [48, 52] 
  });
  const rightLayout = useSplitLayout({ id: "arena-right-column-v5", defaultLayout: [56, 44] });
  const bottomLayout = useSplitLayout({ id: "arena-bottom-row-v5", defaultLayout: [50, 50] });

  return (
    <div className="mx-auto flex h-[calc(100vh-var(--h-navbar)-16px)] w-[min(1500px,calc(100vw-20px))] max-w-full flex-col py-[10px] max-[860px]:w-[min(100vw-12px,100%)]">
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <ResizablePanelGroup
          className="h-full min-h-0 min-w-0"
          defaultLayout={rootLayout.defaultLayout}
          onLayoutChanged={rootLayout.onLayoutChanged}
          orientation={isMobile ? "vertical" : "horizontal"}
        >
          <Panel defaultSize={48} maxSize={isMobile ? 100 : 70} minSize={isMobile ? 0 : 26}>
            <Surface>{viewer}</Surface>
          </Panel>
          <ResizeHandle id="arena-main-handle" orientation={isMobile ? "horizontal" : "vertical"} />
          <Panel defaultSize={52} maxSize={74} minSize={28}>
            <ResizablePanelGroup
              className="h-full min-h-0 min-w-0"
              defaultLayout={rightLayout.defaultLayout}
              onLayoutChanged={rightLayout.onLayoutChanged}
              orientation="vertical"
            >
              <Panel defaultSize={56} maxSize={82} minSize={24}>
                <Surface>{editor}</Surface>
              </Panel>
              <ResizeHandle id="arena-editor-result-handle" orientation="horizontal" />
              <Panel defaultSize={44} maxSize={70} minSize={16}>
                <ResizablePanelGroup
                  className="h-full min-h-0 min-w-0"
                  defaultLayout={bottomLayout.defaultLayout}
                  onLayoutChanged={bottomLayout.onLayoutChanged}
                  orientation="horizontal"
                >
                  <Panel defaultSize={50} maxSize={76} minSize={20}>
                    <Surface>{testCases}</Surface>
                  </Panel>
                  <ResizeHandle id="arena-tests-result-handle" orientation="vertical" />
                  <Panel defaultSize={50} maxSize={80} minSize={20}>
                    <Surface>{result}</Surface>
                  </Panel>
                </ResizablePanelGroup>
              </Panel>
            </ResizablePanelGroup>
          </Panel>
        </ResizablePanelGroup>
      </div>

      {authModal}
    </div>
  );
}
