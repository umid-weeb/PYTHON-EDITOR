let pyodide;
let editor;
let autoSaveInterval;
let defaultCode = "";
let activeRunSession = null;
let activeDebugSession = null;
let activeDebugSteps = [];
let activeDebugStepIndex = 0;
let activeDebugLineNumber = null;

let debugRangeStartLine = null;
let debugRangeEndLine = null;
let debugRangeHighlightedStartLine = null;
let debugRangeHighlightedEndLine = null;
let debugRangeHighlightedBodyLines = [];

const DEBUG_MAX_STEPS = 500;

const MATH_FUNCTIONS = [
    "math.acos", "math.acosh", "math.asin", "math.asinh", "math.atan", "math.atan2", "math.atanh", "math.ceil",
    "math.comb", "math.copysign", "math.cos", "math.cosh", "math.degrees", "math.dist", "math.erf", "math.erfc",
    "math.exp", "math.expm1", "math.fabs", "math.factorial", "math.floor", "math.fmod", "math.frexp", "math.fsum",
    "math.gamma", "math.gcd", "math.hypot", "math.isclose", "math.isfinite", "math.isinf", "math.isnan", "math.isqrt",
    "math.ldexp", "math.lgamma", "math.log", "math.log10", "math.log1p", "math.log2", "math.modf", "math.nextafter",
    "math.perm", "math.pow", "math.radians", "math.remainder", "math.sin", "math.sinh", "math.sqrt", "math.tan",
    "math.tanh", "math.tau", "math.trunc", "math.ulp", "math.pi", "math.e", "math.inf", "math.nan"
];

const PYTHON_KEYWORDS = [
    "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue",
    "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in",
    "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
    "print", "input", "len", "range", "list", "dict", "set", "int", "str", "float", "bool", "type",
    "append", "extend", "insert", "remove", "pop", "clear", "index", "count", "sort", "reverse", "copy",
    "get", "items", "keys", "values", "update", "add", "discard", "union", "intersection", "difference"
];

const EDITOR_FONT_FAMILIES = {
    "IBM Plex Mono": '"IBM Plex Mono", monospace',
    "JetBrains Mono": '"JetBrains Mono", monospace',
    "Fira Code": '"Fira Code", monospace',
    "Victor Mono": '"Victor Mono", monospace',
    "Inconsolata": '"Inconsolata", monospace',
    "Azeret Mono": '"Azeret Mono", monospace',
    "Source Code Pro": '"Source Code Pro", monospace',
    "Roboto Mono": '"Roboto Mono", monospace',
    "Space Mono": '"Space Mono", monospace',
    "Ubuntu Mono": '"Ubuntu Mono", monospace',
    "Courier Prime": '"Courier Prime", monospace',
    "Anonymous Pro": '"Anonymous Pro", monospace',
};

// --- UTILS ---

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function normalizePositiveInteger(value) {
    const parsed = parseInt(value, 10);
    return isFinite(parsed) && parsed > 0 ? parsed : null;
}

function scrollOutputToLatest() {
    const output = document.getElementById("output");
    if (output) {
        output.scrollTop = output.scrollHeight;
    }
}

function scrollEditorToCursor() {
    if (editor) {
        editor.scrollIntoView(null, 20);
    }
}

function clearOutputInputHost() {
    const host = document.getElementById("output-input-host");
    if (host) {
        host.className = "output-input-host";
        host.innerHTML = "";
    }
}

function getPanelSplitStorageKey(stacked) {
    return stacked ? "editorPanelSplitMobileRatio" : "editorPanelSplitDesktopRatio";
}

function getPanelSplitDefaultRatio(stacked) {
    return stacked ? 0.54 : 0.56;
}

function isStackedPanelLayout() {
    return window.matchMedia("(max-width: 1080px)").matches;
}

