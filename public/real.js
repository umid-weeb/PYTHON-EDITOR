let pyodide;
let editor;
let autoSaveInterval;
let defaultCode = "";
let activeErrorLineNumber = null;
let activeErrorTextMarker = null;

const PYTHON_KEYWORDS = [
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
  "print",
  "input",
  "len",
  "range",
  "str",
  "int",
  "float",
  "list",
  "dict",
  "set",
  "tuple",
  "bool",
  "type",
  "open",
  "file",
  "round",
  "abs",
  "all",
  "any",
  "sum",
  "min",
  "max",
  "sorted",
  "reversed",
  "enumerate",
  "zip",
  "map",
  "filter",
  "help",
];

const MATH_FUNCTIONS = [
  "math.sqrt",
  "math.pow",
  "math.floor",
  "math.ceil",
  "math.round",
  "math.sin",
  "math.cos",
  "math.tan",
  "math.asin",
  "math.acos",
  "math.atan",
  "math.log",
  "math.log10",
  "math.exp",
  "math.pi",
  "math.e",
  "math.degrees",
  "math.radians",
  "math.factorial",
];

const COMMON_PYTHON_NAMES = [...new Set([...PYTHON_KEYWORDS, "math"])];

function extractUserDefinedNames(code) {
  const names = new Set();
  const funcRegex = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const classRegex = /class\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const varRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g;
  const loopVarRegex = /for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in/g;
  const importRegex =
    /^\s*import\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*))?/gm;
  const fromImportRegex =
    /^\s*from\s+[a-zA-Z_][a-zA-Z0-9_.]*\s+import\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*))?/gm;
  const paramRegex = /def\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(([^)]*)\)/g;
  let match;

  while ((match = funcRegex.exec(code)) !== null) {
    names.add(match[1]);
  }

  while ((match = classRegex.exec(code)) !== null) {
    names.add(match[1]);
  }

  while ((match = varRegex.exec(code)) !== null) {
    names.add(match[1]);
  }

  while ((match = loopVarRegex.exec(code)) !== null) {
    names.add(match[1]);
  }

  while ((match = importRegex.exec(code)) !== null) {
    names.add(match[2] || match[1]);
  }

  while ((match = fromImportRegex.exec(code)) !== null) {
    names.add(match[2] || match[1]);
  }

  while ((match = paramRegex.exec(code)) !== null) {
    const params = match[1]
      .split(",")
      .map((param) => param.trim())
      .map((param) => param.replace(/[:=].*$/, "").replace(/^\*+/, "").trim())
      .filter(Boolean);

    params.forEach((param) => names.add(param));
  }

  return Array.from(names);
}

