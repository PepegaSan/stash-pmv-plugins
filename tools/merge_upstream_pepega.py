"""Merge upstream stashui / pmvGenerator into Pepega forks without losing fork-only files."""

import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGINS = os.path.join(ROOT, "plugins")
UPSTREAM = "upstream/main"

PEPEGA_STASHUI_KEEP = [
    "pepega-stashui.yml",
    "classic/classic.js",
    "app/js/plugin-host.js",
    "app/js/views/player.js",
    "app/js/views/plugins.js",
]

PEPEGA_PMV_KEEP = [
    "pepega-pmvGenerator.yml",
    "pmvGenerator.js",
    "pmvGenerator.css",
    "app/js/config.js",
    "app/index.html",
]

API_MARKER_SNIPPET = """
  if (data && /sceneMarker(Create|Update|Destroy)/i.test(query)) {
    const input = (variables && (variables.input || variables.i)) || {};
    window.dispatchEvent(
      new CustomEvent("kb:scene-markers-changed", {
        detail: {
          sceneId: input.scene_id != null ? input.scene_id : null,
          marker: data.sceneMarkerCreate || data.sceneMarkerUpdate || null,
        },
      })
    );
  }
"""


def git_show(path):
    out = subprocess.run(
        ["git", "show", f"{UPSTREAM}:{path}"],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if out.returncode != 0:
        return None
    return out.stdout


def list_upstream_tree(prefix):
    out = subprocess.run(
        ["git", "ls-tree", "-r", "--name-only", UPSTREAM, prefix],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return [p for p in out.stdout.splitlines() if p.startswith(prefix)]


def backup_files(base, keep_rels, backup_root):
    os.makedirs(backup_root, exist_ok=True)
    for rel in keep_rels:
        src = os.path.join(base, rel)
        if not os.path.isfile(src):
            continue
        dst = os.path.join(backup_root, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)


def restore_files(base, keep_rels, backup_root):
    for rel in keep_rels:
        src = os.path.join(backup_root, rel.replace("/", os.sep))
        if not os.path.isfile(src):
            continue
        dst = os.path.join(base, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)


def merge_tree(upstream_prefix, dest_dir, skip_names):
    paths = list_upstream_tree(upstream_prefix)
    upstream_name = upstream_prefix.split("/")[-1]
    for full in paths:
        rel = os.path.relpath(full, upstream_prefix)
        if rel.replace("\\", "/") in skip_names:
            continue
        if rel.endswith(f"{upstream_name}.yml"):
            continue
        data = git_show(full)
        if data is None:
            continue
        out = os.path.join(dest_dir, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "wb") as f:
            f.write(data)


def patch_pepega_main(path):
    """Re-apply Pepega fork hooks after upstream main.js is merged in."""
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as f:
        s = f.read()
    if "awaitPluginHostFor" in s and "pepega-pmvGenerator" in s:
        return
    if 'import { bootPluginHost } from "./plugin-host.js";' not in s:
        s = s.replace(
            'import { visibleRail } from "./railcfg.js";\n',
            'import { visibleRail } from "./railcfg.js";\n'
            'import { bootPluginHost } from "./plugin-host.js";\n\n'
            "let pluginHostReady = Promise.resolve();\n\n",
            1,
        )
    else:
        s = s.replace(
            "const pluginHostReady = bootPluginHost();\n",
            "let pluginHostReady = Promise.resolve();\n",
            1,
        )
    old_route = (
        "async function route() {\n"
        "  try {\n"
        "    await pluginHostReady;\n"
        "  } catch (err) {\n"
        '    console.error("[Stash UI] plugin host failed", err);\n'
        "  }\n"
        "  const r = parseHash();"
    )
    new_route = (
        "async function awaitPluginHostFor(view) {\n"
        '  if (view !== "player" && view !== "plugins") return;\n'
        "  try {\n"
        "    await pluginHostReady;\n"
        "  } catch (err) {\n"
        '    console.error("[Stash UI] plugin host failed", err);\n'
        "  }\n"
        "}\n"
        "async function route() {\n"
        "  const r = parseHash();\n"
        "  await awaitPluginHostFor(r.view);"
    )
    if old_route in s:
        s = s.replace(old_route, new_route, 1)
    elif "await awaitPluginHostFor(r.view)" not in s:
        s = s.replace(
            "async function route() {\n  const r = parseHash();",
            new_route,
            1,
        )
    if "pluginHostReady = bootPluginHost();" not in s:
        s = s.replace(
            "  renderRail();\n  try {\n    app.favId = await favoriteTagId(false);",
            "  renderRail();\n  pluginHostReady = bootPluginHost();\n  try {\n    app.favId = await favoriteTagId(false);",
            1,
        )
    s = s.replace(
        'export const PMV_PAGE = "/plugin/pmvGenerator/assets/index.html?from=stashui";',
        'export const PMV_PAGE = "/plugin/pepega-pmvGenerator/assets/index.html?from=pepega-stashui";',
    )
    s = s.replace(
        'const pmv = plugins.find((p) => p.enabled && (norm(p.id) === "pmvgenerator" || norm(p.name) === "pmvgenerator"));',
        "const pmv = plugins.find(\n"
        '      (p) => p.enabled && (norm(p.id) === "pepegapmvgenerator" || norm(p.name) === "pmvgeneratorpepega")\n'
        "    );",
    )
    s = s.replace(
        'const OWN = new Set(["stashui", "mediastorm", "pmvgenerator"]);',
        'const OWN = new Set(["pepega-stashui", "mediastorm", "pepegapmvgenerator"]);',
    )
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(s)


def patch_api_js(path):
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as f:
        s = f.read()
    if "kb:scene-markers-changed" in s:
        return
    needle = "  return json.data;"
    if needle not in s:
        print("warn: could not patch api.js marker events", file=sys.stderr)
        return
    insert = "  const data = json.data;" + API_MARKER_SNIPPET + "\n  return data;"
    s = s.replace("  const data = json.data;\n  return data;", insert, 1)
    if "const data = json.data" not in s or "kb:scene-markers-changed" not in s:
        s = s.replace(
            needle,
            "  const data = json.data;" + API_MARKER_SNIPPET + "\n  return data;",
            1,
        )
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(s)


def write_pepega_yml(path, upstream_version):
    with open(path, encoding="utf-8") as f:
        s = f.read()
    import re

    s = re.sub(r"^version:\s*\S+", f"version: {upstream_version}", s, count=1, flags=re.M)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(s)


def upstream_version(yml_path):
    data = git_show(yml_path)
    if not data:
        return "0"
    import re

    m = re.search(rb"^version:\s*(\S+)", data, re.M)
    return m.group(1).decode() if m else "0"


def main():
    stashui_v = upstream_version("plugins/stashui/stashui.yml")
    pmv_v = upstream_version("plugins/pmvGenerator/pmvGenerator.yml")

    pepega_ui = os.path.join(PLUGINS, "pepega-stashui")
    pepega_pmv = os.path.join(PLUGINS, "pepega-pmvGenerator")
    bui = os.path.join(ROOT, ".merge_backup_pepega_stashui")
    bpmv = os.path.join(ROOT, ".merge_backup_pepega_pmv")

    backup_files(pepega_ui, PEPEGA_STASHUI_KEEP, bui)
    backup_files(pepega_pmv, PEPEGA_PMV_KEEP, bpmv)

    skip = set(PEPEGA_STASHUI_KEEP)
    merge_tree("plugins/stashui", pepega_ui, skip)
    restore_files(pepega_ui, PEPEGA_STASHUI_KEEP, bui)
    write_pepega_yml(os.path.join(pepega_ui, "pepega-stashui.yml"), stashui_v)
    patch_api_js(os.path.join(pepega_ui, "app/js/api.js"))
    patch_pepega_main(os.path.join(pepega_ui, "app/js/main.js"))

    skip_pmv = set(PEPEGA_PMV_KEEP)
    merge_tree("plugins/pmvGenerator", pepega_pmv, skip_pmv)
    restore_files(pepega_pmv, PEPEGA_PMV_KEEP, bpmv)

    yml = os.path.join(pepega_pmv, "pepega-pmvGenerator.yml")
    if os.path.isfile(yml):
        write_pepega_yml(yml, pmv_v)

    shutil.rmtree(bui, ignore_errors=True)
    shutil.rmtree(bpmv, ignore_errors=True)
    print(f"pepega-stashui merged from upstream stashui {stashui_v}")
    print(f"pepega-pmvGenerator merged from upstream pmvGenerator {pmv_v}")


if __name__ == "__main__":
    main()
