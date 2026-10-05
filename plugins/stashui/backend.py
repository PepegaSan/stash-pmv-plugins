"""Stash UI – a small backend for what the browser can't do on its own.

Called through Stash's `runPluginOperation` (interface: raw):

* mode "funscript_list": every .funscript in the Stash library folders (to pick one in the player).
      args:   {"mode": "funscript_list", "scene_id": "12"}
      output: {"files": [{"path", "name", "dir", "size", "mtime", "paired"}], "current": "<path or null>",
               "truncated": bool}
  "paired": a video with the same name lies next to it (it already belongs to one); "current": the
  funscript the scene has now (next to its video).

* mode "funscript_save": give a scene a funscript. Stash finds funscripts by their name – next to
  the video, with the same name and the extension .funscript (video.mp4 → video.funscript) – so the
  file is written there; then the video is scanned again so Stash marks the scene as interactive.
  That's what keeps the choice: it stays with the video, also after a restart and in classic Stash.
      args:   {"mode": "funscript_save", "scene_id": "12", "source": "<a .funscript in the library>"}
          or  {"mode": "funscript_save", "scene_id": "12", "content": "<the .funscript as text>"}
      output: {"path": "...", "replaced": bool}
  The video's path comes from Stash (not from the browser); a source must lie in a library folder.
  A funscript that was there before is kept as "<name>.funscript.bak".

* mode "funscript_remove": the scene's funscript goes aside (renamed to .funscript.bak), Stash scans.
      args:   {"mode": "funscript_remove", "scene_id": "12"}
      output: {"removed": bool}

* mode "funscript_variants": the funscripts next to a scene's video that start with its name
  ("V.funscript", "V (Soft).funscript", "V - Hard.funscript" …), each read: length, speed stripes
  (for the heatmap), number of movements, a hash of the movements, problems.
      args:   {"mode": "funscript_variants", "scene_id": "12"}
      output: {"video", "duration", "variants": [{"path", "name", "label", "main", "length", "actions",
               "speed": [..], "peak", "hash", "issues": ["broken"|"unsorted"|"long"|"short"]}]}
  "long"/"short": the script is more than max(5 s, 5 %) longer, or max(10 s, 10 %) shorter than the video.

* mode "funscript_read": the text of one library funscript (the Handy gets a chosen variant this way).
      args:   {"mode": "funscript_read", "path": "<a .funscript in the library>"}   output: {"content"}

* mode "funscript_scan": all interactive scenes, checked: {"scanned", "unreachable",
  "problems": [{"id", "title", "screenshot", "variants": [{"name", "label", "issues", "length"}]}],
  "multi": [{"id", "title", "screenshot", "count"}]}

* mode "funscript_dupes": every .funscript in the library read, scripts with exactly the same movements
  (hash over at/pos – names and metadata don't matter) grouped.
      output: {"scanned", "truncated", "groups": [{"hash", "files": [{"path", "name", "dir", "size", "mtime",
               "length", "actions", "video"}]}], "aside": [{"path", "name", "dir", "restore"}]}
  "video": the video of the same name next to the script (it belongs to a scene), else null.

* mode "funscript_dupe_aside" {"paths": [...]}: duplicates go aside, x.funscript → x.funscriptdupe (nothing is
  deleted; Stash ignores the extension). Scripts that belong to a video: Stash scans that video again.
  mode "funscript_dupe_restore" {"paths": [... .funscriptdupe]}: the other way round (not over an existing file).
      output: {"done": [paths], "skipped": [{"path", "reason"}]}

* mode "funscript_overview": numbers for all interactive scenes: {"total", "scanned", "read", "with_variants",
  "with_problems", "issues": {"broken", "long", "short"}, "avg_speed" (units/s), "edges", "hist" (scripts per intensity
  range), "avg_cover", "intense", "calm" (scenes: id, title, screenshot, speed, gap, gap_at, gaps, cover),
  "gap_scenes", "longest_gaps"}. A gap is a pause in the movements of more than 20 s.

* mode "funscript_save_variant": an edited script becomes a new variant next to the video:
  "<video> (<label>).funscript" (a taken name gets " 2", " 3" …) – the original isn't touched.
      args:   {"mode": "funscript_save_variant", "scene_id": "12", "label": "Soft", "content": "<funscript text>"}
      output: {"path", "name"}
"""