function levenshteinDistance(left, right) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let row = 0; row < rows; row++) {
    matrix[row][0] = row;
  }

  for (let col = 0; col < cols; col++) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row++) {
    for (let col = 1; col < cols; col++) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

function findClosestNameSuggestion(targetName, code) {
  if (!targetName) {
    return null;
  }

  const candidates = [
    ...new Set([...extractUserDefinedNames(code), ...COMMON_PYTHON_NAMES]),
  ].filter((candidate) => candidate && candidate !== targetName);

  const loweredTarget = targetName.toLowerCase();
  let bestCandidate = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = levenshteinDistance(
      loweredTarget,
      candidate.toLowerCase()
    );
    const maxLength = Math.max(candidate.length, targetName.length);
    const threshold = Math.max(1, Math.ceil(maxLength / 3));

    if (distance > threshold) {
      continue;
    }

    if (
      distance < bestDistance ||
      bestCandidate === null ||
      (distance === bestDistance && candidate.length < bestCandidate.length)
    ) {
      bestCandidate = candidate;
      bestDistance = distance;
    }
  }

  return bestCandidate;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePositiveInteger(value) {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function extractUndefinedName(errorInfo) {
  if (!errorInfo) {
    return null;
  }

  if (errorInfo.undefinedName) {
    return errorInfo.undefinedName;
  }

  const match = (errorInfo.message || "").match(/name '([^']+)' is not defined/i);
  return match ? match[1] : null;
}

function extractSuggestionFromMessage(message) {
  const match = (message || "").match(/Did you mean:\s*['"]([^'"]+)['"]/i);
  return match ? match[1] : null;
}

function stripInlineSuggestion(message) {
  return (message || "")
    .replace(/\s*Did you mean:\s*['"][^'"]+['"]\??/i, "")
    .trim();
}

function findColumnForName(lineText, targetName) {
  if (!lineText || !targetName) {
    return null;
  }

  const pattern = new RegExp(`\\b${escapeRegExp(targetName)}\\b`);
  const match = pattern.exec(lineText);
  return match ? match.index + 1 : null;
}

function buildSuggestedLine(lineText, originalName, suggestion) {
  if (!lineText || !originalName || !suggestion) {
    return null;
  }

  const pattern = new RegExp(`\\b${escapeRegExp(originalName)}\\b`);
  return pattern.test(lineText) ? lineText.replace(pattern, suggestion) : null;
}

function buildCodeFrame(lineText, lineNumber, columnNumber) {
  if (!lineText) {
    return "";
  }

  const safeLineNumber = lineNumber || "?";
  const prefix = `${safeLineNumber} | `;
  const frameLine = `${prefix}${lineText}`;

  if (!columnNumber) {
    return frameLine;
  }

  const safeColumn = Math.max(1, Math.min(columnNumber, lineText.length + 1));
  return `${frameLine}\n${" ".repeat(prefix.length + safeColumn - 1)}^`;
}

function getFriendlyErrorMessage(errorInfo, undefinedName) {
  const errorType = errorInfo?.type || "PythonError";

  switch (errorType) {
    case "NameError":
      return undefinedName
        ? `"${undefinedName}" nomi topilmadi.`
        : "Aniqlanmagan nom ishlatildi.";
    case "SyntaxError":
      return "Kod sintaksisida xatolik bor.";
    case "IndentationError":
      return "Indentatsiya noto'g'ri. Bo'sh joy va tablarni tekshiring.";
    case "TypeError":
      return "Mos kelmaydigan qiymat turi ishlatildi.";
    case "ZeroDivisionError":
      return "0 ga bo'lish mumkin emas.";
    case "LoopIterationError":
      return "Kod juda uzoq ishladi. Cheksiz sikl bo'lishi mumkin.";
    default:
      return errorInfo?.message || "Kod bajarishda xatolik yuz berdi.";
  }
}

function getWordRangeAtColumn(lineText, columnIndex) {
  if (!lineText) {
    return null;
  }

  const isWordCharacter = (char) => /[a-zA-Z0-9_]/.test(char || "");
  const safeIndex = Math.max(
    0,
    Math.min(columnIndex, Math.max(0, lineText.length - 1))
  );
  let start = safeIndex;
  let end = safeIndex;

  if (
    !isWordCharacter(lineText[start]) &&
    start > 0 &&
    isWordCharacter(lineText[start - 1])
  ) {
    start -= 1;
    end -= 1;
  }

  if (!isWordCharacter(lineText[start])) {
    return {
      start: safeIndex,
      end: Math.min(safeIndex + 1, lineText.length),
    };
  }

  while (start > 0 && isWordCharacter(lineText[start - 1])) {
    start -= 1;
  }

  while (end < lineText.length && isWordCharacter(lineText[end])) {
    end += 1;
  }

  return { start, end };
}

function clearEditorDiagnostics() {
  if (!editor) {
    return;
  }

  if (activeErrorLineNumber !== null) {
    editor.removeLineClass(activeErrorLineNumber, "background", "error-line");
    activeErrorLineNumber = null;
  }

  if (activeErrorTextMarker) {
    activeErrorTextMarker.clear();
    activeErrorTextMarker = null;
  }
}

function highlightEditorError(lineNumber, columnNumber, focusToken) {
  clearEditorDiagnostics();

  if (!editor) {
    return;
  }

  const safeLineNumber = normalizePositiveInteger(lineNumber);
  if (!safeLineNumber || safeLineNumber > editor.lineCount()) {
    return;
  }

  const lineIndex = safeLineNumber - 1;
  const lineText = editor.getLine(lineIndex) || "";
  let start = null;
  let end = null;

  activeErrorLineNumber = lineIndex;
  editor.addLineClass(lineIndex, "background", "error-line");

  if (focusToken) {
    const pattern = new RegExp(`\\b${escapeRegExp(focusToken)}\\b`);
    const match = pattern.exec(lineText);
    if (match) {
      start = match.index;
      end = match.index + match[0].length;
    }
  }

  if (start === null) {
    const safeColumn = normalizePositiveInteger(columnNumber);
    if (safeColumn) {
      const wordRange = getWordRangeAtColumn(lineText, safeColumn - 1);
      if (wordRange) {
        start = wordRange.start;
        end = wordRange.end;
      }
    }
  }

  if (start !== null && end !== null && end > start) {
    activeErrorTextMarker = editor.markText(
      { line: lineIndex, ch: start },
      { line: lineIndex, ch: end },
      { className: "error-token" }
    );
  }

  editor.setCursor({ line: lineIndex, ch: start !== null ? start : 0 });
  editor.scrollIntoView(
    { line: lineIndex, ch: start !== null ? start : 0 },
    120
  );
}

function buildExecutionErrorReport(resultObj, code, executionTime) {
  const errorInfo = resultObj.error || {};
  const undefinedName = extractUndefinedName(errorInfo);
  const suggestion =
    extractSuggestionFromMessage(errorInfo.message) ||
    findClosestNameSuggestion(undefinedName, code);
  const friendlyMessage = getFriendlyErrorMessage(errorInfo, undefinedName);
  const rawPythonMessage = stripInlineSuggestion(errorInfo.message);
  const lineNumber = normalizePositiveInteger(errorInfo.line);
  let columnNumber = normalizePositiveInteger(errorInfo.column);
  const editorLine =
    lineNumber && editor && lineNumber <= editor.lineCount()
      ? editor.getLine(lineNumber - 1)
      : "";
  const codeLine = (editorLine || errorInfo.codeLine || "").replace(/\r?\n$/, "");

  if (!columnNumber && undefinedName && codeLine) {
    columnNumber = findColumnForName(codeLine, undefinedName);
  }

  const reportLines = [
    `Xatolik turi: ${errorInfo.type || "PythonError"}`,
    `Sabab: ${friendlyMessage}`,
  ];

  if (rawPythonMessage && rawPythonMessage !== friendlyMessage) {
    reportLines.push(`Python xabari: ${rawPythonMessage}`);
  }

  if (lineNumber) {
    reportLines.push(
      `Joylashuv: ${lineNumber}-qator${columnNumber ? `, ${columnNumber}-ustun` : ""}`
    );
  }

  if (codeLine) {
    reportLines.push(
      "",
      "Muammo bo'lgan qator:",
      buildCodeFrame(codeLine, lineNumber, columnNumber)
    );
  }

  if (suggestion && suggestion !== undefinedName) {
    reportLines.push("", `Did you mean: "${suggestion}"?`);

    const suggestedLine = buildSuggestedLine(codeLine, undefinedName, suggestion);
    if (suggestedLine && suggestedLine !== codeLine) {
      reportLines.push("Tavsiya etilgan variant:", suggestedLine);
    }
  }

  if (resultObj.output && resultObj.output.trim()) {
    reportLines.push("", "Xatolikdan oldingi chiqish:", resultObj.output.trim());
  }

  reportLines.push("", `Bajarilish vaqti: ${executionTime} soniya`);

  return {
    text: reportLines.join("\n"),
    lineNumber,
    columnNumber,
    focusToken: undefinedName || suggestion || null,
  };
}

window.addEventListener("DOMContentLoaded", function () {
  const textarea = document.getElementById("code-editor");
  defaultCode = textarea.value;

  editor = CodeMirror.fromTextArea(textarea, {
    mode: "python",
    theme: "monokai",
    lineNumbers: true,
    indentUnit: 4,
    indentWithTabs: false,
    lineWrapping: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    matchTags: true,
    styleActiveLine: true,
    foldGutter: true,
    gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "breakpoints"],
    extraKeys: {
      "Ctrl-Space": "autocomplete",
      "Ctrl-/": toggleComment,
      "Ctrl-Shift-F": formatCode,
      "Ctrl-D": duplicateLine,
      "Alt-Up": moveLineUp,
      "Alt-Down": moveLineDown,
      "Ctrl-F": showFindReplace,
      "Ctrl-H": showFindReplace,
      "Ctrl-G": goToLine,
      "Ctrl-Shift-K": deleteLine,
      Tab: function (cm) {
        if (cm.state.completionActive) {
          return CodeMirror.Pass;
        }
        if (cm.somethingSelected()) {
          cm.indentSelection("add");
        } else {
          cm.replaceSelection("    ");
        }
      },
      "Shift-Tab": function (cm) {
        cm.indentSelection("subtract");
      },
    },
    hintOptions: {
      completeSingle: false,
      alignWithWord: true,
      closeOnUnfocus: true,
    },
  });

  setupAutoClose();
  setupAutocomplete();
  setupCodeSnippets();
  setupMultipleCursors();
  setupBreakpoints();
  loadAutoSavedCode();
  loadTheme();
  startAutoSave();
  initPyodide();
});

