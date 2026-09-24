import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";

// About has its own static entry. The other routes are rendered from their
// React pages, so the searchable HTML and the live policy copy cannot drift.
export const renderedPages = {
  "/": "landing",
  "/community": "community",
  "/terms": "terms",
  "/privacy": "privacy",
  "/cookies": "cookies",
  "/contact": "contact",
};

const escapeHtml = (text) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

export async function renderPublicPage(vite, route, shell) {
  const moduleName = renderedPages[route];
  if (!moduleName) throw new Error(`Unknown public page: ${route}`);
  const [{ default: Page }, { publicPages, publicPageSchema }] = await Promise.all([
    vite.ssrLoadModule(`/src/pages/${moduleName}.tsx`),
    vite.ssrLoadModule("/src/lib/public-page-meta.ts"),
  ]);
  const key = route === "/" ? "home" : route.slice(1);
  const { title, description, url } = publicPages[key];
  const body = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(Router, { hook: () => [route, () => {}] }, createElement(Page)),
    ),
  );
  let html = shell
    .replace("<html lang=\"en\">", "<html lang=\"en\" data-public-entry>")
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeHtml(description)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${escapeHtml(url)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeHtml(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapeHtml(description)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${escapeHtml(url)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapeHtml(title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escapeHtml(description)}$2`)
    .replace("<div id=\"root\"></div>", `<div id="root">${body}</div>`);
  if (!html.includes(`<div id="root">${body}</div>`)) {
    throw new Error(`Missing root element in public HTML entry: ${route}`);
  }
  const json = JSON.stringify(publicPageSchema(key)).replaceAll("<", "\\u003c");
  html = html.replace("</head>", `  <script type="application/ld+json" data-public-page-schema>${json}</script>\n  </head>`);
  return html;
}