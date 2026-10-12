"""RedTok – backend of the plugin page (Stash runPluginOperation, interface: raw).

The page asks RedGifs itself whenever the browser may (from localhost); this backend is the detour for everything
else and does what a browser can't: saving files into your library.

* mode "api":      {"path": "/gifs/search?..."} → {"data": {...}}  (read-only RedGifs API paths, no account)
* mode "images":   {"urls": [...]} → {"data": {url: "data:image/...;base64,..."}}  (RedGifs pictures the page may not
                   load itself – Stash's Content-Security-Policy; "image" does one)
* mode "download": {"url", "base", "folder", "filename"} → saved as <base>/<folder>/<filename>.mp4
* mode "have":     {"base", "ids": [...]} → {"have": [ids already on disk]}
* mode "conf":     → {"base": "<first video library>/RedGifs"} (a suggestion for the download folder)
* mode "bk_save" / "bk_load": the page's likes, follows and settings as a file next to Stash's config
"""

import base64
import hashlib
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
API = "https://api.redgifs.com/v2"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
CACHE = os.path.join(HERE, ".cache")
TOKEN_FILE = os.path.join(CACHE, "rgtoken.json")
TOKEN_TTL = 20 * 3600

# Files only from RedGifs – the backend is not a general downloader
DOWNLOAD_HOSTS = {"media.redgifs.com"}
IMG_HOSTS = {"userpic.redgifs.com", "media.redgifs.com", "thumbs2.redgifs.com", "thumbs44.redgifs.com"}
VIDEO_EXT = {".mp4", ".webm", ".m4v"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
INVALID_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
RESERVED_NAMES = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}


# --------------------------------------------------------------------------- RedGifs API (a visitor's token)

def http_json(url, token=None):
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=15) as res:
        return json.load(res)


def get_token(force=False):
    if not force:
        try:
            with open(TOKEN_FILE, encoding="utf-8") as f:
                cached = json.load(f)
            if cached.get("token") and cached.get("exp", 0) > time.time():
                return cached["token"]
        except (OSError, ValueError):
            pass
    token = http_json(API + "/auth/temporary")["token"]
    try:
        os.makedirs(CACHE, exist_ok=True)
        with open(TOKEN_FILE, "w", encoding="utf-8") as f:
            json.dump({"token": token, "exp": time.time() + TOKEN_TTL}, f)
    except OSError:
        pass  # the cache is only an optimization
    return token


def api_get(path):
    for attempt in range(2):
        token = get_token(force=attempt > 0)
        try:
            return http_json(API + path, token)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403) and attempt == 0:
                continue  # token ran out → a new one
            raise
    return None


# The read-only paths the page uses
API_PATHS = re.compile(
    r"^/(gifs/search|gifs/[\w]+|niches/[\w.-]+/gifs|niches/search|niches/[\w.-]+|users/[\w.-]+/search|users/[\w.-]+"
    r"|search/suggest|creators/search)(\?|$)"
)


def api(path):
    path = str(path or "")
    if not API_PATHS.match(path) or ".." in path:
        raise ValueError("RedGifs API path not allowed")
    try:
        return {"data": api_get(path)}
    except urllib.error.HTTPError as e:
        out = {"status": e.code, "error": f"HTTP {e.code}"}
        try:
            err = json.load(e).get("error") or {}
            out["error"] = err.get("message") or out["error"]
            if err.get("target"):
                out["target"] = err["target"]
        except Exception:
            pass
        return out


# --------------------------------------------------------------------------- pictures

