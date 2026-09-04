"use client";

import { useSyncExternalStore } from "react";
import { ANONYMOUS_LANGUAGE_KEY, LANGUAGE_COOKIE, formatLocale, formatCalendarDate, translateMessage, isLanguage, resolveLanguage, type Language, type LanguagePreferences, type LocalizedMessage } from "./language";
import type { Catalog, MessageKey } from "./locales/en";
import { publicErrorMessages } from "./api-error";

const loaders = { en: () => import("./locales/en"), ja: () => import("./locales/ja"), zh: () => import("./locales/zh"), es: () => import("./locales/es") };
const catalogs = new Map<Language, Catalog>();
const requests = new Map<Language, Promise<void>>();
const listeners = new Set<() => void>();
const initial = { language: "ko" as Language, preferences: null as LanguagePreferences | null, userId: null as string | null };
let snapshot = initial;
let generation = 0;
let previewing = false;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const emit = () => listeners.forEach((listener) => listener());

export const getClientLanguage = (): Language => typeof window === "undefined" ? "ko" : snapshot.language;
export const messageValue = (value: unknown): string | number => typeof value === "number" ? value : String(value ?? "");
export const isCurrentLanguageAccount = (userId: string) => snapshot.userId === userId;
export const getClientLocale = () => formatLocale(getClientLanguage());
export const displayDate = (value: string, options?: Intl.DateTimeFormatOptions) => formatCalendarDate(value, getClientLanguage(), options);
export const displayLanguageHeaders = (): Record<string, string> => snapshot.userId && snapshot.preferences?.language === "auto"
  ? { "x-okri-display-language": snapshot.language } : {};
export function useLanguage() { return useSyncExternalStore(subscribe, () => snapshot, () => initial); }

export function t(key: MessageKey | (string & {}), values?: Record<string, string | number>): string {
  return translateForLanguage(getClientLanguage(), key, values);
}

export function translateForLanguage(language: Language, key: MessageKey | (string & {}), values?: Record<string, string | number>): string {
  const dictionary = catalogs.get(language) as Record<string, LocalizedMessage> | undefined;
  return translateMessage(key, language === "ko" ? undefined : dictionary?.[key], language, values);
}

export function apiError(payload: { error?: unknown; code?: unknown; messageCode?: unknown; messageValues?: unknown }, fallback?: string): string {
  const dictionary = catalogs.get(getClientLanguage());
  // Only complete, known messages are translated; arbitrary backend diagnostics are never shown.
  if (typeof payload.error === "string" && dictionary && Object.hasOwn(dictionary, payload.error)) return t(payload.error);
  const actionError = typeof payload.code === "string" ? ({
    creation_rolled_back: "전체 생성을 취소했습니다.",
    editor_changed: "선택지가 변경되었습니다. 최신 선택지를 확인해 주세요.",
    initiative_changed: "추천 후보가 변경됐습니다. 다른 후보를 선택해 주세요.",
  } as const)[payload.code as "creation_rolled_back" | "editor_changed" | "initiative_changed"] : undefined;
  if (actionError) return t(actionError);
  const code = typeof payload.messageCode === "string" && Object.hasOwn(publicErrorMessages, payload.messageCode)
    ? payload.messageCode as keyof typeof publicErrorMessages : "request_failed";
  return t(fallback && (getClientLanguage() === "ko" || dictionary && Object.hasOwn(dictionary, fallback)) ? fallback : publicErrorMessages[code]);
}

export async function loadLanguage(language: Language) {
  if (language === "ko" || catalogs.has(language)) return;
  if (!requests.has(language)) requests.set(language, loaders[language]().then(({ default: catalog }) => { catalogs.set(language, catalog); })
    .finally(() => { requests.delete(language); }));
  await requests.get(language);
}

function apply(language: Language, userId: string | null, preferences: LanguagePreferences | null) {
  if (typeof window === "undefined") return;
  snapshot = { language, userId, preferences };
  document.documentElement.lang = language === "zh" ? "zh-Hans" : language;
  emit();
}

export async function applyAccountLanguage(userId: string, preferences: LanguagePreferences | undefined, options: { commit?: boolean } = {}) {
  const value = preferences ?? { language: "ko", resolvedLanguage: "ko", revision: 0 };
  // Ignore a stale bootstrap racing a successful preference save in the same account.
  if (snapshot.userId === userId && snapshot.preferences && snapshot.preferences.revision > value.revision) return;
  // Revalidation may refresh the saved value, but must not discard a settings preview.
  if (!options.commit && previewing && snapshot.userId === userId) {
    apply(snapshot.language, userId, value);
    return;
  }
  // An IP-only country change must not change an already open automatic-language UI.
  if (!options.commit && snapshot.userId === userId && value.language === "auto" && snapshot.preferences?.revision === value.revision
    && !navigator.languages.some((tag) => isLanguage(tag.toLowerCase().split(/[-_]/)[0]))) return;
  const request = ++generation;
  await loadLanguage(value.resolvedLanguage);
  if (request === generation) { previewing = false; apply(value.resolvedLanguage, userId, value); }
}

export async function previewLanguage(language: Language) {
  const request = ++generation;
  await loadLanguage(language);
  if (request === generation) { previewing = Boolean(snapshot.userId); apply(language, snapshot.userId, snapshot.preferences); }
}

export function browserPreferredLanguage() {
  return resolveLanguage(navigator.languages.length ? navigator.languages : [navigator.language]);
}

export async function applyGuestLanguage() {
  const request = ++generation;
  previewing = false;
  let value: string | null = null;
  try { value = localStorage.getItem(ANONYMOUS_LANGUAGE_KEY); } catch { /* Optional browser preference. */ }
  let language = isLanguage(value) ? value : browserPreferredLanguage();
  if (!isLanguage(value) && !navigator.languages.some((tag) => isLanguage(tag.toLowerCase().split(/[-_]/)[0]))) {
    try {
      const response = await fetch("/api/language", { cache: "no-store", signal: AbortSignal.timeout(1000) });
      const data = await response.json() as { language?: unknown };
      if (response.ok && isLanguage(data.language)) language = data.language;
    } catch { /* Optional country hint must never block sign-in. */ }
  }
  if (isLanguage(value)) document.cookie = `${LANGUAGE_COOKIE}=${value}; Path=/; SameSite=Lax; Max-Age=31536000${location.protocol === "https:" ? "; Secure" : ""}`;
  await loadLanguage(language);
  if (request === generation) apply(language, null, null);
}

export async function chooseGuestLanguage(language: Language) {
  try { localStorage.setItem(ANONYMOUS_LANGUAGE_KEY, language); } catch { /* Keep this visit usable. */ }
  document.cookie = `${LANGUAGE_COOKIE}=${language}; Path=/; SameSite=Lax; Max-Age=31536000${location.protocol === "https:" ? "; Secure" : ""}`;
  await previewLanguage(language);
}

export async function saveAccountLanguage(userId: string, preferences: LanguagePreferences) {
  if (snapshot.userId !== userId) return;
  await applyAccountLanguage(userId, preferences, { commit: true });
  // No personal values in storage or shared caches; other tabs re-read their own session.
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("okri-language");
    channel.postMessage({ userId }); channel.close();
  }
}

export function clearAccountLanguage() {
  ++generation;
  previewing = false;
  snapshot = initial;
  if (typeof window !== "undefined") { document.documentElement.lang = "ko"; emit(); }
}
