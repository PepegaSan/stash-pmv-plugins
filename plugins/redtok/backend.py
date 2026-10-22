"""RedTok – backend of the plugin page (Stash runPluginOperation, interface: raw).

The page asks RedGifs itself whenever the browser may (from localhost); this backend is the detour for everything
else and does what a browser can't: saving files into your library.

* mode "api":      {"path": "/gifs/search?..."} → {"data": {...}}  (read-only RedGifs API paths, no account)
* mode "images":   {"urls": [...]} → {"data": {url: "data:image/...;base64,..."}}  (RedGifs pictures the page may not
                   load itself – Stash's Content-Security-Policy; "image" does one)
* mode "download": {"url", "base", "folder", "filename"} → saved as <base>/<folder>/<filename>.mp4
* mode "have":     {"base", "ids": [...]} → {"have": [ids already on disk]}
* mode "dl_add" / "dl_status" / "dl_ctl": downloads in the background (a worker process of its own, see below)
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


# --------------------------------------------------------------------------- downloads in the background
# The page hands a list to "dl_add"; a worker process of its own (this file with --dljob) downloads it, has Stash scan the
# folders and fills in the scenes (date, creator, link, tags, performer) – so it carries on when the page is closed.
# State: <cache>/dl/state.json (jobs + a heartbeat of the worker), written under a small lock file by both sides.

DL_DIR = os.path.join(CACHE, "dl")
DL_STATE = os.path.join(DL_DIR, "state.json")
DL_LOCK = os.path.join(DL_DIR, "state.lock")
DL_BEAT = 6  # seconds: a worker whose heartbeat is older than this is gone
DL_KEEP = 4000  # jobs kept in the list
_ID = re.compile(r"^[\w\-]{1,64}$")


class dl_locked:
    def __enter__(self):
        os.makedirs(DL_DIR, exist_ok=True)
        for _ in range(400):
            try:
                os.close(os.open(DL_LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
                return self
            except FileExistsError:
                try:
                    if time.time() - os.path.getmtime(DL_LOCK) > 10:
                        os.remove(DL_LOCK)  # left behind by a crash
                except OSError:
                    pass
                time.sleep(0.025)
        raise RuntimeError("the download list is busy")

    def __exit__(self, *a):
        try:
            os.remove(DL_LOCK)
        except OSError:
            pass


def dl_load():
    st = _read(DL_STATE) or {}
    st.setdefault("jobs", [])
    st.setdefault("opts", {})
    st.setdefault("rev", 0)
    st.setdefault("beat", 0)
    st.setdefault("pid", 0)
    return st


def dl_save(st, bump=True):
    if bump:  # (the page asks "anything new since rev n?" – a heartbeat alone isn't)
        st["rev"] = int(st.get("rev", 0)) + 1
    if len(st["jobs"]) > DL_KEEP:  # drop the oldest finished ones
        extra = len(st["jobs"]) - DL_KEEP
        keep = []
        for j in st["jobs"]:
            if extra > 0 and j.get("state") in ("ok", "bad", "cancel"):
                extra -= 1
                continue
            keep.append(j)
        st["jobs"] = keep
    os.makedirs(DL_DIR, exist_ok=True)
    tmp = DL_STATE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f)
    os.replace(tmp, DL_STATE)


def dl_alive(st):
    return time.time() - float(st.get("beat") or 0) < DL_BEAT


def dl_start(conn):
    """Start the worker unless one is running (it checks again itself, so two starts at once are harmless)."""
    import subprocess
    if dl_alive(dl_load()):
        return
    flags = (0x00000008 | 0x00000200 | 0x08000000) if os.name == "nt" else 0  # detached, own process group, no window
    p = subprocess.Popen([sys.executable, os.path.abspath(__file__), "--dljob"], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         creationflags=flags, close_fds=True, start_new_session=(os.name != "nt"))
    try:
        p.stdin.write(json.dumps(conn or {}).encode())
        p.stdin.close()
    except OSError:
        pass


def dl_add(conn, args):
    base = str(args.get("base") or "").strip()
    if not base or not os.path.isabs(base):
        raise ValueError(f"the download folder must be a full path: {base!r}")
    opts = args.get("opts") or {}
    items = args.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("nothing to download")
    added = 0
    with dl_locked():
        st = dl_load()
        by_id = {j["id"]: j for j in st["jobs"]}
        for it in items[:5000]:
            if not isinstance(it, dict):
                continue
            jid, url = str(it.get("id") or ""), str(it.get("url") or "")
            if not _ID.match(jid) or urllib.parse.urlparse(url).hostname not in DOWNLOAD_HOSTS or urllib.parse.urlparse(url).scheme != "https":
                continue
            old = by_id.get(jid)
            if old and old.get("state") in ("queued", "run"):
                continue
            if old:
                st["jobs"].remove(old)
            st["jobs"].append({
                "id": jid, "user": str(it.get("user") or "")[:100], "url": url, "thumb": str(it.get("thumb") or "")[:300], "state": "queued", "note": "", "size": 0, "at": int(time.time()),
                "date": int(it.get("date") or 0), "desc": str(it.get("desc") or "")[:300], "tags": [str(x)[:60] for x in (it.get("tags") or [])[:10]],
                "scan": bool(opts.get("scan")), "m": {k: bool(opts.get(k)) for k in ("meta", "metaTags", "metaPerf")},
            })
            added += 1
        st["base"] = base
        dl_save(st)
    if added:
        dl_start(conn)
    return {"added": added}


def dl_status(args):
    st = dl_load()
    if int(args.get("rev") or 0) == st["rev"]:
        return {"same": True, "rev": st["rev"], "alive": dl_alive(st)}
    jobs = [{"id": j["id"], "user": j.get("user", ""), "thumb": j.get("thumb", ""), "state": j.get("state"), "note": j.get("note", ""), "size": j.get("size", 0), "at": j.get("at", 0),
             "date": j.get("date", 0), "desc": j.get("desc", ""), "tags": j.get("tags", []), "url": j.get("url", "")} for j in st["jobs"]]
    return {"rev": st["rev"], "alive": dl_alive(st), "jobs": jobs}


def dl_ctl(conn, args):
    action = str(args.get("action") or "")
    ids = {str(i) for i in (args.get("ids") or [])}
    n = 0
    with dl_locked():
        st = dl_load()
        keep = []
        for j in st["jobs"]:
            sel = not ids or j["id"] in ids
            if action == "cancel" and sel and j.get("state") == "queued":
                j["state"] = "cancel"
                n += 1
            elif action == "retry" and sel and j.get("state") in ("bad", "cancel"):
                j.update({"state": "queued", "note": ""})
                n += 1
            elif action == "clear" and j.get("state") in ("ok", "bad", "cancel") and sel:
                n += 1
                continue
            keep.append(j)
        st["jobs"] = keep
        dl_save(st)
    if action == "retry" and n:
        dl_start(conn)
    return {"n": n}


def dl_one(job, base):
    note = ""
    for _ in range(2):
        try:
            o = download({"url": job["url"], "base": base, "folder": job["user"], "filename": f"{job['user']} - {job['id']}"})
            return {"state": "ok", "note": "there" if o.get("existed") else "saved", "size": o.get("size", 0), "dir": o.get("dir", ""), "existed": bool(o.get("existed"))}
        except Exception as e:  # noqa: BLE001
            note = str(e)[:120]
            time.sleep(0.8)
    return {"state": "bad", "note": note}


def stash_gql(conn, query, variables=None):
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
    req = urllib.request.Request(url, json.dumps({"query": query, "variables": variables or {}}).encode(), headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as res:
        d = json.load(res)
    if d.get("errors"):
        raise RuntimeError("; ".join(str(e.get("message", "")) for e in d["errors"])[:300])
    return d.get("data") or {}


class MetaFiller:
    """What the page's fillMeta did, for videos Stash has scanned: date, details, link, the creator as the studio, tags, performer."""

    def __init__(self, conn):
        self.conn = conn
        self.studios, self.tags, self.perfs = {}, {}, {}

    def studio(self, name):
        if name in self.studios:
            return self.studios[name]
        d = stash_gql(self.conn, "query($f: StudioFilterType) { findStudios(studio_filter: $f, filter: { per_page: 1 }) { studios { id } } }", {"f": {"name": {"value": name, "modifier": "EQUALS"}}})
        sid = (d["findStudios"]["studios"] or [{}])[0].get("id")
        if not sid:
            sid = stash_gql(self.conn, "mutation($i: StudioCreateInput!) { studioCreate(input: $i) { id } }", {"i": {"name": name, "url": f"https://www.redgifs.com/users/{name}"}})["studioCreate"]["id"]
        self.studios[name] = sid
        return sid

    def tag(self, name):
        key = name.lower()
        if key in self.tags:
            return self.tags[key]
        d = stash_gql(self.conn, "query($q: String!) { findTags(filter: { q: $q, per_page: 20 }) { tags { id name aliases } } }", {"q": name})
        hit = next((x for x in d["findTags"]["tags"] if x["name"].lower() == key or any(a.lower() == key for a in (x.get("aliases") or []))), None)
        tid = hit["id"] if hit else stash_gql(self.conn, "mutation($i: TagCreateInput!) { tagCreate(input: $i) { id } }", {"i": {"name": name}})["tagCreate"]["id"]
        self.tags[key] = tid
        return tid

    def performer(self, name):
        key = name.lower()
        if key in self.perfs:
            return self.perfs[key]
        d = stash_gql(self.conn, "query($q: String!) { findPerformers(filter: { q: $q, per_page: 20 }) { performers { id name } } }", {"q": name})
        hit = next((x for x in d["findPerformers"]["performers"] if x["name"].lower() == key), None)
        pid = hit["id"] if hit else None
        if not pid:
            url = f"https://www.redgifs.com/users/{name}"
            for extra in ({"urls": [url]}, {"url": url}, {}):
                try:
                    pid = stash_gql(self.conn, "mutation($i: PerformerCreateInput!) { performerCreate(input: $i) { id } }", {"i": dict({"name": name}, **extra)})["performerCreate"]["id"]
                    break
                except Exception:  # noqa: BLE001 – an older / newer field name: next form
                    pass
            if not pid:
                raise RuntimeError("performer not created")
        self.perfs[key] = pid
        return pid

    def apply(self, job):
        """True = done (or nothing to do), False = the scene isn't there yet."""
        d = stash_gql(self.conn, "query($f: SceneFilterType) { findScenes(scene_filter: $f, filter: { per_page: 1 }) { scenes { id tags { id } performers { id } } } }",
                      {"f": {"path": {"value": f"{job['user']} - {job['id']}", "modifier": "INCLUDES"}}})
        sc = (d["findScenes"]["scenes"] or [None])[0]
        if not sc:
            return False
        m = job.get("m") or {}
        inp = {"id": sc["id"]}
        if m.get("meta"):
            if job.get("date"):
                inp["date"] = time.strftime("%Y-%m-%d", time.gmtime(int(job["date"])))
            if job.get("desc") and len(job["desc"]) < 200:
                inp["details"] = job["desc"]
            try:
                inp["studio_id"] = self.studio(job["user"])
            except Exception:  # noqa: BLE001 – the rest still goes in
                pass
        if m.get("metaTags") and job.get("tags"):
            ids = {x["id"] for x in sc.get("tags") or []}
            for name in job["tags"][:10]:
                try:
                    ids.add(self.tag(str(name)))
                except Exception:  # noqa: BLE001 – skip this tag
                    pass
            inp["tag_ids"] = sorted(ids)
        if m.get("metaPerf") and job.get("user"):
            ids = {x["id"] for x in sc.get("performers") or []}
            try:
                ids.add(self.performer(job["user"]))
                inp["performer_ids"] = sorted(ids)
            except Exception:  # noqa: BLE001 – no performer
                pass
        if len(inp) < 2 and not m.get("meta"):
            return True
        link = f"https://www.redgifs.com/watch/{job['id']}"
        for extra in ({"urls": [link]}, {"url": link}, {}) if m.get("meta") else ({},):
            try:
                stash_gql(self.conn, "mutation($i: SceneUpdateInput!) { sceneUpdate(input: $i) { id } }", {"i": dict(inp, **extra)})
                break
            except Exception:  # noqa: BLE001 – an older / newer field name: next form
                pass
        return True