// 1. TOGGLE COMMENT (Ctrl+/)
function toggleComment(cm) {
  const from = cm.getCursor("start");
  const to = cm.getCursor("end");
  const lineCount = to.line - from.line + 1;

  let allCommented = true;
  for (let i = from.line; i <= to.line; i++) {
    const line = cm.getLine(i);
    if (!line.trim().startsWith("#")) {
      allCommented = false;
      break;
    }
  }

  cm.operation(() => {
    for (let i = from.line; i <= to.line; i++) {
      const line = cm.getLine(i);
      if (allCommented) {
        cm.replaceRange(
          line.replace(/^\s*#\s?/, ""),
          { line: i, ch: 0 },
          { line: i, ch: line.length }
        );
      } else {
        const indent = line.match(/^\s*/)[0];
        cm.replaceRange(
          indent + "# " + line.trim(),
          { line: i, ch: 0 },
          { line: i, ch: line.length }
        );
      }
    }
  });
}

// 2. CODE FORMATTING (Ctrl+Shift+F)
function formatCode(cm) {
  const code = cm.getValue();
  const lines = code.split("\n");
  let formatted = [];
  let indentLevel = 0;

  for (let line of lines) {
    const trimmed = line.trim();

    if (
      trimmed.startsWith("elif ") ||
      trimmed.startsWith("else:") ||
      trimmed.startsWith("except") ||
      trimmed.startsWith("finally:")
    ) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    if (trimmed) {
      formatted.push("    ".repeat(indentLevel) + trimmed);
    } else {
      formatted.push("");
    }

    if (trimmed.endsWith(":")) {
      indentLevel++;
    }

    if (
      trimmed.startsWith("return ") ||
      trimmed.startsWith("break") ||
      trimmed.startsWith("continue") ||
      trimmed.startsWith("pass")
    ) {
      indentLevel = Math.max(0, indentLevel - 1);
    }
  }

  cm.setValue(formatted.join("\n"));
  showOutput("✅ Kod formatlandi", "success");
  setTimeout(clearOutput, 2000);
}

// 3. DUPLICATE LINE (Ctrl+D)
function duplicateLine(cm) {
  const cursor = cm.getCursor();
  const line = cm.getLine(cursor.line);
  cm.replaceRange("\n" + line, { line: cursor.line, ch: line.length });
  cm.setCursor({ line: cursor.line + 1, ch: cursor.ch });
}

// 4. MOVE LINE UP (Alt+Up)
function moveLineUp(cm) {
  const cursor = cm.getCursor();
  if (cursor.line === 0) return;

  const line = cm.getLine(cursor.line);
  const prevLine = cm.getLine(cursor.line - 1);

  cm.operation(() => {
    cm.replaceRange(
      line + "\n",
      { line: cursor.line - 1, ch: 0 },
      { line: cursor.line - 1, ch: prevLine.length }
    );
    cm.replaceRange(
      prevLine,
      { line: cursor.line, ch: 0 },
      { line: cursor.line, ch: line.length }
    );
    cm.setCursor({ line: cursor.line - 1, ch: cursor.ch });
  });
}

// 5. MOVE LINE DOWN (Alt+Down)
function moveLineDown(cm) {
  const cursor = cm.getCursor();
  if (cursor.line === cm.lineCount() - 1) return;

  const line = cm.getLine(cursor.line);
  const nextLine = cm.getLine(cursor.line + 1);

  cm.operation(() => {
    cm.replaceRange(
      nextLine,
      { line: cursor.line, ch: 0 },
      { line: cursor.line, ch: line.length }
    );
    cm.replaceRange("\n" + line, {
      line: cursor.line + 1,
      ch: nextLine.length,
    });
    cm.setCursor({ line: cursor.line + 1, ch: cursor.ch });
  });
}

// 6. FIND & REPLACE (Ctrl+F / Ctrl+H)
function showFindReplace(cm) {
  const dialog = document.createElement("div");
  dialog.className = "find-replace-dialog";
  dialog.innerHTML = `
        <div class="find-replace-content">
            <input type="text" id="findInput" placeholder="Qidirish..." />
            <input type="text" id="replaceInput" placeholder="Almashtirish..." />
            <div class="find-replace-buttons">
                <button onclick="findNext()">Keyingi</button>
                <button onclick="findPrev()">Oldingi</button>
                <button onclick="replaceOne()">Almashtir</button>
                <button onclick="replaceAll()">Barchasini</button>
                <button onclick="closeFindReplace()">Yopish</button>
            </div>
        </div>
    `;
  document.body.appendChild(dialog);
  document.getElementById("findInput").focus();
}

window.findNext = function () {
  const searchText = document.getElementById("findInput").value;
  if (!searchText) return;
  editor.execCommand("findNext");
};

window.findPrev = function () {
  editor.execCommand("findPrev");
};

window.replaceOne = function () {
  const replaceText = document.getElementById("replaceInput").value;
  editor.replaceSelection(replaceText);
};

window.replaceAll = function () {
  const searchText = document.getElementById("findInput").value;
  const replaceText = document.getElementById("replaceInput").value;
  const code = editor.getValue();
  editor.setValue(code.replaceAll(searchText, replaceText));
};

window.closeFindReplace = function () {
  const dialog = document.querySelector(".find-replace-dialog");
  if (dialog) dialog.remove();
};

// 7. GO TO LINE (Ctrl+G)
function goToLine(cm) {
  const line = prompt("Qator raqamini kiriting:");
  if (line && !isNaN(line)) {
    const lineNum = parseInt(line) - 1;
    cm.setCursor({ line: lineNum, ch: 0 });
    cm.scrollIntoView({ line: lineNum, ch: 0 }, 100);
  }
}

// 8. DELETE LINE (Ctrl+Shift+K)
function deleteLine(cm) {
  const cursor = cm.getCursor();
  cm.replaceRange(
    "",
    { line: cursor.line, ch: 0 },
    { line: cursor.line + 1, ch: 0 }
  );
}

// 9. CODE SNIPPETS
function setupCodeSnippets() {
  const snippets = {
    for: "for i in range(${1:10}):\n    ${2:pass}",
    while: "while ${1:True}:\n    ${2:pass}",
    if: "if ${1:condition}:\n    ${2:pass}",
    def: "def ${1:function_name}(${2:params}):\n    ${3:pass}",
    class: "class ${1:ClassName}:\n    def __init__(self):\n        ${2:pass}",
    try: "try:\n    ${1:pass}\nexcept ${2:Exception} as e:\n    ${3:pass}",
    with: "with open(${1:filename}) as f:\n    ${2:pass}",
    main: 'if __name__ == "__main__":\n    ${1:pass}',
  };

  editor.on("inputRead", function (cm, change) {
    const cursor = cm.getCursor();
    const line = cm.getLine(cursor.line);
    const word = line.substring(0, cursor.ch).split(/\s/).pop();

    if (snippets[word] && change.text[0] === " ") {
      const from = { line: cursor.line, ch: cursor.ch - word.length - 1 };
      const to = cursor;
      cm.replaceRange(
        snippets[word].replace(/\$\{\d+:([^}]*)\}/g, "$1"),
        from,
        to
      );
    }
  });
}

