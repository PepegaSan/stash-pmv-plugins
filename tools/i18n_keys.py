"""List every translatable text of Stash UI – and which ones a translation file is missing.

    python tools/i18n_keys.py                 # all keys
    python tools/i18n_keys.py zh-CN           # keys missing in app/js/locales/zh-CN.js

The English text is the key (see app/js/i18n.js). Keys come from t("…") calls, the unit words of
plural(), error labels of errorToast() and the text tables (menu, sections, tasks, sort orders …).
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS = os.path.join(ROOT, "plugins", "pepega-stashui", "app", "js")

STR = r'"((?:[^"\\]|\\.)*)"'
PATTERNS = [
    r"\bt\(\s*" + STR,  # t("…")
    r"\bplural\([^,]+,\s*" + STR + r",\s*" + STR,  # plural(n, "one", "many")
    r"\berrorToast\([^,]+,\s*" + STR,  # errorToast(e, "What")
    r"\blogEvent\(\s*\"[^\"]*\",\s*\"[^\"]*\",\s*" + STR,  # logEvent(area, level, "text with {placeholders}")
    r"\blogEvent\([^?\n]*\?\s*" + STR + r"\s*:\s*" + STR,  # logEvent(area, level, cond ? "a" : "b")
    r"\b(?:label|group|title|text|intro):\s*" + STR,  # tables: NAV, TASKS, SECTIONS, TOOLS
]
TABLE_PAIRS = r"\[\s*\"[^\"]*\",\s*" + STR + r"\s*\]"  # ["key", "Text"] in SORTS / WORKSHOP
LABELS = r"^\s*\w+:\s*\[" + STR + r",\s*" + STR + r"\]"  # forms.js LABELS
ENUMS = r"(\w+):\s*" + STR  # forms.js ENUM_LABELS values


def keys():
    found = set()
    for path in glob.glob(os.path.join(JS, "*.js")) + glob.glob(os.path.join(JS, "views", "*.js")):
        name = os.path.basename(path)
        if name == "i18n.js":
            continue
        src = open(path, encoding="utf-8").read()
        for p in PATTERNS:
            for m in re.finditer(p, src):
                found.update(g for g in m.groups() if g is not None)
        if name in ("media.js", "embed.js", "performers.js", "videofolders.js"):
            for m in re.finditer(TABLE_PAIRS, src):
                found.add(m.group(1))
        if name == "forms.js":
            for m in re.finditer(LABELS, src, re.M):
                found.update(g for g in m.groups() if g)
            enum = src[src.index("export const ENUM_LABELS"): src.index("const humanize")]
            for m in re.finditer(ENUMS, enum):
                found.add(m.group(2))
        for m in re.finditer(r"(?:KIND_NAME|UNITS|KIND_UNIT|TITLES)\s*=\s*\{([^;]+)\};", src):
            found.update(re.findall(STR, m.group(1)))
        if name == "list.js":
            found.update(re.findall(r"\w+:\s*" + STR, src[src.index("const INTRO"): src.index("export function")]))
        if name == "settings.js":
            found.update(["Debug", "Info", "Warning", "Error"])  # log levels
        if name == "edit.js":
            found.update(["Couldn't be loaded"])
    found = {json.loads('"' + k + '"') for k in found}  # unescape \" etc.
    return sorted(k for k in found if re.search(r"[A-Za-z]", k) or k in PUNCTUATION)


PUNCTUATION = {", "}  # t(", ") joins lists – languages like Chinese use their own comma


if __name__ == "__main__":
    all_keys = keys()
    if len(sys.argv) > 1:
        loc = open(os.path.join(JS, "locales", sys.argv[1] + ".js"), encoding="utf-8").read()
        have = set(json.loads("[" + ",".join(re.findall(r'^\s*("(?:[^"\\]|\\.)*")\s*:', loc, re.M)) + "]"))
        missing = [k for k in all_keys if k not in have]
        extra = [k for k in have if k not in all_keys]
        print(f"{len(all_keys)} keys, {len(missing)} missing, {len(extra)} unused")
        for k in missing:
            print("MISSING", json.dumps(k, ensure_ascii=False))
        for k in extra:
            print("UNUSED ", json.dumps(k, ensure_ascii=False))
    else:
        for k in all_keys:
            print(json.dumps(k, ensure_ascii=False))
        print(len(all_keys), "keys", file=sys.stderr)