function getPanelSplitBounds(container, stacked) {
    const availableSpace =
        (stacked ? container.clientHeight : container.clientWidth) -
        (parseFloat(getComputedStyle(container).getPropertyValue("--panel-resizer-size")) || 14);
    const minPrimary = stacked ? 240 : 320;
    const minSecondary = stacked ? 220 : 300;

    return {
        availableSpace: Math.max(0, availableSpace),
        minPrimary,
        minSecondary,
    };
}

function applyPanelSplitRatio(container, ratio, options = {}) {
    const stacked = isStackedPanelLayout();
    const bounds = getPanelSplitBounds(container, stacked);
    if (!bounds.availableSpace) return;

    const minRatio = bounds.minPrimary / bounds.availableSpace;
    const maxRatio = 1 - bounds.minSecondary / bounds.availableSpace;
    const safeRatio = Math.min(
        Math.max(Number.isFinite(ratio) ? ratio : getPanelSplitDefaultRatio(stacked), minRatio),
        Math.max(minRatio, maxRatio)
    );
    const sizePx = Math.round(bounds.availableSpace * safeRatio);
    const resizer = document.getElementById("panel-resizer");

    container.style.setProperty("--panel-primary-size", `${sizePx}px`);
    if (resizer) {
        resizer.setAttribute("aria-orientation", stacked ? "horizontal" : "vertical");
    }

    if (options.persist !== false) {
        localStorage.setItem(getPanelSplitStorageKey(stacked), safeRatio.toFixed(4));
    }

    if (editor) {
        editor.refresh();
    }
}

function loadSavedPanelSplitRatio(stacked) {
    const stored = Number.parseFloat(localStorage.getItem(getPanelSplitStorageKey(stacked)) || "");
    return Number.isFinite(stored) ? stored : getPanelSplitDefaultRatio(stacked);
}

function setupPanelResizer() {
    const container = document.querySelector(".editor-container");
    const resizer = document.getElementById("panel-resizer");
    const primaryPanel = container?.querySelector(".editor-panel");

    if (!container || !resizer || !primaryPanel) return;

    const applySavedSplit = () => {
        applyPanelSplitRatio(container, loadSavedPanelSplitRatio(isStackedPanelLayout()), { persist: false });
    };

    let dragState = null;

    const endResize = () => {
        if (!dragState) return;
        container.classList.remove("is-resizing");
        document.body.classList.remove("panel-resizing", "panel-resizing-horizontal", "panel-resizing-vertical");
        dragState = null;
    };

    const onPointerMove = (event) => {
        if (!dragState) return;
        const delta = dragState.stacked
            ? event.clientY - dragState.startPointer
            : event.clientX - dragState.startPointer;
        const nextSize = dragState.startSize + delta;
        const ratio = nextSize / dragState.availableSpace;
        applyPanelSplitRatio(container, ratio);
    };

    resizer.addEventListener("pointerdown", (event) => {
        const stacked = isStackedPanelLayout();
        const bounds = getPanelSplitBounds(container, stacked);
        const panelRect = primaryPanel.getBoundingClientRect();
        dragState = {
            stacked,
            startPointer: stacked ? event.clientY : event.clientX,
            startSize: stacked ? panelRect.height : panelRect.width,
            availableSpace: bounds.availableSpace,
        };

        container.classList.add("is-resizing");
        document.body.classList.add("panel-resizing");
        document.body.classList.add(stacked ? "panel-resizing-vertical" : "panel-resizing-horizontal");
        resizer.setPointerCapture(event.pointerId);
        event.preventDefault();
    });

    resizer.addEventListener("pointermove", onPointerMove);
    resizer.addEventListener("pointerup", endResize);
    resizer.addEventListener("pointercancel", endResize);
    resizer.addEventListener("lostpointercapture", endResize);

    window.addEventListener("resize", applySavedSplit);
    applySavedSplit();
}

// --- PYTHON ENVIRONMENT ---

