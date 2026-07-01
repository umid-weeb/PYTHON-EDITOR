/**
 * C# driver generator (runs on Godbolt / .NET via the same cloud path).
 *
 * Wraps the user's `public class Solution` with a `__Program` class whose Main
 * reads all test cases from stdin, deserializes each arg (System.Text.Json)
 * into a typed variable, calls the method, captures the return + stdout
 * (Console.SetOut), and prints one marked record per case.
 *
 * Note: the method name is the function_name with its first letter upper-cased
 * (matching the generated C# stub, e.g. solve -> Solve, twoSum -> TwoSum).
 */

function csType(rawType) {
  const t = String(rawType || "int").trim().toLowerCase().replace(/\s+/g, "");
  const map = {
    int: "int",
    integer: "int",
    long: "long",
    float: "double",
    double: "double",
    bool: "bool",
    boolean: "bool",
    char: "string",
    string: "string",
    "int[]": "int[]",
    "long[]": "long[]",
    "float[]": "double[]",
    "double[]": "double[]",
    "bool[]": "bool[]",
    "string[]": "string[]",
    "int[][]": "int[][]",
    "string[][]": "string[][]",
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

const csMethod = (fn) => (fn ? fn[0].toUpperCase() + fn.slice(1) : "Solve");

export function generateCsharpSource(signature, userCode) {
  const { fn, params, ret } = normSpec(signature);

  const reads = params
    .map((p, i) => {
      const t = String(p.type || "").trim().toLowerCase().replace(/\s+/g, "");
      if (t === "string" || t === "char") return `        var arg${i} = ReadStr();`;
      return `        var arg${i} = Um<${csType(p.type)}>();`;
    })
    .join("\n");
  const argList = params.map((_, i) => `arg${i}`).join(", ");

  const isVoid = ret.toLowerCase() === "void";
  const callBlock = isVoid
    ? `          new Solution().${csMethod(fn)}(${argList}); resStr = "null";`
    : `          var __r = new Solution().${csMethod(fn)}(${argList}); resStr = JsonSerializer.Serialize(__r);`;

  const main = `class __Program {
    static string RL() { return Console.ReadLine() ?? ""; }
    static T Um<T>() { try { return JsonSerializer.Deserialize<T>(RL().Trim()); } catch { return default(T); } }
    static string ReadStr() { var s = RL().Trim(); if (s.Length > 0 && s[0] == '"') { try { return JsonSerializer.Deserialize<string>(s); } catch {} } return s; }
    static string B64(string x) { return Convert.ToBase64String(Encoding.UTF8.GetBytes(x ?? "")); }
    static void Main() {
      int __T = Um<int>();
      var __out = new StringBuilder();
      var __real = Console.Out;
      for (int __tc = 0; __tc < __T; __tc++) {
${reads}
        var __cap = new System.IO.StringWriter();
        Console.SetOut(__cap);
        string resStr = "null"; string errStr = "";
        try {
${callBlock}
        } catch (Exception __e) { errStr = __e.Message; }
        Console.SetOut(__real);
        __out.Append("\\u001e").Append(resStr).Append("\\u001f").Append(B64(__cap.ToString())).Append("\\u001f").Append(B64(errStr)).Append("\\n");
      }
      Console.Write(__out.ToString());
    }
}`;

  return `using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;

${userCode}

${main}
`;
}
