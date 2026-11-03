import { fileURLToPath } from "node:url";

// Absolute config path so the dev server works from any working directory.
export default {
  plugins: {
    tailwindcss: { config: fileURLToPath(new URL("./tailwind.config.js", import.meta.url)) },
    autoprefixer: {},
  },
};
