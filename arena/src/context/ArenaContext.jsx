import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { arenaApi } from "../lib/apiClient.js";
import { useAuth } from "./AuthContext.jsx";
import { buildResultState } from "../lib/formatters.js";
import { isClientRunLanguage, isClientSideLanguage, runClientSide, warmupClientRuntime } from "../lib/clientJudge.js";
import TimeoutWarningModal from "../components/common/TimeoutWarningModal.tsx";
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

// Minimal, syntactically-clean placeholder per language. Used before a problem
// has loaded (and as a last-resort fallback) so a JavaScript editor never shows
// Python code with red errors during the brief load window.
const LANG_DEFAULTS = {
  python: DEFAULT_CODE,
  sql: "SELECT 1;\n",
  javascript: "var solve = function() {\n    \n};\n",
  typescript: "function solve(): void {\n    \n}\n",
  java: "class Solution {\n    \n}\n",
  cpp: "class Solution {\npublic:\n    \n};\n",
  c: "\n",
  csharp: "public class Solution {\n    \n}\n",
  go: "func solve() {\n    \n}\n",
};

function defaultCodeFor(language) {
  return LANG_DEFAULTS[String(language || "").toLowerCase()] || DEFAULT_CODE;
}

const SQL_TAGS = new Set(["sql", "postgresql", "basic-joins", "aggregation", "grouping", "subqueries"]);

function isSqlProblem(problem) {
  if (!problem) return false;
  const slug = String(problem.slug || "").toLowerCase();
  if (slug.startsWith("sql-")) return true;
  const tags = Array.isArray(problem.tags) ? problem.tags : [];
  return tags.some((tag) => SQL_TAGS.has(String(tag || "").toLowerCase()));
}

function resolveProblemLanguage(problem, currentLanguage, fallbackLanguage = "python") {
  if (isSqlProblem(problem)) return "sql";
  return String(currentLanguage || "").toLowerCase() === "sql" ? fallbackLanguage : currentLanguage;
}

