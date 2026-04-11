let pyodide;
let editor;
let autoSaveInterval;
let defaultCode = "";
let activeRunSession = null;
let activeDebugSession = null;
let activeDebugSteps = [];
let activeDebugStepIndex = 0;
let activeDebugLineNumber = null;
let pendingRemoteRun = null;
let currentLanguage = "python";
let currentStarterPack = "array";

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
    // Keywords
    "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue",
    "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in",
    "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
    
    // Built-in functions
    "print", "input", "len", "range", "list", "dict", "set", "int", "str", "float", "bool", "type",
    "abs", "all", "any", "ascii", "bin", "breakpoint", "bytearray", "bytes", "callable", "chr",
    "classmethod", "compile", "complex", "delattr", "dir", "divmod", "enumerate", "eval", "exec",
    "filter", "format", "frozenset", "getattr", "globals", "hasattr", "hash", "help", "hex", "id",
    "isinstance", "issubclass", "iter", "locals", "map", "max", "memoryview", "min", "next",
    "object", "oct", "open", "ord", "pow", "property", "repr", "reversed", "round", "setattr",
    "slice", "sorted", "staticmethod", "sum", "super", "tuple", "vars", "zip", "__import__",
    
    // Common methods and attributes
    "append", "extend", "insert", "remove", "pop", "clear", "index", "count", "sort", "reverse", "copy",
    "get", "items", "keys", "values", "update", "add", "discard", "union", "intersection", "difference",
    "split", "join", "strip", "lstrip", "rstrip", "replace", "find", "startswith", "endswith", "lower", "upper",
    "format", "count", "index", "isalnum", "isalpha", "isdecimal", "isdigit", "isidentifier", "islower", "isnumeric", "isprintable", "isspace", "istitle", "isupper"
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

const LANGUAGE_STORAGE_KEY = "onlineEditorLanguage";
const STARTER_PACK_STORAGE_KEY = "onlineEditorStarterPack";
const LANGUAGE_CONFIGS = {
    python: {
        label: "Python",
        mode: "python",
        indentUnit: 4,
        statusLabel: "Python 3",
        fileExtension: "py",
        defaultCode: `import sys


def main():
    numbers = [int(value) for value in sys.stdin.read().split()]
    if not numbers:
        print(0)
        return

    total = 0
    maximum = numbers[0]
    for value in numbers:
        total += value
        if value > maximum:
            maximum = value

    print(total)
    print(maximum)


if __name__ == "__main__":
    main()
`,
        inputHelp: "Bu starter stdin'dagi barcha sonlarni o'qiydi. Sonlar bo'shliq yoki yangi qatorda bo'lishi mumkin.",
        inputPlaceholder: "Masalan: 1 2 3 4 5",
        outputPlaceholder: "Natija shu yerda: avval yig'indi, keyin maksimum.",
        supportsLocalRun: true,
        supportsRemoteRun: false,
        supportsFormat: true,
        supportsDebug: true,
    },
    javascript: {
        label: "JavaScript",
        mode: "javascript",
        indentUnit: 2,
        statusLabel: "JavaScript",
        fileExtension: "js",
        defaultCode: `const fs = require("fs");

function main() {
    const raw = fs.readFileSync(0, "utf8").trim();
    const numbers = raw
        ? raw.split(/\\s+/).map((value) => Number(value)).filter((value) => Number.isFinite(value))
        : [];

    if (!numbers.length) {
        console.log(0);
        return;
    }

    let total = 0;
    let maximum = numbers[0];
    for (const value of numbers) {
        total += value;
        if (value > maximum) {
            maximum = value;
        }
    }

    console.log(total);
    console.log(maximum);
}

main();
`,
        inputHelp: "Bu starter stdin'dagi barcha sonlarni o'qiydi. JavaScript da ular bir qatorda ham, ko'p qatorda ham bo'lishi mumkin.",
        inputPlaceholder: "Masalan: 1 2 3 4 5",
        outputPlaceholder: "Natija shu yerda: avval yig'indi, keyin maksimum.",
        supportsLocalRun: false,
        supportsRemoteRun: true,
        supportsFormat: false,
        supportsDebug: false,
    },
    cpp: {
        label: "C++",
        mode: "text/x-c++src",
        indentUnit: 4,
        statusLabel: "C++",
        fileExtension: "cpp",
        defaultCode: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long value = 0;
    long long total = 0;
    long long maximum = 0;
    bool hasValue = false;

    while (cin >> value) {
        total += value;
        if (!hasValue || value > maximum) {
            maximum = value;
            hasValue = true;
        }
    }

    if (!hasValue) {
        cout << 0 << endl;
        return 0;
    }

    cout << total << endl << maximum << endl;
    return 0;
}
`,
        inputHelp: "Bu starter stdin'dagi barcha sonlarni o'qiydi. C++ da sonlar bo'shliq yoki yangi qatorda bo'lishi mumkin.",
        inputPlaceholder: "Masalan: 1 2 3 4 5",
        outputPlaceholder: "Natija shu yerda: avval yig'indi, keyin maksimum.",
        supportsLocalRun: false,
        supportsRemoteRun: true,
        supportsFormat: false,
        supportsDebug: false,
    },
    java: {
        label: "Java",
        mode: "text/x-java",
        indentUnit: 4,
        statusLabel: "Java",
        fileExtension: "java",
        defaultCode: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        long sum = 0;
        Long maximum = null;

        while (scanner.hasNextLong()) {
            long value = scanner.nextLong();
            sum += value;
            if (maximum == null || value > maximum) {
                maximum = value;
            }
        }

        if (maximum == null) {
            System.out.println(0);
            return;
        }

        System.out.println(sum);
        System.out.println(maximum);
    }
}
`,
        inputHelp: "Bu starter stdin'dagi barcha sonlarni o'qiydi. Java'da ular bo'shliq yoki yangi qatorda bo'lishi mumkin.",
        inputPlaceholder: "Masalan: 1 2 3 4 5",
        outputPlaceholder: "Natija shu yerda: avval yig'indi, keyin maksimum.",
        supportsLocalRun: false,
        supportsRemoteRun: true,
        supportsFormat: false,
        supportsDebug: false,
    },
    go: {
        label: "Go",
        mode: "text/x-go",
        indentUnit: 4,
        statusLabel: "Go",
        fileExtension: "go",
        defaultCode: `package main

import (
    "bufio"
    "fmt"
    "os"
)

func main() {
    reader := bufio.NewReader(os.Stdin)
    var value int64
    var sum int64
    var maximum int64
    hasValue := false

    for {
        if _, err := fmt.Fscan(reader, &value); err != nil {
            break
        }
        sum += value
        if !hasValue || value > maximum {
            maximum = value
            hasValue = true
        }
    }

    if !hasValue {
        fmt.Println(0)
        return
    }

    fmt.Println(sum)
    fmt.Println(maximum)
}
`,
        inputHelp: "Bu starter stdin'dagi barcha sonlarni o'qiydi. Go'da ular bo'shliq yoki yangi qatorda bo'lishi mumkin.",
        inputPlaceholder: "Masalan: 1 2 3 4 5",
        outputPlaceholder: "Natija shu yerda: avval yig'indi, keyin maksimum.",
        supportsLocalRun: false,
        supportsRemoteRun: true,
        supportsFormat: false,
        supportsDebug: false,
    },
};

const LANGUAGE_GREETING_PRESETS = {
    python: {
        defaultCode: `print("Salom, Python tiliga xush kelibsiz")\n`,
        outputPlaceholder: "Run bosilganda natija shu yerda ko'rsatiladi.",
    },
    javascript: {
        defaultCode: `console.log("Salom, JavaScript tiliga xush kelibsiz");\n`,
        outputPlaceholder: "Run bosilganda natija shu yerda ko'rsatiladi.",
    },
    cpp: {
        defaultCode: `#include <bits/stdc++.h>
using namespace std;

int main() {
    cout << "Salom, C++ tiliga xush kelibsiz" << '\\n';
    return 0;
}
`,
        outputPlaceholder: "Run bosilganda natija shu yerda ko'rsatiladi.",
    },
    java: {
        defaultCode: `public class Main {
    public static void main(String[] args) {
        System.out.println("Salom, Java tiliga xush kelibsiz");
    }
}
`,
        outputPlaceholder: "Run bosilganda natija shu yerda ko'rsatiladi.",
    },
    go: {
        defaultCode: `package main

import "fmt"

func main() {
    fmt.Println("Salom, Go tiliga xush kelibsiz")
}
`,
        outputPlaceholder: "Run bosilganda natija shu yerda ko'rsatiladi.",
    },
};

for (const [language, preset] of Object.entries(LANGUAGE_GREETING_PRESETS)) {
    Object.assign(LANGUAGE_CONFIGS[language], preset);
}

const LANGUAGE_AUTOCOMPLETE_WORDS = {
    python: [...PYTHON_KEYWORDS, ...MATH_FUNCTIONS],
    javascript: [
        "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do",
        "else", "export", "extends", "false", "finally", "for", "function", "if", "import", "in",
        "instanceof", "let", "new", "null", "return", "super", "switch", "this", "throw", "true",
        "try", "typeof", "undefined", "var", "void", "while", "with", "yield", "async", "await",
        "Array", "Boolean", "console", "Date", "Error", "JSON", "Math", "Number", "Object", "Promise",
        "Set", "String", "Symbol", "Map", "window", "document", "globalThis", "fetch", "parseInt", "parseFloat",
    ],
    cpp: [
        "auto", "bool", "break", "case", "catch", "char", "class", "const", "constexpr", "continue",
        "cout", "cin", "cerr", "endl", "double", "else", "false", "float", "for", "friend", "goto",
        "if", "inline", "int", "long", "main", "map", "namespace", "new", "nullptr", "pair", "private",
        "protected", "public", "return", "set", "short", "size_t", "std", "string", "struct", "switch",
        "template", "this", "true", "typedef", "typename", "union", "unordered_map", "unordered_set",
        "using", "vector", "while", "make_pair", "push_back", "emplace_back", "sort", "reverse",
    ],
    java: [
        "abstract", "assert", "boolean", "break", "byte", "case", "catch", "class", "const", "continue",
        "default", "double", "else", "enum", "extends", "final", "finally", "float", "for", "if",
        "implements", "import", "instanceof", "int", "interface", "long", "new", "package", "private",
        "protected", "public", "return", "short", "static", "strictfp", "super", "switch", "synchronized",
        "this", "throw", "throws", "transient", "try", "void", "volatile", "while", "String", "System",
        "Scanner", "ArrayList", "List", "Map", "HashMap", "Integer", "Double", "Boolean", "Math",
    ],
    go: [
        "break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough", "for",
        "func", "go", "goto", "if", "import", "interface", "map", "package", "range", "return", "select",
        "struct", "switch", "type", "var", "fmt", "Println", "Printf", "Scan", "Scanln", "make", "new",
        "append", "len", "cap", "close", "delete", "panic", "recover",
    ],
};

