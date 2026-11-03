import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transformWithEsbuild } from "vite";

const source = await readFile(new URL("../src/api/connection.ts", import.meta.url), "utf8");
async function transport(origin) {
  const result = await transformWithEsbuild(source, "connection.ts", {
    format: "esm",
    define: { "import.meta.env.VITE_BACKEND_ORIGIN": JSON.stringify(origin) },
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.code).toString("base64")}`);
}
const local = await transport("");
const remote = await transport("https://eldoria-api.pre-scribe.org/");
assert.equal(local.backendUrl("/api/adventures"), "/api/adventures");
assert.equal(local.mediaUrl("/media/scene.png"), "/media/scene.png");
assert.equal(remote.backendUrl("/api/tts"), "https://eldoria-api.pre-scribe.org/api/tts");
assert.equal(remote.mediaUrl("/media/voice.mp3"), "https://eldoria-api.pre-scribe.org/media/voice.mp3");
assert.equal(remote.mediaUrl("/media/refs/guide.jpg"), "https://eldoria-api.pre-scribe.org/media/refs/guide.jpg");
for (const invalid of ["http://example.com", "https://user:secret@example.com", "https://example.com/path", "https://example.com/?secret=x", "javascript:alert(1)"]) {
  assert.throws(() => local.normalizeBackendOrigin(invalid));
}
assert.equal(local.normalizeBackendOrigin("http://127.0.0.1:8001/"), "http://127.0.0.1:8001");
assert.throws(() => remote.backendUrl("//untrusted.example/api"));
assert.throws(() => remote.mediaUrl("https://untrusted.example/image.png"));
const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response("{}"); };
try {
  await local.backendFetch("/api/health");
  await remote.backendFetch("/api/adventures", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(calls[1].options.credentials, "include");
  assert.equal(calls[1].url, "https://eldoria-api.pre-scribe.org/api/adventures");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.body, "{}");
} finally {
  globalThis.fetch = originalFetch;
}
console.log("Local/hosted API, media, credentials, and URL validation checks passed.");