// Per-language starter stub for a problem. Falls back to the legacy single
// starter_code (e.g. SQL problems) and finally to the generic default.
function getStarterForLanguage(problem, language) {
  if (!problem) return defaultCodeFor(language);
  const map = problem.starter_codes || problem.starterCodes || {};
  if (map[language]) return map[language];
  // The legacy single starter_code is Python/SQL; only use it for those.
  const lang = String(language || "").toLowerCase();
  if (lang === "python" || lang === "sql") return problem.starter_code || defaultCodeFor(language);
  return defaultCodeFor(language);
}

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
  const [code, setCode] = useState(() => defaultCodeFor(readLanguage()));
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
  
  const [isTimeoutModalOpen, setIsTimeoutModalOpen] = useState(false);
  const [pendingRetry, setPendingRetry] = useState(null); // { type: 'run' | 'submit', token?: string }
  
  const cacheRef = useRef(new Map());
  const initialLanguage = String(readLanguage() || "python");
  const lastNonSqlLanguageRef = useRef(initialLanguage.toLowerCase() === "sql" ? "python" : initialLanguage);

  const { token } = useAuth();

  useEffect(() => {
    if (token) {
      setShowAuthModal(false);
    }
  }, [token]);

  // Pre-load the Python runtime (Pyodide) in the background so the first "Sinash"
  // is instant instead of waiting ~10s for the WASM download.
  useEffect(() => {
    warmupClientRuntime(language);
  }, [language]);


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
      const nextLanguage = resolveProblemLanguage(cached, language, lastNonSqlLanguageRef.current || "python");
      setCode(readDraft(problemId, getStarterForLanguage(cached, nextLanguage), nextLanguage));
      setActiveCaseIndex(0);
      if (nextLanguage !== language) {
        setLanguageState(nextLanguage);
        if (String(nextLanguage || "").toLowerCase() !== "sql") {
          lastNonSqlLanguageRef.current = nextLanguage;
        }
        writeLanguage(nextLanguage);
      }
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
      const nextLanguage = resolveProblemLanguage(payload, language, lastNonSqlLanguageRef.current || "python");
      setCode(readDraft(problemId, getStarterForLanguage(payload, nextLanguage), nextLanguage));
      setActiveCaseIndex(0);
      if (nextLanguage !== language) {
        setLanguageState(nextLanguage);
        if (String(nextLanguage || "").toLowerCase() !== "sql") {
          lastNonSqlLanguageRef.current = nextLanguage;
        }
        writeLanguage(nextLanguage);
      }
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
  }, [language]);


  const persistDraft = useCallback(
    (problemId = selectedProblemId, value = code) => {
      if (!problemId) return;
      writeDraft(problemId, value, language);
    },
    [code, selectedProblemId, language]
  );

  const setLanguage = useCallback((nextLanguage) => {
    const resolvedLanguage = resolveProblemLanguage(
      selectedProblem,
      nextLanguage,
      lastNonSqlLanguageRef.current || "python"
    );
    if (resolvedLanguage === language) return;
    // Save the current editor content under the language we're leaving,
    // then load the draft (or starter stub) for the language we switch to.
    if (selectedProblemId) writeDraft(selectedProblemId, code, language);
    const starter = getStarterForLanguage(selectedProblem, resolvedLanguage);
    setCode(selectedProblemId ? readDraft(selectedProblemId, starter, resolvedLanguage) : starter);
    setLanguageState(resolvedLanguage);
    if (String(resolvedLanguage || "").toLowerCase() !== "sql") {
      lastNonSqlLanguageRef.current = resolvedLanguage;
    }
    writeLanguage(resolvedLanguage);
  }, [selectedProblem, selectedProblemId, language, code]);

  const runCode = useCallback(async (isExtended = false) => {
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

    if (isRunning && !isExtended) return null;

    persistDraft();
    setIsRunning(true);
    setResult({
      tone: "info",
      chip: "Ishlayapti",
      summary: isExtended ? "Kodni uzaytirilgan vaqt bilan tekshirilmoqda..." : "Ko'rinadigan testlar ishga tushirilmoqda...",
      details: [],
    });

    try {
      const submissionLanguage = resolveProblemLanguage(
        selectedProblem,
        language,
        lastNonSqlLanguageRef.current || "python"
      );

      // Client-side judging (runs in the user's browser, no server round-trip).
      // JavaScript/TypeScript run directly; Python runs via Pyodide. Uses the
      // problem's VISIBLE test cases.
      if (isClientRunLanguage(submissionLanguage)) {
        const cases = (selectedProblem?.visible_testcases || []).map((tc) => ({
          name: tc.name,
          input: tc.input,
          expected_output: tc.expected_output,
        }));
        const functionName =
          selectedProblem?.signature?.function_name || selectedProblem?.function_name || "solve";
        const clientPayload = await runClientSide(submissionLanguage, {
          code,
          functionName,
          cases,
          // Python loads Pyodide first (not counted here); give execution more room.
          timeLimitMs: submissionLanguage === "python" ? (isExtended ? 15000 : 10000) : (isExtended ? 10000 : 5000),
        });
        const formattedClient = buildResultState(clientPayload, "run");
        setResult(formattedClient);
        return formattedClient;
      }

      const submission = await arenaApi.runSolution(submissionProblemKey, code, submissionLanguage, isExtended);
      if (!submission) {
        throw new Error("Serverdan javob kelmadi.");
      }

      const payload = submission.submission_id
        ? await arenaApi.pollSubmission(submission.submission_id)
        : submission;

      if (!payload) {
        throw new Error("Natijani yuklab bo'lmadi.");
      }

      // Check for timeout to trigger modal
      if (!isExtended && payload.verdict === "TIME_LIMIT_EXCEEDED") {
        setPendingRetry({ type: 'run' });
        setIsTimeoutModalOpen(true);
      }

      const formatted = buildResultState(payload, "run");
      setResult(formatted);
      return formatted;
    } catch (error) {
      console.error("Run solution failed:", error);
      const errorState = {
        tone: "danger",
        chip: "Xato",
        summary: error.message || "Kodni bajarishda kutilmagan xatolik yuz berdi.",
        details: [],
      };
      setResult(errorState);
      return errorState;
    } finally {
      setIsRunning(false);
    }
  }, [code, getSubmissionProblemKey, isRunning, language, persistDraft, selectedProblem]);

  const submitCode = useCallback(
    async (token, isExtended = false) => {
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

      if (isSubmitting && !isExtended) return null;

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
        summary: isExtended ? "Yechimingiz uzaytirilgan vaqt bilan tekshirilmoqda..." : "Yechimingiz yuborilmoqda...",
        details: [],
      });

      try {
        const submissionLanguage = resolveProblemLanguage(
          selectedProblem,
          language,
          lastNonSqlLanguageRef.current || "python"
        );

        // Client-side languages (e.g. JavaScript) are judged in the browser.
        // Submit checks ALL test cases (visible + hidden) — fetched from the
        // server — so it is a thorough check, not just the visible ones.
        if (isClientSideLanguage(submissionLanguage)) {
          let cases;
          try {
            const data = await arenaApi.getJudgeTestcases(submissionProblemKey);
            cases = (data?.cases || []).map((tc) => ({
              name: tc.name,
              input: tc.input,
              expected_output: tc.expected_output,
            }));
          } catch {
            // Fall back to the visible tests if the full set can't be loaded.
            cases = (selectedProblem?.visible_testcases || []).map((tc) => ({
              name: tc.name,
              input: tc.input,
              expected_output: tc.expected_output,
            }));
          }
          const functionName =
            selectedProblem?.signature?.function_name || selectedProblem?.function_name || "solve";
          const clientPayload = await runClientSide(submissionLanguage, {
            code,
            functionName,
            cases,
            timeLimitMs: submissionLanguage === "python" ? (isExtended ? 20000 : 12000) : (isExtended ? 10000 : 5000),
          });
          clearPendingSubmission();
          const formattedClient = buildResultState(clientPayload, "submit");
          setResult(formattedClient);

          // Persist the browser-judged submission so the problem is marked
          // solved and history/rating update (server records the verdict).
          const cAccepted = String(clientPayload?.verdict || "").trim().toLowerCase() === "accepted";
          const cAttempted = cAccepted || (clientPayload?.total_count || 0) > 0;
          try {
            await arenaApi.recordClientResult(
              {
                problem_id: submissionProblemKey,
                code,
                language: submissionLanguage,
                verdict: clientPayload.verdict,
                passed_count: clientPayload.passed_count || 0,
                total_count: clientPayload.total_count || 0,
                runtime_ms: Math.round(clientPayload.runtime_ms || 0),
                memory_bytes: Math.round(clientPayload.memory_bytes || 0),
              },
              token
            );
          } catch (recordError) {
            console.warn("recordClientResult failed", recordError);
          }

          const targetKey = selectedProblemId || submissionProblemKey;
          if (targetKey) {
            setProblems((current) =>
              current.map((problem) => {
                const matches =
                  problem.id === targetKey ||
                  problem.slug === targetKey ||
                  (problem.id && problem.id === selectedProblem?.id) ||
                  (problem.slug && problem.slug === selectedProblem?.slug);
                return matches
                  ? {
                      ...problem,
                      is_attempted: problem.is_attempted || cAttempted,
                      is_solved: problem.is_solved || cAccepted,
                    }
                  : problem;
              })
            );
            setSelectedProblem((current) =>
              current
                ? {
                    ...current,
                    is_attempted: current.is_attempted || cAttempted,
                    is_solved: current.is_solved || cAccepted,
                  }
                : current
            );
          }
          return formattedClient;
        }

        const submission = await arenaApi.submitSolution(submissionProblemKey, code, submissionLanguage, isExtended);
        if (!submission) {
          throw new Error("Serverdan javob kelmadi.");
        }

        const payload = submission.submission_id
          ? await arenaApi.pollSubmission(submission.submission_id, token)
          : submission;

        if (!payload) {
          throw new Error("Natijani yuklab bo'lmadi.");
        }

        // Check for timeout to trigger modal
        if (!isExtended && payload.verdict === "TIME_LIMIT_EXCEEDED") {
          setPendingRetry({ type: 'submit', token });
          setIsTimeoutModalOpen(true);
        }

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
        const errorState = {
          tone: "danger",
          chip: "Xato",
          summary: error.message || "Yuborishda kutilmagan xatolik yuz berdi.",
          details: [],
        };
        setResult(errorState);
        return errorState;
      } finally {
        setIsSubmitting(false);
      }
    },
    [code, getSubmissionProblemKey, isSubmitting, language, persistDraft, selectedProblem, selectedProblemId]
  );

  const handleContinueExecution = useCallback(() => {
    setIsTimeoutModalOpen(false);
    if (!pendingRetry) return;

    if (pendingRetry.type === 'run') {
      runCode(true);
    } else if (pendingRetry.type === 'submit') {
      submitCode(pendingRetry.token, true);
    }
    setPendingRetry(null);
  }, [pendingRetry, runCode, submitCode]);

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
        if (selectedProblemId) writeDraft(selectedProblemId, value, language);
      },
      setActiveCaseIndex,
      loadProblems,
      selectProblem,
      runCode,
      submitCode,
      runCooldown: 0,
      submitCooldown: 0,
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
      getSubmissionProblemKey,
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
      selectedProblem?.id,
      selectedProblem?.slug,
      selectedProblemId,
      setDifficulty,
      setLanguage,
      setSearch,
      showAuthModal,
      submitCode,
    ]
  );

  return (
    <ArenaContext.Provider value={value}>
      {children}
      <TimeoutWarningModal
        isOpen={isTimeoutModalOpen}
        onClose={() => {
          setIsTimeoutModalOpen(false);
          setPendingRetry(null);
        }}
        onContinue={handleContinueExecution}
      />
    </ArenaContext.Provider>
  );
}

export function useArena() {
  const context = useContext(ArenaContext);
  if (!context) {
    throw new Error("useArena must be used within ArenaProvider");
  }
  return context;
}
