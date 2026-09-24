import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import { renderedPages, renderPublicPage } from "./public-pages.mjs";

const output = new URL("../dist/public/", import.meta.url);
const shell = await readFile(new URL("index.html", output), "utf8");
// The build-time renderer must not add development-only component attributes.
process.env.NODE_ENV = "production";
const vite = await createServer({ configFile: new URL("../vite.config.ts", import.meta.url).pathname, server: { middlewareMode: true }, appType: "custom" });
try {
  for (const route of Object.keys(renderedPages)) {
    const html = await renderPublicPage(vite, route, shell);
    const filename = route === "/" ? "index.html" : `${route.slice(1)}.html`;
    await writeFile(new URL(filename, output), html, "utf8");
  }
} finally {
  await vite.close();
}