// 10. MULTIPLE CURSORS (Ctrl+Click)
function setupMultipleCursors() {
  let cursors = [];

  editor.on("mousedown", function (cm, event) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const pos = cm.coordsChar({ left: event.clientX, top: event.clientY });
      cursors.push(pos);
      cm.setSelection(pos, pos);
    }
  });
}

// 11. BREAKPOINTS
function setupBreakpoints() {
  editor.on("gutterClick", function (cm, line, gutter, event) {
    if (gutter === "breakpoints") {
      const info = cm.lineInfo(line);
      if (info.gutterMarkers && info.gutterMarkers.breakpoints) {
        cm.setGutterMarker(line, "breakpoints", null);
      } else {
        const marker = document.createElement("div");
        marker.innerHTML = "●";
        marker.style.color = "#ff4444";
        marker.style.fontSize = "20px";
        cm.setGutterMarker(line, "breakpoints", marker);
      }
    }
  });
}

// 12. AUTO-INDENT PASTE
editor.on("beforeChange", function (cm, change) {
  if (change.origin === "paste") {
    const lines = change.text;
    const cursor = change.from;
    const currentIndent = cm.getLine(cursor.line).match(/^\s*/)[0].length;

    const indented = lines.map((line, i) => {
      if (i === 0) return line;
      return " ".repeat(currentIndent) + line;
    });

    change.update(change.from, change.to, indented);
  }
});