async function initPyodide() {
    const loading = document.getElementById("loading");
    loading.classList.add("active");

    try {
        pyodide = await loadPyodide();
        loading.textContent = "⏳ Formatlash vositalari yuklanmoqda...";
        await ensurePythonRuntimeTools();
        loading.textContent = "⏳ Python ishga tayyorlanmoqda...";
        await setupSafeExecutionEnvironment();
        loading.textContent = "✅ Python tayyor!";
        setTimeout(() => {
            loading.classList.remove("active");
        }, 1500);
    } catch (error) {
        loading.textContent = "❌ Xatolik: Python yuklanmadi!";
        loading.style.background = "#fee2e2";
        loading.style.color = "#991b1b";
    }
}

async function ensurePythonRuntimeTools() {
    try {
        await pyodide.loadPackage("micropip");
        await pyodide.runPythonAsync(`
import micropip
try:
    import autopep8
except Exception:
    await micropip.install("autopep8")
    import autopep8
        `);
    } catch (error) {
        console.warn("Python formatter vositalari yuklanmadi:", error);
    }
}

async function setupSafeExecutionEnvironment() {
    await pyodide.runPythonAsync(`
import sys, ast, builtins, traceback, time
from io import StringIO

class LoopIterationError(Exception): pass
class AwaitingInput(Exception):
    def __init__(self, prompt="", input_index=0):
        super().__init__(prompt)
        self.prompt = prompt or ""
        self.input_index = input_index

class LoopTransformer(ast.NodeTransformer):
    def visit_loop(self, node):
        self.generic_visit(node)
        guard = ast.Expr(ast.Call(func=ast.Name(id="_tick", ctx=ast.Load()), args=[], keywords=[]))
        ast.copy_location(guard, node)
        node.body.insert(0, guard)
        return node
    visit_For = visit_While = visit_loop

def _tick():
    if time.time() - _executor.start_time > _executor.timeout:
        raise LoopIterationError("Vaqt chegarasi tugadi (1s). Cheksiz sikl bo'lishi mumkin.")

class SafeExecutor:
    def __init__(self, timeout=1.0, max_output=50000):
        self.timeout = timeout
        self.max_output = max_output
        self.start_time = None

    def _serialize_error(self, error):
        tb = traceback.extract_tb(error.__traceback__)
        user_frame = next((f for f in reversed(tb) if f.filename == "<user_code>"), None)
        ln = getattr(error, "lineno", user_frame.lineno if user_frame else None)
        col = getattr(error, "offset", None)
        txt = getattr(error, "text", user_frame.line if user_frame else None)
        
        return {
            "type": type(error).__name__,
            "message": str(error),
            "line": ln,
            "column": col,
            "codeLine": txt.strip() if isinstance(txt, str) else None,
            "traceback": "".join(traceback.format_exception(type(error), error, error.__traceback__))
        }

    def execute(self, code, inputs=None):
        old_stdout, old_stderr = sys.stdout, sys.stderr
        sys.stdout = sys.stderr = StringIO()
        inputs = [str(v) if v is not None else "" for v in (inputs or [])]
        consumed = 0

        def m_input(prompt=""):
            nonlocal consumed
            if consumed >= len(inputs): raise AwaitingInput(str(prompt), consumed)
            val = inputs[consumed]; consumed += 1; return val

        # Custom output handler with truncation to prevent browser freeze
        def m_write(data):
            if sys.stdout.tell() < self.max_output:
                old_write(data)
            elif sys.stdout.tell() == self.max_output:
                old_write("\\n... [Natija juda ko'p bo'lganligi sababli qirqildi] ...")
        
        old_write = sys.stdout.write
        sys.stdout.write = m_write

        try:
            tree = ast.parse(code, filename="<user_code>")
            LoopTransformer().visit(tree)
            ast.fix_missing_locations(tree)
            compiled = compile(tree, filename="<user_code>", mode="exec")
            
            self.start_time = time.time() # Corrected time.now to time.time
            glbs = {"__builtins__": dict(vars(builtins), input=m_input), "__name__": "__main__", "_tick": _tick}
            exec(compiled, glbs)
            return {"success": True, "output": sys.stdout.getvalue().rstrip()}
        except AwaitingInput as e:
            return {"success": False, "awaitingInput": True, "error": {"prompt": e.prompt, "inputIndex": e.input_index}, "output": sys.stdout.getvalue().rstrip()}
        except BaseException as e:
            return {"success": False, "error": self._serialize_error(e), "output": sys.stdout.getvalue().rstrip()}
        finally:
            sys.stdout.write = old_write # Restore original write
            sys.stdout, sys.stderr = old_stdout, old_stderr

_executor = SafeExecutor(timeout=1.0)
def safe_run(code, inputs=None): return _executor.execute(code, inputs)

def auto_fix_code(code):
    try:
        import autopep8
        res = autopep8.fix_code(code)
        return {"code": res, "changed": res != code, "formatterAvailable": True}
    except:
        return {"code": code, "changed": False, "formatterAvailable": False}
    `);
}