def dl_worker():
    from concurrent.futures import ThreadPoolExecutor
    try:
        conn = json.loads(sys.stdin.read() or "{}")
    except ValueError:
        conn = {}
    me = os.getpid()
    with dl_locked():
        st = dl_load()
        if dl_alive(st) and st.get("pid") not in (0, me):
            return  # another worker has it
        st["pid"], st["beat"] = me, time.time()
        dl_save(st)
    pool = ThreadPoolExecutor(max_workers=3)
    futs = {}  # future → job id
    meta_left = {}  # job id → tries left (the scene is looked up every 3 s, up to ~2 minutes)
    meta_due = 0.0
    filler = MetaFiller(conn)
    idle = 0.0
    last_beat = 0.0
    while True:
        with dl_locked():
            st = dl_load()
            st["pid"], st["beat"] = me, time.time()
            running = set(futs.values())
            moved = False
            for j in st["jobs"]:
                if j.get("state") == "run" and j["id"] not in running:
                    j["state"] = "queued"  # left over from a worker that died
                    moved = True
            while len(futs) < 3:
                j = next((x for x in st["jobs"] if x.get("state") == "queued"), None)
                if not j:
                    break
                j["state"] = "run"
                moved = True
                futs[pool.submit(dl_one, dict(j), st.get("base") or "")] = j["id"]
            if moved or time.time() - last_beat > 2:  # (a big list isn't rewritten ten times a second for a heartbeat)
                last_beat = time.time()
                dl_save(st, moved)
        for f in [f for f in futs if f.done()]:
            jid = futs.pop(f)
            try:
                res = f.result()
            except Exception as e:  # noqa: BLE001
                res = {"state": "bad", "note": str(e)[:120]}
            with dl_locked():
                st = dl_load()
                j = next((x for x in st["jobs"] if x["id"] == jid), None)
                if j:
                    new = res.get("state") == "ok" and not res.get("existed")
                    j.update({"state": res["state"], "note": res.get("note", ""), "size": res.get("size", 0), "dir": res.get("dir", "")})
                    j["scan"] = bool(j.get("scan")) and new
                    m = j.get("m") or {}
                    if not (new and (m.get("meta") or m.get("metaTags") or m.get("metaPerf"))):
                        j["m"] = {}
                    dl_save(st)
        with dl_locked():
            st = dl_load()
            busy = bool(futs) or any(x.get("state") == "queued" for x in st["jobs"])
        if busy:
            idle = 0.0
        else:
            with dl_locked():
                st = dl_load()
                pend = [j for j in st["jobs"] if j.get("scan")]
            did = False
            if pend:
                dirs = sorted({j["dir"] for j in pend if j.get("dir")})
                try:
                    stash_gql(conn, "mutation($p: [String!]) { metadataScan(input: { paths: $p }) }", {"p": dirs})
                except Exception:  # noqa: BLE001 – only a courtesy: Stash finds the files at its next scan
                    pass
                with dl_locked():
                    st = dl_load()
                    ids = {j["id"] for j in pend}
                    for j in st["jobs"]:
                        if j["id"] in ids:
                            j["scan"] = False
                            if any((j.get("m") or {}).values()):
                                meta_left[j["id"]] = 40
                    dl_save(st, False)
                meta_due = time.time() + 3
                did = True
            elif meta_left:
                did = True
                if time.time() >= meta_due:
                    meta_due = time.time() + 3
                    with dl_locked():
                        st = dl_load()
                    for gone in set(meta_left) - {x["id"] for x in st["jobs"]}:
                        meta_left.pop(gone, None)  # cleared from the list meanwhile
                    for j in st["jobs"]:
                        if j["id"] not in meta_left:
                            continue
                        try:
                            done = filler.apply(j)
                        except Exception:  # noqa: BLE001 – try again
                            done = False
                        meta_left[j["id"]] -= 1
                        if done or meta_left[j["id"]] <= 0:
                            meta_left.pop(j["id"], None)
                    with dl_locked():
                        st = dl_load()
                        for j in st["jobs"]:
                            if j["id"] not in meta_left:
                                j["m"] = {}
                        dl_save(st, False)
            idle = 0.0 if did else idle + 0.4
            if idle > 8:
                break
        time.sleep(0.4)
    with dl_locked():
        st = dl_load()
        st["beat"], st["pid"] = 0, 0
        dl_save(st, False)


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