import hashlib
import json
import os
import sys
import urllib.request

MAX_SIZE = 30 * 1024 * 1024


class Stash:
    def __init__(self, conn):
        conn = {str(k).lower(): v for k, v in (conn or {}).items()}
        host = str(conn.get("host") or "localhost")
        if host in ("0.0.0.0", ""):
            host = "127.0.0.1"
        if ":" in host and not host.startswith("["):
            host = f"[{host}]"
        self.url = f"{str(conn.get('scheme') or 'http').lower()}://{host}:{int(conn.get('port') or 9999)}/graphql"
        self.headers = {"Content-Type": "application/json"}
        if conn.get("apikey"):
            self.headers["ApiKey"] = str(conn["apikey"])
        cookie = conn.get("sessioncookie")
        if isinstance(cookie, dict):
            cookie = {str(k).lower(): v for k, v in cookie.items()}
            if cookie.get("value"):
                self.headers["Cookie"] = f"{cookie.get('name') or 'session'}={cookie['value']}"

    def gql(self, query, variables=None):
        req = urllib.request.Request(self.url, json.dumps({"query": query, "variables": variables or {}}).encode(), self.headers, method="POST")
        with urllib.request.urlopen(req, timeout=30) as res:
            d = json.load(res)
        if d.get("errors"):
            raise RuntimeError("Stash: " + "; ".join(e.get("message", "") for e in d["errors"]))
        return d["data"]


MAX_LIST = 20000
SKIP_DIRS = {".git", "$recycle.bin", "system volume information", "node_modules", ".trash", "@eadir"}


def libraries(stash):
    st = stash.gql("query { configuration { general { stashes { path excludeVideo } videoExtensions } } }")["configuration"]["general"]
    roots = [os.path.realpath(s["path"]) for s in (st.get("stashes") or []) if s.get("path")]
    exts = {"." + e.lower().lstrip(".") for e in (st.get("videoExtensions") or ["mp4", "m4v", "mov", "wmv", "avi", "mpg", "mpeg", "mkv", "webm", "flv"])}
    return roots, exts


def inside(path, roots):
    p = os.path.normcase(os.path.realpath(path))
    for r in roots:
        r = os.path.normcase(r)
        try:
            if os.path.commonpath([p, r]) == r:
                return True
        except ValueError:
            pass  # another drive
    return False


def scene_video(stash, sid):
    if not sid.isdigit():
        raise ValueError("no scene")
    files = stash.gql("query($id: ID!) { findScene(id: $id) { files { path } } }", {"id": sid})["findScene"]
    if not files or not files.get("files"):
        raise ValueError("the scene has no file")
    return files["files"][0]["path"]


def funscript_list(stash, args):
    roots, exts = libraries(stash)
    current = None
    sid = str(args.get("scene_id") or "")
    if sid:
        try:
            f = os.path.splitext(scene_video(stash, sid))[0] + ".funscript"
            current = f if os.path.isfile(f) else None
        except Exception:
            pass
    out = []
    truncated = False
    for root in roots:
        for d, dirs, files in os.walk(root):
            dirs[:] = [x for x in dirs if x.lower() not in SKIP_DIRS and not x.startswith(".")]
            low = {f.lower() for f in files}
            for f in files:
                if not f.lower().endswith(".funscript"):
                    continue
                p = os.path.join(d, f)
                stem = f[: -len(".funscript")].lower()
                try:
                    stt = os.stat(p)
                except OSError:
                    continue
                out.append({"path": p, "name": f, "dir": d, "size": stt.st_size, "mtime": int(stt.st_mtime),
                            "paired": any(stem + e in low for e in exts)})
                if len(out) >= MAX_LIST:
                    truncated = True
                    break
            if truncated:
                break
        if truncated:
            break
    return {"files": out, "current": current, "truncated": truncated}


