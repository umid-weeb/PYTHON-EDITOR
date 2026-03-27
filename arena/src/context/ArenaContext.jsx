import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { arenaApi } from "../lib/apiClient.js";
import { buildResultState } from "../lib/formatters.js";
import {
  clearPendingSubmission,
  readDraft,
  readLanguage,
  setPendingSubmission,
  writeDraft,
  writeLanguage,
  writeLastProblem,
} from "../lib/storage.js";

const DEFAULT_CODE = `class Solution:\n    def solve(self):\n        pass\n`;

const ArenaContext = createContext(null);

export function ArenaProvider({ children }) {
  const [problems, setProblems] = useState([]);
  const [problemsStatus, setProblemsStatus] = useState("idle");
  const [problemStatus, setProblemStatus] = useState("idle");
  const [selectedProblemId, setSelectedProblemId] = useState("");
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("all");
  const [language, setLanguageState] = useState(() => readLanguage());
  const [code, setCode] = useState(DEFAULT_CODE);
  const [result, setResult] = useState({
    tone: "info",
    chip: "Ma'lumot",
    summary: "Masalalar yuklanmoqda...",
    details: [],
  });
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activeCaseIndex, setActiveCaseIndex] = useState(0);
  const cacheRef = useRef(new Map());

  const getSubmissionProblemKey = useCallback(
    () => selectedProblem?.id || selectedProblem?.slug || selectedProblemId,
    [selectedProblem?.id, selectedProblem?.slug, selectedProblemId]
  );

  const loadProblems = useCallback(async () => {
    setProblemsStatus("loading");
    try {
      const items = await arenaApi.getProblems();
      setProblems(items);
      setProblemsStatus("ready");
      return items;
    } catch (error) {
      setProblemsStatus("error");
      setResult({
        tone: "danger",
        chip: "Xato",
        summary: "Backend bilan ulanishda xato",
        details: [],
      });
      throw error;
    }
  }, []);

  const selectProblem = useCallback(async (problemId) => {
    if (!problemId) return null;
    setSelectedProblemId(problemId);
    writeLastProblem(problemId);

    if (cacheRef.current.has(problemId)) {
      const cached = cacheRef.current.get(problemId);
      setSelectedProblem(cached);
      setCode(readDraft(problemId, cached.starter_code || DEFAULT_CODE));
      setActiveCaseIndex(0);
      setResult({
        tone: "info",
        chip: "Tayyor",
        summary: "Tayyor. Kod yozing va ko'rinadigan testlarni ishga tushiring yoki yechimni yuboring.",
        details: [],
      });
      return cached;
    }

    setProblemStatus("loading");
    try {
      const payload = await arenaApi.getProblem(problemId);
      cacheRef.current.set(problemId, payload);
      setSelectedProblem(payload);
      setCode(readDraft(problemId, payload.starter_code || DEFAULT_CODE));
      setActiveCaseIndex(0);
      setResult({
        tone: "info",
        chip: "Tayyor",
        summary: "Tayyor. Kod yozing va ko'rinadigan testlarni ishga tushiring yoki yechimni yuboring.",
        details: [],
      });
      setProblemStatus("ready");
      return payload;
    } catch (error) {
      setProblemStatus("error");
      setResult({
        tone: "danger",
        chip: "Xato",
        summary: "Tanlangan masalani yuklab bo'lmadi",
        details: [],
      });
      throw error;
    }
  }, []);

  const persistDraft = useCallback(
    (problemId = selectedProblemId, value = code) => {
      if (!problemId) return;
      writeDraft(problemId, value);
    },
    [code, selectedProblemId]
  );

  const setLanguage = useCallback((nextLanguage) => {
    setLanguageState(nextLanguage);
    writeLanguage(nextLanguage);
  }, []);

  const runCode = useCallback(async () => {
    const submissionProblemKey = getSubmissionProblemKey();

    if (!submissionProblemKey) {
      setResult({
        tone: "warning",
        chip: "Ma'lumot",
        summary: "Avval masalani tanlang.",
        details: [],
      });
      return null;
    }

    persistDraft();
    setIsRunning(true);
    setResult({
      tone: "info",
      chip: "Ishlayapti",
      summary: "Ko'rinadigan testlar ishga tushirilmoqda...",
      details: [],
    });

    try {
      const submission = await arenaApi.runSolution(submissionProblemKey, code, language);
      const payload = submission?.submission_id
        ? await arenaApi.pollSubmission(submission.submission_id)
        : submission;
      const formatted = buildResultState(payload, "run");
      setResult(formatted);
      return formatted;
    } catch (error) {
      setResult({
        tone: "danger",
        chip: "Xato",
        summary: error.message || "Bajarish muvaffaqiyatsiz tugadi",
        details: [],
      });
      throw error;
    } finally {
      setIsRunning(false);
    }
  }, [code, getSubmissionProblemKey, language, persistDraft]);

  const submitCode = useCallback(
    async (token) => {
      const submissionProblemKey = getSubmissionProblemKey();

      if (!submissionProblemKey) {
        setResult({
          tone: "warning",
          chip: "Ma'lumot",
          summary: "Avval masalani tanlang.",
          details: [],
        });
        return null;
      }

      if (!token) {
        setPendingSubmission(submissionProblemKey);
        setShowAuthModal(true);
        return null;
      }

      persistDraft();
      setIsSubmitting(true);
      setResult({
        tone: "info",
        chip: "Yuborilmoqda",
        summary: "Yechimingiz yuborilmoqda...",
        details: [],
      });

      try {
        const submission = await arenaApi.submitSolution(submissionProblemKey, code, language);
        const payload = submission?.submission_id
          ? await arenaApi.pollSubmission(submission.submission_id, token)
          : submission;
        clearPendingSubmission();
        const formatted = buildResultState(payload, "submit");
        setResult(formatted);
        const normalizedVerdict = String(payload?.verdict || "").trim().toLowerCase();
        const normalizedStatus = String(payload?.status || "").trim().toLowerCase();
        const accepted = normalizedVerdict === "accepted";
        const attempted = accepted || normalizedStatus === "completed";

        if (selectedProblemId) {
          setProblems((current) =>
            current.map((problem) =>
              (problem.id || problem.slug) === selectedProblemId
                ? {
                    ...problem,
                    is_attempted: problem.is_attempted || attempted,
                    is_solved: problem.is_solved || accepted,
                  }
                : problem
            )
          );
          setSelectedProblem((current) =>
            current
              ? {
                  ...current,
                  is_attempted: current.is_attempted || attempted,
                  is_solved: current.is_solved || accepted,
                }
              : current
          );
        }
        return formatted;
      } catch (error) {
        setResult({
          tone: "danger",
          chip: "Xato",
          summary: error.message || "Bajarish muvaffaqiyatsiz tugadi",
          details: [],
        });
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [code, getSubmissionProblemKey, language, persistDraft]
  );

  const filteredProblems = useMemo(
    () =>
      problems.filter((problem) => {
        const query = search.trim().toLowerCase();
        const matchesQuery =
          !query ||
          String(problem.title || "").toLowerCase().includes(query) ||
          String(problem.slug || problem.id || "").toLowerCase().includes(query);
        const matchesDifficulty =
          difficulty === "all" ||
          String(problem.difficulty || "easy").toLowerCase() === difficulty;
        return matchesQuery && matchesDifficulty;
      }),
    [difficulty, problems, search]
  );

  const value = useMemo(
    () => ({
      problems,
      filteredProblems,
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
      setCode: (value) => {
        setCode(value);
        if (selectedProblemId) writeDraft(selectedProblemId, value);
      },
      setActiveCaseIndex,
      loadProblems,
      selectProblem,
      runCode,
      submitCode,
      persistDraft,
      dismissAuthModal: () => setShowAuthModal(false),
      openAuthModal: () => setShowAuthModal(true),
      clearPendingSubmission,
    }),
    [
      activeCaseIndex,
      code,
      difficulty,
      filteredProblems,
      isRunning,
      isSubmitting,
      language,
      loadProblems,
      persistDraft,
      problemStatus,
      problems,
      problemsStatus,
      result,
      runCode,
      search,
      selectProblem,
      selectedProblem,
      selectedProblemId,
      setLanguage,
      showAuthModal,
      submitCode,
    ]
  );

  return <ArenaContext.Provider value={value}>{children}</ArenaContext.Provider>;
}

export function useArena() {
  const context = useContext(ArenaContext);
  if (!context) {
    throw new Error("useArena must be used within ArenaProvider");
  }
  return context;
}
