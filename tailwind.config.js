/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Quiet Warm Editorial — Dynamic Light / Dark CSS Variable Mappings
        background: "rgb(var(--color-background) / <alpha-value>)",
        foreground: "rgb(var(--color-foreground) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        "muted-foreground": "rgb(var(--color-muted-foreground) / <alpha-value>)",
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        "on-primary": "rgb(var(--color-on-primary) / <alpha-value>)",
        secondary: "rgb(var(--color-secondary) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        destructive: "rgb(var(--color-destructive) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        ring: "rgb(var(--color-ring) / <alpha-value>)",
        card: "rgb(var(--color-card) / <alpha-value>)",
      },

      fontFamily: {
        sans: [
          "Inter",
          "Segoe UI Variable",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        heading: [
          "Inter",
          "Segoe UI Variable",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        serif: [
          "Newsreader",
          "Georgia",
          "Times New Roman",
          "serif",
        ],
      },

      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.1rem",
        "3xl": "1.35rem",
      },

      boxShadow: {
        // Warm, paper-like shadows — không dùng neon/tím
        soft: "0 1px 3px rgba(26,26,26,0.05), 0 4px 12px rgba(26,26,26,0.06)",
        card: "0 1px 2px rgba(26,26,26,0.05), 0 2px 8px rgba(26,26,26,0.06)",
        "card-hover": "0 2px 6px rgba(26,26,26,0.08), 0 8px 24px rgba(26,26,26,0.08)",
        glow: "0 0 0 1px rgba(204,120,92,0.18), 0 4px 16px rgba(204,120,92,0.10)",
        button: "0 2px 8px rgba(204,120,92,0.22), 0 1px 2px rgba(204,120,92,0.15)",
        modal: "0 8px 40px rgba(26,26,26,0.10), 0 2px 8px rgba(26,26,26,0.06)",
      },

      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },

      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-down": {
          from: { opacity: "0", transform: "translateY(-10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "modal-in": {
          from: { opacity: "0", transform: "translateY(14px) scale(0.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "overlay-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(14px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-left": {
          from: { opacity: "0", transform: "translateX(-14px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" },
        },
      },

      animation: {
        "fade-in": "fade-in 0.22s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-up": "fade-up 0.32s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-down": "fade-down 0.32s cubic-bezier(0.22, 1, 0.36, 1) both",
        "scale-in": "scale-in 0.22s cubic-bezier(0.22, 1, 0.36, 1) both",
        "modal-in": "modal-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) both",
        "overlay-in": "overlay-in 0.22s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-in-right": "slide-in-right 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-in-left": "slide-in-left 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer: "shimmer 1.8s linear infinite",
      },
    },
  },
  plugins: [],
};