def funscript_save(stash, args):
    sid = str(args.get("scene_id") or "")
    if not sid.isdigit():
        raise ValueError("no scene")
    source = str(args.get("source") or "")
    if source:
        roots, _ = libraries(stash)
        if not source.lower().endswith(".funscript") or not os.path.isfile(source) or not inside(source, roots):
            raise ValueError("that funscript isn't in a Stash library folder")
        with open(source, encoding="utf-8-sig", errors="replace") as f:
            args = dict(args, content=f.read())
    content = str(args.get("content") or "")
    if len(content.encode()) > MAX_SIZE:
        raise ValueError("the funscript is too big")
    try:
        fs = json.loads(content)
    except Exception:
        raise ValueError("that's not a funscript (not JSON)")
    acts = fs.get("actions") if isinstance(fs, dict) else None
    if not isinstance(acts, list) or not acts or not all(isinstance(a, dict) and "at" in a and "pos" in a for a in acts[:50]):
        raise ValueError("that's not a funscript (no actions with at/pos)")
    files = stash.gql("query($id: ID!) { findScene(id: $id) { files { path } } }", {"id": sid})["findScene"]
    if not files or not files.get("files"):
        raise ValueError("the scene has no file")
    video = files["files"][0]["path"]
    if not os.path.isfile(video):
        raise ValueError(f"the video file can't be reached from here: {video}")
    target = os.path.splitext(video)[0] + ".funscript"  # like Stash: the extension replaced
    if source and os.path.normcase(os.path.realpath(source)) == os.path.normcase(os.path.realpath(target)):
        # it's already the one next to the video – only let Stash look again
        stash.gql("mutation($i: ScanMetadataInput!) { metadataScan(input: $i) }", {"i": {"paths": [video], "rescan": True}})
        return {"path": target, "replaced": False}
    replaced = os.path.exists(target)
    if replaced:
        os.replace(target, target + ".bak")
    tmp = target + ".part"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    os.replace(tmp, target)
    # Stash notices the funscript when it scans the video again
    stash.gql("mutation($i: ScanMetadataInput!) { metadataScan(input: $i) }", {"i": {"paths": [video], "rescan": True}})
    return {"path": target, "replaced": replaced}


def funscript_remove(stash, args):
    video = scene_video(stash, str(args.get("scene_id") or ""))
    target = os.path.splitext(video)[0] + ".funscript"
    if not os.path.isfile(target):
        return {"removed": False}
    os.replace(target, target + ".bak")
    stash.gql("mutation($i: ScanMetadataInput!) { metadataScan(input: $i) }", {"i": {"paths": [video], "rescan": True}})
    return {"removed": True}


# ---------- Variants: several funscripts for one video ----------
BUCKETS = 160  # the heatmap of a script: this many stripes
GAP_MS = 20000  # a pause in the movements longer than this counts as a gap
SPEED_UNITS = 400  # units per second that count as "full intensity" in the picture (the front end scales)


def scene_file(stash, sid):
    if not sid.isdigit():
        raise ValueError("no scene")
    sc = stash.gql("query($id: ID!) { findScene(id: $id) { files { path duration } } }", {"id": sid})["findScene"]
    if not sc or not sc.get("files"):
        raise ValueError("the scene has no file")
    return sc["files"][0]["path"], float(sc["files"][0].get("duration") or 0)


