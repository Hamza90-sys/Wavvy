import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const translations = {
  en: {
    settingsTitle: "Make Wavvy yours",
    settingsSubtitle: "Account, preferences, privacy, and help.",
    languageLabel: "Language"
  },
  fr: {
    settingsTitle: "Personnalisez Wavvy",
    settingsSubtitle: "Compte, préférences, confidentialité et aide.",
    languageLabel: "Langue"
  }
};

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [language, setLanguage] = useState(() => localStorage.getItem("wavvy_lang") || "en");

  useEffect(() => {
    localStorage.setItem("wavvy_lang", language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(() => {
    const t = (key, fallback) => translations[language]?.[key] || translations.en[key] || fallback || key;
    return { language, setLanguage, t };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
