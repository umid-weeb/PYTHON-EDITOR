import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { loader } from "@monaco-editor/react";
import { registerSW } from "virtual:pwa-register";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ArenaProvider } from "./context/ArenaContext.jsx";
import { ThemeProvider } from "./providers/ThemeProvider.tsx";
import "./styles/tailwind.css";

// Configure Monaco Editor to use local assets for offline capability
const getMonacoVsPath = () => {
  const origin = window.location.origin;
  const pathname = window.location.pathname;
  if (pathname.includes('/zone')) {
    return `${origin}/zone/monaco/vs`;
  }
  return `${origin}/monaco/vs`;
};

loader.config({
  paths: {
    vs: getMonacoVsPath()
  }
});

// Register PWA Service Worker for 100% offline capability
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log("Yangi PyZone versiyasi mavjud.");
  },
  onOfflineReady() {
    console.log("PyZone 100% oflayn rejimga tayyor!");
  }
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename="/zone">
      <ThemeProvider>
        <AuthProvider>
          <ArenaProvider>
            <App />
          </ArenaProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