def find_variants(video, exts):
    """The funscripts next to a video that start with its name: "V.funscript", "V (Soft).funscript",
    "V - Hard.funscript" … → [(path, label)], the one with the exact name first (label "")."""
    d = os.path.dirname(video)
    stem = os.path.splitext(os.path.basename(video))[0]
    low = stem.lower()
    try:
        names = os.listdir(d)
    except OSError:
        return []
    others = {os.path.splitext(n)[0].lower() for n in names if os.path.splitext(n)[1].lower() in exts} - {low}
    out = []
    for n in sorted(names, key=str.lower):
        if not n.lower().endswith(".funscript"):
            continue
        s = n[: -len(".funscript")]
        sl = s.lower()
        if not sl.startswith(low):
            continue
        rest = s[len(stem):]
        if rest and rest[0].isalnum():
            continue  # "Video2" – another name
        if sl in others or any(len(o) > len(low) and o.startswith(low) and sl.startswith(o) and (len(sl) == len(o) or not sl[len(o)].isalnum()) for o in others):
            continue  # that one belongs to another video ("Video 2.funscript" next to "Video 2.mp4")
        label = rest.strip(" -_.()[]{}") if rest else ""
        out.append((os.path.join(d, n), label))
    out.sort(key=lambda x: (x[1] != "", x[1].lower()))
    return out


def analyze(path, duration, buckets=True):
    """Read a funscript: length, speed stripes for the heatmap, a hash over the movements and problems:
    broken (not readable / no movements), unsorted, long / short (against the video's length)."""
    info = {"path": path, "name": os.path.basename(path), "issues": []}
    try:
        st = os.stat(path)
        info.update(size=st.st_size, mtime=int(st.st_mtime))
        with open(path, encoding="utf-8-sig", errors="replace") as f:
            fs = json.load(f)
        acts = fs.get("actions") if isinstance(fs, dict) else None
        if not isinstance(acts, list):
            raise ValueError
    except Exception:
        info.update(actions=0, length=0, hash="", speed=[], issues=["broken"])
        return info
    good = []
    for a in acts:
        try:
            at, pos = float(a["at"]), float(a["pos"])
        except Exception:
            continue
        if at == at and pos == pos and at >= 0:
            good.append((at, pos))
    if len(good) < 2 or len(good) < len(acts) * 0.95:
        info["issues"].append("broken")
    if any(good[i][0] > good[i + 1][0] for i in range(len(good) - 1)):
        info["issues"].append("unsorted")
        good.sort()
    length = good[-1][0] / 1000 if good else 0
    info.update(actions=len(good), length=round(length, 1))
    # intensity (units moved per second over the whole script) and pauses (a gap between two movements; the start counts too)
    if good and length:
        travel = sum(abs(p1 - p0) for (_, p0), (_, p1) in zip(good, good[1:]))
        info["mean_speed"] = round(travel / length)
        gaps = [(good[0][0], 0)] + [(b[0] - a[0], a[0]) for a, b in zip(good, good[1:])]
        g, at = max(gaps)
        info.update(gap_max=round(g / 1000, 1), gap_at=round(at / 1000, 1), gaps=sum(1 for x, _ in gaps if x > GAP_MS))
    # the same movements → the same hash (name, metadata, rounding noise don't matter)
    h = hashlib.sha1()
    for at, pos in good:
        h.update(f"{round(at)}:{round(pos)};".encode())
    info["hash"] = h.hexdigest()[:16] if good else ""
    if duration and length and "broken" not in info["issues"]:
        if length > duration + max(5, duration * 0.05):
            info["issues"].append("long")
        elif length < duration - max(10, duration * 0.1):
            info["issues"].append("short")
    if buckets:
        span = max(good[-1][0], 1) if good else 1
        sp = [0.0] * BUCKETS
        w = span / BUCKETS  # ms per stripe
        for (a0, p0), (a1, p1) in zip(good, good[1:]):
            if a1 <= a0:
                continue
            d = abs(p1 - p0) / (a1 - a0)  # movement per ms, spread over the stripes the stroke touches
            for i in range(int(a0 / w), min(BUCKETS - 1, int(a1 / w)) + 1):
                ov = min(a1, (i + 1) * w) - max(a0, i * w)
                if ov > 0:
                    sp[i] += d * ov
        info["speed"] = [min(999, round(x / (w / 1000))) for x in sp]
        info["peak"] = max(info["speed"]) if good else 0
    return info