function normalizeLanguage(language) {
    return Object.prototype.hasOwnProperty.call(LANGUAGE_CONFIGS, language) ? language : "python";
}

function getLanguageConfig(language = currentLanguage) {
    return LANGUAGE_CONFIGS[normalizeLanguage(language)] || LANGUAGE_CONFIGS.python;
}

function getLanguageLabel(language = currentLanguage) {
    return getLanguageConfig(language).label;
}

function getLanguageMode(language = currentLanguage) {
    return getLanguageConfig(language).mode;
}

function getLanguageIndentUnit(language = currentLanguage) {
    return getLanguageConfig(language).indentUnit || 4;
}

function getLanguageStatusLabel(language = currentLanguage) {
    return getLanguageConfig(language).statusLabel;
}

function getLanguageFileExtension(language = currentLanguage) {
    return getLanguageConfig(language).fileExtension;
}

function getLanguageInputHelp(language = currentLanguage, pack = currentStarterPack) {
    return getLanguageConfig(language).inputHelp || "";
}

function getLanguageInputPlaceholder(language = currentLanguage, pack = currentStarterPack) {
    return getLanguageConfig(language).inputPlaceholder || "";
}

function getLanguageOutputPlaceholder(language = currentLanguage, pack = currentStarterPack) {
    return getLanguageConfig(language).outputPlaceholder || "Natija bu yerda ko'rsatiladi...";
}

function getLanguageRunModeLabel(language = currentLanguage) {
    return getLanguageConfig(language).supportsLocalRun ? "LOCAL" : "REMOTE";
}

const STARTER_PACK_CONFIGS = {
    array: {
        label: "n + array",
        badge: "ARRAY",
        helpText: "Avval n kiriting, keyin n ta son yozing. Bu paket massiv, loop va yig'indi/maksimum kabi masalalar uchun qulay.",
        inputPlaceholder: "Masalan:\n5\n1 2 3 4 5",
        outputPlaceholder: "Natija shu yerda: yig'indi va maksimum.",
    },
    loop: {
        label: "loop + condition",
        badge: "LOOP",
        helpText: "Avval n kiriting, keyin n ta son yozing. Bu paket if va loop mashqlari uchun qulay.",
        inputPlaceholder: "Masalan:\n6\n1 2 3 4 5 6",
        outputPlaceholder: "Natija shu yerda: juftlar soni va musbatlar soni.",
    },
    string: {
        label: "string parsing + output formatting",
        badge: "STRING",
        helpText: "Bir qator matn yozing. Bu paket split, trim va chiroyli output formatlash uchun qulay.",
        inputPlaceholder: "Masalan: Ali Vali 19",
        outputPlaceholder: "Natija shu yerda: so'zlar soni va formatlangan matn.",
    },
};

function normalizeStarterPack(pack) {
    return Object.prototype.hasOwnProperty.call(STARTER_PACK_CONFIGS, pack) ? pack : "array";
}

function getStarterPackConfig(pack = currentStarterPack) {
    return STARTER_PACK_CONFIGS[normalizeStarterPack(pack)] || STARTER_PACK_CONFIGS.array;
}

function getStarterPackLabel(pack = currentStarterPack) {
    return getStarterPackConfig(pack).label;
}

function getStarterPackBadge(pack = currentStarterPack) {
    return getStarterPackConfig(pack).badge;
}

const LEGACY_STARTER_SIGNATURES = {
    python: [
        "numbers = [int(value) for value in sys.stdin.read().split()]",
        "total = 0",
        "maximum = numbers[0]",
        "print(total)",
        "print(maximum)",
    ],
    javascript: [
        "const numbers = raw",
        "let total = 0;",
        "let maximum = numbers[0];",
        "console.log(total);",
        "console.log(maximum);",
    ],
    cpp: [
        "long long total = 0;",
        "long long maximum = 0;",
        "while (cin >> value)",
        "cout << total << endl << maximum << endl;",
    ],
    java: [
        "long sum = 0;",
        "Long maximum = null;",
        "while (scanner.hasNextLong())",
        "System.out.println(sum);",
        "System.out.println(maximum);",
    ],
    go: [
        "var sum int64",
        "var maximum int64",
        "hasValue := false",
        "fmt.Println(sum)",
        "fmt.Println(maximum)",
    ],
};

function isLegacyStarterCode(language, code) {
    const normalizedLanguage = normalizeLanguage(language);
    const normalizedCode = String(code || "").replace(/\r\n/g, "\n");
    const signatures = LEGACY_STARTER_SIGNATURES[normalizedLanguage] || [];
    return signatures.length > 0 && signatures.every((fragment) => normalizedCode.includes(fragment));
}

const LANGUAGE_STARTER_CODES = {
    python: {
        array: LANGUAGE_CONFIGS.python.defaultCode,
        loop: `import sys


def main():
    numbers = [int(value) for value in sys.stdin.read().split()]
    if not numbers:
        print(0)
        return

    even_count = 0
    positive_count = 0
    for value in numbers:
        if value % 2 == 0:
            even_count += 1
        if value > 0:
            positive_count += 1

    print(even_count)
    print(positive_count)


if __name__ == "__main__":
    main()
`,
        string: `import sys


def main():
    raw = sys.stdin.read().strip()
    words = raw.split()

    if not words:
        print(0)
        return

    print(len(words))
    print(words[0])
    print(" | ".join(words))


if __name__ == "__main__":
    main()
`,
    },
    javascript: {
        array: LANGUAGE_CONFIGS.javascript.defaultCode,
        loop: `const fs = require("fs");

function main() {
    const raw = fs.readFileSync(0, "utf8").trim();
    const numbers = raw
        ? raw.split(/\\s+/).map((value) => Number(value)).filter((value) => Number.isFinite(value))
        : [];

    let evenCount = 0;
    let positiveCount = 0;
    for (const value of numbers) {
        if (value % 2 === 0) {
            evenCount += 1;
        }
        if (value > 0) {
            positiveCount += 1;
        }
    }

    console.log(evenCount);
    console.log(positiveCount);
}

main();
`,
        string: `const fs = require("fs");

function main() {
    const raw = fs.readFileSync(0, "utf8").trim();
    const words = raw ? raw.split(/\\s+/) : [];

    if (!words.length) {
        console.log(0);
        return;
    }

    console.log(words.length);
    console.log(words[0]);
    console.log(words.join(" | "));
}

main();
`,
    },
    cpp: {
        array: LANGUAGE_CONFIGS.cpp.defaultCode,
        loop: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long value = 0;
    long long evenCount = 0;
    long long positiveCount = 0;

    while (cin >> value) {
        if (value % 2 == 0) {
            ++evenCount;
        }
        if (value > 0) {
            ++positiveCount;
        }
    }

    cout << evenCount << endl;
    cout << positiveCount << endl;
    return 0;
}
`,
        string: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string line;
    getline(cin, line);
    if (line.empty() && cin.good()) {
        getline(cin, line);
    }

    stringstream ss(line);
    vector<string> words;
    string word;
    while (ss >> word) {
        words.push_back(word);
    }

    if (words.empty()) {
        cout << 0 << endl;
        return 0;
    }

    cout << words.size() << endl;
    cout << words.front() << endl;
    for (size_t i = 0; i < words.size(); ++i) {
        if (i) cout << " | ";
        cout << words[i];
    }
    cout << endl;
    return 0;
}
`,
    },
    java: {
        array: LANGUAGE_CONFIGS.java.defaultCode,
        loop: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        long evenCount = 0;
        long positiveCount = 0;

        while (scanner.hasNextLong()) {
            long value = scanner.nextLong();
            if (value % 2 == 0) {
                evenCount++;
            }
            if (value > 0) {
                positiveCount++;
            }
        }

        System.out.println(evenCount);
        System.out.println(positiveCount);
    }
}
`,
        string: `import java.io.BufferedReader;
import java.io.InputStreamReader;

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        String line = reader.readLine();
        if (line == null) {
            line = "";
        }
        line = line.trim();

        if (line.isEmpty()) {
            System.out.println(0);
            return;
        }

        String[] parts = line.split("\\\\s+");
        System.out.println(parts.length);
        System.out.println(parts[0]);
        System.out.println(String.join(" | ", parts));
    }
}
`,
    },
    go: {
        array: LANGUAGE_CONFIGS.go.defaultCode,
        loop: `package main

import (
    "bufio"
    "fmt"
    "os"
)

func main() {
    reader := bufio.NewReader(os.Stdin)
    var value int64
    var evenCount int64
    var positiveCount int64

    for {
        if _, err := fmt.Fscan(reader, &value); err != nil {
            break
        }
        if value%2 == 0 {
            evenCount++
        }
        if value > 0 {
            positiveCount++
        }
    }

    fmt.Println(evenCount)
    fmt.Println(positiveCount)
}
`,
        string: `package main

import (
    "bufio"
    "fmt"
    "os"
    "strings"
)

