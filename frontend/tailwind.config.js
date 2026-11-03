import { fileURLToPath } from "node:url";

const here = (path) => fileURLToPath(new URL(path, import.meta.url)).replace(/\\/g, "/");

/** @type {import('tailwindcss').Config} */
export default {
  content: [here("./index.html"), here("./src") + "/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#06070b",
        night: {
          950: "#08090f",
          900: "#0c0e16",
          800: "#121520",
          700: "#1a1e2c",
          600: "#252a3b",
        },
        gold: {
          DEFAULT: "#c9a14a",
          soft: "#e3c77d",
          dim: "#8a6d33",
        },
        parchment: "#ebe3d0",
        mist: "#9aa3b5",
        verdant: "#7dbb77",
        umbral: "#9a7ff0",
        ember: "#d0644f",
        frost: "#a9c6ff",
      },
      fontFamily: {
        display: ["Cinzel", "Georgia", "serif"],
        serif: ["'Cormorant Garamond'", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(201,161,74,0.25)",
        panel: "0 10px 40px rgba(0,0,0,0.55)",
      },
      keyframes: {
        drift: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        float: {
          "0%": { transform: "translateY(0) scale(1)", opacity: "0" },
          "15%": { opacity: "1" },
          "100%": { transform: "translateY(-120px) scale(0.6)", opacity: "0" },
        },
        pulseGlow: { "0%,100%": { opacity: "0.55" }, "50%": { opacity: "1" } },
        breathe: { "0%,100%": { transform: "scale(1)" }, "50%": { transform: "scale(1.035)" } },
      },
      animation: {
        drift: "drift 60s linear infinite",
        "drift-slow": "drift 110s linear infinite",
        float: "float 9s ease-in infinite",
        "pulse-glow": "pulseGlow 4s ease-in-out infinite",
        breathe: "breathe 18s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