// 13. BRACKET MATCHING HIGHLIGHT
editor.on("cursorActivity", function (cm) {
  const cursor = cm.getCursor();
  const token = cm.getTokenAt(cursor);

  if (["(", ")", "[", "]", "{", "}"].includes(token.string)) {
    cm.matchBrackets();
  }
});

// 14. UNDO/REDO HISTORY VIEWER
function showHistory() {
  const history = editor.getHistory();
  console.log("Undo stack:", history.undone.length);
  console.log("Redo stack:", history.done.length);
}

// 15. SELECTION INFO
editor.on("cursorActivity", function (cm) {
  const selection = cm.getSelection();
  if (selection) {
    const lines = selection.split("\n").length;
    const chars = selection.length;
    console.log(`Selected: ${lines} lines, ${chars} chars`);
  }
});

function setupAutoClose() {
  const pairs = {
    "(": ")",
    "[": "]",
    "{": "}",
    '"': '"',
    "'": "'",
    "`": "`",
  };

  editor.on("keydown", function (cm, event) {
    const char = event.key;
    const cursor = cm.getCursor();
    const nextChar = cm.getRange(cursor, {
      line: cursor.line,
      ch: cursor.ch + 1,
    });

    if (
      Object.values(pairs).includes(char) &&
      nextChar === char &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      cm.setCursor({ line: cursor.line, ch: cursor.ch + 1 });
      return;
    }

    if (pairs[char] && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();

      const selection = cm.getSelection();

      if (selection) {
        cm.replaceSelection(char + selection + pairs[char]);
        cm.setCursor({
          line: cursor.line,
          ch: cursor.ch + selection.length + 1,
        });
      } else {
        if (nextChar === pairs[char] && (char === '"' || char === "'")) {
          cm.setCursor({ line: cursor.line, ch: cursor.ch + 1 });
        } else {
          cm.replaceRange(char + pairs[char], cursor);
          cm.setCursor({ line: cursor.line, ch: cursor.ch + 1 });
        }
      }
    } else if (event.key === "Backspace") {
      const charBefore = cm.getRange(
        { line: cursor.line, ch: cursor.ch - 1 },
        cursor
      );
      const charAfter = cm.getRange(cursor, {
        line: cursor.line,
        ch: cursor.ch + 1,
      });

      if (pairs[charBefore] === charAfter) {
        event.preventDefault();
        cm.replaceRange(
          "",
          { line: cursor.line, ch: cursor.ch - 1 },
          { line: cursor.line, ch: cursor.ch + 1 }
        );
      }
    }
  });
}