func main() {
    reader := bufio.NewReader(os.Stdin)
    line, _ := reader.ReadString('\n')
    line = strings.TrimSpace(line)
    if line == "" {
        fmt.Println(0)
        return
    }

    words := strings.Fields(line)
    if len(words) == 0 {
        fmt.Println(0)
        return
    }

    fmt.Println(len(words))
    fmt.Println(words[0])
    fmt.Println(strings.Join(words, " | "))
}
`,
    },
};

function isLegacyStarterCode(language, code) {
    const normalizedLanguage = normalizeLanguage(language);
    const normalizedCode = String(code || "").replace(/\r\n/g, "\n");
    const signatures = LEGACY_STARTER_SIGNATURES[normalizedLanguage] || [];
    return signatures.length > 0 && signatures.every((fragment) => normalizedCode.includes(fragment));
}

function getStarterCode(language = currentLanguage, pack = currentStarterPack) {
    const normalizedLanguage = normalizeLanguage(language);
    return getLanguageConfig(normalizedLanguage).defaultCode;
}

function getSavedCodeStorageKey(language = currentLanguage, pack = currentStarterPack) {
    const normalizedLanguage = normalizeLanguage(language);
    const normalizedPack = normalizeStarterPack(pack);
    return `onlineEditor.savedCode.${normalizedLanguage}.${normalizedPack}`;
}

function getLegacySavedCodeStorageKey(language = currentLanguage) {
    return language === "python" ? "pythonSavedCode" : `onlineEditor.savedCode.${language}`;
}

function getAutoSaveStorageKey(language = currentLanguage, pack = currentStarterPack) {
    const normalizedLanguage = normalizeLanguage(language);
    const normalizedPack = normalizeStarterPack(pack);
    return `onlineEditor.autoSave.${normalizedLanguage}.${normalizedPack}`;
}

function getLegacyAutoSaveStorageKey(language = currentLanguage) {
    return language === "python" ? "pythonAutoSave" : `onlineEditor.autoSave.${language}`;
}

function getInputDraftStorageKey(language = currentLanguage, pack = currentStarterPack) {
    const normalizedLanguage = normalizeLanguage(language);
    const normalizedPack = normalizeStarterPack(pack);
    return `onlineEditor.inputDraft.${normalizedLanguage}.${normalizedPack}`;
}

function getLegacyInputDraftStorageKey(language = currentLanguage) {
    return `onlineEditor.inputDraft.${language}`;
}

function readInputDraft(language = currentLanguage, pack = currentStarterPack) {
    const normalizedLanguage = normalizeLanguage(language);
    const normalizedPack = normalizeStarterPack(pack);
    const raw = localStorage.getItem(getInputDraftStorageKey(normalizedLanguage, normalizedPack));
    if (raw !== null) return raw;
    if (normalizedPack !== "array") return null;

    const legacyRaw = localStorage.getItem(getLegacyInputDraftStorageKey(normalizedLanguage));
    if (legacyRaw === null) return null;
    saveInputDraft(normalizedLanguage, legacyRaw, normalizedPack);
    return legacyRaw;
}

function saveInputDraft(language = currentLanguage, value = "", pack = currentStarterPack) {
    localStorage.setItem(getInputDraftStorageKey(normalizeLanguage(language), pack), typeof value === "string" ? value : "");
}

function clearInputDraft(language = currentLanguage, pack = currentStarterPack) {
    localStorage.removeItem(getInputDraftStorageKey(normalizeLanguage(language), pack));
}

function getSelectedLanguageStorageKey() {
    return LANGUAGE_STORAGE_KEY;
}

function getStoredLanguage() {
    return normalizeLanguage(localStorage.getItem(getSelectedLanguageStorageKey()) || "python");
}

function setStoredLanguage(language) {
    localStorage.setItem(getSelectedLanguageStorageKey(), normalizeLanguage(language));
}

function getSelectedStarterPackStorageKey() {
    return STARTER_PACK_STORAGE_KEY;
}

function getStoredStarterPack() {
    return "array";
}

function setStoredStarterPack(pack) {
    localStorage.setItem(getSelectedStarterPackStorageKey(), "array");
}

function readAutoSavedCode(language = currentLanguage, pack = currentStarterPack) {
    const raw = localStorage.getItem(getAutoSaveStorageKey(language, pack));
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "string") return parsed;
        if (parsed && typeof parsed.code === "string") return parsed.code;
    } catch (error) {
        return raw;
    }
    return null;
}

function readSavedCode(language = currentLanguage, pack = currentStarterPack) {
    const raw = localStorage.getItem(getSavedCodeStorageKey(language, pack));
    return raw === null ? null : raw;
}

function getStoredCode(language = currentLanguage, pack = currentStarterPack) {
    const normalizedLanguage = normalizeLanguage(language);
    const normalizedPack = normalizeStarterPack(pack);

    const autoSaved = readAutoSavedCode(normalizedLanguage, normalizedPack);
    if (typeof autoSaved === "string" && !isLegacyStarterCode(normalizedLanguage, autoSaved)) return autoSaved;

    const saved = readSavedCode(normalizedLanguage, normalizedPack);
    if (saved !== null && !isLegacyStarterCode(normalizedLanguage, saved)) return saved;

    if (normalizedPack === "array") {
        const legacyAuto = localStorage.getItem(getLegacyAutoSaveStorageKey(normalizedLanguage));
        if (legacyAuto) {
            try {
                const parsed = JSON.parse(legacyAuto);
                const legacyAutoCode = typeof parsed === "string" ? parsed : parsed && typeof parsed.code === "string" ? parsed.code : legacyAuto;
                if (typeof legacyAutoCode === "string" && !isLegacyStarterCode(normalizedLanguage, legacyAutoCode)) {
                    saveAutoCodeSnapshot(normalizedLanguage, legacyAutoCode, normalizedPack);
                    return legacyAutoCode;
                }
            } catch (error) {
                if (!isLegacyStarterCode(normalizedLanguage, legacyAuto)) {
                    saveAutoCodeSnapshot(normalizedLanguage, legacyAuto, normalizedPack);
                    return legacyAuto;
                }
            }
        }

        const legacySaved = localStorage.getItem(getLegacySavedCodeStorageKey(normalizedLanguage));
        if (legacySaved !== null && !isLegacyStarterCode(normalizedLanguage, legacySaved)) {
            saveCodeSnapshot(normalizedLanguage, legacySaved, normalizedPack);
            return legacySaved;
        }
    }

    return getStarterCode(normalizedLanguage, normalizedPack);
}

function saveCodeSnapshot(language, code, pack = currentStarterPack) {
    const normalizedLanguage = normalizeLanguage(language);
    const normalizedPack = normalizeStarterPack(pack);
    const value = typeof code === "string" ? code : "";
    localStorage.setItem(getSavedCodeStorageKey(normalizedLanguage, normalizedPack), value);
    localStorage.setItem(
        getAutoSaveStorageKey(normalizedLanguage, normalizedPack),
        JSON.stringify({
            code: value,
            lastSaved: Date.now(),
        })
    );
}

function saveAutoCodeSnapshot(language, code, pack = currentStarterPack) {
    const normalizedLanguage = normalizeLanguage(language);
    const normalizedPack = normalizeStarterPack(pack);
    const value = typeof code === "string" ? code : "";
    localStorage.setItem(
        getAutoSaveStorageKey(normalizedLanguage, normalizedPack),
        JSON.stringify({
            code: value,
            lastSaved: Date.now(),
        })
    );
}

function getAutocompleteWords(language = currentLanguage) {
    return LANGUAGE_AUTOCOMPLETE_WORDS[normalizeLanguage(language)] || [];
}

function splitInputLines(text) {
    const normalized = String(text || "").replace(/\r\n/g, "\n");
    if (!normalized.length) return [];
    return normalized.split("\n");
}

function getInputPanelElement() {
    return document.getElementById("output-panel-input");
}

function getInputPanelValue() {
    const input = getInputPanelElement();
    return input ? input.value : "";
}

function setInputPanelValue(value) {
    const input = getInputPanelElement();
    if (input) input.value = value;
}

function setInputPanelButtonDisabled(disabled) {
    const button = document.getElementById("output-panel-submit");
    if (button) button.disabled = disabled;
}

function bindInputPanelSubmit(handler) {
    const button = document.getElementById("output-panel-submit");
    const input = getInputPanelElement();
    if (button) button.onclick = handler;
    if (input) {
        input.onkeydown = (event) => {
            if (event.key === "Enter" && (input.tagName === "INPUT" || input.dataset.submitOnEnter === "true")) {
                event.preventDefault();
                handler();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                handler();
            }
        };
    }
}

function renderInputPanel({
    title,
    helpText,
    chipLabel,
    buttonLabel,
    buttonDisabled = false,
    inputValue = "",
    placeholder = "",
    persistDraft = true,
    multiline = true,
    submitOnEnter = false,
    onSubmit = null,
    inlinePrompt = "",
} = {}) {
    const host = document.getElementById("output-input-host");
    if (!host) return;
    const promptText = typeof inlinePrompt === "string" ? inlinePrompt.trim() : "";
    const fieldHtml = multiline
        ? `<textarea
                id="output-panel-input"
                class="output-input-field output-input-textarea"
                spellcheck="false"
                placeholder="${escapeHtml(placeholder || "Masalan: 1\\n2\\n3")}"
            >${escapeHtml(inputValue || "")}</textarea>`
        : `<input
                id="output-panel-input"
                class="output-input-field output-input-singleline"
                type="text"
                spellcheck="false"
                autocomplete="off"
                enterkeyhint="done"
                placeholder="${escapeHtml(placeholder || "Qiymat kiriting")}"
                value="${escapeHtml(inputValue || "")}"
            />`;

    const headerHtml = !promptText && (title || helpText || chipLabel)
        ? `
        <div class="output-input-header">
            <div class="output-input-meta">
                ${title ? `<div class="output-input-label">${escapeHtml(title)}</div>` : ""}
                ${helpText ? `<div class="output-input-help">${escapeHtml(helpText)}</div>` : ""}
            </div>
            ${chipLabel ? `<div class="output-input-chip">${escapeHtml(chipLabel)}</div>` : ""}
        </div>`
        : "";

    host.className = "output-input-host active";
    host.innerHTML = promptText ? `
        <div class="output-input-terminal">
            <div class="output-input-terminal-line">
                <label class="output-input-terminal-prompt" for="output-panel-input">${escapeHtml(promptText)}</label>
                ${fieldHtml}
                <button id="output-panel-submit" class="output-input-submit output-input-submit--compact" type="button">${escapeHtml(buttonLabel || "Yuborish")}</button>
            </div>
        </div>` : `
        ${headerHtml}
        <div class="output-input-row">
            ${fieldHtml}
            <button id="output-panel-submit" class="output-input-submit" type="button">${escapeHtml(buttonLabel || "Yuborish")}</button>
        </div>`;

    const input = getInputPanelElement();
    if (input && typeof inputValue === "string") {
        input.value = inputValue;
        input.dataset.submitOnEnter = submitOnEnter ? "true" : "false";
        if (persistDraft) {
            input.oninput = () => saveInputDraft(currentLanguage, input.value);
        } else {
            input.oninput = null;
        }
    }
    setInputPanelButtonDisabled(buttonDisabled);
    if (onSubmit) {
        bindInputPanelSubmit(onSubmit);
    } else {
        bindInputPanelSubmit(() => {});
    }
    dispatchEditorContextUpdate();
}

function renderIdleInputPanel({ preserveValue = true } = {}) {
    clearOutputInputHost({ preserveValue });
}

function clearEditorInputPanel() {
    renderIdleInputPanel({ preserveValue: false });
}

function appendPromptInputToSession() {
    const value = getInputPanelValue();
    const current = value || "";
    if (!current.trim().length && current.length === 0) {
        return "";
    }
    setInputPanelValue("");
    return current;
}

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
        loading.textContent = "Formatlash vositalari yuklanmoqda...";
        await ensurePythonRuntimeTools();
        loading.textContent = "Python ishga tayyorlanmoqda...";
        await setupSafeExecutionEnvironment();
        loading.textContent = "Python tayyor!";
        setTimeout(() => {
            loading.classList.remove("active");
        }, 1500);
    } catch (error) {
        loading.textContent = "Ogohlantirish: Python muhiti yuklanmadi, lekin editor ishlaydi.";
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
    def __init__(self, timeout=1.0):
        self.timeout = timeout
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
        old_stdout, old_stderr, old_stdin = sys.stdout, sys.stderr, sys.stdin
        sys.stdout = sys.stderr = StringIO()
        inputs = [str(v) if v is not None else "" for v in (inputs or [])]
        stdin_text = "\\n".join(inputs)
        if inputs and inputs[-1] == "":
            stdin_text += "\\n"
        sys.stdin = StringIO(stdin_text)
        consumed = 0

        def m_input(prompt=""):
            nonlocal consumed
            line = sys.stdin.readline()
            if line == "":
                raise AwaitingInput(str(prompt), consumed)
            consumed += 1
            return line.rstrip("\\r\\n")

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
            sys.stdout, sys.stderr, sys.stdin = old_stdout, old_stderr, old_stdin

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

        const runCode = activeRunSession ? activeRunSession.code : editor.getValue();
        activeRunSession = null;
        if (!result.success) {
            highlightEditorError(result.error.line, result.error.column || 1);
            showOutput(buildCompactErrorMessage({
                title: `${result.error.type}`,
                summary: normalizeErrorText(result.error.message) || "Python bajarilishida xatolik yuz berdi.",
                line: result.error.line,
                codeLine: result.error.codeLine || getCodeLineAt(runCode, result.error.line),
                column: result.error.column || null,
                tips: [
                    "Qator ustidagi kodni aynan shu joyda tekshiring.",
                    "Agar xato `end` yoki `endl` ga o'xshasa, to'g'ri yozuvni qo'ying.",
                ],
                durationSeconds: time,
            }), "error");
        } else {
            clearEditorDiagnostics();
            showOutput(`${result.output || "Muvaffaqiyatli bajarildi."}\n\nVaqt: ${time}s`, "success");
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
    dispatchEditorContextUpdate();
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
        indentWithTabs: false,
        lineWrapping: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        styleActiveLine: true,
        foldGutter: true,
        gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "breakpoints"],
        extraKeys: {
            "Ctrl-Enter": runCode,
            "F5": runCode,
            "Enter": "newlineAndIndent",
            "Ctrl-S": saveCode,
            "Ctrl-Shift-F": formatEditorCode,
            "Tab": (cm) => {
                if (cm.state.completionActive) return CodeMirror.Pass;
                if (cm.somethingSelected()) cm.indentSelection("add");
                else cm.replaceSelection("    ");
            },
            "Shift-Tab": (cm) => cm.indentSelection("subtract")
        },
        hintOptions: {
            completeSingle: false,
            alignWithWord: true,
            closeOnUnfocus: true
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
    if (secondary) secondary.textContent = `${getLanguageStatusLabel()} | UTF-8 | Spaces: ${getLanguageIndentUnit()}`;
}

function highlightEditorError(line, column = 1) {
    clearEditorDiagnostics();
    if (!line || line > editor.lineCount()) return;
    const idx = line - 1;
    const ch = Math.max(0, (Number(column) || 1) - 1);
    activeDebugLineNumber = idx; // Reuse variable for simple highlight
    editor.addLineClass(idx, "background", "error-line");
    editor.setCursor({ line: idx, ch });
    editor.scrollIntoView({ line: idx, ch }, 100);
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
    saveCodeSnapshot(currentLanguage, editor.getValue(), currentStarterPack);
    showOutput(`✅ ${getLanguageLabel()} kodi saqlandi.`, "success");
    setTimeout(clearOutput, 2000);
}

function loadCode() {
    const code = getStoredCode(currentLanguage, currentStarterPack);
    editor.setValue(code);
    showOutput(`✅ ${getLanguageLabel()} kodi yuklandi.`, "success");
}

function downloadCode() {
    const ext = getLanguageFileExtension(currentLanguage);
    const blob = new Blob([editor.getValue()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `main_${currentLanguage}_${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
}

function uploadFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        editor.setValue(e.target.result);
        showOutput(`OK: Fayl yuklandi: ${file.name}`, "success");
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
                showOutput("OK: Kod formatlandi.", "success");
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
    dispatchEditorContextUpdate();
}

function showOutput(text, type) {
    const output = document.getElementById("output");
    if (!output) return;
    output.textContent = text;
    output.className = type ? "output-content " + type : "output-content";
    scrollOutputToLatest();
    dispatchEditorContextUpdate();
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

function continueDebugSession() {
    showOutput("Debug rejimi hozircha tayyor emas.", "");
    activeDebugSession = null;
}

// --- AUTOCOMPLETE ---

function onEditorInputRead(cm, change) {
    if (change.origin !== "+input") return;
    const cur = cm.getCursor();
    const token = cm.getTokenAt(cur);
    const char = change.text[0];

    // Trigger on any alphabetical character or dot
    if (!/^[a-zA-Z_.]$/.test(char)) return;
    
    // Trigger instantly if we have a valid starting char
    if (token.string.trim().length > 0 || char === ".") {
        showAutocompleteHints(cm);
    }
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

            const currentWordLower = currentWord.toLowerCase();
            const priority = ["True", "False", "None"];

            const list = [...new Set([
                ...PYTHON_KEYWORDS,
                ...MATH_FUNCTIONS,
                ...(CodeMirror.hint.anyword(editor).list || [])
            ])].filter(h => h.toLowerCase().startsWith(currentWordLower))
               .sort((a, b) => {
                   // Priority check
                   const aPri = priority.includes(a);
                   const bPri = priority.includes(b);
                   if (aPri && !bPri) return -1;
                   if (!aPri && bPri) return 1;

                   // Exact case match prioritize
                   const aStart = a.startsWith(currentWord);
                   const bStart = b.startsWith(currentWord);
                   if (aStart && !bStart) return -1;
                   if (!aStart && bStart) return 1;

                   return a.localeCompare(b);
               });

            return {
                list: list,
                from: CodeMirror.Pos(line, start),
                to: CodeMirror.Pos(line, end)
            };
        },
        completeSingle: false
    });
}

// --- MULTI-LANGUAGE OVERRIDES ---

function applyEditorTypography(family, size) {
    const resolvedFamily = EDITOR_FONT_FAMILIES[family] || family;
    const root = document.documentElement;
    root.style.setProperty("--editor-font-family", resolvedFamily);
    root.style.setProperty("--editor-font-size", size);

    if (editor) {
        const wrapper = editor.getWrapperElement();
        wrapper.style.fontFamily = resolvedFamily;
        wrapper.style.fontSize = size;
        editor.refresh();
    }

    localStorage.setItem("editorFontFamily", family);
    localStorage.setItem("editorFontSize", size);
}

function loadTheme() {
    const theme = localStorage.getItem("theme") || "light";
    const isDark = theme === "dark";
    document.body.classList.toggle("dark-mode", isDark);
    const btn = document.getElementById("themeBtn");
    if (btn) {
        const label = btn.querySelector(".button-label");
        if (label) label.textContent = isDark ? "Light" : "Dark";
    }
    if (editor) editor.setOption("theme", isDark ? "monokai" : "eclipse");
}

function loadEditorTypographyPreferences() {
    const family = localStorage.getItem("editorFontFamily") || "IBM Plex Mono";
    const size = localStorage.getItem("editorFontSize") || "14px";

    const fSelect = document.getElementById("editor-font-family");
    const sSelect = document.getElementById("editor-font-size");

    if (fSelect) {
        fSelect.value = family;
        fSelect.onchange = () => applyEditorTypography(fSelect.value, sSelect ? sSelect.value : size);
    }
    if (sSelect) {
        sSelect.value = size;
        sSelect.onchange = () => applyEditorTypography(fSelect ? fSelect.value : family, sSelect.value);
    }

    applyEditorTypography(family, size);
}

const IDENTIFIER_RESERVED_WORDS = (() => {
    const words = new Set(Object.values(LANGUAGE_AUTOCOMPLETE_WORDS).flat());
    words.delete("main");
    words.delete("Main");
    return words;
})();

const IDENTIFIER_TONE_COUNT = 10;

function hashIdentifier(name) {
    let hash = 0;
    for (let index = 0; index < name.length; index += 1) {
        hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
    }
    return hash;
}

function getIdentifierToneClass(name) {
    return `cm-identifier-tone-${hashIdentifier(name) % IDENTIFIER_TONE_COUNT}`;
}

function createIdentifierOverlay() {
    return {
        token(stream) {
            if (stream.eatSpace()) return null;

            const word = stream.match(/^[A-Za-z_][A-Za-z0-9_]*/);
            if (word) {
                const token = word[0];
                if (!IDENTIFIER_RESERVED_WORDS.has(token)) {
                    return getIdentifierToneClass(token);
                }
                return null;
            }

            stream.next();
            return null;
        },
    };
}

async function initPyodide() {
    const loading = document.getElementById("loading");
    if (!loading) return;

    loading.classList.add("active");
    loading.textContent = "Python vositalari yuklanmoqda...";

    try {
        pyodide = await loadPyodide();
        await ensurePythonRuntimeTools();
        loading.textContent = "Python muhiti tayyorlanmoqda...";
        await setupSafeExecutionEnvironment();
        loading.textContent = "Python tayyor!";
        setTimeout(() => {
            loading.classList.remove("active");
        }, 1500);
    } catch (error) {
        console.warn("Python muhiti yuklanmadi:", error);
        loading.textContent = "Ogohlantirish: Python muhiti yuklanmadi, lekin editor ishlaydi.";
        loading.style.background = "#fef3c7";
        loading.style.color = "#92400e";
        setTimeout(() => {
            loading.classList.remove("active");
        }, 2500);
    }
}

function syncLanguageSelector() {
    const selector = document.getElementById("editor-language");
    if (selector) {
        selector.value = currentLanguage;
    }
}

function setupLanguageSelector() {
    const selector = document.getElementById("editor-language");
    if (!selector) return;
    selector.value = currentLanguage;
    selector.onchange = () => setEditorLanguage(selector.value);
}

function syncStarterPackSelector() {
    const selector = document.getElementById("editor-starter-pack");
    if (selector) {
        selector.value = currentStarterPack;
    }
}

function setupStarterPackSelector() {
    const selector = document.getElementById("editor-starter-pack");
    if (!selector) return;
    selector.value = currentStarterPack;
    selector.onchange = () => setStarterPack(selector.value);
}

function setStarterPack(pack, options = {}) {
    const nextPack = normalizeStarterPack(pack);
    const shouldPersistCurrent = options.persistCurrent !== false;

    if (!editor) {
        currentStarterPack = nextPack;
        setStoredStarterPack(nextPack);
        syncStarterPackSelector();
        return;
    }

    if (currentStarterPack === nextPack && !options.force) {
        syncStarterPackSelector();
        updateEditorStatus();
        return;
    }

    if (shouldPersistCurrent) {
        saveAutoCodeSnapshot(currentLanguage, editor.getValue(), currentStarterPack);
    }

    currentStarterPack = nextPack;
    setStoredStarterPack(nextPack);

    editor.setValue(getStoredCode(currentLanguage, nextPack));
    editor.focus();
    editor.refresh();

    clearOutput({ preserveInput: false });
    syncStarterPackSelector();
    updateEditorStatus();
    dispatchEditorContextUpdate();
}

function setEditorLanguage(language, options = {}) {
    const nextLanguage = normalizeLanguage(language);
    const shouldPersistCurrent = options.persistCurrent !== false;

    if (!editor) {
        currentLanguage = nextLanguage;
        setStoredLanguage(nextLanguage);
        syncLanguageSelector();
        return;
    }

    if (currentLanguage === nextLanguage && !options.force) {
        syncLanguageSelector();
        updateEditorStatus();
        return;
    }

    if (shouldPersistCurrent) {
        saveAutoCodeSnapshot(currentLanguage, editor.getValue(), currentStarterPack);
    }

    currentLanguage = nextLanguage;
    setStoredLanguage(nextLanguage);

    editor.setOption("mode", getLanguageMode(nextLanguage));
    editor.setOption("indentUnit", getLanguageIndentUnit(nextLanguage));
    editor.setValue(getStoredCode(nextLanguage, currentStarterPack));
    editor.focus();
    editor.refresh();

    clearOutput({ preserveInput: false });
    syncLanguageSelector();
    syncStarterPackSelector();
    updateEditorStatus();
    dispatchEditorContextUpdate();
}

