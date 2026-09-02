/** Theme identity, preview colors, first paint and editor scheme share one registry. */
export const THEME_STORAGE_KEY = "okrptr.theme";
export const DEFAULT_THEME = "white";

const themeSeeds = {
  white: {
    label: "화이트", description: "깨끗한 문서", scheme: "light",
    page: "#FFFFFF", surface: "#F8F9FA", raised: "#FFFFFF", subtle: "#F1F3F5", hover: "#E8EBEE", sidebar: "#F6F7F8",
    text: "#202124", muted: "#555C65", faint: "#606872", line: "#DEE2E6", control: "#7C848D",
    primary: "#202124", onPrimary: "#FFFFFF", primaryHover: "#35383D", primaryActive: "#101114",
    accent: "#202124", accentSoft: "#E8EBEE", link: "#202124", focus: "#202124", secondaryAccent: "#555C65",
  },
  beige: {
    label: "베이지", description: "따뜻한 종이", scheme: "light",
    page: "#F3F2EE", surface: "#FAF9F6", raised: "#FFFEFA", subtle: "#F0EDE7", hover: "#EAE6DF", sidebar: "#E9E6DF",
    text: "#29251F", muted: "#625C53", faint: "#6C645A", line: "#E3DFD7", control: "#8A8072",
    primary: "#594735", onPrimary: "#FFFEFA", primaryHover: "#493929", primaryActive: "#382B20",
    accent: "#695038", accentSoft: "#E9DFD1", link: "#674B31", focus: "#766149", secondaryAccent: "#6B6140",
  },
  gray: {
    label: "그레이", description: "차분한 회색", scheme: "light",
    page: "#EEF1F3", surface: "#F7F8F9", raised: "#FFFFFF", subtle: "#E9EDF0", hover: "#E2E7EA", sidebar: "#E5E9EC",
    text: "#252A30", muted: "#535D66", faint: "#5D6771", line: "#DCE1E5", control: "#7B858F",
    primary: "#2D5057", onPrimary: "#FFFFFF", primaryHover: "#234149", primaryActive: "#18333A",
    accent: "#305D66", accentSoft: "#D8E5E7", link: "#285760", focus: "#3F6D76", secondaryAccent: "#626187",
  },
  dark: {
    label: "다크", description: "중립 차콜", scheme: "dark",
    page: "#1F1F1F", surface: "#242424", raised: "#282828", subtle: "#303030", hover: "#383838", sidebar: "#181818",
    text: "#CCCCCC", muted: "#B5B5B5", faint: "#ABABAB", line: "#444444", control: "#858585",
    primary: "#0078D4", onPrimary: "#FFFFFF", primaryHover: "#026EC1", primaryActive: "#005DA6",
    accent: "#90C8FF", accentSoft: "#213B53", link: "#90C8FF", focus: "#90C8FF", secondaryAccent: "#C3B1EA",
  },
  neon: {
    label: "네온", description: "청록과 연보라", scheme: "dark",
    page: "#111827", surface: "#162033", raised: "#1B273B", subtle: "#202E43", hover: "#293950", sidebar: "#0D1422",
    text: "#E6EDF7", muted: "#BAC6DB", faint: "#B0BED5", line: "#35465F", control: "#7E93AE",
    primary: "#67E8F9", onPrimary: "#09232C", primaryHover: "#A5F3FC", primaryActive: "#22D3EE",
    accent: "#67E8F9", accentSoft: "#193B48", link: "#8CECF8", focus: "#67E8F9", secondaryAccent: "#C4B5FD",
  },
  cyberpunk: {
    label: "사이버펑크", description: "핑크와 일렉트릭", scheme: "dark",
    page: "#0D0B14", surface: "#15101F", raised: "#1D162B", subtle: "#271D36", hover: "#342444", sidebar: "#100B1A",
    text: "#F4ECFF", muted: "#C6B4D6", faint: "#C0ADCF", line: "#493555", control: "#9D7FAB",
    primary: "#FF4FD8", onPrimary: "#180B1A", primaryHover: "#FF85E5", primaryActive: "#EB45C8",
    accent: "#FF87E5", accentSoft: "#421E43", link: "#58F0F3", focus: "#39F5E4", secondaryAccent: "#39F5E4",
  },
} as const;

export type ThemeMode = keyof typeof themeSeeds;
export type ColorScheme = "light" | "dark";
type Seed = (typeof themeSeeds)[ThemeMode];