function setupAutocomplete() {
  CodeMirror.registerHelper("hint", "pythonComplete", function (editor) {
    const cursor = editor.getCursor();
    const token = editor.getTokenAt(cursor);
    const line = editor.getLine(cursor.line);
    const start = token.start;
    const end = cursor.ch;
    const currentWord = line.slice(start, end);

    let list = [];

    const userNames = extractUserDefinedNames(editor.getValue());

    if (line.slice(Math.max(0, end - 5), end) === "math.") {
      list = MATH_FUNCTIONS.map((f) => f.replace("math.", ""));
    } else if (currentWord) {
      const userMatches = userNames.filter((word) =>
        word.toLowerCase().startsWith(currentWord.toLowerCase())
      );

      const keywordMatches = PYTHON_KEYWORDS.filter((word) =>
        word.toLowerCase().startsWith(currentWord.toLowerCase())
      );

      const mathMatch = "math".startsWith(currentWord.toLowerCase())
        ? ["math"]
        : [];

      list = [...userMatches, ...keywordMatches, ...mathMatch];
    } else {
      list = [...userNames, ...PYTHON_KEYWORDS.slice(0, 15)];
    }

    list = [...new Set(list)];

    return {
      list: list,
      from: CodeMirror.Pos(cursor.line, start),
      to: CodeMirror.Pos(cursor.line, end),
    };
  });

  editor.on("inputRead", function (cm, change) {
    if (change.text[0].match(/[a-zA-Z_]/)) {
      CodeMirror.commands.autocomplete(cm, null, {
        hint: CodeMirror.hint.pythonComplete,
        completeSingle: false,
      });
    }
  });
}

window.addEventListener("beforeunload", function () {
  autoSaveCode();
});

function startAutoSave() {
  autoSaveInterval = setInterval(() => {
    autoSaveCode();
  }, 10000);
}

function autoSaveCode() {
  const code = editor.getValue();

  if (code.trim() !== defaultCode.trim()) {
    const timestamp = new Date().toLocaleString("uz-UZ");

    const autoSaveData = {
      code: code,
      timestamp: timestamp,
      lastSaved: Date.now(),
    };

    localStorage.setItem("pythonAutoSave", JSON.stringify(autoSaveData));
  }
}

function loadAutoSavedCode() {
  const autoSaveData = localStorage.getItem("pythonAutoSave");

  if (autoSaveData) {
    try {
      const data = JSON.parse(autoSaveData);

      if (data.code && data.code.trim()) {
        editor.setValue(data.code);

        const timeSaved = new Date(data.lastSaved).toLocaleString("uz-UZ");
        showOutput(
          `✅ Oxirgi sessiya qayta tiklandi\n📅 Saqlangan vaqt: ${timeSaved}`,
          "success"
        );

        setTimeout(() => {
          clearOutput();
        }, 3000);
      }
    } catch (error) {
      console.error("Avtomatik saqlangan kodni yuklashda xatolik:", error);
    }
  }
}

