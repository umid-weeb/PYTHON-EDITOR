
let pyodide;
let editor;
let autoSaveInterval;
let defaultCode = '';

window.addEventListener('DOMContentLoaded', function () {
    const textarea = document.getElementById('code-editor');
    defaultCode = textarea.value;

    editor = CodeMirror.fromTextArea(textarea, {
        mode: 'python',
        theme: 'monokai',
        lineNumbers: true,
        indentUnit: 4,
        indentWithTabs: false,
        lineWrapping: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        extraKeys: {
            "Ctrl-Space": "autocomplete",
            "Tab": function (cm) {
                if (cm.state.completionActive) {
                    return CodeMirror.Pass;
                }
                cm.replaceSelection("    ");
            }
        },
        hintOptions: {
            completeSingle: false,
            alignWithWord: true,
            closeOnUnfocus: true
        }
    });

    setupAutoClose();
    setupAutocomplete();
    loadAutoSavedCode();
    loadTheme();
    startAutoSave();
    initPyodide();
});

function setupAutoClose() {
    const pairs = {
        '(': ')',
        '[': ']',
        '{': '}',
        '"': '"',
        "'": "'"
    };

    editor.on('keydown', function (cm, event) {
        const char = event.key;

        if (pairs[char] && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();

            const cursor = cm.getCursor();
            const selection = cm.getSelection();

            if (selection) {
                cm.replaceSelection(char + selection + pairs[char]);
                cm.setCursor({ line: cursor.line, ch: cursor.ch + selection.length + 1 });
            } else {
                const nextChar = cm.getRange(cursor, { line: cursor.line, ch: cursor.ch + 1 });

                if (nextChar === pairs[char] && (char === '"' || char === "'")) {
                    cm.setCursor({ line: cursor.line, ch: cursor.ch + 1 });
                } else {
                    cm.replaceRange(char + pairs[char], cursor);
                    cm.setCursor({ line: cursor.line, ch: cursor.ch + 1 });
                }
            }
        } else if (event.key === 'Backspace') {
            const cursor = cm.getCursor();
            const charBefore = cm.getRange({ line: cursor.line, ch: cursor.ch - 1 }, cursor);
            const charAfter = cm.getRange(cursor, { line: cursor.line, ch: cursor.ch + 1 });

            if (pairs[charBefore] === charAfter) {
                event.preventDefault();
                cm.replaceRange('', { line: cursor.line, ch: cursor.ch - 1 }, { line: cursor.line, ch: cursor.ch + 1 });
            }
        }
    });
}

function setupAutocomplete() {
    const pythonKeywords = [
        'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
        'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
        'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
        'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
        'try', 'while', 'with', 'yield',
        'print', 'input', 'len', 'range', 'str', 'int', 'float', 'list',
        'dict', 'set', 'tuple', 'bool', 'type', 'open', 'file', 'round',
        'abs', 'all', 'any', 'sum', 'min', 'max', 'sorted', 'reversed',
        'enumerate', 'zip', 'map', 'filter', 'help'
    ];

    const mathFunctions = [
        'math.sqrt', 'math.pow', 'math.floor', 'math.ceil', 'math.round',
        'math.sin', 'math.cos', 'math.tan', 'math.asin', 'math.acos', 'math.atan',
        'math.log', 'math.log10', 'math.exp', 'math.pi', 'math.e',
        'math.degrees', 'math.radians', 'math.factorial'
    ];

    function getUserDefinedNames(editor) {
        const code = editor.getValue();
        const names = new Set();

        const funcRegex = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
        let match;
        while ((match = funcRegex.exec(code)) !== null) {
            names.add(match[1]);
        }

        const classRegex = /class\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
        while ((match = classRegex.exec(code)) !== null) {
            names.add(match[1]);
        }

        const varRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g;
        while ((match = varRegex.exec(code)) !== null) {
            names.add(match[1]);
        }

        return Array.from(names);
    }

    CodeMirror.registerHelper('hint', 'pythonComplete', function (editor) {
        const cursor = editor.getCursor();
        const token = editor.getTokenAt(cursor);
        const line = editor.getLine(cursor.line);
        const start = token.start;
        const end = cursor.ch;
        const currentWord = line.slice(start, end);

        let list = [];

        const userNames = getUserDefinedNames(editor);

        if (line.slice(Math.max(0, end - 5), end) === 'math.') {
            list = mathFunctions.map(f => f.replace('math.', ''));
        } else if (currentWord) {
            const userMatches = userNames.filter(word =>
                word.toLowerCase().startsWith(currentWord.toLowerCase())
            );

            const keywordMatches = pythonKeywords.filter(word =>
                word.toLowerCase().startsWith(currentWord.toLowerCase())
            );

            const mathMatch = 'math'.startsWith(currentWord.toLowerCase()) ? ['math'] : [];

            list = [...userMatches, ...keywordMatches, ...mathMatch];
        } else {
            list = [...userNames, ...pythonKeywords.slice(0, 15)];
        }

        list = [...new Set(list)];

        return {
            list: list,
            from: CodeMirror.Pos(cursor.line, start),
            to: CodeMirror.Pos(cursor.line, end)
        };
    });

    editor.on('inputRead', function (cm, change) {
        if (change.text[0].match(/[a-zA-Z_]/)) {
            CodeMirror.commands.autocomplete(cm, null, {
                hint: CodeMirror.hint.pythonComplete,
                completeSingle: false
            });
        }
    });
}

