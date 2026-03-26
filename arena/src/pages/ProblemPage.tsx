import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Group as ResizablePanelGroup, Panel, useDefaultLayout } from "react-resizable-panels";
import AuthPromptModal from "../components/common/AuthPromptModal.jsx";
import CodeEditorPanel from "../components/editor/CodeEditorPanel.jsx";
import ResizeHandle from "../components/layout/ResizeHandle.jsx";
import ProblemDescription from "../components/problem/ProblemDescription.tsx";
import TestTabs from "../components/tests/TestTabs.tsx";
import { useArena } from "../context/ArenaContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProblemPage() {
  const navigate = useNavigate();
  const { slug = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { token } = useAuth();
  const resumedRef = useRef("");

  const {
    problemStatus,
    selectedProblemId,
    selectedProblem,
    language,
    code,
    result,
    isRunning,
    isSubmitting,
    showAuthModal,
    activeCaseIndex,
    setLanguage,
    setCode,
    setActiveCaseIndex,
    loadProblems,
    selectProblem,
    runCode,
    submitCode,
    dismissAuthModal,
  } = useArena();

  const problemKey = useMemo(() => slug || selectedProblem?.slug || selectedProblemId, [selectedProblem?.slug, selectedProblemId, slug]);
  const horizontalLayout = useDefaultLayout({ id: "pyzone-problem-horizontal" });
  const verticalLayout = useDefaultLayout({ id: "pyzone-problem-vertical" });

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const items = await loadProblems();
      if (!mounted || !items.length) return;
      const available = new Set(items.map((p: any) => p.slug || p.id).filter(Boolean));
      if (slug && available.has(slug)) {
        await selectProblem(slug);
        return;
      }
      navigate("/problems", { replace: true });
    }

    bootstrap().catch(() => {});
    return () => {
      mounted = false;
    };
  }, [loadProblems, navigate, selectProblem, slug]);

  useEffect(() => {
    const pendingFromUrl = params.get("pending") === "submit" ? problemKey : "";
    if (!token || !problemKey || pendingFromUrl !== problemKey) return;

    const resumeKey = `${pendingFromUrl}:${token}`;
    if (resumedRef.current === resumeKey) return;
    resumedRef.current = resumeKey;

    submitCode(token)
      .catch(() => {})
      .finally(() => {
        const nextParams = new URLSearchParams(params);
        nextParams.delete("pending");
        setParams(nextParams, { replace: true });
      });
  }, [params, problemKey, setParams, submitCode, token]);

  const visibleCases = selectedProblem?.visible_testcases || [];

  return (
    <>
      <div className="flex h-[calc(100vh-var(--h-navbar))] flex-col overflow-hidden">
        <ResizablePanelGroup
          className="flex-1 overflow-hidden"
          defaultLayout={horizontalLayout.defaultLayout}
          onLayoutChanged={horizontalLayout.onLayoutChanged}
          orientation="horizontal"
        >
          <Panel defaultSize={38} maxSize={55} minSize={24}>
            <div className="h-full min-h-0 overflow-hidden pr-0">
              <ProblemDescription loading={problemStatus === "loading"} problem={selectedProblem} />
            </div>
          </Panel>

          <ResizeHandle orientation="vertical" />

          <Panel defaultSize={62} minSize={35}>
            <ResizablePanelGroup
              className="h-full"
              defaultLayout={verticalLayout.defaultLayout}
              onLayoutChanged={verticalLayout.onLayoutChanged}
              orientation="vertical"
            >
              <Panel defaultSize={66} minSize={38}>
                <CodeEditorPanel
                  code={code}
                  isRunning={isRunning}
                  isSubmitting={isSubmitting}
                  language={language}
                  onChange={setCode}
                  onLanguageChange={setLanguage}
                  onRun={() => runCode().catch(() => {})}
                  onSubmit={() => submitCode(token).catch(() => {})}
                />
              </Panel>

              <ResizeHandle orientation="horizontal" />

              <Panel defaultSize={34} maxSize={58} minSize={18}>
                <TestTabs
                  activeIndex={activeCaseIndex}
                  busy={isRunning || isSubmitting}
                  cases={visibleCases}
                  result={result}
                  onSelect={setActiveCaseIndex}
                />
              </Panel>
            </ResizablePanelGroup>
          </Panel>
        </ResizablePanelGroup>
      </div>
      <AuthPromptModal open={showAuthModal} problemId={problemKey} onClose={dismissAuthModal} />
    </>
  );
}
