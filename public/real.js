let pyodide;
let editor;
let autoSaveInterval;
let defaultCode = "";
let activeRunSession = null;
let activeDebugSession = null;
let activeDebugSteps = [];
let activeDebugStepIndex = 0;
let activeDebugLineNumber = null;
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

const LEGACY_STARTER_CODES = {
    python: `import sys


def main():
    raw = sys.stdin.read().strip()
    name = raw.split()[0] if raw else "Python"
    print(f"Salom, {name}!")


if __name__ == "__main__":
    main()
`,
    javascript: `const fs = require("fs");

function main() {
    const raw = fs.readFileSync(0, "utf8").trim();
    const name = raw ? raw.split(/\\s+/)[0] : "JavaScript";
    console.log("Salom, " + name + "!");
}

main();
`,
    cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string name;
    if (!(cin >> name)) name = "C++";

    cout << "Salom, " << name << "!" << '\\n';
    return 0;
}
`,
    java: `import java.io.BufferedReader;
import java.io.InputStreamReader;

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        String raw = reader.readLine();
        String name = (raw == null || raw.trim().isEmpty()) ? "Java" : raw.trim().split("\\\\s+")[0];
        System.out.println("Salom, " + name + "!");
    }
}
`,
    go: `package main

import (
    "bufio"
    "fmt"
    "os"
)

