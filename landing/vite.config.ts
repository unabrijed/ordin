import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The root HTML is the single source for the current Ordin design.
// Keep the existing Yarn preview commands pointed at that same page.
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export default defineConfig({
  root: projectRoot,
  publicDir: false,
  build: {
    outDir: fileURLToPath(new URL("./dist/", import.meta.url)),
    emptyOutDir: true,
  },
  plugins: [{
    name: "ordin-protocol-document",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "README.md",
        source: readFileSync(new URL("../README.md", import.meta.url), "utf8"),
      });
    },
  }],
});
