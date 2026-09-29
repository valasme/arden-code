/** Logo colors (plan section 8.2). */

export interface LogoColors {
  mark: string;
  wordmark: string;
}

export const variants = {
  "color-on-light": { mark: "#EA9061", wordmark: "#58382B" },
  "color-on-dark": { mark: "#EA9061", wordmark: "#F2E8E1" },
  black: { mark: "#000000", wordmark: "#000000" },
  white: { mark: "#FFFFFF", wordmark: "#FFFFFF" },
} as const satisfies Record<string, LogoColors>;
