"""Build the plugin source.

    python tools/build.py [--out dist] [--repo owner/name] [--sync-only]

1. Sync: the PMV Generator plugin uses the basics of Stash UI (styles, GraphQL, helpers,
   tag picker, image analysis) – they're copied from plugins/pepega-stashui into plugins/pepega-pmvGenerator
   (edit them in pepega-stashui, then run this script). The generator itself (pmvgen.js, beats.js, …)
   lives only in plugins/pepega-pmvGenerator; its beats.js is also copied to plugins/mediaStorm/web.
   Media Storm's rgbackend.py (RedGifs) is copied to plugins/pepega-pmvGenerator.
2. Stamp: every app page gets an import map with version stamps, so browsers never mix
   cached old modules with new ones.
3. Package: every plugin folder is zipped and listed in <out>/index.yml – the file Stash reads
   when you add this repository as a plugin source.
"""

import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGINS = os.path.join(ROOT, "plugins")
UI = os.path.join(PLUGINS, "pepega-stashui")
UI_ORIG = os.path.join(PLUGINS, "stashui")
GEN = os.path.join(PLUGINS, "pepega-pmvGenerator")
GEN_ORIG = os.path.join(PLUGINS, "pmvGenerator")
STORM = os.path.join(PLUGINS, "mediaStorm")