function toggleTheme() {
  const body = document.body;
  const themeBtn = document.getElementById("themeBtn");

  body.classList.toggle("dark-mode");

  if (body.classList.contains("dark-mode")) {
    themeBtn.textContent = "☀️ Light";
    localStorage.setItem("theme", "dark");
  } else {
    themeBtn.textContent = "🌙 Dark";
    localStorage.setItem("theme", "light");
  }
}

function loadTheme() {
  const savedTheme = localStorage.getItem("theme");
  const themeBtn = document.getElementById("themeBtn");

  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
    themeBtn.textContent = "☀️ Light";
  }
}

async function initPyodide() {
  const loading = document.getElementById("loading");
  loading.classList.add("active");

  try {
    pyodide = await loadPyodide();
    await setupSafeExecutionEnvironment();
    loading.textContent = "✅ Python tayyor!";
    setTimeout(() => {
      loading.classList.remove("active");
    }, 2000);
  } catch (error) {
    loading.textContent = "❌ Xatolik: Python yuklanmadi!";
    loading.style.background = "#fee2e2";
    loading.style.color = "#991b1b";
  }
}

async function setupSafeExecutionEnvironment() {
  const pyodideVersion = pyodide.version;
  if (!pyodideVersion || parseFloat(pyodideVersion) < 0.23) {
    console.warn(
      "Pyodide versiyasi eski. Ba'zi funksiyalar ishlamasligi mumkin."
    );
  }

  await pyodide.runPythonAsync(`
import sys
import ast
import builtins
import traceback
from io import StringIO
import time

class LoopIterationError(Exception):
    pass

class SafeExecutor:
    def __init__(self, max_execution_time=5):
        self.max_execution_time = max_execution_time  # Maximum execution time in seconds
        self.start_time = None

    def compile_code(self, code):
        tree = ast.parse(code, filename="<user_code>", mode="exec")
        transformer = LoopTransformer()
        new_tree = transformer.visit(tree)
        ast.fix_missing_locations(new_tree)
        return compile(new_tree, filename="<user_code>", mode="exec")

    def _serialize_error(self, error):
        traceback_summary = traceback.extract_tb(error.__traceback__)
        user_frame = None

        for frame in reversed(traceback_summary):
            if frame.filename == "<user_code>":
                user_frame = frame
                break

        line_number = getattr(error, "lineno", None)
        column_number = getattr(error, "offset", None)
        code_line = getattr(error, "text", None)

        if user_frame is not None:
            if line_number is None:
                line_number = user_frame.lineno
            if not code_line:
                code_line = user_frame.line

        return {
            "type": error.__class__.__name__,
            "message": str(error),
            "line": line_number,
            "column": column_number,
            "codeLine": code_line.strip("\\n") if isinstance(code_line, str) else code_line,
            "undefinedName": getattr(error, "name", None),
            "traceback": "".join(traceback.format_exception(type(error), error, error.__traceback__)),
        }

    def execute(self, code):
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        sys.stdout = StringIO()
        sys.stderr = StringIO()
        result = {"output": "", "success": True, "error": None}

        try:
            compiled_code = self.compile_code(code)
            self.start_time = time.time()

            exec_globals = {
                "__builtins__": builtins,
                "__name__": "__main__",
                "_check_execution_time": self._check_execution_time,
            }

            exec(compiled_code, exec_globals)
        except BaseException as e:
            result["success"] = False
            result["error"] = self._serialize_error(e)
        finally:
            stdout_value = sys.stdout.getvalue().rstrip()
            stderr_value = sys.stderr.getvalue().rstrip()
            result["output"] = "\\n".join(
                value for value in [stdout_value, stderr_value] if value
            )
            sys.stdout = old_stdout
            sys.stderr = old_stderr

        return result

    def _check_execution_time(self):
        if time.time() - self.start_time > self.max_execution_time:
            raise LoopIterationError("⏳ Loop execution time exceeded the limit!")

    def _check_execution_time(self):
        if time.time() - self.start_time > self.max_execution_time:
            raise LoopIterationError("Loop execution time exceeded the limit!")

class LoopTransformer(ast.NodeTransformer):
    def visit_For(self, node):
        self.generic_visit(node)
        guard_call = ast.Expr(
            value=ast.Call(
                func=ast.Name(id='_check_execution_time', ctx=ast.Load()),
                args=[],
                keywords=[]
            )
        )
        ast.copy_location(guard_call, node)
        node.body.insert(0, guard_call)
        return node

    def visit_While(self, node):
        self.generic_visit(node)
        guard_call = ast.Expr(
            value=ast.Call(
                func=ast.Name(id='_check_execution_time', ctx=ast.Load()),
                args=[],
                keywords=[]
            )
        )
        ast.copy_location(guard_call, node)
        node.body.insert(0, guard_call)
        return node

_safe_executor = SafeExecutor(max_execution_time=5)  # Set max execution time to 5 seconds

def safe_execute(code):
    return _safe_executor.execute(code)
  `);
}