function setupEditor() {
    const textArea = document.getElementById("code-editor");
    if (!textArea) return;

    currentLanguage = getStoredLanguage();
    currentStarterPack = getStoredStarterPack();

    editor = CodeMirror.fromTextArea(textArea, {
        mode: getLanguageMode(currentLanguage),
        theme: "eclipse",
        lineNumbers: true,
        indentUnit: getLanguageIndentUnit(currentLanguage),
        smartIndent: true,
        indentWithTabs: false,
        lineWrapping: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        styleActiveLine: true,
        foldGutter: true,
        gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "breakpoints"],
        extraKeys: {
            "Ctrl-Enter": runCode,
            "F5": runCode,
            "Enter": "newlineAndIndent",
            "Ctrl-S": saveCode,
            "Ctrl-Shift-F": formatEditorCode,
            "Tab": (cm) => {
                if (cm.state.completionActive) return CodeMirror.Pass;
                if (cm.somethingSelected()) cm.indentSelection("add");
                else cm.replaceSelection(" ".repeat(getLanguageIndentUnit()));
            },
            "Shift-Tab": (cm) => cm.indentSelection("subtract"),
        },
        hintOptions: {
            completeSingle: false,
            alignWithWord: true,
            closeOnUnfocus: true,
        },
    });
    editor.addOverlay(createIdentifierOverlay(), { combine: true });

    editor.on("inputRead", onEditorInputRead);
    editor.on("cursorActivity", updateEditorStatus);
    editor.on("change", () => {
        updateEditorStatus();
        autoSaveCode();
        dispatchEditorContextUpdate();
    });

    setupLanguageSelector();
    setupStarterPackSelector();
    loadTheme();
    loadEditorTypographyPreferences();
    editor.setValue(getStoredCode(currentLanguage, currentStarterPack));
    setupPanelResizer();
    updateEditorStatus();
    syncLanguageSelector();
    syncStarterPackSelector();
    clearOutput({ preserveInput: false });
}

function updateEditorStatus() {
    const cursor = editor.getCursor();
    const primary = document.getElementById("editor-status-primary");
    const secondary = document.getElementById("editor-status-secondary");
    if (primary) primary.textContent = `Ln ${cursor.line + 1}, Col ${cursor.ch + 1}`;
    if (secondary) secondary.textContent = `${getLanguageStatusLabel()} | UTF-8 | Spaces: ${getLanguageIndentUnit()}`;
}

function getEditorAssistantContext() {
    const output = document.getElementById("output");
    const inputHost = document.getElementById("output-input-host");
    const inputLabel = inputHost ? inputHost.querySelector(".output-input-label") : null;
    const selection = editor ? editor.getSelection() : "";
    const cursor = editor ? editor.getCursor() : { line: 0, ch: 0 };

    return {
        language: currentLanguage,
        languageLabel: getLanguageLabel(),
        starterPack: currentStarterPack,
        starterPackLabel: getStarterPackLabel(),
        code: editor ? editor.getValue() : "",
        outputText: output ? output.textContent || "" : "",
        selectedText: selection || "",
        cursorLine: cursor.line + 1,
        cursorColumn: cursor.ch + 1,
        lineCount: editor ? editor.lineCount() : 0,
        isDarkMode: document.body.classList.contains("dark-mode"),
        consoleInputActive: Boolean(inputHost && inputHost.classList.contains("active")),
        consoleInputPrompt: inputLabel ? inputLabel.textContent || "" : "",
    };
}

function dispatchEditorContextUpdate() {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
    window.dispatchEvent(new CustomEvent("pyzone-editor-context-changed", {
        detail: getEditorAssistantContext(),
    }));
}

function highlightEditorError(line, column = 1) {
    clearEditorDiagnostics();
    if (!editor || !line || line > editor.lineCount()) return;
    const idx = line - 1;
    const ch = Math.max(0, (Number(column) || 1) - 1);
    activeDebugLineNumber = idx;
    editor.addLineClass(idx, "background", "error-line");
    editor.setCursor({ line: idx, ch });
    editor.scrollIntoView({ line: idx, ch }, 100);
}

function clearEditorDiagnostics() {
    if (activeDebugLineNumber !== null && editor) {
        editor.removeLineClass(activeDebugLineNumber, "background", "error-line");
        activeDebugLineNumber = null;
    }
}

function clearOutputInputHost({ preserveValue = true } = {}) {
    const input = getInputPanelElement();
    if (preserveValue && input && typeof input.value === "string" && input.value.length) {
        saveInputDraft(currentLanguage, input.value, currentStarterPack);
    }
    const host = document.getElementById("output-input-host");
    if (host) {
        host.className = "output-input-host";
        host.innerHTML = "";
    }
    dispatchEditorContextUpdate();
}

function clearOutput({ preserveInput = true } = {}) {
    const output = document.getElementById("output");
    if (output) {
        output.textContent = getLanguageOutputPlaceholder(currentLanguage, currentStarterPack);
        output.className = "output-content";
    }
    pendingRemoteRun = null;
    clearEditorDiagnostics();
    clearOutputInputHost({ preserveValue: preserveInput });
    dispatchEditorContextUpdate();
}

function showOutput(text, type) {
    const output = document.getElementById("output");
    if (!output) return;
    output.textContent = text;
    output.className = type ? "output-content " + type : "output-content";
    scrollOutputToLatest();
    dispatchEditorContextUpdate();
}

function saveCode() {
    saveCodeSnapshot(currentLanguage, editor.getValue(), currentStarterPack);
    showOutput(`OK: ${getLanguageLabel()} kodi saqlandi.`, "success");
    setTimeout(clearOutput, 2000);
}

function loadCode() {
    const code = getStoredCode(currentLanguage, currentStarterPack);
    editor.setValue(code);
    showOutput(`OK: ${getLanguageLabel()} kodi yuklandi.`, "success");
}

