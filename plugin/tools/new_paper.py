#!/usr/bin/env python3
"""Scaffold a CoWriting paper workspace from the plugin's template.

    python3 new_paper.py --format latex --lang de [--party grammar-guy,reviewer-2,…] [--project my-paper] [--name "My paper"] [--dir PATH]

Without --project the current folder (or --dir) becomes the paper. With --project the
paper goes to projects/<name>/ and .active-project points at it. --party names the
catalogue personas of the paper's review party (default: all but the clinician); the
author's own experts are party/<id>.md files, added later. Existing files are never
overwritten. Standard library only.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parent.parent / "templates" / "workspace"
# the catalogue in plugin/hooks/personas.ts; the clinician is field-specific and joins on request
CATALOG = ("grammar-guy", "statistics-nerd", "reviewer-2", "librarian", "architect", "integrity-guardian", "lay-reader",
           "style-coach", "terminologist", "clinician")
DEFAULT_PARTY = tuple(p for p in CATALOG if p != "clinician")
SETTINGS = Path(".claude") / "settings.json"


def union(old: list, new: list) -> list:
    return old + [x for x in new if x not in old]


def merge_settings(path: Path, fresh: dict) -> None:
    """Add the paper's deny rules and sandbox paths to the folder's Claude Code settings, keeping what is there.

    Claude Code reads project settings from the folder it runs in, so with --project the rules
    live at the workspace root, prefixed with projects/<name>/, one paper after another.
    """
    current = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    permissions = current.setdefault("permissions", {})
    permissions["deny"] = union(permissions.get("deny", []), fresh["permissions"]["deny"])
    sandbox = current.setdefault("sandbox", {})
    sandbox["enabled"] = True
    fs = sandbox.setdefault("filesystem", {})
    fs["denyWrite"] = union(fs.get("denyWrite", []), fresh["sandbox"]["filesystem"]["denyWrite"])
    network = sandbox.setdefault("network", {})
    network["allowLocalBinding"] = True
    network["allowedDomains"] = union(network.get("allowedDomains", []), fresh["sandbox"]["network"]["allowedDomains"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(current, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--format", choices=("latex", "markdown"), required=True)
    parser.add_argument("--lang", choices=("en", "de"), default="en")
    parser.add_argument("--party", default=",".join(DEFAULT_PARTY),
                        help="comma-separated catalogue personas of the review party (default: all but clinician)")
    parser.add_argument("--project", help="create the paper under projects/<project>/")
    parser.add_argument("--name", help="display name (default: folder or project name)")
    parser.add_argument("--dir", type=Path, help="folder to set up (default: the current folder)")
    args = parser.parse_args()

    party = [p for p in args.party.replace(" ", "").split(",") if p]
    unknown = [p for p in party if p not in CATALOG]
    if unknown:
        parser.error(f"not in the catalogue: {', '.join(unknown)} (it has {', '.join(CATALOG)})")

    cwd = args.dir.expanduser().resolve() if args.dir else Path.cwd()
    root = cwd / "projects" / args.project if args.project else cwd
    root.mkdir(parents=True, exist_ok=True)
    name = args.name or args.project or root.name

    values = {
        "{{name}}": name,
        "{{lang}}": args.lang,
        "{{language}}": "German (Deutsch)" if args.lang == "de" else "English",
        "{{format}}": "LaTeX" if args.format == "latex" else "Markdown",
        "{{babel}}": "ngerman" if args.lang == "de" else "english",
        "{{ltexLanguage}}": "de-DE" if args.lang == "de" else "en-US",
        # the paper's files as Claude Code's settings see them from the folder it runs in
        "{{prefix}}": f"projects/{args.project}/" if args.project else "",
    }

    def render(src: Path) -> str:
        text = src.read_text(encoding="utf-8")
        for k, v in values.items():
            text = text.replace(k, v)
        return text

    skip = "main.md" if args.format == "latex" else "main.tex"
    created, kept = [], []
    for src in sorted(TEMPLATE.rglob("*")):
        if src.is_dir() or src.name == skip:
            continue
        rel = src.relative_to(TEMPLATE)
        if rel == SETTINGS and args.project:
            merge_settings(cwd / SETTINGS, json.loads(render(src)))
            created.append(f"{SETTINGS} (at the workspace root, merged)")
            continue
        dst = root / rel
        if dst.exists():
            kept.append(str(rel))
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.suffix in (".md", ".tex", ".json", ".bib", "") or src.name.startswith("."):
            dst.write_text(render(src), encoding="utf-8")
        else:
            shutil.copy2(src, dst)
        created.append(str(rel))

    paper_json = root / "paper.json"
    if not paper_json.exists():
        paper_json.write_text(json.dumps({"name": name, "format": args.format, "language": args.lang, "party": party}, indent=2) + "\n", encoding="utf-8")
        created.append("paper.json")
    else:
        kept.append("paper.json")

    if args.project:
        (cwd / ".active-project").write_text(args.project + "\n", encoding="utf-8")

    repo = cwd if args.project else root
    if subprocess.run(["git", "rev-parse", "--is-inside-work-tree"], cwd=repo, capture_output=True).returncode != 0:
        subprocess.run(["git", "init", "-q"], cwd=repo, check=False)
        created.append("(git repository)")

    print(f"Paper workspace: {root}")
    for c in created:
        print(f"  + {c}")
    for k in kept:
        print(f"  = {k} (kept, already existed)")
    # the author's own text lying next to the workspace: they move it in themselves
    template_files = {"CLAUDE.md", "party.md", "scope.md"}
    loose = sorted(f.name for f in root.iterdir()
                   if f.is_file() and f.suffix in (".md", ".tex", ".docx", ".odt") and f.name not in template_files)
    if loose:
        print("Text outside the manuscript folder (move it in yourself, e.g. replacing the skeleton):")
        for name in loose:
            print(f"  ! {name}")


if __name__ == "__main__":
    main()
