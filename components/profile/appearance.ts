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
