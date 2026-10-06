"""Restore pepega main.js as UTF-8 from git and apply PMV rail visibility fix."""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "plugins/pepega-stashui/app/js/main.js"

OLD = (
    'const applyPluginLinks = () => document.querySelectorAll("#rail [data-plugin]").forEach((b) => (b.hidden = !pluginsOn.has(norm(b.dataset.plugin))));'
)
NEW = """const pmvPluginVisible = () => pluginsOn && (pluginsOn.has("pmvgenerator") || pluginsOn.has("pepegapmvgenerator"));
const applyPluginLinks = () =>
  document.querySelectorAll("#rail [data-plugin]").forEach((b) => {
    const key = norm(b.dataset.plugin);
    const on =
      key === "pmvgenerator" || key === "pepegapmvgenerator"
        ? pmvPluginVisible()
        : pluginsOn && pluginsOn.has(key);
    b.hidden = !on;
  });"""


def main():
    out = subprocess.run(
        ["git", "show", "HEAD:plugins/pepega-stashui/app/js/main.js"],
        cwd=ROOT,
        capture_output=True,
        check=True,
    )
    text = out.stdout.decode("utf-8")
    if OLD not in text:
        if "pmvPluginVisible" in text:
            print("already patched")
            return
        raise SystemExit("applyPluginLinks needle not found")
    text = text.replace(OLD, NEW, 1)
    MAIN.write_text(text, encoding="utf-8", newline="\n")
    print("wrote", MAIN, "bytes", MAIN.stat().st_size)


if __name__ == "__main__":
    main()
