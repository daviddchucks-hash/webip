import { useState, useEffect } from "react";

export type HistoryType = "ip" | "website";

export interface HistoryEntry {
  id: string;
  type: HistoryType;
  query: string;
  title?: string;
  timestamp: number;
  isFavorite: boolean;
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const stored = localStorage.getItem("webip_history");
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error("Failed to load history", e);
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem("webip_history", JSON.stringify(history));
  }, [history]);

  const addHistory = (type: HistoryType, query: string, title?: string) => {
    setHistory((prev) => {
      // Remove if exists to push to top
      const filtered = prev.filter((item) => !(item.type === type && item.query === query));
      const entry: HistoryEntry = {
        id: `${type}-${query}`,
        type,
        query,
        title,
        timestamp: Date.now(),
        isFavorite: prev.find((item) => item.type === type && item.query === query)?.isFavorite || false,
      };
      return [entry, ...filtered].slice(0, 100); // Keep max 100
    });
  };

  const toggleFavorite = (id: string) => {
    setHistory((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
      )
    );
  };

  const removeHistory = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  };

  const clearHistory = () => {
    setHistory((prev) => prev.filter((item) => item.isFavorite)); // keep favorites when clearing
  };

  return {
    history,
    addHistory,
    toggleFavorite,
    removeHistory,
    clearHistory,
  };
}