function colors(seed: Seed, mode: ThemeMode) {
  const dark = seed.scheme === "dark";
  return {
    "text-primary": seed.text, "text-secondary": seed.muted, "text-tertiary": seed.faint,
    "text-link": seed.link, "icon-default": seed.muted,
    "bg-page": seed.page, "bg-surface": seed.surface, "bg-raised": seed.raised,
    "bg-subtle": seed.subtle, "bg-hover": seed.hover, "bg-sidebar": seed.sidebar,
    "border-default": seed.line, "border-control": seed.control,
    "button-primary-bg": seed.primary, "button-primary-fg": seed.onPrimary,
    "button-primary-hover-bg": seed.primaryHover, "button-primary-hover-fg": seed.onPrimary,
    "button-primary-active-bg": seed.primaryActive, "button-primary-active-fg": seed.onPrimary,
    "button-secondary-bg": seed.raised, "button-secondary-fg": seed.text,
    "button-secondary-hover-bg": seed.hover, "button-secondary-hover-fg": seed.text,
    "button-secondary-active-bg": seed.subtle, "button-secondary-active-fg": seed.text,
    "button-ghost-bg": "transparent", "button-ghost-fg": seed.muted,
    "button-ghost-hover-bg": seed.hover, "button-ghost-hover-fg": seed.text,
    "button-ghost-active-bg": seed.subtle, "button-ghost-active-fg": seed.text,
    "button-disabled-bg": seed.subtle, "button-disabled-fg": seed.faint,
    "button-danger-bg": dark ? "#B42318" : "#A32F29", "button-danger-fg": "#FFFFFF",
    "button-danger-hover-bg": "#8D231C", "button-danger-active-bg": "#741B17",
    "input-bg": seed.raised, "input-fg": seed.text, "input-placeholder": seed.faint,
    "menu-bg": seed.raised, "menu-fg": seed.text, "modal-bg": seed.raised,
    "toast-bg": seed.text, "toast-fg": seed.page,
    "selected-bg": seed.accentSoft, "selected-fg": seed.accent,
    "accent-fg": seed.accent, "accent-secondary": seed.secondaryAccent, "focus-ring": seed.focus,
    "success-fg": dark ? "#A6DEB6" : "#28603C", "success-bg": dark ? "#203A2B" : "#E8F2EA",
    "warning-fg": dark ? "#F6D18B" : "#795011", "warning-bg": dark ? "#3C301D" : "#FFF3D9",
    "danger-fg": dark ? "#FFB1A9" : "#A32F29", "danger-bg": dark ? "#422724" : "#FAEBE9",
    "info-fg": dark ? "#A5D2FF" : "#26578A", "info-bg": dark ? "#22384D" : "#E7EFF8",
    "purple-fg": dark ? "#D3BFFF" : "#65418A", "purple-bg": dark ? "#382B4D" : "#F0E9F7",
    "orange-fg": dark ? "#F7C095" : "#8B4B20", "orange-bg": dark ? "#422D21" : "#F9EBDD",
    "neutral-badge-fg": seed.muted, "neutral-badge-bg": seed.subtle,
    "kr-badge-bg": dark ? "#43302B" : "#F6EDEA", "kr-badge-text": dark ? "#D4B3A5" : "#7D5E54",
    "kr-rail": "#A18072", "initiative-badge-bg": dark ? "#30322E" : "#EFF1EF",
    "initiative-badge-text": dark ? "#AFB5AD" : "#60655F", "initiative-rail": dark ? "#8C9689" : "#898E87",
    "overlay-backdrop": dark ? "rgba(0, 0, 0, .66)" : "rgba(25, 28, 33, .34)",
    "shadow-raised": dark ? "0 1px 3px rgba(0, 0, 0, .22)" : "0 1px 3px rgba(25, 28, 33, .06)",
    "shadow-overlay": dark ? "0 20px 56px rgba(0, 0, 0, .42)" : "0 18px 48px rgba(25, 28, 33, .18)",
    "selection-glow": mode === "cyberpunk" ? "0 0 10px rgba(255, 79, 216, .18)" : "none",
    "skeleton-bg": seed.subtle,
  };
}

// Backwards-compatible semantic aliases. Text tokens are never action fills.
const aliases = {
  ink: "text-primary", muted: "text-secondary", faint: "text-tertiary",
  paper: "bg-page", surface: "bg-surface", raised: "bg-raised", sidebar: "bg-sidebar",
  "surface-muted": "bg-subtle", "surface-hover": "bg-hover", hover: "bg-hover",
  line: "border-default", "line-strong": "border-control",
  accent: "accent-fg", "accent-strong": "accent-fg", "accent-soft": "selected-bg",
  blue: "info-fg", red: "danger-fg", green: "success-fg", focus: "focus-ring",
  "okr-card-bg": "bg-raised", "okr-card-border": "border-default",
  "kr-hover": "bg-hover", "initiative-hover": "bg-hover",
} as const;

export const THEMES = (Object.keys(themeSeeds) as ThemeMode[]).map((mode) => ({
  mode,
  label: themeSeeds[mode].label,
  description: themeSeeds[mode].description,
  colorScheme: themeSeeds[mode].scheme as ColorScheme,
  tokens: colors(themeSeeds[mode], mode),
}));

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && Object.hasOwn(themeSeeds, value);
}

export function themeColorScheme(value: unknown): ColorScheme {
  return themeSeeds[isThemeMode(value) ? value : DEFAULT_THEME].scheme;
}

export const themeCss = THEMES.map(({ mode, colorScheme, tokens }) => {
  const selectors = `${mode === DEFAULT_THEME ? ":root, " : ""}html[data-theme="${mode}"], [data-theme-preview="${mode}"]`;
  const entries = Object.entries(tokens).map(([key, value]) => `--${key}:${value};`).join("");
  const legacy = Object.entries(aliases).map(([key, value]) => `--${key}:var(--${value});`).join("");
  return `${selectors}{color-scheme:${colorScheme};${entries}${legacy}}`;
}).join("\n");

// This runs before the body paints. It never changes an existing saved preference.
export const themeBootstrapScript = `(() => {
  const schemes = ${JSON.stringify(Object.fromEntries(THEMES.map(({ mode, colorScheme }) => [mode, colorScheme])))};
  let theme = ${JSON.stringify(DEFAULT_THEME)};
  try {
    const saved = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (Object.prototype.hasOwnProperty.call(schemes, saved)) theme = saved;
  } catch {}
  const root = document.documentElement;
  root.dataset.themePreference = theme;
  root.dataset.theme = theme;
  root.style.colorScheme = schemes[theme];
})();`;
