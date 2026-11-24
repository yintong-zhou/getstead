export const glassStorageKey = "getstead.glassTransparency";
const glassProperty = "--glass-transparency";
const validLevel = /^(100|[1-9]?[0-9])$/;

export const glassBootstrap = `try {
  const value = localStorage.getItem(${JSON.stringify(glassStorageKey)});
  if (${validLevel}.test(value ?? "")) {
    document.documentElement.style.setProperty(${JSON.stringify(glassProperty)}, value + "%");
  }
} catch {}`;

export function readGlassLevel() {
  try {
    const value = localStorage.getItem(glassStorageKey);
    if (value !== null && validLevel.test(value)) return Number(value);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
  return 100;
}

export function previewGlass(level: number) {
  document.documentElement.style.setProperty(glassProperty, `${level}%`);
}

export const themeStorageKey = "getstead.theme";
export const themes = ["system", "light", "dark"] as const;
export type Theme = (typeof themes)[number];
const themeEvent = "getstead:theme";

/** Runs before first paint so a saved choice never flashes the other theme; "system" leaves the attribute off. */
export const themeBootstrap = `try {
  const value = localStorage.getItem(${JSON.stringify(themeStorageKey)});
  if (value === "light" || value === "dark") document.documentElement.dataset.theme = value;
} catch {}`;

export function readTheme(): Theme {
  try {
    const value = localStorage.getItem(themeStorageKey);
    if (value === "light" || value === "dark") return value;
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
  return "system";
}

export function restoreTheme() {
  const theme = readTheme();
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/** Applies the theme now and remembers it in this browser (the page still switches if storage is blocked). */
export function saveTheme(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(themeStorageKey);
    else localStorage.setItem(themeStorageKey, theme);
  } catch {
    // The choice then lasts only for this visit.
  }
  window.dispatchEvent(new Event(themeEvent));
}

export function subscribeTheme(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(themeEvent, onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener(themeEvent, onChange); };
}
