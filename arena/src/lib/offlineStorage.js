/**
 * PyZone Offline Storage Helper
 * Provides seamless local persistence (localStorage + IndexedDB) for code, execution history, and user settings.
 */

const STORAGE_KEYS = {
  CODE: "pyzone_offline_editor_code",
  HISTORY: "pyzone_offline_execution_history",
  SETTINGS: "pyzone_offline_settings",
};

export const offlineStorage = {
  /**
   * Save user's code to local storage
   */
  saveCode(code) {
    try {
      localStorage.setItem(STORAGE_KEYS.CODE, code);
    } catch (err) {
      console.warn("OfflineStorage: Error saving code to localStorage:", err);
    }
  },

  /**
   * Load user's saved code
   */
  loadCode(defaultCode = "") {
    try {
      return localStorage.getItem(STORAGE_KEYS.CODE) || defaultCode;
    } catch (err) {
      console.warn("OfflineStorage: Error loading code:", err);
      return defaultCode;
    }
  },

  /**
   * Save execution history log entry
   */
  saveHistoryEntry(entry) {
    try {
      const historyStr = localStorage.getItem(STORAGE_KEYS.HISTORY);
      const history = historyStr ? JSON.parse(historyStr) : [];
      
      const newEntry = {
        id: Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
        timestamp: new Date().toISOString(),
        code: entry.code,
        output: entry.output,
        stderr: entry.stderr || "",
        status: entry.status || "success",
      };

      // Keep last 30 execution entries
      const updatedHistory = [newEntry, ...history].slice(0, 30);
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(updatedHistory));
      return updatedHistory;
    } catch (err) {
      console.warn("OfflineStorage: Error saving execution history:", err);
      return [];
    }
  },

  /**
   * Get execution history
   */
  getHistory() {
    try {
      const historyStr = localStorage.getItem(STORAGE_KEYS.HISTORY);
      return historyStr ? JSON.parse(historyStr) : [];
    } catch (err) {
      console.warn("OfflineStorage: Error reading execution history:", err);
      return [];
    }
  },

  /**
   * Clear execution history
   */
  clearHistory() {
    try {
      localStorage.removeItem(STORAGE_KEYS.HISTORY);
    } catch (err) {
      console.warn("OfflineStorage: Error clearing history:", err);
    }
  },
};
