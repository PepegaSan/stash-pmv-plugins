// Stash UI as an app: nothing is cached – Stash is on your network anyway. The worker only shows a small
// page instead of the browser's error when Stash can't be reached.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const OFFLINE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pepega test version</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#1a0b17;color:#f4e6ee;font:16px system-ui,sans-serif;text-align:center">
<div><h1 style="color:#ff3e8a;font-size:28px;margin:0 0 8px">Stash can't be reached</h1><p style="opacity:.75;margin:0 0 20px">Is the computer with Stash on, and are you on the same network?</p>
<button onclick="location.reload()" style="padding:10px 20px;border:0;border-radius:4px;background:#ff3e8a;color:#1a0b17;font:600 15px system-ui;cursor:pointer">Try again</button></div>`;

self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