def funscript_variants(stash, args):
    video, duration = scene_file(stash, str(args.get("scene_id") or ""))
    _, exts = libraries(stash)
    main = os.path.splitext(video)[0] + ".funscript"
    out = []
    for p, label in find_variants(video, exts):
        a = analyze(p, duration)
        a["label"] = label
        a["main"] = os.path.normcase(p) == os.path.normcase(main)
        out.append(a)
    return {"video": video, "duration": duration, "variants": out}


def funscript_read(stash, args):
    path = str(args.get("path") or "")
    roots, _ = libraries(stash)
    if not path.lower().endswith(".funscript") or not os.path.isfile(path) or not inside(path, roots):
        raise ValueError("that funscript isn't in a Stash library folder")
    if os.path.getsize(path) > MAX_SIZE:
        raise ValueError("the funscript is too big")
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        return {"content": f.read()}


def funscript_scan(stash, args):
    """All interactive scenes: which ones have a problem (broken / too long / too short), which have several scripts."""
    d = stash.gql("query { findScenes(scene_filter: {interactive: true}, filter: {per_page: -1}) { scenes { id title paths { screenshot } files { path duration } } } }")
    _, exts = libraries(stash)
    problems, multi, n, unreachable = [], [], 0, 0
    for sc in d["findScenes"]["scenes"]:
        if not sc.get("files"):
            continue
        video, dur = sc["files"][0]["path"], float(sc["files"][0].get("duration") or 0)
        if not os.path.isdir(os.path.dirname(video)):
            unreachable += 1
            continue
        n += 1
        vs = find_variants(video, exts)
        bad = []
        for p, label in vs:
            a = analyze(p, dur, buckets=False)
            iss = [i for i in a["issues"] if i != "unsorted"]
            if iss:
                bad.append({"name": a["name"], "label": label, "issues": iss, "length": a["length"]})
        row = {"id": sc["id"], "title": sc.get("title") or os.path.basename(video), "screenshot": (sc.get("paths") or {}).get("screenshot"), "duration": dur}
        if bad:
            problems.append(dict(row, variants=bad))
        if len(vs) > 1:
            multi.append(dict(row, count=len(vs)))
    return {"scanned": n, "unreachable": unreachable, "problems": problems, "multi": multi}


# ---------- Duplicates: the same movements in more than one file ----------
ASIDE = ".funscriptdupe"  # a set-aside duplicate: "x.funscript" ↔ "x.funscriptdupe" (Stash doesn't look at it)


def paired_video(path, exts):
    """The video with the same name next to a funscript (or None)."""
    stem = os.path.splitext(path)[0]
    for e in sorted(exts):
        for cand in (stem + e, stem + e.upper()):
            if os.path.isfile(cand):
                return cand
    return None


def funscript_dupes(stash, args):
    """Funscripts in the library whose movements are exactly the same (name, metadata, formatting don't matter),
    grouped – plus the ones already set aside (.funscriptdupe)."""
    roots, exts = libraries(stash)
    groups, aside, n, truncated = {}, [], 0, False
    for root in roots:
        for d, dirs, files in os.walk(root):
            dirs[:] = [x for x in dirs if x.lower() not in SKIP_DIRS and not x.startswith(".")]
            for f in files:
                low = f.lower()
                p = os.path.join(d, f)
                if low.endswith(ASIDE):
                    aside.append({"path": p, "name": f, "dir": d, "restore": p[: -len("dupe")]})
                elif low.endswith(".funscript"):
                    n += 1
                    if n > MAX_LIST:
                        truncated = True
                        continue
                    a = analyze(p, 0, buckets=False)
                    if a["hash"] and "broken" not in a["issues"]:
                        v = paired_video(p, exts)
                        groups.setdefault(a["hash"], []).append({"path": p, "name": f, "dir": d, "size": a["size"], "mtime": a["mtime"],
                                                                 "length": a["length"], "actions": a["actions"], "video": os.path.basename(v) if v else None})
    out = [{"hash": h, "files": sorted(fl, key=lambda x: (x["video"] is None, x["mtime"]))} for h, fl in groups.items() if len(fl) > 1]
    out.sort(key=lambda g: (-len(g["files"]), g["files"][0]["name"].lower()))
    return {"scanned": min(n, MAX_LIST), "groups": out, "aside": sorted(aside, key=lambda x: x["path"].lower()), "truncated": truncated}