// --- CORE FUNCTIONS ---

async function runCode() {
    if (!pyodide) return showOutput("Python yuklanmoqda...", "error");
    const code = editor.getValue();
    if (!code.trim()) return showOutput("Kod kiritilmagan.", "error");

    clearDebugState();
    activeRunSession = { code, inputValues: [] };
    showOutput("Bajarilmoqda...", "");
    await continueRunSession();
}

async function continueRunSession() {
    if (!activeRunSession) return;
    const start = performance.now();
    try {
        const res = await pyodide.runPythonAsync(`import json; json.dumps(safe_run(${JSON.stringify(activeRunSession.code)}, ${JSON.stringify(activeRunSession.inputValues)}))`);
        const result = JSON.parse(res);
        const time = ((performance.now() - start) / 1000).toFixed(3);

        if (result.awaitingInput) {
            showOutput(result.output ? result.output + "\n..." : "Input kutilmoqda...", "");
            renderOutputPanelInput(result.error.prompt, result.error.inputIndex);
            return;
        }

        activeRunSession = null;
        if (!result.success) {
            highlightEditorError(result.error.line);
            showOutput(`❌ ${result.error.type}: ${result.error.message}\n\nQator: ${result.error.line}\n${result.output}`, "error");
        } else {
            clearEditorDiagnostics();
            showOutput(`${result.output || "Muvaffaqiyatli bajarildi."}\n\n⏱ Vaqt: ${time}s`, "success");
        }
    } catch (e) {
        showOutput("Xatolik: " + e.message, "error");
    }
}

function renderOutputPanelInput(prompt, index) {
    const host = document.getElementById("output-input-host");
    if (!host) return;
    host.className = "output-input-host active";
    host.innerHTML = `
        <div class="output-input-label">${escapeHtml(prompt || "Qiymat kiriting:")}</div>
        <div class="output-input-row">
            <input type="text" id="output-panel-input" class="output-input-field" autocomplete="off" />
            <button id="output-panel-submit" class="output-input-submit">Yuborish</button>
        </div>`;
    
    const input = document.getElementById("output-panel-input");
    const submitBtn = document.getElementById("output-panel-submit");

    const submit = () => {
        const val = input.value;
        if (activeRunSession) activeRunSession.inputValues.push(val);
        else if (activeDebugSession) activeDebugSession.inputValues.push(val);
        clearOutputInputHost();
        if (activeRunSession) continueRunSession();
        else if (activeDebugSession) continueDebugSession();
    };

    submitBtn.onclick = submit;
    input.onkeydown = (e) => { if (e.key === "Enter") submit(); };
    input.focus();
    scrollOutputToLatest();
}

// --- EDITOR SETUP ---

