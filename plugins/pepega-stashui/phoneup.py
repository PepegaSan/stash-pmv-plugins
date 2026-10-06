"""Stash UI – "Phone upload": a small receiver in your home network.

Started by backend.py (mode phone_start). Your phone opens the page (QR code in Stash UI → Phone upload), you pick
photos and videos from its gallery and they are written into one folder of your Stash library (streamed to disk,
so big videos are fine). Stash UI then scans that folder.

Safety: every request needs the random token that was made when it started (it is in the QR code / link);
only photo and video file types are taken; nothing is overwritten (a number is added to the name); the folder
is fixed at start and checked by backend.py to lie inside a library folder; it stops by itself after three
hours without a request, or with "Stop" in Stash UI. It listens on all network interfaces of this PC – so
only use it on a network you trust (your home Wi-Fi), not on a public one.

    python phoneup.py <port> <token> <folder>
"""

import hmac
import http.server
import json
import os
import re
import shutil
import sys
import threading
import time
import urllib.parse

PORT = int(sys.argv[1])
TOKEN = sys.argv[2]
FOLDER = sys.argv[3]
IDLE = 3 * 3600
EXT = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".avif", ".bmp",
    ".mp4", ".m4v", ".mov", ".3gp", ".webm", ".mkv", ".avi", ".mpg", ".mpeg", ".wmv", ".flv", ".ts",
}
RESERVED = {"con", "prn", "aux", "nul"} | {f"com{i}" for i in range(1, 10)} | {f"lpt{i}" for i in range(1, 10)}
received = []  # newest last: {name, size, at}
state = {"last": time.time(), "busy": 0}
lock = threading.Lock()


def clean_name(raw):
    name = os.path.basename(urllib.parse.unquote(raw or "").replace("\\", "/"))
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")
    stem, ext = os.path.splitext(name)
    if stem.lower() in RESERVED:
        stem = "_" + stem
    stem = stem[:120] or "upload"
    return stem + ext.lower()


def unique_path(name):
    stem, ext = os.path.splitext(name)
    path = os.path.join(FOLDER, name)
    n = 2
    while os.path.exists(path):
        path = os.path.join(FOLDER, f"{stem} ({n}){ext}")
        n += 1
    return path


PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Stash – upload</title>
<style>
:root{color-scheme:dark light;--bg:#14101a;--card:#1f1927;--text:#f4eef8;--dim:#a99db6;--pink:#ff4d9d;--ok:#3ecf8e;--err:#ff6b6b}
@media (prefers-color-scheme:light){:root{--bg:#faf6fc;--card:#fff;--text:#231a2b;--dim:#6f6379}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:18px 16px calc(24px + env(safe-area-inset-bottom))}
h1{font-size:22px;margin:4px 0 2px}p{margin:6px 0;color:var(--dim)}
.pick{display:flex;align-items:center;justify-content:center;gap:10px;margin:16px 0;padding:22px 16px;border-radius:16px;background:var(--pink);color:#fff;font-weight:700;font-size:18px;border:0;width:100%}
.pick:active{transform:scale(.99)}input[type=file]{display:none}
.sum{display:flex;justify-content:space-between;color:var(--dim);font-size:14px;margin:6px 2px}
.list{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.f{background:var(--card);border-radius:12px;padding:10px 12px}.f b{display:block;font-weight:600;word-break:break-all;font-size:14.5px}
.f small{color:var(--dim)}.bar{height:6px;border-radius:3px;background:rgba(128,128,128,.25);margin-top:8px;overflow:hidden}.bar i{display:block;height:100%;width:0;background:var(--pink);transition:width .15s}
.f.done .bar i{background:var(--ok)}.f.err .bar i{background:var(--err)}.f.err small{color:var(--err)}
button.small{margin-top:8px;padding:8px 12px;border-radius:10px;border:1px solid var(--dim);background:transparent;color:var(--text);font-size:14px}
</style></head><body>
<h1 id="t-title"></h1><p id="t-sub"></p>
<label class="pick" id="pick"><span id="t-pick"></span><input id="file" type="file" multiple accept="image/*,video/*"></label>
<div class="sum"><span id="s-count"></span><span id="s-state"></span></div>
<div class="list" id="list"></div>
<script>
(function(){
var K = new URLSearchParams(location.search).get("k") || "";
var L = (navigator.language || "en").toLowerCase().indexOf("zh") === 0 ? "zh" : (navigator.language || "").toLowerCase().indexOf("de") === 0 ? "de" : "en";
var T = {
 en:{title:"Upload to Stash",sub:"Pick photos and videos from your gallery – they go straight to your PC. Keep this page open until everything is done.",pick:"Choose photos / videos",wait:"waiting",up:"uploading",done:"done",fail:"failed",retry:"Try again",count:"{n} of {m} done",all:"All done ✓",busy:"Uploading …",tooBig:"not enough space on the PC",type:"file type not accepted",bad:"link is not valid"},
 de:{title:"Zu Stash hochladen",sub:"Wähle Fotos und Videos aus deiner Galerie – sie gehen direkt an deinen PC. Lass diese Seite offen, bis alles fertig ist.",pick:"Fotos / Videos auswählen",wait:"wartet",up:"lädt hoch",done:"fertig",fail:"fehlgeschlagen",retry:"Nochmal versuchen",count:"{n} von {m} fertig",all:"Alles fertig ✓",busy:"Lädt hoch …",tooBig:"nicht genug Platz auf dem PC",type:"Dateityp nicht erlaubt",bad:"Link ungültig"},
 zh:{title:"上传到 Stash",sub:"从相册选择照片和视频——它们会直接传到你的电脑。传完之前请保持此页面打开。",pick:"选择照片 / 视频",wait:"等待中",up:"上传中",done:"完成",fail:"失败",retry:"重试",count:"已完成 {n} / {m}",all:"全部完成 ✓",busy:"上传中 …",tooBig:"电脑空间不足",type:"不支持的文件类型",bad:"链接无效"}
}[L];
function $(i){return document.getElementById(i)}
$("t-title").textContent=T.title;$("t-sub").textContent=T.sub;$("t-pick").textContent=T.pick;
var items=[],running=false,lock=null;
function size(n){return n>=1e9?(n/1e9).toFixed(2)+" GB":n>=1e6?(n/1e6).toFixed(1)+" MB":Math.max(1,Math.round(n/1e3))+" KB"}
function paint(){
  var d=items.filter(function(x){return x.s==="done"}).length;
  $("s-count").textContent=items.length?T.count.replace("{n}",d).replace("{m}",items.length):"";
  $("s-state").textContent=items.length?(d===items.length?T.all:running?T.busy:""):"";
}
function row(x){
  var el=document.createElement("div");el.className="f";
  el.innerHTML="<b></b><small></small><div class=bar><i></i></div>";
  el.querySelector("b").textContent=x.f.name;x.el=el;$("list").appendChild(el);return el;
}
function show(x,pct,msg){
  x.el.className="f"+(x.s==="done"?" done":x.s==="err"?" err":"");
  x.el.querySelector("i").style.width=pct+"%";
  x.el.querySelector("small").textContent=size(x.f.size)+" · "+msg;
  var old=x.el.querySelector("button");if(old)old.remove();
  if(x.s==="err"){var b=document.createElement("button");b.className="small";b.textContent=T.retry;b.onclick=function(){x.s="wait";show(x,0,T.wait);go()};x.el.appendChild(b)}
}
function send(x){
  return new Promise(function(res){
    var r=new XMLHttpRequest();
    r.open("POST","/up?k="+encodeURIComponent(K)+"&name="+encodeURIComponent(x.f.name)+"&m="+(x.f.lastModified||0));
    r.upload.onprogress=function(e){if(e.lengthComputable)show(x,Math.round(e.loaded/e.total*100),T.up+" "+Math.round(e.loaded/e.total*100)+"%")};
    r.onload=function(){
      if(r.status===200){x.s="done";show(x,100,T.done)}
      else{x.s="err";var m=r.status===507?T.tooBig:r.status===415?T.type:r.status===403?T.bad:T.fail+" ("+r.status+")";show(x,0,m)}
      res()};
    r.onerror=function(){x.s="err";show(x,0,T.fail);res()};
    r.send(x.f);
  });
}
function go(){
  if(running)return;running=true;paint();
  if(navigator.wakeLock&&navigator.wakeLock.request){navigator.wakeLock.request("screen").then(function(l){lock=l}).catch(function(){})}
  (function next(){
    var x=items.find(function(i){return i.s==="wait"});
    if(!x){running=false;paint();if(lock){lock.release();lock=null}return}
    x.s="up";show(x,0,T.up);paint();
    send(x).then(function(){paint();next()});
  })();
}
$("file").onchange=function(e){
  Array.prototype.forEach.call(e.target.files,function(f){var x={f:f,s:"wait"};items.push(x);row(x);show(x,0,T.wait)});
  e.target.value="";paint();go();
};
if(!K){$("pick").style.display="none";$("t-sub").textContent=T.bad}
})();
</script></body></html>
"""


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "StashUIPhoneUpload"

    def log_message(self, *a):
        pass

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.cors()
        self.end_headers()
        self.wfile.write(body)

    def authed(self, q):
        return hmac.compare_digest(q.get("k", [""])[0].encode(), TOKEN.encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        state["last"] = time.time()
        u = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(u.query)
        if u.path == "/":
            body = PAGE.encode("utf-8")
            if not self.authed(q):
                body = b"<!doctype html><meta name=viewport content='width=device-width'><p style='font:16px system-ui;padding:20px'>This link is not valid. Scan the QR code in Stash UI again.</p>"
            self.send_response(200 if self.authed(q) else 403)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        if not self.authed(q):
            return self.send_json(403, {"error": "wrong token"})
        if u.path == "/api/ping":
            return self.send_json(200, {"ok": True, "folder": FOLDER, "busy": state["busy"], "pid": os.getpid()})
        if u.path == "/api/list":
            with lock:
                return self.send_json(200, {"folder": FOLDER, "busy": state["busy"], "files": list(received[-200:]), "total": len(received)})
        if u.path == "/api/stop":
            self.send_json(200, {"ok": True})
            threading.Thread(target=lambda: (time.sleep(0.3), os._exit(0)), daemon=True).start()
            return
        self.send_json(404, {"error": "unknown"})

    def do_POST(self):
        state["last"] = time.time()
        u = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(u.query)
        if u.path != "/up":
            return self.send_json(404, {"error": "unknown"})
        if not self.authed(q):
            self.close_connection = True
            return self.send_json(403, {"error": "wrong token"})
        name = clean_name(q.get("name", [""])[0])
        if os.path.splitext(name)[1] not in EXT:
            self.close_connection = True
            return self.send_json(415, {"error": "file type not accepted"})
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self.close_connection = True
            return self.send_json(411, {"error": "length required"})
        try:
            os.makedirs(FOLDER, exist_ok=True)
            if shutil.disk_usage(FOLDER).free < length + 200 * 1024 * 1024:  # keep 200 MB free
                self.close_connection = True
                return self.send_json(507, {"error": "not enough space"})
        except OSError as e:
            self.close_connection = True
            return self.send_json(500, {"error": str(e)})
        path = unique_path(name)
        part = path + ".part"  # not a media extension – Stash leaves it alone while it grows
        state["busy"] += 1
        try:
            left = length
            with open(part, "wb") as f:
                while left > 0:
                    chunk = self.rfile.read(min(1 << 20, left))
                    if not chunk:
                        raise ConnectionError("upload interrupted")
                    f.write(chunk)
                    left -= len(chunk)
                    state["last"] = time.time()
            os.replace(part, path)
            try:  # keep the date the photo / video has on the phone
                ms = int(q.get("m", ["0"])[0] or 0)
                if 946684800000 < ms < time.time() * 1000 + 86400000:
                    os.utime(path, (ms / 1000.0, ms / 1000.0))
            except (ValueError, OSError):
                pass
            with lock:
                received.append({"name": os.path.basename(path), "size": length, "at": time.time()})
            self.send_json(200, {"ok": True, "name": os.path.basename(path), "size": length})
        except Exception as e:  # noqa: BLE001 – an interrupted upload leaves nothing behind
            try:
                os.remove(part)
            except OSError:
                pass
            self.close_connection = True
            try:
                self.send_json(500, {"error": str(e)})
            except OSError:
                pass
        finally:
            state["busy"] -= 1


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def watchdog():
    while True:
        time.sleep(30)
        if not state["busy"] and time.time() - state["last"] > IDLE:
            os._exit(0)


if __name__ == "__main__":
    os.makedirs(FOLDER, exist_ok=True)
    threading.Thread(target=watchdog, daemon=True).start()
    Server(("0.0.0.0", PORT), Handler).serve_forever()