async function runCode() {
  if (!pyodide) {
    showOutput("❌ Python hali yuklanmagan. Iltimos, kuting...", "error");
    return;
  }

  const code = editor.getValue();

  if (!code.trim()) {
    showOutput("⚠️ Kod kiritilmagan!", "error");
    return;
  }

  showOutput("⏳ Bajarilmoqda...", "");

  try {
    clearEditorDiagnostics();
    const startTime = performance.now();

    const result = await pyodide.runPythonAsync(`
import json
result = safe_execute(${JSON.stringify(code)})
json.dumps(result)
    `);

    const endTime = performance.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(3);

    const resultObj = JSON.parse(result);

    if (!resultObj.success) {
      const errorReport = buildExecutionErrorReport(resultObj, code, executionTime);
      highlightEditorError(
        errorReport.lineNumber,
        errorReport.columnNumber,
        errorReport.focusToken
      );
      showOutput(errorReport.text, "error");
      return;
    }

    if (resultObj.success) {
      clearEditorDiagnostics();
      if (resultObj.output && resultObj.output.trim()) {
        showOutput(
          `${resultObj.output}\n⏱ Bajarilish vaqti: ${executionTime} soniya`,
          "success"
        );
      } else {
        showOutput(
          `✅ Kod muvaffaqiyatli bajarildi\n\n⏱ Bajarilish vaqti: ${executionTime} soniya`,
          "success"
        );
      }
    } else {
      showOutput(
        `❌ Kod bajarishda xatolik yuz berdi\n⏱ Bajarilish vaqti: ${executionTime} soniya`,
        "error"
      );
    }
  } catch (error) {
    showOutput(`❌ Xatolik:\n${error.message}`, "error");
  }
}

function clearOutput() {
  clearEditorDiagnostics();
  showOutput('Natija tozalandi. Kodni yozing va "Run" tugmasini bosing.', "");
}

function showOutput(text, type) {
  const output = document.getElementById("output");
  output.textContent = text;
  output.className = type ? "output-content " + type : "output-content";
  output.scrollTop = 0;
}

function saveCode() {
  const code = editor.getValue();
  const savedCodes = JSON.parse(localStorage.getItem("pythonCodes") || "[]");
  const timestamp = new Date().toLocaleString("uz-UZ");

  savedCodes.unshift({
    code: code,
    timestamp: timestamp,
  });

  if (savedCodes.length > 10) {
    savedCodes.pop();
  }

  localStorage.setItem("pythonCodes", JSON.stringify(savedCodes));
  showOutput(`✅ Kod saqlandi (${timestamp})`, "success");

  setTimeout(() => {
    clearOutput();
  }, 2000);
}

function loadCode() {
  const savedCodes = JSON.parse(localStorage.getItem("pythonCodes") || "[]");

  if (savedCodes.length === 0) {
    showOutput("❌ Saqlangan kodlar topilmadi!", "error");
    return;
  }

  editor.setValue(savedCodes[0].code);
  showOutput(`✅ Oxirgi kod yuklandi (${savedCodes[0].timestamp})`, "success");

  setTimeout(() => {
    clearOutput();
  }, 2000);
}

function downloadCode() {
  const code = editor.getValue();
  const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const filename = `python_code_${new Date().getTime()}.py`;

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showOutput(`✅ Kod yuklab olindi: ${filename}`, "success");

  setTimeout(() => {
    clearOutput();
  }, 2000);
}

function uploadFile(event) {
  const file = event.target.files[0];

  if (!file) return;

  const reader = new FileReader();

  reader.onload = function (e) {
    const content = e.target.result;
    editor.setValue(content);
    showOutput(`✅ Fayl yuklandi: ${file.name}`, "success");

    setTimeout(() => {
      clearOutput();
    }, 2000);
  };

  reader.onerror = function () {
    showOutput("❌ Faylni o'qishda xatolik yuz berdi!", "error");
  };

  reader.readAsText(file);
  event.target.value = "";
}

document.addEventListener("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    runCode();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    saveCode();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "d") {
    e.preventDefault();
    downloadCode();
  }
});
