import { Group as ResizablePanelGroup, Panel, useDefaultLayout } from "react-resizable-panels";
import ResizeHandle from "./ResizeHandle.jsx";

function Surface({ children }) {
  return (
    <div className="h-full min-h-0 min-w-0 overflow-hidden border border-[color:var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-md)] backdrop-blur-[10px]">
      {children}
    </div>
  );
}

export default function ArenaLayout({
  sidebar,
  viewer,
  editor,
  testCases,
  result,
  authModal,
}) {
  const rootLayout = useDefaultLayout({ id: "arena-root-panels" });
  const rightLayout = useDefaultLayout({ id: "arena-right-column" });
  const bottomLayout = useDefaultLayout({ id: "arena-bottom-row" });

  return (
    <div className="mx-auto flex h-[calc(100vh-var(--h-navbar)-16px)] w-[min(1500px,calc(100vw-20px))] max-w-full flex-col py-[10px] max-[860px]:w-[min(100vw-12px,100%)]">
      <div className="min-h-0 flex-1 overflow-hidden">
        <ResizablePanelGroup
          className="h-full min-h-0"
          defaultLayout={rootLayout.defaultLayout}
          onLayoutChanged={rootLayout.onLayoutChanged}
          orientation="horizontal"
        >
          <Panel defaultSize={21} maxSize={30} minSize={16}>
            <Surface>{sidebar}</Surface>
          </Panel>
          <ResizeHandle orientation="vertical" />
          <Panel defaultSize={31} minSize={22}>
            <Surface>{viewer}</Surface>
          </Panel>
          <ResizeHandle orientation="vertical" />
          <Panel defaultSize={48} minSize={30}>
            <ResizablePanelGroup
              className="h-full min-h-0"
              defaultLayout={rightLayout.defaultLayout}
              onLayoutChanged={rightLayout.onLayoutChanged}
              orientation="vertical"
            >
              <Panel defaultSize={63} minSize={38}>
                <Surface>{editor}</Surface>
              </Panel>
              <ResizeHandle orientation="horizontal" />
              <Panel defaultSize={37} minSize={22}>
                <ResizablePanelGroup
                  className="h-full min-h-0"
                  defaultLayout={bottomLayout.defaultLayout}
                  onLayoutChanged={bottomLayout.onLayoutChanged}
                  orientation="horizontal"
                >
                  <Panel defaultSize={48} minSize={24}>
                    <Surface>{testCases}</Surface>
                  </Panel>
                  <ResizeHandle orientation="vertical" />
                  <Panel defaultSize={52} minSize={24}>
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
