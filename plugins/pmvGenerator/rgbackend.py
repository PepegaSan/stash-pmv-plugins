"""RedGifs backend (copied from Media Storm by tools/build.py) (suggestions and downloads).

Called from the browser through Stash's `runPluginOperation`.

* mode "suggest": the Stash interface only allows requests to Stash itself (Content Security
  Policy). So that the live suggestions (niches, tags, creators) in the panel still work,
  this script queries the public RedGifs API and returns the raw data; sorting and
  filtering happen in the browser.
      args:   {"mode": "suggest", "query": "..."}
      output: {"niches": [...], "suggest": [...], "creators": [...]}

* mode "api": a GET on the RedGifs API for pages whose browser requests are blocked – the API
  only answers cross-origin requests from localhost, so Stash opened via its network address
  needs this detour. Only the read-only paths the plugins use are allowed.
      args:   {"mode": "api", "path": "/gifs/search?..."}
      output: {"data": {...}}  or  {"status": 404, "error": "..."}

* mode "download": downloads a clip from media.redgifs.com into a folder (typically
  inside the Stash library). The browser then takes care of the scan and the metadata.
      args:   {"mode": "download", "url": "...", "base": "/path/to/library/RedGifs",
               "folder": "some niche", "filename": "creator - id"}
      output: {"path": "...", "dir": "...", "kind": "video" | "image", "existed": bool, "size": int}
"""

import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://api.redgifs.com/v2"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache", "rgtoken.json")
TOKEN_TTL = 20 * 3600

# Downloads only from RedGifs – the backend is not meant to be a general downloader.
DOWNLOAD_HOSTS = {"media.redgifs.com"}
VIDEO_EXT = {".mp4", ".webm", ".m4v"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
INVALID_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
RESERVED_NAMES = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}


# --------------------------------------------------------------------------- API

def http_json(url, token=None):
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as res:
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
        os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
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
                continue  # token expired → fetch a new one
            raise
    return None


# Read-only API paths the plugins use (for mode "api")
API_PATHS = re.compile(r"^/(gifs/search|niches/[\w.-]+/gifs|niches/search|users/[\w.-]+/search|search/suggest|creators/search)(\?|$)")


def api(path):
    path = str(path or "")
    if not API_PATHS.match(path):
        raise ValueError("RedGifs API path not allowed")
    try:
        return {"data": api_get(path)}
    except urllib.error.HTTPError as e:
        msg = f"HTTP {e.code}"
        try:
            err = json.load(e).get("error") or {}
            msg = err.get("message") or msg
            if err.get("code") == "UserNotFound":
                msg = "creator not found"
        except Exception:
            pass
        return {"status": e.code, "error": msg}


# --------------------------------------------------------------------------- suggest

def suggest(query):
    q = urllib.parse.quote(query)
    paths = {
        "niches": f"/niches/search?query={q}&order=best_match&count=30",
        "suggest": f"/search/suggest?query={q}",
        "creators": f"/creators/search?query={q}&count=20",
    }

    def fetch(item):
        key, path = item
        try:
            return key, api_get(path)
        except Exception as e:  # one missing group shouldn't block the others
            print(f"[MediaStorm] {key}: {e}", file=sys.stderr)
            return key, None

    with ThreadPoolExecutor(max_workers=3) as pool:
        raw = dict(pool.map(fetch, paths.items()))

    return {
        "niches": (raw.get("niches") or {}).get("niches", [])[:30],
        "suggest": raw.get("suggest") if isinstance(raw.get("suggest"), list) else [],
        "creators": (raw.get("creators") or {}).get("items", [])[:20],
    }


# --------------------------------------------------------------------------- download

def safe_name(name, fallback=""):
    """Folder/file name that is valid on Windows."""
    name = INVALID_CHARS.sub("_", str(name or "")).strip().rstrip(". ")
    name = re.sub(r"\s+", " ", name)[:100].strip()
    if name.upper() in RESERVED_NAMES:
        name = "_" + name
    return name or fallback


def match_existing_case(path):
    """Takes over the spelling of existing folders/files.

    Windows ignores upper/lower case, but Stash stores paths exactly. Without this
    matching, e.g. "RedGifs" next to an existing "Redgifs" would show up as a second
    folder in Stash.
    """
    drive, rest = os.path.splitdrive(os.path.normpath(path))
    current = drive + os.sep if drive else os.sep
    for part in [p for p in re.split(r"[\\/]", rest) if p]:
        try:
            entries = os.listdir(current)
        except OSError:
            entries = []
        match = next((e for e in entries if e.lower() == part.lower()), part)
        current = os.path.join(current, match)
    return current


def download(args):
    url = str(args.get("url") or "")
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in DOWNLOAD_HOSTS:
        raise ValueError("only downloads from media.redgifs.com are allowed")

    base = str(args.get("base") or "").strip()
    if not base or not os.path.isabs(base):
        raise ValueError(f"invalid download folder: {base!r}")

    folder = safe_name(args.get("folder"))
    target_dir = match_existing_case(os.path.join(base, folder) if folder else base)

    ext = os.path.splitext(parsed.path)[1].lower()
    if ext not in VIDEO_EXT | IMAGE_EXT:
        ext = ".mp4"
    filename = safe_name(args.get("filename"), safe_name(args.get("id"), "redgifs")) + ext
    path = os.path.join(target_dir, filename)
    kind = "image" if ext in IMAGE_EXT else "video"

    if os.path.exists(path):
        path = match_existing_case(path)
        return {"path": path, "dir": target_dir, "kind": kind, "existed": True, "size": os.path.getsize(path)}

    os.makedirs(target_dir, exist_ok=True)
    tmp = path + ".part"
    # Important: no referrer – otherwise media.redgifs.com answers with 403.
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
    return {"path": path, "dir": target_dir, "kind": kind, "existed": False, "size": os.path.getsize(path)}


# --------------------------------------------------------------------------- main

def main():
    data = json.loads(sys.stdin.read() or "{}")
    args = data.get("args") or {}
    mode = str(args.get("mode") or "")

    try:
        if mode == "suggest":
            query = str(args.get("query") or "").strip()
            output = suggest(query) if query else {"niches": [], "suggest": [], "creators": []}
        elif mode == "api":
            output = api(args.get("path"))
        elif mode == "download":
            output = download(args)
        else:
            raise ValueError(f"unknown mode: {mode}")
    except urllib.error.HTTPError as e:
        print(json.dumps({"error": f"RedGifs answers with HTTP {e.code}"}))
        return
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return
    print(json.dumps({"output": output}))


if __name__ == "__main__":
    main()