def image(url):
    url = str(url or "")
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not (parsed.hostname in IMG_HOSTS or str(parsed.hostname).endswith(".redgifs.com")):
        raise ValueError("only pictures from redgifs.com")
    ext = os.path.splitext(parsed.path)[1].lower()
    ctype = {".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}.get(ext, "image/jpeg")
    folder = os.path.join(CACHE, "img")
    path = os.path.join(folder, hashlib.sha1(url.encode()).hexdigest() + ext)
    if not os.path.isfile(path):
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=20) as res:
            data = res.read(12 << 20)
        os.makedirs(folder, exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
    with open(path, "rb") as f:
        return {"data": f"data:{ctype};base64," + base64.b64encode(f.read()).decode()}


def images(urls):
    """Up to 24 pictures at once, fetched side by side (each cached on disk)."""
    from concurrent.futures import ThreadPoolExecutor

    urls = [str(u) for u in (urls or []) if u][:24]

    def one(u):
        try:
            return u, image(u)["data"]
        except Exception:
            return u, ""

    with ThreadPoolExecutor(max_workers=8) as pool:
        return {"data": dict(pool.map(one, urls))}


# --------------------------------------------------------------------------- downloads

def safe_name(name, fallback=""):
    """A folder/file name that is valid on Windows too."""
    name = INVALID_CHARS.sub("_", str(name or "")).strip().rstrip(". ")
    name = re.sub(r"\s+", " ", name)[:100].strip()
    if name.upper() in RESERVED_NAMES:
        name = "_" + name
    return name or fallback


def match_existing_case(path):
    """Take over the spelling of existing folders: Windows ignores case, Stash doesn't – "RedGifs" next to an
    existing "Redgifs" would otherwise be a second folder in Stash."""
    drive, rest = os.path.splitdrive(os.path.normpath(path))
    current = drive + os.sep if drive else os.sep
    for part in [p for p in re.split(r"[\\/]", rest) if p]:
        try:
            entries = os.listdir(current)
        except OSError:
            entries = []
        current = os.path.join(current, next((e for e in entries if e.lower() == part.lower()), part))
    return current


def download(args):
    url = str(args.get("url") or "")
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in DOWNLOAD_HOSTS:
        raise ValueError("only downloads from media.redgifs.com")
    base = str(args.get("base") or "").strip()
    if not base or not os.path.isabs(base):
        raise ValueError(f"the download folder must be a full path: {base!r}")
    folder = safe_name(args.get("folder"))
    target_dir = match_existing_case(os.path.join(base, folder) if folder else base)
    ext = os.path.splitext(parsed.path)[1].lower()
    if ext not in VIDEO_EXT | IMAGE_EXT:
        ext = ".mp4"
    path = os.path.join(target_dir, safe_name(args.get("filename"), "redgifs") + ext)
    if os.path.exists(path):
        path = match_existing_case(path)
        return {"path": path, "dir": target_dir, "existed": True, "size": os.path.getsize(path)}
    os.makedirs(target_dir, exist_ok=True)
    tmp = path + ".part"
    # no referrer – media.redgifs.com answers 403 to foreign ones
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=60) as res, open(tmp, "wb") as f:
            shutil.copyfileobj(res, f, 1 << 20)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise
    return {"path": path, "dir": target_dir, "existed": False, "size": os.path.getsize(path)}


def have(args):
    """Which RedGifs ids are on disk already: any picture/video below the download folder whose name is the id or ends
    with it ("user - id", "user_id" …) – files of other tools or moved into other folders count too."""
    base = str(args.get("base") or "").strip()
    ids = [str(i).lower() for i in (args.get("ids") or []) if i]
    if not base or not os.path.isdir(base) or not ids:
        return {"have": []}
    names = set()
    for _root, _dirs, files in os.walk(base):
        for f in files:
            stem, ext = os.path.splitext(f)
            if ext.lower() in VIDEO_EXT | IMAGE_EXT:
                s = stem.lower()
                names.add(s)
                names.add(re.split(r"[ _\-]+", s)[-1])
    return {"have": [i for i in ids if i in names]}


# --------------------------------------------------------------------------- Stash

def stash_request(conn, query):
    conn = {str(k).lower(): v for k, v in (conn or {}).items()}
    host = str(conn.get("host") or "localhost")
    if host in ("0.0.0.0", "", "::"):
        host = "127.0.0.1"
    url = f"{str(conn.get('scheme') or 'http').lower()}://{host}:{int(conn.get('port') or 9999)}/graphql"
    headers = {"Content-Type": "application/json"}
    if conn.get("apikey"):
        headers["ApiKey"] = str(conn["apikey"])
    cookie = conn.get("sessioncookie")
    if isinstance(cookie, dict):
        cookie = {str(k).lower(): v for k, v in cookie.items()}
        if cookie.get("value"):
            headers["Cookie"] = f"{cookie.get('name') or 'session'}={cookie['value']}"
    req = urllib.request.Request(url, json.dumps({"query": query}).encode(), headers, method="POST")
    with urllib.request.urlopen(req, timeout=15) as res:
        return json.load(res)