def funscript_dupe_aside(stash, args):
    """Put duplicates aside: x.funscript → x.funscriptdupe (nothing is deleted). A script that belongs to a video
    (same name next to it) makes that scene lose its funscript – Stash scans the video again then."""
    roots, exts = libraries(stash)
    done, skipped, scan = [], [], []
    for p in args.get("paths") or []:
        p = str(p)
        if not p.lower().endswith(".funscript") or not os.path.isfile(p) or not inside(p, roots):
            skipped.append({"path": p, "reason": "not a funscript in a library folder"})
        elif os.path.exists(p + "dupe"):
            skipped.append({"path": p, "reason": "already a set-aside file with that name"})
        else:
            v = paired_video(p, exts)
            os.rename(p, p + "dupe")
            done.append(p)
            if v:
                scan.append(v)
    if scan:
        stash.gql("mutation($i: ScanMetadataInput!) { metadataScan(input: $i) }", {"i": {"paths": scan, "rescan": True}})
    return {"done": done, "skipped": skipped}


def funscript_dupe_restore(stash, args):
    """Bring set-aside files back: x.funscriptdupe → x.funscript (not over an existing file)."""
    roots, exts = libraries(stash)
    done, skipped, scan = [], [], []
    for p in args.get("paths") or []:
        p = str(p)
        t = p[: -len("dupe")]
        if not p.lower().endswith(ASIDE) or not os.path.isfile(p) or not inside(p, roots):
            skipped.append({"path": p, "reason": "not a set-aside file in a library folder"})
        elif os.path.exists(t):
            skipped.append({"path": p, "reason": "a funscript with that name exists already"})
        else:
            os.rename(p, t)
            done.append(t)
            v = paired_video(t, exts)
            if v:
                scan.append(v)
    if scan:
        stash.gql("mutation($i: ScanMetadataInput!) { metadataScan(input: $i) }", {"i": {"paths": scan, "rescan": True}})
    return {"done": done, "skipped": skipped}


def funscript_save_variant(stash, args):
    """Save an edited script as a new variant next to the video: "<video> (<label>).funscript". Never overwrites –
    a taken name gets " 2", " 3" … – and the original stays as it is."""
    sid = str(args.get("scene_id") or "")
    video, _ = scene_file(stash, sid)
    if not os.path.isfile(video):
        raise ValueError(f"the video file can't be reached from here: {video}")
    content = str(args.get("content") or "")
    if len(content.encode()) > MAX_SIZE:
        raise ValueError("the funscript is too big")
    try:
        fs = json.loads(content)
    except Exception:
        raise ValueError("that's not a funscript (not JSON)")
    acts = fs.get("actions") if isinstance(fs, dict) else None
    if not isinstance(acts, list) or not acts or not all(isinstance(a, dict) and "at" in a and "pos" in a for a in acts[:50]):
        raise ValueError("that's not a funscript (no actions with at/pos)")
    label = "".join(c for c in str(args.get("label") or "") if c not in '\\/:*?"<>|' and c.isprintable()).strip(" .")[:40] or "Edited"
    base = os.path.splitext(video)[0] + f" ({label})"
    target, n = base + ".funscript", 1
    while os.path.exists(target):
        n += 1
        target = f"{base} {n}.funscript"
    tmp = target + ".part"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    os.replace(tmp, target)
    return {"path": target, "name": os.path.basename(target)}