function downloadCode() {
    const ext = getLanguageFileExtension(currentLanguage);
    const blob = new Blob([editor.getValue()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `main_${currentLanguage}_${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
}

function uploadFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const extensionMap = {
        py: "python",
        js: "javascript",
        mjs: "javascript",
        cjs: "javascript",
        cpp: "cpp",
        cc: "cpp",
        cxx: "cpp",
        h: "cpp",
        hpp: "cpp",
        java: "java",
        go: "go",
    };

    const ext = file.name.split(".").pop().toLowerCase();
    const targetLanguage = normalizeLanguage(extensionMap[ext] || currentLanguage);
    const reader = new FileReader();
    reader.onload = (e) => {
        if (targetLanguage !== currentLanguage) {
            setEditorLanguage(targetLanguage, { persistCurrent: true });
        }
        editor.setValue(String(e.target.result || ""));
        showOutput(`OK: Fayl yuklandi: ${file.name}`, "success");
    };
    reader.readAsText(file);
}

function autoSaveCode() {
    saveAutoCodeSnapshot(currentLanguage, editor.getValue(), currentStarterPack);
}

function loadAutoSavedCode() {
    editor.setValue(getStoredCode(currentLanguage, currentStarterPack));
}

function normalizeErrorText(text) {
    return String(text || "").replace(/\r\n/g, "\n").trim();
}

function extractErrorLocationFromText(text) {
    const normalized = normalizeErrorText(text);
    if (!normalized) return { line: null, column: null };

    const patterns = [
        /:(\d+):(\d+):\s*(?:error|warning)/i,
        /:(\d+):(\d+)/i,
        /line\s+(\d+),\s*column\s+(\d+)/i,
        /line\s+(\d+)(?:,\s*column\s+\d+)?/i,
        /at\s+[^:\n]+:(\d+):(\d+)/i,
        /File "[^"]+", line (\d+)/i,
    ];

    for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (match) {
            const line = Number(match[1]);
            const column = Number(match[2]);
            return {
                line: Number.isFinite(line) && line > 0 ? line : null,
                column: Number.isFinite(column) && column > 0 ? column : null,
            };
        }
    }

    return { line: null, column: null };
}

function extractErrorLineFromText(text) {
    return extractErrorLocationFromText(text).line;
}

function getCodeLineAt(code, lineNumber) {
    const lines = String(code || "").replace(/\r\n/g, "\n").split("\n");
    const index = Number(lineNumber) - 1;
    if (!Number.isFinite(index) || index < 0 || index >= lines.length) return "";
    return String(lines[index] || "").trimEnd();
}

function getPointerIndent(column, maxWidth = 88) {
    const col = Math.max(1, Number(column) || 1);
    return " ".repeat(Math.min(maxWidth, Math.max(0, col - 1)));
}

function buildCompactErrorMessage({
    title,
    summary,
    line,
    codeLine,
    column,
    tips = [],
    durationSeconds,
} = {}) {
    const parts = [];
    if (title) parts.push(`Xatolik: ${title}`);
    if (summary) parts.push(summary);
    if (line) {
        const lineText = column ? `Qator: ${line}, Ustun: ${column}` : `Qator: ${line}`;
        parts.push(lineText);
    }
    if (codeLine) {
        parts.push("Kod satri:");
        parts.push(codeLine);
        parts.push(`${getPointerIndent(column)}↑ xato shu yerda`);
    }
    if (tips.length) {
        parts.push("");
        parts.push("Tuzatish:");
        for (const tip of tips.slice(0, 3)) {
            parts.push(`- ${tip}`);
        }
    }
    if (durationSeconds !== undefined && durationSeconds !== null) {
        parts.push("");
        parts.push(`Vaqt: ${durationSeconds}s`);
    }
    return parts.join("\n");
}

function matchErrorRule(lowerText, rules) {
    for (const rule of rules) {
        const matches = Array.isArray(rule.match) ? rule.match : [rule.match];
        const shouldMatchAll = rule.all !== false;
        const hit = shouldMatchAll
            ? matches.every((term) => lowerText.includes(String(term).toLowerCase()))
            : matches.some((term) => lowerText.includes(String(term).toLowerCase()));

        if (hit) {
            return {
                summary: rule.summary,
                tips: Array.isArray(rule.tips) ? rule.tips : [],
            };
        }
    }

    return null;
}

function getLanguageSpecificErrorAdvice(language, verdict, lowerText) {
    const normalizedLanguage = normalizeLanguage(language);

    const compilationRules = {
        cpp: [
            {
                match: ["expected '}'", "expected }", "expected '}' at end of input"],
                summary: "Kodda yopilmagan qavs bor. `}` yetishmayapti.",
                tips: [
                    "Har bir `{` uchun mos `}` borligini tekshiring.",
                    "Ayniqsa `if`, `for`, `while` va `main` bloklarini ko'rib chiqing.",
                ],
            },
            {
                match: ["expected ';'", "missing ';'"],
                summary: "Nuqta-vergul `;` yetishmayapti.",
                tips: [
                    "Har bir buyruq satrining oxirini tekshiring.",
                    "Ayniqsa `return`, `int`, `cout`, `if` atrofini ko'ring.",
                ],
            },
            {
                match: ["was not declared in this scope"],
                summary: "Bu nom bu joyda e'lon qilinmagan.",
                tips: [
                    "O'zgaruvchi yoki funksiya ishlatilishdan oldin e'lon qilinganini tekshiring.",
                    "Nomni yozishda xatolik yo'qligiga ishonch hosil qiling.",
                ],
            },
            {
                match: ["no matching function for call to"],
                summary: "Funksiya chaqiruvidagi argumentlar mos kelmadi.",
                tips: [
                    "Funksiya nomi va argumentlar sonini tekshiring.",
                    "Qabul qiladigan tur bilan yuborayotgan tur mos ekanini ko'ring.",
                ],
            },
            {
                match: ["invalid conversion", "cannot convert"],
                all: false,
                summary: "Qiymat turi mos emas.",
                tips: [
                    "Son, matn va boolean qiymatlarni aralashtirib yubormaganingizni tekshiring.",
                    "Kerak bo'lsa explicit type cast ishlating.",
                ],
            },
            {
                match: ["redefinition of"],
                summary: "Nom ikki marta e'lon qilingan.",
                tips: [
                    "Bir xil nomdagi o'zgaruvchi yoki funksiya takrorlanmaganini tekshiring.",
                ],
            },
            {
                match: ["does not name a type"],
                summary: "E'lon joyi noto'g'ri yoki oldingi qatorda sintaksis uzilib qolgan.",
                tips: [
                    "Oldingi qatorda `;` yetishmayotganini tekshiring.",
                    "E'lon kodini blokdan tashqariga chiqarmaganingizga qarang.",
                ],
            },
        ],
        java: [
            {
                match: ["cannot find symbol"],
                summary: "Java bu nomni topmadi.",
                tips: [
                    "O'zgaruvchi, funksiya yoki class nomini tekshiring.",
                    "Kerakli importlar qo'shilganini ko'ring.",
                ],
            },
            {
                match: ["package ", " does not exist"],
                summary: "Import qilinayotgan paket topilmadi.",
                tips: [
                    "Import yozuvi to'g'riligini tekshiring.",
                    "Kerakli kutubxona mavjudligini ko'ring.",
                ],
            },
            {
                match: ["class, interface, or enum expected"],
                summary: "Kod sinf tanasidan tashqariga chiqib qolgan yoki qavs yopilmagan.",
                tips: [
                    "Har bir `{` uchun `}` borligini tekshiring.",
                    "Metodlar class ichida joylashganiga ishonch hosil qiling.",
                ],
            },
            {
                match: ["reached end of file while parsing"],
                summary: "Kod oxirida blok yopilmay qolgan.",
                tips: [
                    "Oxirgi `}` larni tekshiring.",
                    "String yoki bracket yopilganini ko'ring.",
                ],
            },
            {
                match: ["incompatible types"],
                summary: "Qiymat turi mos emas.",
                tips: [
                    "Masalan, `String` o'rniga `int` yubormaganingizni tekshiring.",
                ],
            },
            {
                match: ["non-static method"],
                summary: "Non-static metod static `main` ichidan noto'g'ri chaqirilgan.",
                tips: [
                    "Obyekt yarating yoki metodni `static` qiling.",
                ],
            },
        ],
        javascript: [
            {
                match: ["unexpected token"],
                summary: "JS kutilmagan belgi yoki operator topdi.",
                tips: [
                    "Qavslar, vergullar va operatorlarni tekshiring.",
                    "Yopilmagan `{`, `(` yoki matn qatori yo'qligiga qarang.",
                ],
            },
            {
                match: ["unexpected identifier"],
                summary: "Nom noto'g'ri joyda ishlatilgan.",
                tips: [
                    "O'zgaruvchi yoki funksiya yozilish tartibini ko'ring.",
                ],
            },
            {
                match: ["missing ) after argument list"],
                summary: "Yopuvchi qavs `)` yetishmayapti.",
                tips: [
                    "Funksiya chaqiruvlaridagi qavslarni tekshiring.",
                ],
            },
            {
                match: ["missing initializer in const declaration"],
                summary: "`const` o'zgaruvchisi qiymatsiz e'lon qilingan.",
                tips: [
                    "`const x = ...` ko'rinishida qiymat berilganini tekshiring.",
                ],
            },
            {
                match: ["unexpected end of input"],
                summary: "Kod oxirida qavs yoki blok yopilmay qolgan.",
                tips: [
                    "Har bir `(`, `{`, `[` uchun mos yopuvchi belgi borligini tekshiring.",
                ],
            },
        ],
        go: [
            {
                match: ["syntax error: unexpected"],
                summary: "Go sintaksisida kutilmagan belgi bor.",
                tips: [
                    "Qavslar, `:=`, `,` va `}` joylashuvini tekshiring.",
                ],
            },
            {
                match: ["undefined:"],
                summary: "Bu nom topilmadi yoki import yetishmaydi.",
                tips: [
                    "Nom yozilishi va importlar to'g'riligini tekshiring.",
                ],
            },
            {
                match: ["declared and not used"],
                summary: "O'zgaruvchi e'lon qilingan, lekin ishlatilmagan.",
                tips: [
                    "Keraksiz o'zgaruvchini olib tashlang yoki uni ishlating.",
                ],
            },
            {
                match: ["cannot use"],
                summary: "Qiymat turi mos emas.",
                tips: [
                    "Qabul qilinayotgan va yuborilayotgan turlarni taqqoslang.",
                ],
            },
            {
                match: ["missing return"],
                summary: "Funksiya barcha yo'llarda `return` qilmayapti.",
                tips: [
                    "Har bir shartli yo'l oxirida return borligini tekshiring.",
                ],
            },
            {
                match: ["imported and not used"],
                summary: "Import qilingan paket ishlatilmagan.",
                tips: [
                    "Keraksiz importni o'chiring yoki paketdan foydalaning.",
                ],
            },
        ],
    };

    const runtimeRules = {
        cpp: [
            {
                match: ["segmentation fault", "invalid memory address"],
                all: false,
                summary: "Xotiraga noto'g'ri murojaat qilindi.",
                tips: [
                    "Bo'sh ko'rsatkich yoki chegaradan chiqqan indeks yo'qligini tekshiring.",
                ],
            },
            {
                match: ["std::bad_alloc"],
                summary: "Xotira yetmadi.",
                tips: [
                    "Juda katta massiv yoki keraksiz ko'p xotira ajratilmayotganini tekshiring.",
                ],
            },
            {
                match: ["terminate called after throwing an instance of"],
                summary: "Tutib olinmagan exception yuz berdi.",
                tips: [
                    "Noto'g'ri parametr, bo'sh qiymat yoki container chegarasini tekshiring.",
                ],
            },
        ],
        java: [
            {
                match: ["nullpointerexception"],
                summary: "Null obyekt ishlatildi.",
                tips: [
                    "Obyekt yaratilib bo'linganini tekshiring.",
                    "Null tekshiruvi qo'shing.",
                ],
            },
            {
                match: ["arrayindexoutofboundsexception"],
                summary: "Indeks chegaradan chiqdi.",
                tips: [
                    "Massiv uzunligi va indekslarni tekshiring.",
                ],
            },
            {
                match: ["numberformatexception"],
                summary: "Matn son sifatida o'qildi, lekin format noto'g'ri.",
                tips: [
                    "Kiritilgan qiymat haqiqiy son ko'rinishida ekanini tekshiring.",
                ],
            },
        ],
        javascript: [
            {
                match: ["cannot read properties of undefined", "cannot read property of undefined"],
                all: false,
                summary: "Undefined yoki null ustida property o'qildi.",
                tips: [
                    "Obyekt mavjudligini tekshiring.",
                    "Optional chaining yoki guard ishlating.",
                ],
            },
            {
                match: ["cannot set properties of undefined"],
                summary: "Undefined qiymatga property yozishga urindingiz.",
                tips: [
                    "Avval obyekt yaratilganini tekshiring.",
                ],
            },
            {
                match: ["referenceerror", "is not defined"],
                all: false,
                summary: "Nom topilmadi.",
                tips: [
                    "O'zgaruvchi yoki funksiya e'lon qilinganini tekshiring.",
                ],
            },
            {
                match: ["typeerror"],
                summary: "Qiymat turi mos emas yoki funksiya noto'g'ri ishlatilgan.",
                tips: [
                    "Qiymat turini va metod chaqiruvini ko'ring.",
                ],
            },
        ],
        go: [
            {
                match: ["panic:"],
                summary: "Go panic holatiga tushdi.",
                tips: [
                    "Nil pointer, indeks yoki formatlash xatolarini tekshiring.",
                ],
            },
            {
                match: ["index out of range"],
                summary: "Indeks chegaradan chiqdi.",
                tips: [
                    "Slice yoki array uzunligini tekshiring.",
                ],
            },
            {
                match: ["invalid memory address"],
                summary: "Nil pointer yoki bo'sh manzilga murojaat qilindi.",
                tips: [
                    "Nil tekshiruv qo'shing.",
                ],
            },
        ],
    };

    const rules = verdict === "Compilation Error"
        ? compilationRules[normalizedLanguage] || []
        : verdict === "Runtime Error"
            ? runtimeRules[normalizedLanguage] || []
            : [];

    return matchErrorRule(lowerText, rules);
}

function translatePythonError(errorType, errorMessage) {
    const type = String(errorType || "Error").trim();
    const message = normalizeErrorText(errorMessage);
    const lowerType = type.toLowerCase();
    const lowerMessage = message.toLowerCase();

    if (lowerType.includes("indentationerror")) {
        return {
            title: "Python indentatsiya xatosi",
            summary: "Bo'shliqlar noto'g'ri joylashgan. Python'da blok ichidagi qatorlar bir xil surilgan bo'lishi kerak.",
            tips: [
                "Har bir blok uchun bir xil bo'shliq ishlating.",
                "`if`, `for`, `def`, `while` dan keyingi qatorlarni tekshiring.",
            ],
        };
    }

    if (lowerType.includes("syntaxerror")) {
        if (lowerMessage.includes("expected ':'")) {
            return {
                title: "Python sintaksis xatosi",
                summary: "Qator oxirida `:` yetishmayapti.",
                tips: [
                    "`if`, `for`, `while`, `def`, `class` dan keyin `:` qo'yilganini tekshiring.",
                ],
            };
        }
        if (lowerMessage.includes("unterminated string") || lowerMessage.includes("eol while scanning string literal")) {
            return {
                title: "Python matn qatori yopilmagan",
                summary: "Qo'shtirnoq yoki apostrof bilan boshlangan matn qatori yopilmagan.",
                tips: [
                    "Ochilgan qo'shtirnoqni aynan shu turdagi qo'shtirnoq bilan yoping.",
                    "Matn ichida qo'shtirnoq ishlatsangiz, uni `\\` bilan escape qiling.",
                ],
            };
        }
        if (lowerMessage.includes("unexpected eof")) {
            return {
                title: "Python sintaksis xatosi",
                summary: "Kod oxirida blok yoki qavs yopilmay qolgan ko'rinadi.",
                tips: [
                    "Har bir `(`, `[`, `{` uchun mos yopilish belgisi borligini tekshiring.",
                ],
            };
        }
        return {
            title: "Python sintaksis xatosi",
            summary: "Kod tuzilishida xatolik bor. Qavs, vergul yoki `:` ni tekshiring.",
            tips: [
                "Xatolik ko'rsatilgan qatorni yana bir bor ko'rib chiqing.",
            ],
        };
    }

    if (lowerType.includes("nameerror")) {
        return {
            title: "Python nom xatosi",
            summary: "O'zgaruvchi yoki funksiya topilmadi. U avval e'lon qilinganini tekshiring.",
            tips: [
                "Nomni bir xil yozganingizga ishonch hosil qiling.",
                "O'zgaruvchini ishlatishdan oldin yaratganingizni tekshiring.",
            ],
        };
    }

    if (lowerType.includes("typeerror")) {
        return {
            title: "Python tur xatosi",
            summary: "Noto'g'ri turdagi qiymat bilan ishlatyapsiz.",
            tips: [
                "Masalan, matn va sonni bevosita aralashtirib yubormaganingizni tekshiring.",
            ],
        };
    }

    if (lowerType.includes("valueerror")) {
        return {
            title: "Python qiymat xatosi",
            summary: "Qiymat noto'g'ri formatda kiritilgan.",
            tips: [
                "Son kutilgan joyda haqiqiy son yozilganini tekshiring.",
            ],
        };
    }

    if (lowerType.includes("zero divisionerror")) {
        return {
            title: "Nolga bo'lish mumkin emas",
            summary: "Dastur 0 ga bo'lishga uringan.",
            tips: [
                "Bo'luvchi nol bo'lmasligini oldindan tekshiring.",
            ],
        };
    }

    if (lowerType.includes("indexerror")) {
        return {
            title: "Python indeks xatosi",
            summary: "Ro'yxat yoki massiv indeksi chegaradan chiqib ketdi.",
            tips: [
                "Indeks 0 dan boshlanishini unutmang.",
                "Ro'yxat uzunligini `len(...)` bilan tekshiring.",
            ],
        };
    }

    if (lowerType.includes("keyerror")) {
        return {
            title: "Python kalit xatosi",
            summary: "Dictionary'da bu kalit topilmadi.",
            tips: [
                "Kalit mavjudligini oldindan tekshiring.",
            ],
        };
    }

    if (lowerType.includes("eoferror")) {
        return {
            title: "Python input tugadi",
            summary: "Dastur yana input kutayotgan edi, lekin kirish tugab qolgan.",
            tips: [
                "Kutilgan input soni to'liq kiritilganini tekshiring.",
            ],
        };
    }

    return {
        title: `Python ${type}`.trim(),
        summary: message || "Python bajarilishida xatolik yuz berdi.",
        tips: [],
    };
}

function translateRemoteError(language, verdict, text) {
    const lang = getLanguageLabel(language);
    const normalizedText = normalizeErrorText(text);
    const lower = normalizedText.toLowerCase();
    const baseTitle = verdict === "Compilation Error"
        ? `${lang} kompilyatsiya xatosi`
        : verdict === "Runtime Error"
            ? `${lang} ishga tushish xatosi`
            : `${lang} xatosi`;

    if (verdict === "Accepted") {
        return { title: `${lang} muvaffaqiyatli`, summary: "", tips: [] };
    }

    const languageAdvice = getLanguageSpecificErrorAdvice(language, verdict, lower);
    if (languageAdvice) {
        return {
            title: baseTitle,
            summary: languageAdvice.summary,
            tips: languageAdvice.tips,
        };
    }

    if (verdict === "Compilation Error") {
        if (lower.includes("expected '}'") || lower.includes("expected '}' at end of input") || lower.includes("expected }")) {
            return {
                title: baseTitle,
                summary: "Kodda yopilmagan qavs bor. `}` yetishmayapti.",
                tips: [
                    "Har bir `{` uchun mos `}` borligini tekshiring.",
                    "Ayniqsa `if`, `for`, `while`, `main` bloklarini ko'rib chiqing.",
                ],
            };
        }
        if (lower.includes("expected ';'") || lower.includes("';' expected")) {
            return {
                title: baseTitle,
                summary: "Nuqta-vergul `;` yetishmayapti.",
                tips: [
                    "Har bir operatorli qatorda `;` borligini tekshiring.",
                ],
            };
        }
        if (lower.includes("cannot find symbol")) {
            return {
                title: baseTitle,
                summary: "Java'da nom topilmadi. O'zgaruvchi yoki funksiya e'lonini tekshiring.",
                tips: [
                    "Nomni aynan bir xil yozing.",
                    "Kerakli importlar qo'shilganini tekshiring.",
                ],
            };
        }
        if (lower.includes("was not declared in this scope")) {
            return {
                title: baseTitle,
                summary: "C++ da bu nom ushbu joyda e'lon qilinmagan.",
                tips: [
                    "O'zgaruvchi yoki funksiya avval e'lon qilinganini tekshiring.",
                ],
            };
        }
        if (lower.includes("missing terminating \" character") || lower.includes("unclosed string literal") || lower.includes("unterminated string")) {
            return {
                title: baseTitle,
                summary: "Matn qatori yopilmagan.",
                tips: [
                    "Ochilgan qo'shtirnoqni yopganingizni tekshiring.",
                    "Ichki qo'shtirnoqlarni escape qiling.",
                ],
            };
        }
        if (lower.includes("undefined") && lower.includes("javascript")) {
            return {
                title: baseTitle,
                summary: "JavaScript kodida noma'lum nom ishlatilgan.",
                tips: [
                    "O'zgaruvchi yoki funksiya oldin e'lon qilinganini tekshiring.",
                ],
            };
        }
        return {
            title: baseTitle,
            summary: "Kompilyatsiya xatosi topildi. Qator va kod satrini tekshiring.",
            tips: [
                "Xatolik ko'rsatilgan qator atrofini diqqat bilan ko'ring.",
                "Qavslar, vergullar va `;` lar to'g'ri ekanini tekshiring.",
            ],
        };
    }

    if (verdict === "Runtime Error") {
        if (lower.includes("referenceerror") || lower.includes("is not defined")) {
            return {
                title: baseTitle,
                summary: "Nom topilmadi. O'zgaruvchi yoki funksiya aniqlanmagan.",
                tips: [
                    "Nomni yozishda xatolik yo'qligini tekshiring.",
                    "Qiymat avval e'lon qilinganini ko'ring.",
                ],
            };
        }
        if (lower.includes("null pointer") || lower.includes("segmentation fault") || lower.includes("invalid memory address")) {
            return {
                title: baseTitle,
                summary: "Xotiraga noto'g'ri murojaat qilindi.",
                tips: [
                    "Bo'sh ko'rsatkich yoki mavjud bo'lmagan elementga murojaat qilmaganingizni tekshiring.",
                ],
            };
        }
        if (lower.includes("division by zero")) {
            return {
                title: baseTitle,
                summary: "Nolga bo'lish mumkin emas.",
                tips: [
                    "Bo'luvchi 0 bo'lishi mumkin bo'lgan joyni tekshiring.",
                ],
            };
        }
        if (lower.includes("index out of range") || lower.includes("out of bounds")) {
            return {
                title: baseTitle,
                summary: "Indeks chegaradan chiqib ketdi.",
                tips: [
                    "Massiv yoki ro'yxat uzunligini tekshiring.",
                    "Tsikl chegaralari to'g'ri ekanini ko'ring.",
                ],
            };
        }
        if (lower.includes("panic:")) {
            return {
                title: baseTitle,
                summary: "Go dasturi panic holatiga tushdi.",
                tips: [
                    "Nil pointer, indeks yoki formatlash xatolarini tekshiring.",
                ],
            };
        }
        return {
            title: baseTitle,
            summary: "Dastur bajarilishida xatolik yuz berdi. Qator va kod satrini tekshiring.",
            tips: [
                "Kiritilgan input va ishlatilgan o'zgaruvchilarni qayta ko'ring.",
            ],
        };
    }

    if (verdict === "Time Limit Exceeded") {
        return {
            title: baseTitle,
            summary: "Dastur juda sekin ishladi yoki cheksiz siklga tushib qoldi.",
            tips: [
                "Tsikl chegaralarini tekshiring.",
                "Katta input uchun murakkablikni kamaytiring.",
            ],
        };
    }

    if (verdict === "Memory Limit Exceeded") {
        return {
            title: baseTitle,
            summary: "Xotira me'yordan oshib ketdi.",
            tips: [
                "Keraksiz katta massivlar yaratmayotganingizni tekshiring.",
                "Kirishni to'liq saqlash o'rniga oqimda ishlashni ko'ring.",
            ],
        };
    }

    if (verdict === "Wrong Answer") {
        return {
            title: baseTitle,
            summary: "Natija test bilan mos kelmadi.",
            tips: [
                "Chegara holatlarni tekshiring.",
                "Input va output formatini yana bir ko'rib chiqing.",
            ],
        };
    }

    return {
        title: baseTitle,
        summary: normalizedText || "Xatolik haqida qo'shimcha ma'lumot yo'q.",
        tips: [],
    };
}

function buildSpecificFixTips(language, verdict, rawText, codeLine, line, column) {
    const tips = [];
    const lowerText = normalizeErrorText(rawText).toLowerCase();
    const lowerCodeLine = normalizeErrorText(codeLine).toLowerCase();
    const normalizedLanguage = normalizeLanguage(language);

    if (normalizedLanguage === "cpp") {
        if (lowerCodeLine.includes("<<end") && !lowerCodeLine.includes("<<endl")) {
            tips.push("Bu joyda `end` emas, `endl` yozing.");
            tips.push("To'g'ri variant: `cout << \"...\" << endl;`");
        }
        if ((lowerText.includes("expected '}'") || lowerText.includes("expected }")) && line) {
            tips.push("Agar `{` ochilgan bo'lsa, shu blokni `}` bilan yoping.");
        }
    }

    if (normalizedLanguage === "javascript" && verdict === "Compilation Error") {
        if (lowerText.includes("unexpected token")) {
            tips.push("Bu qatorni tekshiring: qavs, vergul yoki nuqta-vergul yetishmayotgan bo'lishi mumkin.");
        }
    }

    if (normalizedLanguage === "python") {
        if (lowerText.includes("expected ':'")) {
            tips.push("Qator oxiriga `:` qo'ying.");
        }
        if (lowerText.includes("indentationerror")) {
            tips.push("Blok ichidagi qatorlarni bir xil bo'shliq bilan suring.");
        }
    }

    return [...new Set(tips)];
}

function buildRemoteOutputMessage(result, durationSeconds, code) {
    const verdict = result.verdict || "Runtime Error";
    const stdout = normalizeErrorText(result.stdout);
    const compileOutput = normalizeErrorText(result.compile_output);
    const stderr = normalizeErrorText(result.stderr);
    const error = normalizeErrorText(result.error || result.message || result.status);
    const rawText = [compileOutput, stderr, error].filter(Boolean).join("\n\n");
    const location = extractErrorLocationFromText(rawText);
    const errorLine = location.line;

    if (verdict === "Accepted") {
        const body = stdout || "Muvaffaqiyatli bajarildi.";
        return `${body}\n\nVaqt: ${durationSeconds}s`;
    }

    const friendly = translateRemoteError(currentLanguage, verdict, rawText);
    const codeLine = errorLine ? getCodeLineAt(code, errorLine) : "";
    const specificTips = buildSpecificFixTips(currentLanguage, verdict, rawText, codeLine, errorLine, location.column);
    return buildCompactErrorMessage({
        title: friendly.title,
        summary: friendly.summary,
        line: errorLine,
        codeLine,
        column: location.column,
        tips: [...new Set([...specificTips, ...friendly.tips])],
        durationSeconds,
    });
}

async function executeRemoteCode(language, code, stdin) {
    const response = await fetch("/api/editor/run", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            language,
            code,
            stdin,
        }),
    });

    let data = {};
    try {
        data = await response.json();
    } catch (error) {
        data = {};
    }

    if (!response.ok) {
        throw new Error(data.detail || data.message || data.error || `Server xatoligi (${response.status})`);
    }

    return data;
}

