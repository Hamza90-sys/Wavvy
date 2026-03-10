import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_THEME, isValidTheme } from "../constants/themes";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("wavvy_theme");
    return isValidTheme(saved) ? saved : DEFAULT_THEME;
  });

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem("wavvy_theme", theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
