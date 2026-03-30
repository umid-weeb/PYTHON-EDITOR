/**
 * Pyodide Web Worker for isolated code execution.
 * This prevents the main UI thread from hanging during long-running or infinite loops.
 */
importScripts("https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js");

let pyodide = null;

async function initPyodide() {
  if (pyodide) return pyodide;
  
  pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.23.4/full/",
  });
  
  // Optional: Load common packages like numpy or pandas if needed
  // await pyodide.loadPackage(["numpy"]);
  
  return pyodide;
}

self.onmessage = async (event) => {
  const { code, type, id } = event.data;

  if (type === "init") {
    try {
      await initPyodide();
      self.postMessage({ type: "initialized", id });
    } catch (err) {
      self.postMessage({ type: "init_error", error: err.message, id });
    }
    return;
  }

  if (type === "run") {
    try {
      const py = await initPyodide();
      
      // Capture stdout and stderr
      let stdoutLines = [];
      let stderrLines = [];
      
      py.setStdout({
        batched: (str) => {
          stdoutLines.push(str);
        }
      });
      
      py.setStderr({
        batched: (str) => {
          stderrLines.push(str);
        }
      });

      // Clear the environment for a clean run if desired, 
      // or keep it to maintain state between runs.
      // For the online editor, keeping state is usually preferred.
      
      await py.runPythonAsync(code);

      self.postMessage({
        type: "success",
        stdout: stdoutLines.join("\n"),
        stderr: stderrLines.join("\n"),
        id
      });
    } catch (err) {
      self.postMessage({
        type: "error",
        error: err.message,
        id
      });
    }
  }
};