SHARED = [
    "app/js/theme.js",
    "app/app.css",
    "app/stage.css",
    "app/admin.css",
    "app/js/api.js",
    "app/js/ui.js",
    "app/js/scale.js",
    "app/js/advfilter.js",
    "app/js/interactive.js",
    "app/js/i18n.js",
    "app/js/locales/zh-CN.js",
    "app/js/locales/ja.js",
    "app/js/locales/vi.js",
    "app/js/locales/fr.js",
    "app/js/locales/es.js",
    "app/js/locales/de.js",
    "app/js/locales/pl.js",
    "app/js/pmvsmart.js",
    "app/js/audiox.js",
    "app/js/views/tagpicker.js",
    "app/js/views/perfpicker.js",
    "app/js/playlists.js",
    "app/js/standings.js",
]
SKIP_DIRS = {"__pycache__", ".cache", "tools"}
PLACEHOLDER_URL = "https://github.com/OWNER/REPO"


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def write(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(s)


def sync():
    """Shared UI files: Pepega test UI is the source; originals stay in sync without fork-only files."""
    for rel in SHARED:
        blob = read(os.path.join(UI, rel))
        write(os.path.join(GEN, rel), blob)
        if os.path.isfile(os.path.join(UI_ORIG, rel)):
            write(os.path.join(UI_ORIG, rel), blob)
        if os.path.isfile(os.path.join(GEN_ORIG, rel)):
            write(os.path.join(GEN_ORIG, rel), blob)
    write(os.path.join(STORM, "web", "beats.js"), read(os.path.join(GEN, "app", "js", "beats.js")))
    # RedGifs backend: Media Storm's is the source, the PMV Generator uses the same one
    rg = read(os.path.join(STORM, "rgbackend.py")).replace('"""Media Storm – backend for RedGifs', '"""RedGifs backend (copied from Media Storm by tools/build.py)', 1)
    write(os.path.join(GEN, "rgbackend.py"), rg)
    if os.path.isfile(os.path.join(GEN_ORIG, "rgbackend.py")):
        write(os.path.join(GEN_ORIG, "rgbackend.py"), rg)


def version_of(plugin_dir):
    yml = read(os.path.join(plugin_dir, os.path.basename(plugin_dir) + ".yml"))
    m = re.search(r"^version:\s*(\S+)", yml, re.M)
    return m.group(1) if m else "0"


def stamp(app, ver):
    """Import map + ?v= stamps for index.html in an app folder."""
    mods = []
    for root, _, files in os.walk(os.path.join(app, "js")):
        for f in files:
            if f.endswith(".js"):
                mods.append(os.path.relpath(os.path.join(root, f), app).replace("\\", "/"))
    imap = {"imports": {"./" + m: "./" + m + "?v=" + ver for m in sorted(mods)}}
    p = os.path.join(app, "index.html")
    s = read(p)
    s = re.sub(r'\s*<script type="importmap">.*?</script>', "", s, flags=re.S)
    block = '  <script type="importmap">\n' + json.dumps(imap, indent=2).replace("\n", "\n  ") + "\n  </script>\n"
    s = s.replace('  <script type="module"', block + '  <script type="module"', 1)
    s = re.sub(r'href="([\w-]+)\.css(\?v=[^"]*)?"', lambda m: f'href="{m.group(1)}.css?v={ver}"', s)
    s = re.sub(r'src="(js/[\w/-]+)\.js(\?v=[^"]*)?"', lambda m: f'src="{m.group(1)}.js?v={ver}"', s)
    write(p, s)


def yml_field(yml, key):
    m = re.search(rf"^{key}:\s*(.+)$", yml, re.M)
    return m.group(1).strip() if m else ""


def last_change(path):
    try:
        out = subprocess.run(["git", "log", "-n", "1", "--date=format:%Y-%m-%d %H:%M:%S %z", "--pretty=format:%ad", "--", path],
                             cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
        if out:
            return out
    except (OSError, subprocess.CalledProcessError):
        pass
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S +0000")


def package(out, repo_url):
    os.makedirs(out, exist_ok=True)
    entries = []
    for pid in sorted(os.listdir(PLUGINS)):
        src = os.path.join(PLUGINS, pid)
        yml_path = os.path.join(src, pid + ".yml")
        if not os.path.isfile(yml_path):
            continue
        zpath = os.path.join(out, pid + ".zip")
        with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
            for root, dirs, files in os.walk(src):
                dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
                for f in sorted(files):
                    full = os.path.join(root, f)
                    rel = os.path.relpath(full, src).replace("\\", "/")
                    data = read(full).encode("utf-8") if f.endswith((".yml", ".md", ".js", ".css", ".html", ".py")) else open(full, "rb").read()
                    if f == pid + ".yml" and repo_url:
                        data = data.decode("utf-8").replace(PLACEHOLDER_URL, repo_url).encode("utf-8")
                    info = zipfile.ZipInfo(rel, date_time=(2020, 1, 1, 0, 0, 0))
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = 0o644 << 16
                    z.writestr(info, data)
        with open(zpath, "rb") as f:
            digest = hashlib.sha256(f.read()).hexdigest()
        yml = read(yml_path)
        entries.append({
            "id": pid,
            "name": yml_field(yml, "name"),
            "description": yml_field(yml, "description"),
            "version": yml_field(yml, "version"),
            "date": last_change(os.path.relpath(src, ROOT)),
            "path": pid + ".zip",
            "sha256": digest,
        })
    lines = []
    for e in entries:
        lines += [
            f"- id: {e['id']}",
            f"  name: {json.dumps(e['name'], ensure_ascii=False)}",
            "  metadata:",
            f"    description: {json.dumps(e['description'], ensure_ascii=False)}",
            f"  version: {json.dumps(e['version'])}",
            f"  date: {json.dumps(e['date'])}",
            f"  path: {e['path']}",
            f"  sha256: {e['sha256']}",
        ]
    write(os.path.join(out, "index.yml"), "\n".join(lines) + "\n")
    return entries


def landing(out, entries, repo_url):
    rows = "\n".join(f"<li><b>{e['name']}</b> {e['version']} – {e['description']}</li>" for e in entries)
    link = f'<p><a href="{repo_url}">{repo_url}</a></p>' if repo_url else ""
    write(os.path.join(out, "index.html"), f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stash plugin source</title>
<style>body{{max-width:760px;margin:40px auto;padding:0 16px;font:16px/1.5 system-ui,sans-serif;color:#2a1a26;background:#fff7fa}}
code{{padding:2px 6px;border-radius:4px;background:#f3dbe6}}li{{margin:8px 0}}</style></head>
<body><h1>Stash plugin source</h1>
<p>In Stash, open <b>Settings → Plugins → Available Plugins → Add Source</b> and enter this page's address followed by <code>index.yml</code>:</p>
<p><code id="u">index.yml</code></p>
<ul>{rows}</ul>{link}
<script>document.getElementById("u").textContent = new URL("index.yml", location.href).href;</script>
</body></html>
""")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "dist"))
    ap.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""), help="owner/name, used for the plugins' project link")
    ap.add_argument("--sync-only", action="store_true", help="only sync shared files and stamp versions")
    a = ap.parse_args()
    sync()
    stamp(os.path.join(UI, "app"), version_of(UI))
    stamp(os.path.join(GEN, "app"), version_of(GEN))
    if os.path.isfile(os.path.join(UI_ORIG, "stashui.yml")):
        stamp(os.path.join(UI_ORIG, "app"), version_of(UI_ORIG))
    if os.path.isfile(os.path.join(GEN_ORIG, "pmvGenerator.yml")):
        stamp(os.path.join(GEN_ORIG, "app"), version_of(GEN_ORIG))
    if a.sync_only:
        print("synced and stamped")
        return
    repo_url = f"https://github.com/{a.repo}" if a.repo else ""
    if os.path.isdir(a.out):
        shutil.rmtree(a.out)
    entries = package(a.out, repo_url)
    landing(a.out, entries, repo_url)
    for e in entries:
        print(f"{e['id']:<14} {e['version']:<8} {e['sha256'][:12]}")
    print("written to", a.out)


if __name__ == "__main__":
    main()
