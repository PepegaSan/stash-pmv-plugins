"""Apply Pepega main.js boot deferral + classic redirect (one-off helper)."""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "plugins/pepega-stashui/app/js/main.js"


def restore_and_patch():
    out = subprocess.run(
        ["git", "show", "HEAD:plugins/pepega-stashui/app/js/main.js"],
        cwd=ROOT,
        capture_output=True,
        check=True,
    )
    text = out.stdout.decode("utf-8")
    if "bootPluginHost" not in text:
        raise SystemExit("HEAD main.js missing bootPluginHost; merge upstream first")

    text = text.replace(
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
    if old_route not in text:
        raise SystemExit("route() block not found; main.js already patched?")
    text = text.replace(old_route, new_route, 1)
    text = text.replace(
        "  renderRail();\n  try {\n    app.favId = await favoriteTagId(false);",
        "  renderRail();\n  pluginHostReady = bootPluginHost();\n  try {\n    app.favId = await favoriteTagId(false);",
        1,
    )
    MAIN.write_text(text, encoding="utf-8", newline="\n")
    print("patched", MAIN)


if __name__ == "__main__":
    restore_and_patch()