def sync_get(conn):
    d = _read(os.path.join(config_dir(conn), "backups-redtok", "sync.json"))
    return {"keys": (d or {}).get("keys") or {}}


def sync_put(conn, keys):
    """The lists that sync between devices: per list the value (a JSON text) and the time of its last change; the newer one stays."""
    if not isinstance(keys, dict):
        raise ValueError("no data")
    folder = os.path.join(config_dir(conn), "backups-redtok")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, "sync.json")
    have = (_read(path) or {}).get("keys") or {}
    for k, e in keys.items():
        if not isinstance(e, dict) or not isinstance(e.get("v"), str) or not isinstance(e.get("t"), (int, float)):
            continue
        if len(e["v"]) > 20 * 1024 * 1024:
            continue
        cur = have.get(str(k))
        if cur is None or e["t"] >= cur.get("t", 0):
            have[str(k)] = {"v": e["v"], "t": e["t"]}
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "keys": have}, f)
    os.replace(tmp, path)
    return {"saved": True}


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
    if len(sys.argv) > 1 and sys.argv[1] == "--dljob":
        return dl_worker()
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
        elif mode == "dl_add":
            output = dl_add(conn, args)
        elif mode == "dl_status":
            output = dl_status(args)
        elif mode == "dl_ctl":
            output = dl_ctl(conn, args)
        elif mode == "conf":
            output = conf(conn)
        elif mode == "bk_load":
            output = bk_load(conn)
        elif mode == "bk_save":
            output = bk_save(conn, args.get("data"))
        elif mode == "sync_get":
            output = sync_get(conn)
        elif mode == "sync_put":
            output = sync_put(conn, args.get("keys"))
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