function setupEditor() {
    const textArea = document.getElementById("code-editor");
    if (!textArea) return;

    editor = CodeMirror.fromTextArea(textArea, {
        mode: "python",
        theme: "eclipse",
        lineNumbers: true,
        indentUnit: 4,
        smartIndent: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        styleActiveLine: true,
        foldGutter: true,
        gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "breakpoints"],
        extraKeys: {
            "Ctrl-Enter": runCode,
            "F5": runCode,
            "Ctrl-S": saveCode,
            "Ctrl-Shift-F": formatEditorCode,
            "Tab": (cm) => {
                if (cm.somethingSelected()) cm.indentSelection("add");
                else cm.replaceSelection("    ");
            },
            "Shift-Tab": (cm) => cm.indentSelection("subtract")
        }
    });

    editor.on("inputRead", onEditorInputRead);
    editor.on("cursorActivity", updateEditorStatus);
    editor.on("change", () => {
        updateEditorStatus();
        autoSaveCode();
    });

    loadTheme();
    loadEditorTypographyPreferences();
    loadAutoSavedCode();
    setupPanelResizer();
    updateEditorStatus();
}

function updateEditorStatus() {
    const cursor = editor.getCursor();
    const primary = document.getElementById("editor-status-primary");
    const secondary = document.getElementById("editor-status-secondary");
    if (primary) primary.textContent = `Ln ${cursor.line + 1}, Col ${cursor.ch + 1}`;
    if (secondary) secondary.textContent = `Python 3 | UTF-8 | Spaces: 4`;
}

function highlightEditorError(line) {
    clearEditorDiagnostics();
    if (!line || line > editor.lineCount()) return;
    const idx = line - 1;
    activeDebugLineNumber = idx; // Reuse variable for simple highlight
    editor.addLineClass(idx, "background", "error-line");
    editor.setCursor({ line: idx, ch: 0 });
    editor.scrollIntoView({ line: idx, ch: 0 }, 100);
}

function clearEditorDiagnostics() {
    if (activeDebugLineNumber !== null) {
        editor.removeLineClass(activeDebugLineNumber, "background", "error-line");
        activeDebugLineNumber = null;
    }
}

// --- THEME & TYPOGRAPHY ---

function toggleTheme() {
    const isDark = !document.body.classList.contains("dark-mode");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    loadTheme();
}

function loadTheme() {
    const theme = localStorage.getItem("theme") || "light";
    const isDark = theme === "dark";
    document.body.classList.toggle("dark-mode", isDark);
    const btn = document.getElementById("themeBtn");
    if (btn) btn.querySelector(".button-label").textContent = isDark ? "Light" : "Dark";
    if (editor) editor.setOption("theme", isDark ? "monokai" : "eclipse");
}

function applyEditorTypography(family, size) {
    const wrapper = editor.getWrapperElement();
    wrapper.style.fontFamily = EDITOR_FONT_FAMILIES[family] || family;
    wrapper.style.fontSize = size;
    localStorage.setItem("editorFontFamily", family);
    localStorage.setItem("editorFontSize", size);
    editor.refresh();
}

function loadEditorTypographyPreferences() {
    const family = localStorage.getItem("editorFontFamily") || "IBM Plex Mono";
    const size = localStorage.getItem("editorFontSize") || "14px";
    
    const fSelect = document.getElementById("editor-font-family");
    const sSelect = document.getElementById("editor-font-size");
    
    if (fSelect) {
        fSelect.value = family;
        fSelect.onchange = () => applyEditorTypography(fSelect.value, sSelect.value);
    }
    if (sSelect) {
        sSelect.value = size;
        sSelect.onchange = () => applyEditorTypography(fSelect.value, sSelect.value);
    }
    
    applyEditorTypography(family, size);
}

// --- FILE OPERATIONS ---

function saveCode() {
    localStorage.setItem("pythonSavedCode", editor.getValue());
    showOutput("✅ Kod saqlandi.", "success");
    setTimeout(clearOutput, 2000);
}

