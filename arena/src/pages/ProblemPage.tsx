import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useResizableSplit } from "../hooks/useResizableSplit.js";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
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
  const isMobile = useMediaQuery("(max-width: 768px)");
  
  const horizontal = useResizableSplit({ 
    id: "pyzone-problem-horizontal-v4", 
    defaultRatio: 48,
    direction: isMobile ? "vertical" : "horizontal",
    minPixels: 300,
    disabled: isMobile
  });

  const vertical = useResizableSplit({ 
    id: "pyzone-problem-vertical-v4", 
    defaultRatio: 52,
    direction: "vertical",
    minPixels: 200
  });

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

  const handleBackToEditor = () => {
    // Navigate back to the editor page
    navigate("/arena", { replace: true });
  };

  return (
    <>
      <div 
        ref={horizontal.containerRef}
        className={`flex h-[calc(100vh-var(--h-navbar))] min-w-0 ${isMobile ? "flex-col overflow-y-auto" : "flex-row overflow-hidden"}`}
      >
        {/* Description Panel */}
        <div style={{ flex: isMobile ? "0 0 auto" : `${horizontal.ratio} 1 0%`, minHeight: isMobile ? "400px" : 0, minWidth: 0 }}>
          <div className="h-full min-h-0 min-w-0 overflow-hidden pr-0">
            <ProblemDescription 
              loading={problemStatus === "loading"} 
              problem={selectedProblem} 
              onBack={handleBackToEditor}
            />
          </div>
        </div>

        {!isMobile && (
          <ResizeHandle 
            id="problem-main-handle" 
            orientation="vertical" 
            {...horizontal.handleProps} 
          />
        )}

        {/* Editor + Tests Panel */}
        <div 
          style={{ flex: isMobile ? "1 1 auto" : `${100 - horizontal.ratio} 1 0%`, minHeight: 0, minWidth: 0 }}
          className="flex flex-col"
        >
          <div ref={vertical.containerRef} className="flex flex-col flex-1 min-h-0">
            {/* Code Editor */}
            <div style={{ flex: `${vertical.ratio} 1 0%`, minHeight: 0 }}>
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
            </div>

            <ResizeHandle 
              id="problem-vertical-handle"
              orientation="horizontal" 
              {...vertical.handleProps} 
            />

            {/* Test Case / Result Panel */}
            <div style={{ flex: `${100 - vertical.ratio} 1 0%`, minHeight: 0 }}>
              <TestTabs
                activeIndex={activeCaseIndex}
                busy={isRunning || isSubmitting}
                cases={visibleCases}
                result={result}
                onSelect={setActiveCaseIndex}
              />
            </div>
          </div>
        </div>
      </div>
      <AuthPromptModal open={showAuthModal} problemId={problemKey} onClose={dismissAuthModal} />
    </>
  );
}
