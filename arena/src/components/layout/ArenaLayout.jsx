import { Group as ResizablePanelGroup, Panel } from "react-resizable-panels";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import UserQuickSearch from "../common/UserQuickSearch.jsx";
import ResizeHandle from "./ResizeHandle.jsx";

function Surface({ children }) {
  return (
    <div className="h-full min-h-0 min-w-0 overflow-hidden rounded-[28px] border border-arena-border bg-arena-surface shadow-arena backdrop-blur-[10px]">
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
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  return (
    <div className="mx-auto flex h-screen w-[min(1500px,calc(100vw-20px))] max-w-full flex-col overflow-hidden py-[18px] max-[860px]:w-[min(100vw-12px,100%)]">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-[18px] max-[860px]:flex-col max-[860px]:items-stretch">
        <div className="flex items-center gap-4">
          <button
            className="rounded-[18px] border border-arena-border bg-[rgba(8,16,30,0.78)] px-[18px] py-[14px] text-arena-text transition-colors hover:border-arena-borderStrong hover:bg-white/10"
            type="button"
            onClick={() => navigate("/")}
          >
            Editor
          </button>
          <div>
            <div className="text-[clamp(2rem,3vw,2.4rem)] font-bold tracking-[-0.06em]">Zone</div>
            <div className="mt-0.5 text-sm text-arena-muted">Competitive coding workspace</div>
          </div>
        </div>
        <div className="flex items-center gap-3.5 max-[860px]:w-full max-[860px]:flex-wrap">
          <UserQuickSearch />
          <div className="flex items-center gap-2.5 max-[860px]:w-full max-[860px]:flex-wrap">
            <button
              className="grid h-12 w-12 place-items-center rounded-2xl border border-arena-border bg-white/5 font-semibold text-arena-primaryStrong transition-colors hover:border-arena-borderStrong hover:bg-white/10"
              type="button"
              onClick={() => navigate("/profile")}
            >
              {(user?.username || "U").slice(0, 1).toUpperCase()}
            </button>
            <button
              className="rounded-2xl border border-arena-border bg-white/5 px-[14px] py-3 text-arena-text transition-colors hover:border-arena-borderStrong hover:bg-white/10"
              type="button"
              onClick={() => navigate("/leaderboard")}
            >
              Rating
            </button>
            <button
              className="rounded-2xl border border-arena-border bg-white/5 px-[14px] py-3 text-arena-text transition-colors hover:border-arena-borderStrong hover:bg-white/10"
              type="button"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ResizablePanelGroup id="arena-root-panels" orientation="horizontal" className="h-full min-h-0">
          <Panel defaultSize="21%" maxSize="30%" minSize="16%">
            <Surface>{sidebar}</Surface>
          </Panel>
          <ResizeHandle orientation="vertical" />
          <Panel defaultSize="31%" minSize="22%">
            <Surface>{viewer}</Surface>
          </Panel>
          <ResizeHandle orientation="vertical" />
          <Panel defaultSize="48%" minSize="30%">
            <ResizablePanelGroup id="arena-right-column" orientation="vertical" className="h-full min-h-0">
              <Panel defaultSize="63%" minSize="38%">
                <Surface>{editor}</Surface>
              </Panel>
              <ResizeHandle orientation="horizontal" />
              <Panel defaultSize="37%" minSize="22%">
                <ResizablePanelGroup id="arena-bottom-row" orientation="horizontal" className="h-full min-h-0">
                  <Panel defaultSize="48%" minSize="24%">
                    <Surface>{testCases}</Surface>
                  </Panel>
                  <ResizeHandle orientation="vertical" />
                  <Panel defaultSize="52%" minSize="24%">
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
