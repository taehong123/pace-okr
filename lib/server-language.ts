import { translateMessage, type Language, type LocalizedMessage } from "./language";
export type Translator = (key: string, values?: Record<string, string | number>) => string;
const loaders = { en: () => import("./locales/en"), ja: () => import("./locales/ja"), zh: () => import("./locales/zh"), es: () => import("./locales/es") };
export async function serverTranslator(language: Language): Promise<Translator> {
  if (language === "ko") return (key, values) => translateMessage(key, undefined, language, values);
  const { default: dictionary } = await loaders[language]();
  return (key, values) => translateMessage(key, (dictionary as Record<string, LocalizedMessage>)[key], language, values);
}