def conf(conn):
    """First video library of Stash + "RedGifs" – only a suggestion."""
    try:
        d = stash_request(conn, "query { configuration { general { stashes { path excludeVideo } } } }")
        stashes = d["data"]["configuration"]["general"]["stashes"] or []
        lib = next((x for x in stashes if not x.get("excludeVideo")), None)
        if lib:
            return {"base": os.path.join(lib["path"].rstrip("\\/"), "RedGifs")}
    except Exception as e:
        return {"base": "", "error": str(e)}
    return {"base": ""}


# --------------------------------------------------------------------------- backup
# Likes, follows, history and settings live in the browser. The page copies them here a few seconds after every change
# and asks for them again when its browser has none. Files: <Stash config folder>/backups-redtok/latest.json plus one
# snapshot per day (the last 14). The older local "RedGifs feed" kept its copy in backups-redgifsfeed – read once.

BK_MAX = 60 * 1024 * 1024


def config_dir(conn):
    d = str((conn or {}).get("Dir") or "")
    return d if d and os.path.isdir(d) else os.path.join(os.path.expanduser("~"), ".stash")


def _read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _count(data, key):
    try:
        return len(json.loads((data or {}).get(key) or "[]"))
    except Exception:
        return 0


def bk_load(conn):
    root = config_dir(conn)
    for folder in ("backups-redtok", "backups-redgifsfeed"):
        d = _read(os.path.join(root, folder, "latest.json"))
        if d and isinstance(d.get("data"), dict):
            return {"data": d["data"], "at": d.get("at"), "from": folder}
    return {"data": None}


def bk_save(conn, data):
    if not isinstance(data, dict):
        raise ValueError("no data")
    clean = {str(k): v for k, v in data.items() if str(k).startswith("rgf.") and isinstance(v, str)}
    if not clean or sum(len(v) for v in clean.values()) > BK_MAX:
        return {"saved": False, "why": "empty or too big"}
    folder = os.path.join(config_dir(conn), "backups-redtok")
    os.makedirs(folder, exist_ok=True)
    latest = os.path.join(folder, "latest.json")
    old = (_read(latest) or {}).get("data") or {}
    # a browser that has just lost its likes must not overwrite the good copy – that goes into its own file
    for key in ("rgf.liked", "rgf.following"):
        was, now = _count(old, key), _count(clean, key)
        if was > 20 and now < was / 2:
            with open(os.path.join(folder, "suspicious.json"), "w", encoding="utf-8") as f:
                json.dump({"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "data": clean}, f)
            return {"saved": False, "why": f"{key} shrank from {was} to {now}"}
    tmp = latest + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "data": clean}, f)
    os.replace(tmp, latest)
    day = os.path.join(folder, "backup-" + time.strftime("%Y%m%d") + ".json")
    if not os.path.exists(day):
        shutil.copyfile(latest, day)
        for n in sorted(n for n in os.listdir(folder) if n.startswith("backup-") and n.endswith(".json"))[:-14]:
            try:
                os.remove(os.path.join(folder, n))
            except OSError:
                pass
    return {"saved": True}


# --------------------------------------------------------------------------- main

def main():
    data = json.loads(sys.stdin.read() or "{}")
    args = data.get("args") or {}
    conn = data.get("server_connection") or {}
    mode = str(args.get("mode") or "")
    try:
        if mode == "api":
            output = api(args.get("path"))
        elif mode == "image":
            output = image(args.get("url"))
        elif mode == "images":
            output = images(args.get("urls"))
        elif mode == "download":
            output = download(args)
        elif mode == "have":
            output = have(args)
        elif mode == "conf":
            output = conf(conn)
        elif mode == "bk_load":
            output = bk_load(conn)
        elif mode == "bk_save":
            output = bk_save(conn, args.get("data"))
        else:
            raise ValueError(f"unknown mode: {mode}")
    except urllib.error.HTTPError as e:
        print(json.dumps({"output": {"error": f"RedGifs answers with HTTP {e.code}", "status": e.code}}))
        return
    except Exception as e:
        print(json.dumps({"output": {"error": str(e)}}))
        return
    print(json.dumps({"output": output}))


if __name__ == "__main__":
    main()