function loadCode() {
    const code = localStorage.getItem("pythonSavedCode");
    if (code) {
        editor.setValue(code);
        showOutput("✅ Saqlangan kod yuklandi.", "success");
    } else {
        showOutput("❌ Saqlangan kod topilmadi.", "error");
    }
}

function downloadCode() {
    const blob = new Blob([editor.getValue()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `main_${Date.now()}.py`;
    a.click();
    URL.revokeObjectURL(url);
}

function uploadFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        editor.setValue(e.target.result);
        showOutput(`✅ Fayl yuklandi: ${file.name}`, "success");
    };
    reader.readAsText(file);
}

function autoSaveCode() {
    localStorage.setItem("pythonAutoSave", JSON.stringify({
        code: editor.getValue(),
        lastSaved: Date.now()
    }));
}

function loadAutoSavedCode() {
    const data = localStorage.getItem("pythonAutoSave");
    if (data) {
        try {
            const parsed = JSON.parse(data);
            if (parsed.code) editor.setValue(parsed.code);
        } catch(e) {}
    }
}

async function formatEditorCode() {
    if (!pyodide) return showOutput("Python yuklanmagan.", "error");
    const code = editor.getValue();
    showOutput("Formatlanmoqda...", "");
    try {
        const res = await pyodide.runPythonAsync(`import json; json.dumps(auto_fix_code(${JSON.stringify(code)}))`);
        const result = JSON.parse(res);
        if (result.formatterAvailable) {
            editor.setValue(result.code);
            showOutput("✅ Kod formatlandi.", "success");
        } else {
            showOutput("Formatlash tooli (autopep8) hali yuklanmagan.", "error");
        }
        setTimeout(clearOutput, 2000);
    } catch (e) {
        showOutput("Xatolik: " + e.message, "error");
    }
}

function clearOutput() {
    const output = document.getElementById("output");
    if (output) {
        output.textContent = "Natija bu yerda ko'rsatiladi...";
        output.className = "output-content";
    }
    clearEditorDiagnostics();
    clearOutputInputHost();
}

function showOutput(text, type) {
    const output = document.getElementById("output");
    if (!output) return;
    output.textContent = text;
    output.className = type ? "output-content " + type : "output-content";
    scrollOutputToLatest();
}

function openArena() {
    window.location.href = "/zone";
}

// Debug placeholders for now
function debugCode() { showOutput("Debug rejimi online editor uchun tez orada qo'shiladi.", ""); }
function clearDebugState() {
    activeDebugSession = null;
    activeDebugSteps = [];
    activeDebugStepIndex = 0;
}

// --- AUTOCOMPLETE ---

function onEditorInputRead(cm, change) {
    if (change.origin !== "+input") return;
    const cur = cm.getCursor();
    const token = cm.getTokenAt(cur);
    const char = change.text[0];

    // Neuvor: symbols or very short input shouldn't trigger
    if (!/^[a-zA-Z_0-9]$/.test(char) && char !== ".") return;
    if (token.string.length < 2 && char !== ".") return;

    showAutocompleteHints(cm);
}

function showAutocompleteHints(cm) {
    cm.showHint({
        hint: function(editor) {
            const cur = editor.getCursor();
            const token = editor.getTokenAt(cur);
            const start = token.start;
            const end = cur.ch;
            const line = cur.line;
            const currentWord = token.string;

            // Collect all hints
            const list = [...new Set([
                ...PYTHON_KEYWORDS,
                ...MATH_FUNCTIONS,
                ...(CodeMirror.hint.anyword(editor).list || [])
            ])].filter(h => h.startsWith(currentWord)).sort();

            return {
                list: list,
                from: CodeMirror.Pos(line, start),
                to: CodeMirror.Pos(line, end)
            };
        },
        completeSingle: false
    });
}

// --- INITIALIZE ---

window.addEventListener("DOMContentLoaded", () => {
    setupEditor();
    initPyodide();
});
