/**
 * AdminProblemFormPage
 * Yangi masala qo'shish va mavjud masalani tahrirlash.
 *
 * 4 bo'lim:
 * 1. Asosiy ma'lumotlar (title, slug, difficulty, tags)
 * 2. Masala tavsifi (description, input/output format, constraints)
 * 3. Kod sozlamalari (function_name, starter_code)
 * 4. Test case lar (table + AI validate/generate)
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { adminApi } from "../../lib/adminApiClient.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Oson", color: "text-green-400" },
  { value: "medium", label: "O'rta", color: "text-yellow-400" },
  { value: "hard", label: "Qiyin", color: "text-red-400" },
];

const POPULAR_TAGS = [
  "Array", "String", "Hash Table", "Dynamic Programming",
  "Math", "Sorting", "Greedy", "Tree", "Binary Search",
  "Graph", "Backtracking", "Stack", "Queue", "Linked List",
  "Two Pointers", "Sliding Window", "Recursion",
];

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

// ---------------------------------------------------------------------------
// UI components
// ---------------------------------------------------------------------------
function Section({ title, icon, children, action }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h2 className="font-semibold text-gray-100">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({ label, hint, children, error }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-300">{label}</label>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function Input({ className = "", ...props }) {
  return (
    <input
      {...props}
      className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors ${className}`}
    />
  );
}

function Textarea({ className = "", ...props }) {
  return (
    <textarea
      {...props}
      className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-y font-mono text-sm ${className}`}
    />
  );
}

function AiButton({ onClick, loading, label, small = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 bg-purple-700/60 hover:bg-purple-600/60 border border-purple-500/30 text-purple-200 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
        small ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
      }`}
    >
      {loading ? (
        <span className="animate-spin text-sm">⟳</span>
      ) : (
        <span className="text-sm">✦</span>
      )}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AdminProblemFormPage() {
  const { problemId } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(problemId);

  // --- Form state ---
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [difficulty, setDifficulty] = useState("medium");
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [leetcodeId, setLeetcodeId] = useState("");

  const [description, setDescription] = useState("");
  const [inputFormat, setInputFormat] = useState("");
  const [outputFormat, setOutputFormat] = useState("");
  const [constraintsText, setConstraintsText] = useState("");

  const [functionName, setFunctionName] = useState("solve");
  const [starterCode, setStarterCode] = useState("def solve():\n    # Yechimingizni shu yerga yozing\n    pass");

  const [testCases, setTestCases] = useState([
    { input: "", expected_output: "", is_hidden: false },
  ]);

  // --- UI state ---
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // AI state
  const [aiLoading, setAiLoading] = useState({});
  const [lcQuery, setLcQuery] = useState("");
  const [lcLoading, setLcLoading] = useState(false);
  const [validateResults, setValidateResults] = useState(null);
  const [improvedDesc, setImprovedDesc] = useState(null);

  // ---------------------------------------------------------------------------
  // Load existing problem (edit mode)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isEditing) return;
    (async () => {
      try {
        const p = await adminApi.getProblem(problemId);
        setTitle(p.title || "");
        setSlug(p.slug || "");
        setSlugManual(true);
        setDifficulty(p.difficulty || "medium");
        setTags(p.tags || []);
        setLeetcodeId(p.leetcode_id ? String(p.leetcode_id) : "");
        setDescription(p.description || "");
        setInputFormat(p.input_format || "");
        setOutputFormat(p.output_format || "");
        setConstraintsText(p.constraints_text || "");
        setFunctionName(p.function_name || "solve");
        setStarterCode(p.starter_code || "def solve():\n    pass");
        setTestCases(
          p.test_cases?.length
            ? p.test_cases.map((tc) => ({
                id: tc.id,
                input: tc.input,
                expected_output: tc.expected_output,
                is_hidden: tc.is_hidden,
              }))
            : [{ input: "", expected_output: "", is_hidden: false }]
        );
      } catch (err) {
        setError("Masala yuklanmadi: " + err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [isEditing, problemId]);

  // Auto-slug from title
  useEffect(() => {
    if (!slugManual && title) {
      setSlug(slugify(title));
    }
  }, [title, slugManual]);

  // ---------------------------------------------------------------------------
  // Tag management
  // ---------------------------------------------------------------------------
  function addTag(tag) {
    const t = tag.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  function removeTag(tag) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  // ---------------------------------------------------------------------------
  // Test case management
  // ---------------------------------------------------------------------------
  function addTestCaseRow() {
    setTestCases((prev) => [...prev, { input: "", expected_output: "", is_hidden: false }]);
  }

  function updateTestCase(idx, field, value) {
    setTestCases((prev) =>
      prev.map((tc, i) => (i === idx ? { ...tc, [field]: value } : tc))
    );
  }

  function removeTestCase(idx) {
    setTestCases((prev) => prev.filter((_, i) => i !== idx));
  }

  // ---------------------------------------------------------------------------
  // AI: LeetCode import
  // ---------------------------------------------------------------------------
  async function handleLeetCodeImport() {
    if (!lcQuery.trim()) return;
    setLcLoading(true);
    setError("");
    try {
      const result = await adminApi.ai.fromLeetCode(lcQuery.trim());
      setTitle(result.title || "");
      setSlug(result.slug || "");
      setSlugManual(true);
      setDifficulty(result.difficulty || "medium");
      setTags(result.tags || []);
      setLeetcodeId(result.leetcode_id ? String(result.leetcode_id) : "");
      setDescription(result.description || "");
      setInputFormat(result.input_format || "");
      setOutputFormat(result.output_format || "");
      setConstraintsText(result.constraints_text || "");
      setFunctionName(result.function_name || "solve");
      setStarterCode(result.starter_code || "def solve():\n    pass");
      if (result.test_cases?.length) {
        setTestCases(result.test_cases);
      }
      setSuccess("LeetCode masalasi muvaffaqiyatli import qilindi!");
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError("LeetCode import xato: " + err.message);
    } finally {
      setLcLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // AI: Generate description
  // ---------------------------------------------------------------------------
  async function handleGenerateDescription() {
    if (!title) { setError("Avval masala nomini kiriting"); return; }
    setAiLoading((p) => ({ ...p, desc: true }));
    setError("");
    try {
      const result = await adminApi.ai.generateDescription({
        title,
        difficulty,
        tags,
      });
      if (result.description) setDescription(result.description);
      if (result.input_format) setInputFormat(result.input_format);
      if (result.output_format) setOutputFormat(result.output_format);
      if (result.constraints_text) setConstraintsText(result.constraints_text);
    } catch (err) {
      setError("AI description yarata olmadi: " + err.message);
    } finally {
      setAiLoading((p) => ({ ...p, desc: false }));
    }
  }

  // ---------------------------------------------------------------------------
  // AI: Improve description
  // ---------------------------------------------------------------------------
  async function handleImproveDescription() {
    if (!description) { setError("Description bo'sh"); return; }
    setAiLoading((p) => ({ ...p, improve: true }));
    setError("");
    setImprovedDesc(null);
    try {
      const result = await adminApi.ai.improveDescription({ description, title, difficulty });
      setImprovedDesc(result);
    } catch (err) {
      setError("AI yaxshilay olmadi: " + err.message);
    } finally {
      setAiLoading((p) => ({ ...p, improve: false }));
    }
  }

  function acceptImprovedDesc() {
    if (improvedDesc?.improved_description) {
      setDescription(improvedDesc.improved_description);
    }
    setImprovedDesc(null);
  }

  // ---------------------------------------------------------------------------
  // AI: Generate starter code
  // ---------------------------------------------------------------------------
  async function handleGenerateStarterCode() {
    if (!description) { setError("Avval description kiriting"); return; }
    setAiLoading((p) => ({ ...p, starter: true }));
    setError("");
    try {
      const result = await adminApi.ai.generateStarterCode({
        description,
        function_name: functionName,
        language: "python",
      });
      if (result.starter_code) setStarterCode(result.starter_code);
      if (result.function_name) setFunctionName(result.function_name);
    } catch (err) {
      setError("AI starter code yarata olmadi: " + err.message);
    } finally {
      setAiLoading((p) => ({ ...p, starter: false }));
    }
  }

  // ---------------------------------------------------------------------------
  // AI: Generate test cases
  // ---------------------------------------------------------------------------
  async function handleGenerateTestCases() {
    if (!description) { setError("Avval description kiriting"); return; }
    setAiLoading((p) => ({ ...p, gen_tc: true }));
    setError("");
    setValidateResults(null);
    try {
      const result = await adminApi.ai.generateTestCases({
        description,
        function_name: functionName,
        count: 10,
        existing_test_cases: testCases.filter((tc) => tc.input),
      });
      if (result.test_cases?.length) {
        setTestCases(
          result.test_cases.map((tc) => ({
            input: tc.input || "",
            expected_output: tc.expected_output || "",
            is_hidden: tc.is_hidden || false,
          }))
        );
        setSuccess(
          result.verified
            ? `${result.test_cases.length} ta test case yaratildi va tasdiqlandi!`
            : `${result.test_cases.length} ta test case yaratildi.`
        );
        setTimeout(() => setSuccess(""), 4000);
      }
    } catch (err) {
      setError("AI test case yarata olmadi: " + err.message);
    } finally {
      setAiLoading((p) => ({ ...p, gen_tc: false }));
    }
  }

  // ---------------------------------------------------------------------------
  // AI: Validate test cases
  // ---------------------------------------------------------------------------
  async function handleValidateTestCases() {
    if (!description) { setError("Avval description kiriting"); return; }
    const filledCases = testCases.filter((tc) => tc.input.trim());
    if (!filledCases.length) { setError("Hech qanday test case yo'q"); return; }

    setAiLoading((p) => ({ ...p, validate: true }));
    setError("");
    setValidateResults(null);
    try {
      const result = await adminApi.ai.validateTestCases({
        description,
        function_name: functionName,
        test_cases: filledCases,
      });
      setValidateResults(result);
    } catch (err) {
      setError("AI tekshira olmadi: " + err.message);
    } finally {
      setAiLoading((p) => ({ ...p, validate: false }));
    }
  }

  function acceptAiSuggestion(idx) {
    if (!validateResults?.results) return;
    const vr = validateResults.results[idx];
    if (vr) {
      updateTestCase(idx, "expected_output", vr.ai_output);
    }
  }

  function acceptAllAiSuggestions() {
    if (!validateResults?.results) return;
    setTestCases((prev) =>
      prev.map((tc, idx) => {
        const vr = validateResults.results[idx];
        if (vr && !vr.is_correct) {
          return { ...tc, expected_output: vr.ai_output };
        }
        return tc;
      })
    );
    setValidateResults(null);
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------
  async function handleSave(e) {
    e.preventDefault();
    if (!title.trim()) { setError("Masala nomi kiritilishi shart"); return; }
    if (!description.trim()) { setError("Description kiritilishi shart"); return; }
    if (!slug.trim()) { setError("Slug kiritilishi shart"); return; }

    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {
      title: title.trim(),
      slug: slug.trim(),
      difficulty,
      description: description.trim(),
      input_format: inputFormat.trim(),
      output_format: outputFormat.trim(),
      constraints_text: constraintsText.trim(),
      starter_code: starterCode.trim(),
      function_name: functionName.trim() || "solve",
      tags,
      leetcode_id: leetcodeId ? parseInt(leetcodeId, 10) : null,
      test_cases: testCases
        .filter((tc) => tc.input.trim())
        .map((tc, i) => ({
          input: tc.input.trim(),
          expected_output: tc.expected_output.trim(),
          is_hidden: tc.is_hidden,
          sort_order: i,
        })),
    };

    try {
      if (isEditing) {
        await adminApi.updateProblem(problemId, payload);
        // Test case larni bulk replace
        await adminApi.bulkReplaceTestCases(problemId, payload.test_cases);
        setSuccess("Masala muvaffaqiyatli yangilandi!");
      } else {
        await adminApi.createProblem(payload);
        setSuccess("Masala muvaffaqiyatli yaratildi!");
        setTimeout(() => navigate("/admin/problems"), 1500);
      }
    } catch (err) {
      setError("Saqlashda xato: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/admin/problems")}
              className="text-gray-400 hover:text-gray-200 transition-colors p-1 rounded"
            >
              ← Orqaga
            </button>
            <h1 className="font-semibold text-white">
              {isEditing ? "Masalani tahrirlash" : "Yangi masala"}
            </h1>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium transition-colors"
          >
            {saving ? <span className="animate-spin">⟳</span> : null}
            {saving ? "Saqlanmoqda..." : "Saqlash"}
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Success / Error */}
        {success && (
          <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-4 text-green-300">
            {success}
          </div>
        )}
        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 text-red-400">
            {error}
          </div>
        )}

        {/* ================================================================
            LEETCODE IMPORT PANEL
        ================================================================ */}
        <div className="bg-gradient-to-r from-blue-950/40 to-purple-950/40 border border-blue-500/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🔗</span>
            <h3 className="font-semibold text-blue-300">LeetCode dan import</h3>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            LeetCode masala raqami yoki nomini kiriting. AI uni topib, O'zbek tiliga tarjima qiladi va hamma narsani to'ldiradi.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder='Masalan: "1" yoki "Two Sum" yoki "two-sum"'
              value={lcQuery}
              onChange={(e) => setLcQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleLeetCodeImport())}
              className="flex-1 bg-gray-800/60 border border-blue-500/30 rounded-lg px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-400 transition-colors"
            />
            <button
              type="button"
              onClick={handleLeetCodeImport}
              disabled={lcLoading || !lcQuery.trim()}
              className="flex items-center gap-2 bg-blue-600/80 hover:bg-blue-500/80 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium transition-colors whitespace-nowrap"
            >
              {lcLoading ? <span className="animate-spin">⟳</span> : "✦"}
              {lcLoading ? "Yuklanmoqda..." : "AI Import"}
            </button>
          </div>
        </div>

        {/* ================================================================
            SECTION 1: Basic Info
        ================================================================ */}
        <Section title="Asosiy ma'lumotlar" icon="📋">
          <div className="space-y-4">
            <Field label="Masala nomi *" hint="O'zbek tilida, aniq va tushunarli">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Masalan: Ikkita sonning yig'indisi"
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Slug (URL)"
                hint="Avtomatik yaratiladi, kerak bo'lsa o'zgartiring"
              >
                <Input
                  value={slug}
                  onChange={(e) => {
                    setSlugManual(true);
                    setSlug(e.target.value);
                  }}
                  placeholder="ikkita-sonning-yigindisi"
                  className="font-mono"
                />
              </Field>
              <Field label="LeetCode ID (ixtiyoriy)">
                <Input
                  type="number"
                  value={leetcodeId}
                  onChange={(e) => setLeetcodeId(e.target.value)}
                  placeholder="Masalan: 1"
                />
              </Field>
            </div>

            <Field label="Qiyinlik *">
              <div className="flex gap-3">
                {DIFFICULTY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDifficulty(opt.value)}
                    className={`flex-1 py-2.5 rounded-lg border font-medium transition-all ${
                      difficulty === opt.value
                        ? `${opt.color} bg-gray-800 border-current`
                        : "text-gray-500 bg-gray-800/50 border-gray-700 hover:border-gray-500"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Teglar" hint="Enter yoki vergul bosib qo'shing">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addTag(tagInput);
                      }
                    }}
                    placeholder="Teg qo'shish..."
                  />
                  <button
                    type="button"
                    onClick={() => addTag(tagInput)}
                    className="bg-gray-700 hover:bg-gray-600 px-4 rounded-lg text-gray-300 transition-colors"
                  >
                    +
                  </button>
                </div>
                {/* Quick tags */}
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addTag(tag)}
                      disabled={tags.includes(tag)}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        tags.includes(tag)
                          ? "bg-blue-700/30 border-blue-500/30 text-blue-300"
                          : "bg-gray-800 border-gray-700 text-gray-400 hover:border-blue-500/50 hover:text-blue-400"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                {/* Selected tags */}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 text-sm bg-blue-700/30 border border-blue-500/30 text-blue-200 px-2.5 py-1 rounded-full"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="text-blue-400 hover:text-red-400 transition-colors ml-0.5"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Field>
          </div>
        </Section>

        {/* ================================================================
            SECTION 2: Description
        ================================================================ */}
        <Section
          title="Masala tavsifi"
          icon="📝"
          action={
            <div className="flex gap-2">
              <AiButton
                onClick={handleGenerateDescription}
                loading={aiLoading.desc}
                label="AI Yaratsin"
                small
              />
              <AiButton
                onClick={handleImproveDescription}
                loading={aiLoading.improve}
                label="AI Yaxshilash"
                small
              />
            </div>
          }
        >
          <div className="space-y-4">
            {/* Improved desc panel */}
            {improvedDesc && (
              <div className="bg-purple-950/30 border border-purple-500/30 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-purple-300">
                    ✦ AI yaxshilangan versiya
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={acceptImprovedDesc}
                      className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded-lg transition-colors"
                    >
                      Qabul qilish
                    </button>
                    <button
                      type="button"
                      onClick={() => setImprovedDesc(null)}
                      className="text-xs bg-gray-700 text-gray-300 px-3 py-1 rounded-lg transition-colors"
                    >
                      Bekor
                    </button>
                  </div>
                </div>
                {improvedDesc.issues_found?.length > 0 && (
                  <div className="text-xs text-red-400 space-y-0.5">
                    <div className="font-medium mb-1">Topilgan muammolar:</div>
                    {improvedDesc.issues_found.map((issue, i) => (
                      <div key={i}>• {issue}</div>
                    ))}
                  </div>
                )}
                {improvedDesc.changes?.length > 0 && (
                  <div className="text-xs text-green-400 space-y-0.5">
                    <div className="font-medium mb-1">Qilingan o'zgarishlar:</div>
                    {improvedDesc.changes.map((c, i) => (
                      <div key={i}>• {c}</div>
                    ))}
                  </div>
                )}
                <div className="bg-gray-900/50 rounded-lg p-3 text-sm text-gray-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {improvedDesc.improved_description}
                </div>
              </div>
            )}

            <Field label="Asosiy tavsif *" hint="Markdown formatida. Misollar, tushuntirish, cheklovlar.">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={12}
                placeholder="Masala tavsifini kiriting..."
              />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Kirish formati" hint="Input qanday beriladi">
                <Textarea
                  value={inputFormat}
                  onChange={(e) => setInputFormat(e.target.value)}
                  rows={4}
                  placeholder="Masalan: Birinchi qatorda n — massiv uzunligi..."
                />
              </Field>
              <Field label="Chiqish formati" hint="Output qanday bo'lishi kerak">
                <Textarea
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value)}
                  rows={4}
                  placeholder="Masalan: Bitta butun son — javob..."
                />
              </Field>
            </div>

            <Field label="Cheklovlar" hint="n, k qiymat diapazoni va boshqa cheklovlar">
              <Textarea
                value={constraintsText}
                onChange={(e) => setConstraintsText(e.target.value)}
                rows={3}
                placeholder="1 ≤ n ≤ 10^5&#10;1 ≤ a[i] ≤ 10^9"
              />
            </Field>
          </div>
        </Section>

        {/* ================================================================
            SECTION 3: Code Setup
        ================================================================ */}
        <Section
          title="Kod sozlamalari"
          icon="⚙"
          action={
            <AiButton
              onClick={handleGenerateStarterCode}
              loading={aiLoading.starter}
              label="AI Yaratsin"
              small
            />
          }
        >
          <div className="space-y-4">
            <Field
              label="Funksiya nomi"
              hint="Foydalanuvchi yechadigan funksiya nomi (inglizcha)"
            >
              <Input
                value={functionName}
                onChange={(e) => setFunctionName(e.target.value)}
                placeholder="solve"
                className="font-mono max-w-xs"
              />
            </Field>

            <Field
              label="Starter code"
              hint="Foydalanuvchiga beriladigan boshlang'ich kod skeleti"
            >
              <Textarea
                value={starterCode}
                onChange={(e) => setStarterCode(e.target.value)}
                rows={10}
                placeholder="def solve():\n    pass"
              />
            </Field>
          </div>
        </Section>

        {/* ================================================================
            SECTION 4: Test Cases
        ================================================================ */}
        <Section
          title="Test case lar"
          icon="🧪"
          action={
            <div className="flex gap-2">
              <AiButton
                onClick={handleGenerateTestCases}
                loading={aiLoading.gen_tc}
                label="AI Yaratsin (10 ta)"
                small
              />
              <AiButton
                onClick={handleValidateTestCases}
                loading={aiLoading.validate}
                label="AI Tekshirsin"
                small
              />
            </div>
          }
        >
          <div className="space-y-4">
            {/* Validate summary */}
            {validateResults && (
              <div
                className={`rounded-xl p-4 border space-y-2 ${
                  validateResults.all_correct
                    ? "bg-green-950/20 border-green-500/30"
                    : "bg-orange-950/20 border-orange-500/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-medium text-sm ${
                      validateResults.all_correct ? "text-green-300" : "text-orange-300"
                    }`}
                  >
                    {validateResults.all_correct ? "✓" : "⚠"} {validateResults.summary}
                  </span>
                  {!validateResults.all_correct && (
                    <button
                      type="button"
                      onClick={acceptAllAiSuggestions}
                      className="text-xs bg-orange-600 hover:bg-orange-500 text-white px-3 py-1 rounded-lg transition-colors"
                    >
                      Barchasini to'g'irla
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Test cases table */}
            <div className="overflow-x-auto rounded-xl border border-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800/50 border-b border-gray-800 text-gray-400 text-xs uppercase">
                    <th className="text-left px-3 py-2.5 font-medium w-8">#</th>
                    <th className="text-left px-3 py-2.5 font-medium">Input</th>
                    <th className="text-left px-3 py-2.5 font-medium">Expected Output</th>
                    <th className="text-center px-3 py-2.5 font-medium w-20">Yashirin</th>
                    <th className="text-center px-3 py-2.5 font-medium w-20">Holat</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {testCases.map((tc, idx) => {
                    const vr = validateResults?.results?.[idx];
                    const rowClass = vr
                      ? vr.is_correct
                        ? "bg-green-950/10"
                        : "bg-red-950/15"
                      : "";
                    return (
                      <tr key={idx} className={rowClass}>
                        <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-1.5">
                          <textarea
                            value={tc.input}
                            onChange={(e) => updateTestCase(idx, "input", e.target.value)}
                            rows={2}
                            placeholder="[1, 2, 3]"
                            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono text-xs resize-none"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="space-y-1">
                            <textarea
                              value={tc.expected_output}
                              onChange={(e) =>
                                updateTestCase(idx, "expected_output", e.target.value)
                              }
                              rows={2}
                              placeholder="6"
                              className={`w-full bg-gray-800 border rounded px-2 py-1.5 text-gray-100 placeholder-gray-600 focus:outline-none font-mono text-xs resize-none transition-colors ${
                                vr && !vr.is_correct
                                  ? "border-red-500/50 focus:border-red-400"
                                  : vr?.is_correct
                                  ? "border-green-500/50"
                                  : "border-gray-700 focus:border-blue-500"
                              }`}
                            />
                            {vr && !vr.is_correct && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-orange-400">
                                  AI: <code className="font-mono">{vr.ai_output}</code>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => acceptAiSuggestion(idx)}
                                  className="text-xs text-orange-300 hover:text-white bg-orange-700/30 hover:bg-orange-600/40 px-2 py-0.5 rounded transition-colors"
                                >
                                  Qabul
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={tc.is_hidden}
                            onChange={(e) =>
                              updateTestCase(idx, "is_hidden", e.target.checked)
                            }
                            className="w-4 h-4 accent-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          {vr ? (
                            <span className={vr.is_correct ? "text-green-400" : "text-red-400"}>
                              {vr.is_correct ? "✓" : "✗"}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeTestCase(idx)}
                            className="text-gray-600 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-400/10"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={addTestCaseRow}
              className="w-full py-2.5 border border-dashed border-gray-700 hover:border-blue-500/50 text-gray-500 hover:text-blue-400 rounded-xl transition-colors text-sm"
            >
              + Test case qo'shish
            </button>

            <div className="text-xs text-gray-500 bg-gray-800/30 rounded-lg p-3">
              <strong className="text-gray-400">Eslatma:</strong> Input Python{" "}
              <code>eval()</code> formatida bo'lsin. Masalan:{" "}
              <code>[1, 2, 3]</code>, <code>"hello"</code>, <code>5</code>,{" "}
              <code>[1, 2], 5</code> (ko'p argument uchun).
              "Yashirin" belgilangan test case lar foydalanuvchiga ko'rsatilmaydi.
            </div>
          </div>
        </Section>

        {/* Save button bottom */}
        <div className="flex justify-end gap-3 pb-8">
          <button
            type="button"
            onClick={() => navigate("/admin/problems")}
            className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-colors"
          >
            Bekor qilish
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
          >
            {saving ? <span className="animate-spin">⟳</span> : null}
            {saving ? "Saqlanmoqda..." : isEditing ? "Yangilash" : "Yaratish"}
          </button>
        </div>
      </form>
    </div>
  );
}
