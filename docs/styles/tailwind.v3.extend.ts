// Sólo si el proyecto usa Tailwind v3. Pegar dentro de theme.extend en tailwind.config.ts
export const maverlangExtend = {
  fontFamily: {
    sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
    display: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
    mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
  },
  colors: {
    bg: "#ffffff", fg: { DEFAULT: "#0a0a0a", body: "#252525", muted: "#6c6f75", subtle: "#a3a7ad" },
    surface: { 1: "#f8f7f5", 2: "#f2f2f2", 3: "#e1e1e1" },
    border: { DEFAULT: "#ebebeb", strong: "#d5dae3" },
    up: { DEFAULT: "#1c7c5b", bg: "#e8f5ef" }, down: { DEFAULT: "#cc2c55", bg: "#fbecef" },
    warn: { DEFAULT: "#99651a", bg: "#fdf5e6" }, info: { DEFAULT: "#2b7fd9", bg: "#eaf3fd" },
    brand: "#ff6a08",
  },
  borderRadius: { xs: "0.25rem", md: "0.75rem", xl: "1rem", "3xl": "1.5rem" },
  boxShadow: { float: "0 8px 30px rgb(0 0 0 / 0.08)" },
  transitionTimingFunction: { spring: "cubic-bezier(0.25, 1, 0.5, 1)" },
  keyframes: {
    marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
    reveal: { from: { opacity: "0", transform: "translateY(16px)" }, to: { opacity: "1", transform: "translateY(0)" } },
  },
  animation: { marquee: "marquee 40s linear infinite", reveal: "reveal 600ms cubic-bezier(0.25,1,0.5,1) both" },
};
