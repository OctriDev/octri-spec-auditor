import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const types = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".yaml": "text/plain; charset=utf-8",
  ".json": "application/json",
};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/") {
      response.writeHead(302, { Location: "/web/index.html" }).end();
      return;
    }
    const pathname = decodeURIComponent(
      url.pathname === "/" ? "/web/index.html" : url.pathname,
    );
    const file = resolve(root, `.${pathname}`);
    const relative = file.slice(root.length + 1);
    if (
      !file.startsWith(root + sep) ||
      !["web/", "packages/browser/", "fixtures/pets.yaml"].some((prefix) =>
        relative.startsWith(prefix),
      ) ||
      !types[extname(file)]
    ) {
      response.writeHead(404).end("Not found");
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": types[extname(file)],
      "Content-Length": info.size,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; worker-src 'self'; connect-src 'self' https: http:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
server.listen(Number(process.env.PORT ?? 4178), "127.0.0.1", () =>
  console.log(`Spec Auditor: http://127.0.0.1:${server.address().port}`),
);