function looksLikeInputRequired(language, code) {
    const normalizedLanguage = normalizeLanguage(language);
    const text = String(code || "");
    const patterns = {
        python: [/\binput\s*\(/],
        javascript: [
            /fs\.readFileSync\s*\(\s*0/,
            /process\.stdin/,
            /readline/i,
        ],
        cpp: [
            /\bcin\b/,
            /\bscanf\s*\(/,
            /\bgetline\s*\(/,
        ],
        java: [
            /\bScanner\s*\(\s*System\.in\s*\)/,
            /\bBufferedReader\b/,
            /\breadLine\s*\(/,
        ],
        go: [
            /\bfmt\.(?:Fscan|Scan|Scanln)\b/,
            /\bbufio\.NewReader\s*\(\s*os\.Stdin\s*\)/,
        ],
    };

    return (patterns[normalizedLanguage] || []).some((pattern) => pattern.test(text));
}

async function runRemoteExecution(language, code, stdinText) {
    const config = getLanguageConfig(language);
    showOutput(`${config.label} bajarilmoqda...`, "");
    const startedAt = performance.now();
    try {
        const result = await executeRemoteCode(language, code, stdinText);
        const elapsed = ((performance.now() - startedAt) / 1000).toFixed(3);
        const verdict = result.verdict || "Runtime Error";
        const remoteText = [result.compile_output, result.stderr, result.error, result.message].filter(Boolean).join("\n\n");
        const location = extractErrorLocationFromText(remoteText);
        if (location.line) {
            highlightEditorError(location.line, location.column || 1);
        }
        const message = buildRemoteOutputMessage(result, elapsed, code);
        showOutput(message, verdict === "Accepted" ? "success" : "error");
    } catch (error) {
        showOutput(`Ulanishda xatolik: ${error.message}`, "error");
    }
}

async function runCode() {
    const config = getLanguageConfig(currentLanguage);
    const code = editor.getValue();
    if (!code.trim()) return showOutput("Kod kiritilmagan.", "error");

    clearDebugState();
    clearEditorDiagnostics();

    if (config.supportsLocalRun) {
        if (!pyodide) return showOutput("Python yuklanmoqda...", "error");
        const stdinText = getInputPanelValue() || readInputDraft(currentLanguage, currentStarterPack) || "";
        activeRunSession = { code, inputValues: splitInputLines(stdinText) };
        showOutput("Bajarilmoqda...", "");
        await continueRunSession();
        return;
    }

    if (config.supportsRemoteRun) {
        const stdinText = getInputPanelValue() || readInputDraft(currentLanguage, currentStarterPack) || "";
        if (!stdinText.trim() && looksLikeInputRequired(currentLanguage, code)) {
            pendingRemoteRun = { language: currentLanguage, code };
            showOutput(`${config.label} uchun input kerak.`, "");
            renderOutputPanelInput("stdin", 0);
            return;
        }
        await runRemoteExecution(currentLanguage, code, stdinText);
        return;
    }

    showOutput(`${config.label} hozircha qo'llab-quvvatlanmaydi.`, "error");
}

async function continueRunSession() {
    if (!activeRunSession) return;
    const start = performance.now();
    try {
        const res = await pyodide.runPythonAsync(`import json; json.dumps(safe_run(${JSON.stringify(activeRunSession.code)}, ${JSON.stringify(activeRunSession.inputValues)}))`);
        const result = JSON.parse(res);
        const time = ((performance.now() - start) / 1000).toFixed(3);

        if (result.awaitingInput) {
            if (result.output) {
                showOutput(result.output + "\n...", "");
            } else {
                showOutput("Input kutilmoqda...", "");
            }
            renderOutputPanelInput(result.error.prompt, result.error.inputIndex);
            return;
        }

        const runCode = activeRunSession ? activeRunSession.code : editor.getValue();
        activeRunSession = null;
        clearEditorDiagnostics();
        if (!result.success) {
            highlightEditorError(result.error.line, result.error.column || 1);
            const friendly = translatePythonError(result.error.type, result.error.message);
            const codeLine = result.error.codeLine || getCodeLineAt(runCode, result.error.line);
            showOutput(buildCompactErrorMessage({
                title: friendly.title,
                summary: friendly.summary,
                line: result.error.line,
                codeLine,
                column: result.error.column || null,
                tips: [...new Set(friendly.tips)],
                durationSeconds: time,
            }), "error");
        } else {
            showOutput(`${result.output || "Muvaffaqiyatli bajarildi."}\n\nVaqt: ${time}s`, "success");
        }
    } catch (error) {
        activeRunSession = null;
        showOutput("Bajarishda xatolik: " + error.message, "error");
    }
}

function renderOutputPanelInput(prompt, index) {
    renderInputPanel({
        inlinePrompt: prompt ? String(prompt) : "Qiymat",
        buttonLabel: "Yuborish",
        buttonDisabled: false,
        inputValue: "",
        placeholder: "Javobni yozing",
        persistDraft: false,
        multiline: false,
        submitOnEnter: true,
        onSubmit: () => {
            const value = getInputPanelValue();
            if (pendingRemoteRun) {
                const queued = pendingRemoteRun;
                pendingRemoteRun = null;
                setInputPanelValue("");
                clearInputDraft(queued.language, currentStarterPack);
                clearOutputInputHost({ preserveValue: false });
                void runRemoteExecution(queued.language, queued.code, value);
                return;
            }
            if (!activeRunSession && !activeDebugSession) return;
            const lines = value === "" ? [""] : splitInputLines(value);
            setInputPanelValue("");
            clearInputDraft(currentLanguage, currentStarterPack);
            clearOutputInputHost({ preserveValue: false });
            if (activeRunSession) {
                activeRunSession.inputValues.push(...lines);
                continueRunSession();
                return;
            }
            if (activeDebugSession) {
                activeDebugSession.inputValues.push(...lines);
                continueDebugSession();
            }
        },
    });

    const input = getInputPanelElement();
    if (input) input.focus();
    scrollOutputToLatest();
}

function formatEditorCode() {
    if (currentLanguage !== "python") {
        showOutput("Formatlash hozircha faqat Python uchun mavjud.", "error");
        return;
    }
    if (!pyodide) return showOutput("Python yuklanmagan.", "error");
    const code = editor.getValue();
    showOutput("Formatlanmoqda...", "");
    pyodide.runPythonAsync(`import json; json.dumps(auto_fix_code(${JSON.stringify(code)}))`)
        .then((res) => {
            const result = JSON.parse(res);
            if (result.formatterAvailable) {
                editor.setValue(result.code);
                showOutput("OK: Kod formatlandi.", "success");
            } else {
                showOutput("Formatlash vositasi (autopep8) mavjud emas.", "error");
            }
            setTimeout(clearOutput, 2000);
        })
        .catch((error) => {
            showOutput("Xatolik: " + error.message, "error");
        });
}

function debugCode() {
    if (currentLanguage !== "python") {
        showOutput("Debug rejimi hozircha faqat Python uchun mavjud.", "");
        return;
    }
    showOutput("Debug rejimi online editor uchun tez orada qo'shiladi.", "");
}

function clearDebugState() {
    activeDebugSession = null;
    activeDebugSteps = [];
    activeDebugStepIndex = 0;
}

function onEditorInputRead(cm, change) {
    if (change.origin !== "+input") return;
    const cur = cm.getCursor();
    const token = cm.getTokenAt(cur);
    const char = change.text[0];

    if (!/^[a-zA-Z0-9_.:$]$/.test(char)) return;

    if (token.string.trim().length > 0 || char === ".") {
        showAutocompleteHints(cm);
    }
}

function showAutocompleteHints(cm) {
    const language = currentLanguage;
    cm.showHint({
        hint: function(editorInstance) {
            const cur = editorInstance.getCursor();
            const token = editorInstance.getTokenAt(cur);
            const start = token.start;
            const end = cur.ch;
            const line = cur.line;
            const currentWord = token.string;
            const currentWordLower = currentWord.toLowerCase();
            const priority = language === "python"
                ? ["True", "False", "None"]
                : language === "javascript"
                    ? ["true", "false", "null", "undefined"]
                    : [];

            const baseWords = getAutocompleteWords(language);
            const anyWordList = (CodeMirror.hint.anyword(editorInstance).list || []);
            const list = [...new Set([...baseWords, ...anyWordList])]
                .filter((word) => word.toLowerCase().startsWith(currentWordLower))
                .sort((a, b) => {
                    const aPri = priority.includes(a);
                    const bPri = priority.includes(b);
                    if (aPri && !bPri) return -1;
                    if (!aPri && bPri) return 1;

                    const aStart = a.startsWith(currentWord);
                    const bStart = b.startsWith(currentWord);
                    if (aStart && !bStart) return -1;
                    if (!aStart && bStart) return 1;

                    return a.localeCompare(b);
                });

            return {
                list,
                from: CodeMirror.Pos(line, start),
                to: CodeMirror.Pos(line, end),
            };
        },
        completeSingle: false,
    });
}

window.pyzoneEditorAssistant = {
    getContext: getEditorAssistantContext,
    isReady: () => Boolean(editor),
};

// --- INITIALIZE ---

window.addEventListener("DOMContentLoaded", () => {
    setupEditor();
    initPyodide();
});
