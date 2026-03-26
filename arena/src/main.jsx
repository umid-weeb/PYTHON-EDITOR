import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ArenaProvider } from "./context/ArenaContext.jsx";
import { ThemeProvider } from "./providers/ThemeProvider.tsx";
import "./styles/tailwind.css";

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
