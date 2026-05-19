importScripts("https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js");

let pyodide = null;

const SAFE_EXEC_CODE = `
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

ALLOWED_IMPORTS = {
    "math", "cmath", "decimal", "fractions", "random", "statistics",
    "itertools", "functools", "operator", "collections", "heapq", "bisect",
    "string", "re", "json", "copy", "pprint", "enum", "dataclasses",
    "typing", "abc", "io", "datetime",
}

def _blocked_import(name, *args, **kwargs):
    if name in ALLOWED_IMPORTS:
        return __import__(name, *args, **kwargs)
    raise ImportError(f"'{name}' modulini import qilishga ruxsat yo'q.")

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
            self.start_time = time.time()
            safe_builtins = {
                name: getattr(builtins, name)
                for name in [
                    "abs", "all", "any", "ascii", "bin", "bool", "bytearray", "bytes",
                    "callable", "chr", "complex", "dict", "dir", "divmod", "enumerate",
                    "filter", "float", "format", "frozenset", "getattr", "hasattr", "hash",
                    "hex", "id", "int", "isinstance", "issubclass", "iter", "len", "list",
                    "locals", "map", "max", "min", "next", "object", "oct", "ord", "pow",
                    "print", "range", "repr", "reversed", "round", "set", "setattr",
                    "slice", "sorted", "str", "sum", "super", "tuple", "type", "vars",
                    "zip", "True", "False", "None",
                    "ArithmeticError", "AssertionError", "AttributeError", "EOFError",
                    "Exception", "FloatingPointError", "GeneratorExit", "IOError",
                    "ImportError", "IndexError", "KeyError", "KeyboardInterrupt",
                    "LookupError", "MemoryError", "NameError", "NotImplementedError",
                    "OSError", "OverflowError", "RecursionError", "RuntimeError",
                    "StopIteration", "SyntaxError", "SystemExit", "TypeError",
                    "UnboundLocalError", "UnicodeError", "ValueError", "ZeroDivisionError",
                    "__build_class__", "__name__",
                ]
                if hasattr(builtins, name)
            }
            safe_builtins["input"] = m_input
            safe_builtins["__import__"] = _blocked_import
            glbs = {"__builtins__": safe_builtins, "__name__": "__main__", "_tick": _tick}
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
`;

async function init() {
    try {
        self.postMessage({ type: "status", message: "Python yuklanmoqda..." });
        pyodide = await loadPyodide();
        self.postMessage({ type: "status", message: "Xavfsiz muhit sozlanmoqda..." });
        await pyodide.runPythonAsync(SAFE_EXEC_CODE);
        self.postMessage({ type: "ready" });

        // Load autopep8 in background after ready
        try {
            await pyodide.loadPackage("micropip");
            await pyodide.runPythonAsync(`
import micropip
try:
    import autopep8
except ImportError:
    await micropip.install("autopep8")
    import autopep8
            `);
            self.postMessage({ type: "formatterReady" });
        } catch (_) {
            // formatter optional
        }
    } catch (error) {
        self.postMessage({ type: "initError", error: error.message });
    }
}

// pending promise map: id -> { resolve, reject }
const pending = {};
let msgIdCounter = 0;

self.onmessage = async (event) => {
    const { type, id, code, inputs } = event.data;

    if (type === "run") {
        try {
            const res = await pyodide.runPythonAsync(
                `import json; json.dumps(safe_run(${JSON.stringify(code)}, ${JSON.stringify(inputs || [])}))`
            );
            self.postMessage({ type: "result", id, result: JSON.parse(res) });
        } catch (error) {
            self.postMessage({ type: "error", id, error: error.message });
        }
    } else if (type === "format") {
        try {
            const res = await pyodide.runPythonAsync(
                `import json; json.dumps(auto_fix_code(${JSON.stringify(code)}))`
            );
            self.postMessage({ type: "formatted", id, result: JSON.parse(res) });
        } catch (error) {
            self.postMessage({ type: "error", id, error: error.message });
        }
    }
};

init();
