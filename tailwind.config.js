const plugin = require("tailwindcss/plugin")

const ok = (v) => `oklch(var(${v}) / <alpha-value>)`
const rgb = (v) => `rgb(var(${v}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        /* Tokens are defined in src/index.css as bare channel values so that the
           `/ <alpha-value>` placeholder below makes opacity modifiers work
           (bg-primary/90, bg-sk-primary-fixed/30, …). */
        border: ok("--border"),
        input: ok("--input"),
        ring: ok("--ring"),
        background: ok("--background"),
        foreground: ok("--foreground"),
        primary: {
          DEFAULT: ok("--primary"),
          foreground: ok("--primary-foreground"),
        },
        secondary: {
          DEFAULT: ok("--secondary"),
          foreground: ok("--secondary-foreground"),
        },
        destructive: {
          DEFAULT: ok("--destructive"),
          foreground: ok("--destructive-foreground"),
        },
        muted: {
          DEFAULT: ok("--muted"),
          foreground: ok("--muted-foreground"),
        },
        accent: {
          DEFAULT: ok("--accent"),
          foreground: ok("--accent-foreground"),
        },
        popover: {
          DEFAULT: ok("--popover"),
          foreground: ok("--popover-foreground"),
        },
        card: {
          DEFAULT: ok("--card"),
          foreground: ok("--card-foreground"),
        },
        /* Speisekammer design tokens — theme-aware via the same CSS vars */
        sk: {
          primary: rgb("--sk-primary"),
          "primary-container": rgb("--sk-primary-container"),
          "primary-fixed": rgb("--sk-primary-fixed"),
          "on-primary-fixed": rgb("--sk-on-primary-fixed"),
          secondary: rgb("--sk-secondary"),
          "secondary-container": rgb("--sk-secondary-container"),
          tertiary: rgb("--sk-tertiary"),
          surface: rgb("--sk-surface"),
          "surface-low": rgb("--sk-surface-low"),
          "surface-container": rgb("--sk-surface-container"),
          "surface-high": rgb("--sk-surface-high"),
          "surface-highest": rgb("--sk-surface-highest"),
          "on-surface": rgb("--sk-on-surface"),
          "on-surface-variant": rgb("--sk-on-surface-variant"),
          outline: rgb("--sk-outline"),
          "outline-variant": rgb("--sk-outline-variant"),
        },
      },
      fontFamily: {
        serif: ["Newsreader Variable", "Newsreader", "Georgia", "serif"],
        sans: ["Manrope Variable", "Manrope", "system-ui", "sans-serif"],
      },
      /* The shadcn/base-ui components were authored against Tailwind v4, which
         has these built in. On v3 they silently compiled to nothing: focus rings
         had no width, and dialog overlays had no blur. */
      ringWidth: {
        3: "3px",
      },
      backdropBlur: {
        xs: "4px",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "0.75rem",
        "2xl": "1rem",
        full: "9999px",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    /* base-ui marks open/closed state with bare data-open / data-closed
       attributes. Tailwind v4 supports `data-open:` directly; v3 does not, so
       all 26 usages produced no CSS and every dialog, alert and select opened
       and closed with no animation at all. */
    plugin(({ addVariant }) => {
      addVariant("data-open", "&[data-open]")
      addVariant("data-closed", "&[data-closed]")
      addVariant("supports-backdrop-filter", "@supports (backdrop-filter: blur(0)) { & }")
    }),
  ],
}
