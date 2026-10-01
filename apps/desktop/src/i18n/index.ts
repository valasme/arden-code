import { use } from "i18next";
import { initReactI18next } from "react-i18next";

import enUS from "./locales/en-US.json";

export const defaultNamespace = "translation";
export const resources = { "en-US": { [defaultNamespace]: enUS } } as const;

void use(initReactI18next).init({
  resources,
  lng: "en-US",
  fallbackLng: "en-US",
  interpolation: { escapeValue: false },
  returnNull: false,
});
