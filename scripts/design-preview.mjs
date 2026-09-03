import http from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

// Local visual review only. API requests never reach the application or a service.
if (process.env.NODE_ENV === "production") throw new Error("Design preview is development-only.");
const upstream = new URL("http://localhost:3187");
const port = Number(process.argv[2] ?? 3188);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid local preview port.");
const require = createRequire(import.meta.url);
const cache = new Map();
function fixture(file) {
  if (cache.has(file)) return cache.get(file);
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "exports", "module", compiled)((id) => id.startsWith(".")
    ? fixture(resolve(dirname(file), `${id}.ts`)) : require(id), loaded.exports, loaded);
  cache.set(file, loaded.exports);
  return loaded.exports;
}
const handlers = [];
await fixture(resolve("tests/e2e/landing-product-fixture.ts")).installLandingProductFixture({
  addInitScript: async () => {},
  route: async (pattern, handler) => {
    if (pattern !== "**/api/**") throw new Error(`Unsupported fixture route: ${pattern}`);
    handlers.unshift(handler);
  },
});

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://localhost:${port}`);
    response.setHeader("Cache-Control", "no-store");
    if (request.method !== "GET") {
      response.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      return response.end(JSON.stringify({ error: "가상 데이터 미리보기에서는 저장하지 않습니다." }));
    }
    if (url.pathname.startsWith("/api/")) {
      let index = 0;
      const route = {
        request: () => ({ url: () => url.href, method: () => "GET", postDataJSON: () => null }),
        fulfill: async ({ status = 200, contentType = "application/json", body, json }) => {
          response.writeHead(status, { "Content-Type": `${contentType}; charset=utf-8` });
          response.end(body ?? JSON.stringify(json ?? {}));
        },
        fallback: async () => index < handlers.length ? handlers[index++](route)
          : route.fulfill({ status: 404, json: { error: "No local fixture" } }),
      };
      return await route.fallback();
    }
    const target = new URL(upstream);
    target.pathname = url.pathname;
    target.search = url.search;
    const result = await fetch(target, { redirect: "manual" });
    response.statusCode = result.status;
    response.setHeader("Content-Type", result.headers.get("content-type") ?? "application/octet-stream");
    if (result.headers.has("location")) response.setHeader("Location", result.headers.get("location"));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Start the local application on port 3187 first.");
    console.error(error.message);
  }
});

server.on("upgrade", (request, socket, head) => {
  if (new URL(request.url, upstream).pathname.startsWith("/api/")) return socket.destroy();
  const proxy = http.request(upstream, { path: request.url, headers: { ...request.headers, host: upstream.host } });
  proxy.on("upgrade", (result, remote, remoteHead) => {
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(result.headers).map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\n\r\n`);
    if (head.length) remote.write(head);
    if (remoteHead.length) socket.write(remoteHead);
    remote.pipe(socket).pipe(remote);
    remote.on("error", () => socket.destroy());
    socket.on("error", () => remote.destroy());
  });
  proxy.on("error", () => socket.destroy());
  proxy.end();
});
server.listen(port, "localhost", () => console.log(`Fictional, read-only design preview: http://localhost:${port}/?view=my_work`));
