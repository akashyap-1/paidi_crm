import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Relative base + hash routing: the build works under any GitHub Pages repo
// path and page refreshes never 404.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});
