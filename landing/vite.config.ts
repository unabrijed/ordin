import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyMetadata, siteMetadata } from "./seo.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

export default defineConfig(({ command }) => {
  const metadata = siteMetadata(command === "build" ? process.env : {});
  return {
    root: projectRoot,
    publicDir: false,
    build: {
      outDir: fileURLToPath(new URL("./dist/", import.meta.url)),
      emptyOutDir: true,
    },
    plugins: [
      {
        name: "ordin-public-content",
        transformIndexHtml(html) {
          return applyMetadata(html, metadata);
        },
        generateBundle() {
          for (const fileName of [
            "README.md",
            "index.md",
            "llms.txt",
            "docs/TESTNET.md",
            "landing/README.md",
          ]) {
            this.emitFile({ type: "asset", fileName, source: read(fileName) });
          }
          this.emitFile({
            type: "asset",
            fileName: "llms-full.txt",
            source: `${read("index.md")}\n---\n\n${read("README.md")}`,
          });
          this.emitFile({
            type: "asset",
            fileName: "robots.txt",
            source:
              read("robots.txt") +
              (metadata.indexable
                ? `\nSitemap: ${metadata.origin}/sitemap.xml\n`
                : ""),
          });
          if (metadata.sitemap)
            this.emitFile({
              type: "asset",
              fileName: "sitemap.xml",
              source: metadata.sitemap,
            });
        },
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url?.split("?")[0] !== "/llms-full.txt") return next();
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end(`${read("index.md")}\n---\n\n${read("README.md")}`);
          });
        },
      },
    ],
  };
});
