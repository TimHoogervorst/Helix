/** Stable names for the CSS custom properties supplied by @helix/mod-api/theme.css. */
export const themeTokens = {
  background: "--color-background",
  surface: "--color-surface",
  card: "--color-card",
  ink: "--color-ink",
  primary: "--color-primary",
  accent: "--color-accent",
  destructive: "--color-destructive",
  success: "--color-success",
  warning: "--color-warning",
} as const;

export type ThemeToken = keyof typeof themeTokens;
