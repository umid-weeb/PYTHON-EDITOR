import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import AuthPromptModal from "../components/common/AuthPromptModal.jsx";
import CodeEditorPanel from "../components/editor/CodeEditorPanel.jsx";
import ArenaLayout from "../components/layout/ArenaLayout.jsx";
import ProblemList from "../components/problems/ProblemList.jsx";
import ProblemViewer from "../components/problems/ProblemViewer.jsx";
import ResultPanel from "../components/results/ResultPanel.jsx";
import TestCasePanel from "../components/results/TestCasePanel.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useArena } from "../context/ArenaContext.jsx";
import { readLastProblem, readPendingSubmission } from "../lib/storage.js";

export default function ArenaPage() {
  const {
    filteredProblems,
    problems,
    problemsStatus,
    problemStatus,
    selectedProblemId,
    selectedProblem,
    search,
    difficulty,
    language,
    code,
    result,
    isRunning,
    isSubmitting,
    showAuthModal,
    activeCaseIndex,
    setSearch,
    setDifficulty,
    setLanguage,
    setCode,
    setActiveCaseIndex,
    loadProblems,
    selectProblem,
    runCode,
    submitCode,
    dismissAuthModal,
  } = useArena();
  const { token } = useAuth();
  const [params, setParams] = useSearchParams();
  const resumedRef = useRef("");

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const items = await loadProblems();
      if (!mounted || !items.length) return;

      const requestedProblem = params.get("problem");
      const fallbackProblem = readLastProblem() || items[0]?.id;
      const target = requestedProblem || fallbackProblem;
      if (target) {
        await selectProblem(target);
        if (!requestedProblem) {
          const nextParams = new URLSearchParams(params);
          nextParams.set("problem", target);
          setParams(nextParams, { replace: true });
        }
      }
    }

    bootstrap().catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const requestedProblem = params.get("problem");
    if (requestedProblem && requestedProblem !== selectedProblemId && problems.length) {
      selectProblem(requestedProblem).catch(() => {});
    }
  }, [params, problems.length, selectProblem, selectedProblemId]);

  useEffect(() => {
    const pendingFromUrl = params.get("pending") === "submit" ? params.get("problem") || selectedProblemId : "";
    const pendingFromStorage = readPendingSubmission()?.problemId || "";
    const pendingProblemId = pendingFromUrl || pendingFromStorage;

    if (!token || !selectedProblemId || pendingProblemId !== selectedProblemId) {
      return;
    }

    const resumeKey = `${pendingProblemId}:${token}`;
    if (resumedRef.current === resumeKey) {
      return;
    }

    resumedRef.current = resumeKey;
    submitCode(token)
      .catch(() => {})
      .finally(() => {
        const nextParams = new URLSearchParams(params);
        nextParams.delete("pending");
        setParams(nextParams, { replace: true });
      });
  }, [params, selectedProblemId, setParams, submitCode, token]);

  const visibleCases = selectedProblem?.visible_testcases || [];
  const currentProblemId = useMemo(
    () => selectedProblem?.id || selectedProblemId,
    [selectedProblem?.id, selectedProblemId]
  );

  async function handleProblemSelect(problemId) {
    const nextParams = new URLSearchParams(params);
    nextParams.set("problem", problemId);
    nextParams.delete("pending");
    setParams(nextParams, { replace: true });
    await selectProblem(problemId);
  }

  return (
    <ArenaLayout
      sidebar={
        <ProblemList
          problems={filteredProblems}
          loading={problemsStatus === "loading"}
          search={search}
          difficulty={difficulty}
          selectedProblemId={selectedProblemId}
          onSearchChange={setSearch}
          onDifficultyChange={setDifficulty}
          onSelect={handleProblemSelect}
        />
      }
      viewer={<ProblemViewer problem={selectedProblem} loading={problemStatus === "loading"} />}
      editor={
        <CodeEditorPanel
          code={code}
          language={language}
          isRunning={isRunning}
          isSubmitting={isSubmitting}
          onChange={setCode}
          onLanguageChange={setLanguage}
          onRun={() => runCode().catch(() => {})}
          onSubmit={() => submitCode(token).catch(() => {})}
        />
      }
      testCases={
        <TestCasePanel
          cases={visibleCases}
          activeIndex={activeCaseIndex}
          onSelect={setActiveCaseIndex}
        />
      }
      result={<ResultPanel result={result} />}
      authModal={
        <AuthPromptModal
          open={showAuthModal}
          problemId={currentProblemId}
          onClose={dismissAuthModal}
        />
      }
    />
  );
}
