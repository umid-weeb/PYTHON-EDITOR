import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { arenaApi } from "../lib/apiClient.js";
import { useAuth } from "./AuthContext.jsx";
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
  const [runCooldown, setRunCooldown] = useState(0);
  const [submitCooldown, setSubmitCooldown] = useState(0);
  const cacheRef = useRef(new Map());

  const { token } = useAuth();

  useEffect(() => {
    if (token) {
      setShowAuthModal(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = setInterval(() => {
      setRunCooldown((c) => (c > 0 ? c - 1 : 0));
      setSubmitCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);


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

    // Reset cooldowns when switching problems so the user can immediately test
    setRunCooldown(0);
    setSubmitCooldown(0);

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

    if (runCooldown > 0) {
      setResult({
        tone: "warning",
        chip: "Kutib turing",
        summary: `Iltimos, qayta sinash uchun ${runCooldown} soniya kuting.`,
        details: [],
      });
      return null;
    }

    persistDraft();
    setIsRunning(true);
    setRunCooldown(10);
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
      console.error("Run solution failed:", error);
      setResult({
        tone: "danger",
        chip: "Xato",
        summary: error.message || "Bajarish muvaffaqiyatsiz tugadi",
        details: [],
      });
      return null;
    } finally {
      setIsRunning(false);
    }
  }, [code, getSubmissionProblemKey, language, persistDraft, runCooldown]);

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

      if (submitCooldown > 0) {
        setResult({
          tone: "warning",
          chip: "Kutib turing",
          summary: `Iltimos, qayta yuborish uchun ${submitCooldown} soniya kuting.`,
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
      setSubmitCooldown(15);
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

        // Update the list of problems in state to reflect the new solved/attempted status
        if (selectedProblemId || submissionProblemKey) {
          const targetKey = selectedProblemId || submissionProblemKey;
          setProblems((current) =>
            current.map((problem) => {
              const matches = 
                problem.id === targetKey || 
                problem.slug === targetKey ||
                (problem.id && problem.id === selectedProblem?.id) ||
                (problem.slug && problem.slug === selectedProblem?.slug);
                
              if (matches) {
                return {
                  ...problem,
                  is_attempted: problem.is_attempted || attempted,
                  is_solved: problem.is_solved || accepted,
                };
              }
              return problem;
            })
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
        console.error("Submit solution failed:", error);
        setResult({
          tone: "danger",
          chip: "Xato",
          summary: error.message || "Bajarish muvaffaqiyatsiz tugadi",
          details: [],
        });
        return null;
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

  const siblings = useMemo(() => {
    if (!selectedProblemId || !filteredProblems.length) return { prev: null, next: null };
    const index = filteredProblems.findIndex(p => p.id === selectedProblemId || p.slug === selectedProblemId);
    if (index === -1) return { prev: null, next: null };
    
    return {
      prev: index > 0 ? filteredProblems[index - 1].slug || filteredProblems[index - 1].id : null,
      next: index < filteredProblems.length - 1 ? filteredProblems[index + 1].slug || filteredProblems[index + 1].id : null,
    };
  }, [filteredProblems, selectedProblemId]);

  const value = useMemo(
    () => ({
      problems,
      filteredProblems,
      siblings,
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
      runCooldown,
      submitCooldown,
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
      clearPendingSubmission,
      code,
      difficulty,
      filteredProblems,
      getSubmissionProblemKey,
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
      runCooldown,
      search,
      selectProblem,
      selectedProblem?.id,
      selectedProblem?.slug,
      selectedProblemId,
      setDifficulty,
      setLanguage,
      setSearch,
      showAuthModal,
      submitCode,
      submitCooldown,
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