func main() {
    reader := bufio.NewReader(os.Stdin)
    var name string
    if _, err := fmt.Fscan(reader, &name); err != nil {
        name = "Go"
    }
    fmt.Printf("Salom, %s!\\n", name)
}
`,
};

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
    return LEGACY_STARTER_CODES[normalizedLanguage] === code;
}

function getStarterCode(language = currentLanguage, pack = currentStarterPack) {
    const normalizedLanguage = normalizeLanguage(language);
    const normalizedPack = normalizeStarterPack(pack);
    const languagePackCodes = LANGUAGE_STARTER_CODES[normalizedLanguage] || {};
    return languagePackCodes[normalizedPack] || getLanguageConfig(normalizedLanguage).defaultCode;
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
    return normalizeStarterPack(localStorage.getItem(getSelectedStarterPackStorageKey()) || "array");
}

function setStoredStarterPack(pack) {
    localStorage.setItem(getSelectedStarterPackStorageKey(), normalizeStarterPack(pack));
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
}

function renderIdleInputPanel({ preserveValue = true } = {}) {
    renderInputPanel({
        buttonLabel: "Yuborish",
        buttonDisabled: true,
        inputValue: preserveValue ? getInputPanelValue() : (readInputDraft(currentLanguage) || ""),
        placeholder: getLanguageInputPlaceholder() || "Masalan: 1\\n2\\n3",
        persistDraft: true,
    });
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
        loading.textContent = "â³ Formatlash vositalari yuklanmoqda...";
        await ensurePythonRuntimeTools();
        loading.textContent = "â³ Python ishga tayyorlanmoqda...";
        await setupSafeExecutionEnvironment();
        loading.textContent = "âœ… Python tayyor!";
        setTimeout(() => {
            loading.classList.remove("active");
        }, 1500);
    } catch (error) {
        loading.textContent = "âŒ Xatolik: Python yuklanmadi!";
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

        activeRunSession = null;
        if (!result.success) {
            highlightEditorError(result.error.line);
            showOutput(`âŒ ${result.error.type}: ${result.error.message}\n\nQator: ${result.error.line}\n${result.output}`, "error");
        } else {
            clearEditorDiagnostics();
            showOutput(`${result.output || "Muvaffaqiyatli bajarildi."}\n\nâ± Vaqt: ${time}s`, "success");
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
        showOutput(`âœ… Fayl yuklandi: ${file.name}`, "success");
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
            showOutput("âœ… Kod formatlandi.", "success");
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

async function initPyodide() {
    const loading = document.getElementById("loading");
    if (!loading) return;

    loading.classList.add("active");
    loading.textContent = "â³ Python vositalari yuklanmoqda...";

    try {
        pyodide = await loadPyodide();
        await ensurePythonRuntimeTools();
        loading.textContent = "â³ Python muhiti tayyorlanmoqda...";
        await setupSafeExecutionEnvironment();
        loading.textContent = "âœ… Python tayyor!";
        setTimeout(() => {
            loading.classList.remove("active");
        }, 1500);
    } catch (error) {
        console.warn("Python muhiti yuklanmadi:", error);
        loading.textContent = "âš  Python muhiti yuklanmadi, lekin editor ishlaydi.";
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

    editor.on("inputRead", onEditorInputRead);
    editor.on("cursorActivity", updateEditorStatus);
    editor.on("change", () => {
        updateEditorStatus();
        autoSaveCode();
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

function highlightEditorError(line) {
    clearEditorDiagnostics();
    if (!editor || !line || line > editor.lineCount()) return;
    const idx = line - 1;
    activeDebugLineNumber = idx;
    editor.addLineClass(idx, "background", "error-line");
    editor.setCursor({ line: idx, ch: 0 });
    editor.scrollIntoView({ line: idx, ch: 0 }, 100);
}

function clearEditorDiagnostics() {
    if (activeDebugLineNumber !== null && editor) {
        editor.removeLineClass(activeDebugLineNumber, "background", "error-line");
        activeDebugLineNumber = null;
    }
}

function clearOutputInputHost({ preserveValue = true } = {}) {
    renderIdleInputPanel({ preserveValue });
}

function clearOutput({ preserveInput = true } = {}) {
    const output = document.getElementById("output");
    if (output) {
        output.textContent = getLanguageOutputPlaceholder(currentLanguage, currentStarterPack);
        output.className = "output-content";
    }
    clearEditorDiagnostics();
    clearOutputInputHost({ preserveValue: preserveInput });
}

function showOutput(text, type) {
    const output = document.getElementById("output");
    if (!output) return;
    output.textContent = text;
    output.className = type ? "output-content " + type : "output-content";
    scrollOutputToLatest();
}

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
        showOutput(`âœ… Fayl yuklandi: ${file.name}`, "success");
    };
    reader.readAsText(file);
}

function autoSaveCode() {
    saveAutoCodeSnapshot(currentLanguage, editor.getValue(), currentStarterPack);
}

function loadAutoSavedCode() {
    editor.setValue(getStoredCode(currentLanguage, currentStarterPack));
}

function buildRemoteOutputMessage(result, durationSeconds) {
    const verdict = result.verdict || "Runtime Error";
    const stdout = String(result.stdout || "").trimEnd();
    const compileOutput = String(result.compile_output || "").trimEnd();
    const stderr = String(result.stderr || "").trimEnd();
    const error = String(result.error || result.message || result.status || "").trimEnd();

    if (verdict === "Accepted") {
        const body = stdout || "Muvaffaqiyatli bajarildi.";
        return `${body}\n\nâ± Vaqt: ${durationSeconds}s`;
    }

    const parts = [stdout, compileOutput, stderr, error].filter((part, index, array) => Boolean(part) && array.indexOf(part) === index);
    const detail = parts.length ? `\n\n${parts.join("\n\n")}` : "";
    return `âŒ ${verdict}${detail}\n\nâ± Vaqt: ${durationSeconds}s`;
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

async function runCode() {
    const config = getLanguageConfig(currentLanguage);
    const code = editor.getValue();
    if (!code.trim()) return showOutput("Kod kiritilmagan.", "error");

    clearDebugState();
    clearEditorDiagnostics();

    if (config.supportsLocalRun) {
        if (!pyodide) return showOutput("Python yuklanmoqda...", "error");
        const stdinText = getInputPanelValue();
        activeRunSession = { code, inputValues: splitInputLines(stdinText) };
        showOutput("Bajarilmoqda...", "");
        await continueRunSession();
        return;
    }

    if (config.supportsRemoteRun) {
        const stdinText = getInputPanelValue();
        showOutput(`${config.label} bajarilmoqda...`, "");
        const startedAt = performance.now();
        try {
            const result = await executeRemoteCode(currentLanguage, code, stdinText);
            const elapsed = ((performance.now() - startedAt) / 1000).toFixed(3);
            const verdict = result.verdict || "Runtime Error";
            const message = buildRemoteOutputMessage(result, elapsed);
            showOutput(message, verdict === "Accepted" ? "success" : "error");
        } catch (error) {
            showOutput(`Xatolik: ${error.message}`, "error");
        }
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

        activeRunSession = null;
        clearEditorDiagnostics();
        if (!result.success) {
            highlightEditorError(result.error.line);
            showOutput(`âŒ ${result.error.type}: ${result.error.message}\n\nQator: ${result.error.line}\n${result.output}`, "error");
        } else {
            showOutput(`${result.output || "Muvaffaqiyatli bajarildi."}\n\nâ± Vaqt: ${time}s`, "success");
        }
    } catch (error) {
        activeRunSession = null;
        showOutput("Xatolik: " + error.message, "error");
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
                showOutput("âœ… Kod formatlandi.", "success");
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

// --- INITIALIZE ---

window.addEventListener("DOMContentLoaded", () => {
    setupEditor();
    initPyodide();
});
