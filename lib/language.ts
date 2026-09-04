/** Language is a presentation preference, never a timezone or workspace identity. */
export const languages = [
  { id: "ko", label: "한국어", locale: "ko-KR" },
  { id: "en", label: "English", locale: "en-US" },
  { id: "ja", label: "日本語", locale: "ja-JP" },
  { id: "zh", label: "中文（简体）", locale: "zh-Hans-CN" },
  { id: "es", label: "Español", locale: "es-ES" },
] as const;
export type Language = (typeof languages)[number]["id"];
export type LanguagePreference = Language | "auto";
export type LanguagePreferences = { language: LanguagePreference; resolvedLanguage: Language; revision: number };
export type LocalizedMessage = string | { one: string; other: string };
export const ANONYMOUS_LANGUAGE_KEY = "okri.intro-language";
export const LANGUAGE_COOKIE = "okri_guest_language";
export const isLanguage = (value: unknown): value is Language => languages.some((entry) => entry.id === value);
export const isLanguagePreference = (value: unknown): value is LanguagePreference => value === "auto" || isLanguage(value);
export const formatLocale = (language: Language) => languages.find((entry) => entry.id === language)!.locale;

export function preferredLanguages(header: string | null): string[] {
  return (header ?? "").split(",").map((part, index) => {
    const [tag, ...parameters] = part.trim().split(";");
    const quality = parameters.find((entry) => entry.trim().startsWith("q="));
    const q = quality ? Number(quality.trim().slice(2)) : 1;
    return { tag, q, index };
  }).filter(({ tag, q }) => tag && tag !== "*" && q > 0 && q <= 1)
    .sort((a, b) => b.q - a.q || a.index - b.index).map(({ tag }) => tag);
}

export function resolveLanguage(preferred: readonly string[], country?: string | null): Language {
  for (const value of preferred) {
    const base = value.trim().toLowerCase().split(/[-_]/)[0];
    if (isLanguage(base)) return base;
  }
  if (country === "KR") return "ko";
  if (country === "JP") return "ja";
  if (country === "CN") return "zh";
  if (["ES", "MX", "AR", "BO", "CL", "CO", "CR", "CU", "DO", "EC", "GT", "HN", "NI", "PA", "PE", "PR", "PY", "SV", "UY", "VE", "GQ"].includes(country ?? "")) return "es";
  return "en";
}

export function requestLanguage(request: Request): Language {
  // Only runtime-owned metadata is trusted. Never trust a caller's country/IP header.
  const country = (request as Request & { cf?: { country?: string } }).cf?.country;
  return resolveLanguage(preferredLanguages(request.headers.get("accept-language")), country);
}

export function guestLanguage(request: Request): Language | null {
  const value = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${LANGUAGE_COOKIE}=`))?.slice(LANGUAGE_COOKIE.length + 1);
  return isLanguage(value) ? value : null;
}

export function interpolate(message: string, values: Record<string, string | number> = {}) {
  return message.replace(/\{(\w+)\}/g, (match, key: string) => Object.hasOwn(values, key) ? String(values[key]) : match);
}

export function translateMessage(key: string, message: LocalizedMessage | undefined, language: Language, values?: Record<string, string | number>) {
  const text = !message ? key : typeof message === "string" ? message
    : new Intl.PluralRules(formatLocale(language)).select(Number(values?.count ?? 0)) === "one" ? message.one : message.other;
  const formatted = values && Object.fromEntries(Object.entries(values).map(([name, value]) => [name, typeof value === "number"
    ? new Intl.NumberFormat(formatLocale(language), { maximumFractionDigits: 20 }).format(value) : value]));
  return interpolate(text, formatted);
}

export function formatNumber(value: number, language: Language, options: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat(formatLocale(language), options).format(value);
}

export function formatCalendarDate(value: string, language: Language, options: Intl.DateTimeFormatOptions = {}) {
  // Date-only task deadlines must not move across days when the locale changes.
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return value;
  return new Intl.DateTimeFormat(formatLocale(language), { month: "short", day: "numeric", ...options, timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))));
}