window.addEventListener('beforeunload', function () {
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
        const timestamp = new Date().toLocaleString('uz-UZ');

        const autoSaveData = {
            code: code,
            timestamp: timestamp,
            lastSaved: Date.now()
        };

        localStorage.setItem('pythonAutoSave', JSON.stringify(autoSaveData));
    }
}

function loadAutoSavedCode() {
    const autoSaveData = localStorage.getItem('pythonAutoSave');

    if (autoSaveData) {
        try {
            const data = JSON.parse(autoSaveData);

            if (data.code && data.code.trim()) {
                editor.setValue(data.code);

                const timeSaved = new Date(data.lastSaved).toLocaleString('uz-UZ');
                showOutput(`✅ Oxirgi sessiya qayta tiklandi\n📅 Saqlangan vaqt: ${timeSaved}`, 'success');

                setTimeout(() => {
                    clearOutput();
                }, 3000);
            }
        } catch (error) {
            console.error('Avtomatik saqlangan kodni yuklashda xatolik:', error);
        }
    }
}

function toggleTheme() {
    const body = document.body;
    const themeBtn = document.getElementById('themeBtn');

    body.classList.toggle('dark-mode');

    if (body.classList.contains('dark-mode')) {
        themeBtn.textContent = '☀️ Light';
        localStorage.setItem('theme', 'dark');
    } else {
        themeBtn.textContent = '🌙 Dark';
        localStorage.setItem('theme', 'light');
    }
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    const themeBtn = document.getElementById('themeBtn');

    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeBtn.textContent = '☀️ Light';
    }
}

async function initPyodide() {
    const loading = document.getElementById('loading');
    loading.classList.add('active');

    try {
        pyodide = await loadPyodide();
        loading.textContent = '✅ Python tayyor!';
        setTimeout(() => {
            loading.classList.remove('active');
        }, 2000);
    } catch (error) {
        loading.textContent = '❌ Xatolik: Python yuklanmadi!';
        loading.style.background = '#fee2e2';
        loading.style.color = '#991b1b';
    }
}

async function runCode() {
    if (!pyodide) {
        showOutput('❌ Python hali yuklanmagan. Iltimos, kuting...', 'error');
        return;
    }

    const code = editor.getValue();

    if (!code.trim()) {
        showOutput('⚠️ Kod kiritilmagan!', 'error');
        return;
    }

    showOutput('⏳ Bajarilmoqda...', '');

    try {
        pyodide.runPython(`
import sys
from io import StringIO
sys.stdout = StringIO()
        `);

        const startTime = performance.now();
        await pyodide.runPythonAsync(code);
        const endTime = performance.now();
        const executionTime = ((endTime - startTime) / 1000).toFixed(3);

        const result = pyodide.runPython('sys.stdout.getvalue()');

        if (result) {
            showOutput(`${result}\n\n⏱ Bajarilish vaqti: ${executionTime} soniya`, 'success');
        } else {
            showOutput(`✅ Kod muvaffaqiyatli bajarildi\n\n⏱ Bajarilish vaqti: ${executionTime} soniya`, 'success');
        }
    } catch (error) {
        showOutput(`❌ Xatolik:\n\n${error.message}`, 'error');
    }
}

function clearOutput() {
    showOutput('Natija tozalandi. Kodni yozing va "Run" tugmasini bosing.', '');
}

function showOutput(text, type) {
    const output = document.getElementById('output');
    output.textContent = text;
    output.className = 'output-content ' + type;
}

function saveCode() {
    const code = editor.getValue();
    const savedCodes = JSON.parse(localStorage.getItem('pythonCodes') || '[]');
    const timestamp = new Date().toLocaleString('uz-UZ');

    savedCodes.unshift({
        code: code,
        timestamp: timestamp
    });

    if (savedCodes.length > 10) {
        savedCodes.pop();
    }

    localStorage.setItem('pythonCodes', JSON.stringify(savedCodes));
    showOutput(`✅ Kod saqlandi (${timestamp})`, 'success');

    setTimeout(() => {
        clearOutput();
    }, 2000);
}

function loadCode() {
    const savedCodes = JSON.parse(localStorage.getItem('pythonCodes') || '[]');

    if (savedCodes.length === 0) {
        showOutput('❌ Saqlangan kodlar topilmadi!', 'error');
        return;
    }

    editor.setValue(savedCodes[0].code);
    showOutput(`✅ Oxirgi kod yuklandi (${savedCodes[0].timestamp})`, 'success');

    setTimeout(() => {
        clearOutput();
    }, 2000);
}

function downloadCode() {
    const code = editor.getValue();
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = `python_code_${new Date().getTime()}.py`;

    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showOutput(`✅ Kod yuklab olindi: ${filename}`, 'success');

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
        showOutput(`✅ Fayl yuklandi: ${file.name}`, 'success');

        setTimeout(() => {
            clearOutput();
        }, 2000);
    };

    reader.onerror = function () {
        showOutput('❌ Faylni o\'qishda xatolik yuz berdi!', 'error');
    };

    reader.readAsText(file);

    event.target.value = '';
}

document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runCode();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCode();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        downloadCode();
    }
});
