/**
 * Simple static file server for Playwright tests.
 *
 * Serves .webpack/renderer/ on port 3100 so that the compiled Electron main
 * process (which has http://localhost:3100 hardcoded by Electron Forge's
 * webpack plugin) can load its renderer files.
 *
 * Usage: node tests/serve-renderer.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3100;
const ROOT = path.resolve(__dirname, "..", ".webpack", "renderer");

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

const server = http.createServer((req, res) => {
  let filePath = path.join(ROOT, req.url === "/" ? "/main_window/index.html" : req.url);

  // Security: prevent path traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // If path is a directory, try index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Renderer static server running on http://localhost:${PORT}`);
  console.log(`Serving files from: ${ROOT}`);
});
