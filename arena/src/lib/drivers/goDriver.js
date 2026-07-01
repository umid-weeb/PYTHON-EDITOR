/**
 * Go driver generator (runs on Godbolt via the same cloud path as C++/Java).
 *
 * Wraps the user's free function `solve(...)` in a `package main` with a main()
 * that reads all test cases from stdin, unmarshals each arg (encoding/json) into
 * a typed variable, calls the function, captures the return + stdout (via an
 * os.Pipe redirect), and prints one marked record per case.
 *
 * Go quirks handled: unused imports are a compile error, so we import exactly
 * what the driver uses plus any common package the user's code references.
 */

// Packages the generated driver itself always uses (all are referenced below).
const BASE_IMPORTS = ["bufio", "bytes", "encoding/base64", "encoding/json", "fmt", "io", "os", "strings"];
// name-in-code -> import path, added only when the user references it.
const EXTRA_IMPORTS = {
  sort: "sort",
  math: "math",
  strconv: "strconv",
  unicode: "unicode",
  bits: "math/bits",
  heap: "container/heap",
  list: "container/list",
  rand: "math/rand",
  regexp: "regexp",
};

function goType(rawType) {
  const t = String(rawType || "int").trim().toLowerCase().replace(/\s+/g, "");
  const map = {
    int: "int",
    integer: "int",
    long: "int64",
    float: "float64",
    double: "float64",
    bool: "bool",
    boolean: "bool",
    char: "string",
    string: "string",
    "int[]": "[]int",
    "long[]": "[]int64",
    "float[]": "[]float64",
    "double[]": "[]float64",
    "bool[]": "[]bool",
    "string[]": "[]string",
    "int[][]": "[][]int",
    "string[][]": "[][]string",
  };
  return map[t] || "string";
}

function normSpec(spec) {
  const fn = String(spec?.function_name || "solve").trim();
  const params = (spec?.params || []).map((p, i) => ({
    name: String(p?.name || `arg${i}`),
    type: String(p?.type || "int"),
  }));
  const returns = spec?.returns || {};
  const ret = String((typeof returns === "object" ? returns.type : returns) || "void");
  return { fn, params, ret };
}

export function generateGoSource(signature, userCode) {
  const { fn, params, ret } = normSpec(signature);
  const code = userCode || "";

  const extra = [];
  for (const [name, path] of Object.entries(EXTRA_IMPORTS)) {
    if (!BASE_IMPORTS.includes(path) && new RegExp(`\\b${name}\\.`).test(code)) extra.push(path);
  }
  const imports = [...BASE_IMPORTS, ...extra].map((p) => `\t"${p}"`).join("\n");

  const reads = params
    .map((p, i) => {
      const t = String(p.type || "").trim().toLowerCase().replace(/\s+/g, "");
      if (t === "string" || t === "char") return `\t\targ${i} := readStr(r)`;
      return `\t\targ${i} := um[${goType(p.type)}](r)`;
    })
    .join("\n");
  const argList = params.map((_, i) => `arg${i}`).join(", ");

  const isVoid = ret.toLowerCase() === "void";
  const callBlock = isVoid
    ? `\t\t\t${fn}(${argList}); resStr = "null"`
    : `\t\t\tres := ${fn}(${argList})\n\t\t\tb, _ := json.Marshal(res)\n\t\t\tresStr = string(b)`;

  return `package main
import (
${imports}
)

${code}

func readLine(r *bufio.Reader) string { s, _ := r.ReadString('\\n'); return strings.TrimRight(s, "\\r\\n") }
func readStr(r *bufio.Reader) string { s := strings.TrimSpace(readLine(r)); if len(s) > 0 && s[0] == '"' { var v string; if json.Unmarshal([]byte(s), &v) == nil { return v } }; return s }
func um[T any](r *bufio.Reader) T { var v T; json.Unmarshal([]byte(strings.TrimSpace(readLine(r))), &v); return v }

func main() {
	r := bufio.NewReader(os.Stdin)
	T := um[int](r)
	var out strings.Builder
	real := os.Stdout
	for tc := 0; tc < T; tc++ {
${reads}
		pr, pw, _ := os.Pipe()
		os.Stdout = pw
		capCh := make(chan string)
		go func() { var b bytes.Buffer; io.Copy(&b, pr); capCh <- b.String() }()
		resStr, errStr := "null", ""
		func() {
			defer func() { if rec := recover(); rec != nil { errStr = fmt.Sprint(rec) } }()
${callBlock}
		}()
		pw.Close()
		os.Stdout = real
		captured := <-capCh
		out.WriteString("\\x1e")
		out.WriteString(resStr)
		out.WriteString("\\x1f")
		out.WriteString(base64.StdEncoding.EncodeToString([]byte(captured)))
		out.WriteString("\\x1f")
		out.WriteString(base64.StdEncoding.EncodeToString([]byte(errStr)))
		out.WriteString("\\n")
	}
	fmt.Fprint(real, out.String())
}
`;
}
