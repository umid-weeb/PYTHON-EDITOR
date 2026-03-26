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
          <Panel defaultSize={16} maxSize={24} minSize={12}>
            <Surface>{sidebar}</Surface>
          </Panel>
          <ResizeHandle orientation="vertical" />
          <Panel defaultSize={28} maxSize={36} minSize={18}>
            <Surface>{viewer}</Surface>
          </Panel>
          <ResizeHandle orientation="vertical" />
          <Panel defaultSize={56} minSize={40}>
            <ResizablePanelGroup
              className="h-full min-h-0"
              defaultLayout={rightLayout.defaultLayout}
              onLayoutChanged={rightLayout.onLayoutChanged}
              orientation="vertical"
            >
              <Panel defaultSize={74} minSize={58}>
                <Surface>{editor}</Surface>
              </Panel>
              <ResizeHandle orientation="horizontal" />
              <Panel defaultSize={26} maxSize={34} minSize={16}>
                <ResizablePanelGroup
                  className="h-full min-h-0"
                  defaultLayout={bottomLayout.defaultLayout}
                  onLayoutChanged={bottomLayout.onLayoutChanged}
                  orientation="horizontal"
                >
                  <Panel defaultSize={44} minSize={26}>
                    <Surface>{testCases}</Surface>
                  </Panel>
                  <ResizeHandle orientation="vertical" />
                  <Panel defaultSize={56} minSize={26}>
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
