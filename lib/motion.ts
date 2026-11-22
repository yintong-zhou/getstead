/** One easing curve and a few durations (seconds) shared by every Motion animation in the app. */
export const ease = [0.22, 1, 0.36, 1] as const;

export const duration = {
  /** Hover, press, toggles. */
  fast: 0.15,
  /** Menus, popovers, tooltips. */
  base: 0.2,
  /** Entrances and layout changes. */
  enter: 0.4,
} as const;

/** Rise distance on enter, in px. */
export const rise = 8;

/** Delay between siblings entering, in seconds. */
export const stagger = 0.05;
