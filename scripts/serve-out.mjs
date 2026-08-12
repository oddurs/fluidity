// Serve ./out, the static export, for the end-to-end suite.
//
// The suite used to run against `next dev`. That server does not survive a
// full three-engine run: it would die partway through and every remaining
// test failed with NS_ERROR_CONNECTION_REFUSED, which is indistinguishable
// from a real regression until you go and read the trace. Hours went into
// chasing failures that were only ever this.
//
// The static export is also what actually ships, so the suite now tests the
// artifact rather than a development convenience. No dependency: a static
// file server is thirty lines of node:http.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(process.argv[2] ?? "out");
const PORT = Number(process.env.PORT ?? 3000);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/** Resolve a URL to a file, preferring index.html for directory paths. */
async function locate(pathname) {
  // Normalise before joining: "/../.." must not escape the export.
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(ROOT, rel);
  if (!candidate.startsWith(ROOT)) return null;
  try {
    const s = await stat(candidate);
    if (s.isDirectory()) return join(candidate, "index.html");
    return candidate;
  } catch {
    // trailingSlash: true means /foo resolves to /foo/index.html.
    try {
      const withIndex = join(candidate, "index.html");
      await stat(withIndex);
      return withIndex;
    } catch {
      return null;
    }
  }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${PORT}`);
  const file = await locate(pathname);
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      // The suite reloads the same pages repeatedly and must always see the
      // build it just made, not one the browser kept.
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("read failed");
  }
}).listen(PORT, () => {
  console.log(`serving ${ROOT} on http://localhost:${PORT}`);
});