def funscript_overview(stash, args):
    """Numbers for all interactive scenes: scripts, variants, problems, intensity (histogram, most intense / calmest),
    pauses (scenes with gaps, the longest), how much of the video the script covers."""
    d = stash.gql("query { stats { scene_count } findScenes(scene_filter: {interactive: true}, filter: {per_page: -1}) { scenes { id title paths { screenshot } files { path duration } } } }")
    _, exts = libraries(stash)
    rows, n, with_var, bad, unreachable = [], 0, 0, 0, 0
    kinds = {"broken": 0, "long": 0, "short": 0}
    for sc in d["findScenes"]["scenes"]:
        if not sc.get("files"):
            continue
        video, dur = sc["files"][0]["path"], float(sc["files"][0].get("duration") or 0)
        if not os.path.isdir(os.path.dirname(video)):
            unreachable += 1
            continue
        n += 1
        vs = find_variants(video, exts)
        if len(vs) > 1:
            with_var += 1
        main_path = os.path.splitext(video)[0] + ".funscript"
        flagged = False
        for p, label in vs:
            a = analyze(p, dur, buckets=False)
            for k in ("broken", "long", "short"):
                if k in a["issues"]:
                    kinds[k] += 1
                    flagged = True
            if os.path.normcase(p) == os.path.normcase(main_path) and a.get("mean_speed") is not None:
                rows.append({"id": sc["id"], "title": sc.get("title") or os.path.basename(video), "screenshot": (sc.get("paths") or {}).get("screenshot"),
                             "speed": a["mean_speed"], "gap": a["gap_max"], "gap_at": a["gap_at"], "gaps": a["gaps"], "cover": round(min(1.0, a["length"] / dur), 2) if dur else 1})
        bad += flagged
    edges = [0, 50, 100, 150, 200, 300, 400]  # units per second
    hist = [0] * len(edges)
    for r in rows:
        hist[max(i for i, e in enumerate(edges) if r["speed"] >= e)] += 1
    by_speed = sorted(rows, key=lambda r: r["speed"])
    return {
        "total": int(d["stats"]["scene_count"]), "scanned": n, "unreachable": unreachable, "read": len(rows), "with_variants": with_var, "with_problems": bad, "issues": kinds,
        "avg_speed": round(sum(r["speed"] for r in rows) / len(rows)) if rows else 0, "edges": edges, "hist": hist,
        "avg_cover": round(sum(r["cover"] for r in rows) / len(rows), 2) if rows else 0,
        "intense": by_speed[::-1][:6], "calm": by_speed[:6],
        "gap_scenes": sum(1 for r in rows if r["gaps"]), "longest_gaps": sorted((r for r in rows if r["gaps"]), key=lambda r: -r["gap"])[:10],
    }


def main():
    data = json.loads(sys.stdin.read() or "{}")
    args = data.get("args") or {}
    mode = str(args.get("mode") or "")
    try:
        if mode == "funscript_overview":
            out = funscript_overview(Stash(data.get("server_connection")), args)
        elif mode == "funscript_save_variant":
            out = funscript_save_variant(Stash(data.get("server_connection")), args)
        elif mode == "funscript_dupes":
            out = funscript_dupes(Stash(data.get("server_connection")), args)
        elif mode == "funscript_dupe_aside":
            out = funscript_dupe_aside(Stash(data.get("server_connection")), args)
        elif mode == "funscript_dupe_restore":
            out = funscript_dupe_restore(Stash(data.get("server_connection")), args)
        elif mode == "funscript_variants":
            out = funscript_variants(Stash(data.get("server_connection")), args)
        elif mode == "funscript_read":
            out = funscript_read(Stash(data.get("server_connection")), args)
        elif mode == "funscript_scan":
            out = funscript_scan(Stash(data.get("server_connection")), args)
        elif mode == "funscript_list":
            out = funscript_list(Stash(data.get("server_connection")), args)
        elif mode == "funscript_save":
            out = funscript_save(Stash(data.get("server_connection")), args)
        elif mode == "funscript_remove":
            out = funscript_remove(Stash(data.get("server_connection")), args)
        else:
            raise ValueError(f"unknown mode: {mode or '(empty)'}")
    except Exception as e:
        print(f"\x01e\x02[Stash UI] {e}", file=sys.stderr, flush=True)
        print(json.dumps({"error": str(e)}))
        return
    print(json.dumps({"output": out}))


if __name__ == "__main__":
    main()
