#!/usr/bin/env python3
"""Scaffold a CoWriting paper workspace from the plugin's template.

    python3 new_paper.py --format latex --lang de [--party grammar-guy,reviewer-2,…] [--project my-paper] [--name "My paper"] [--dir PATH]
    python3 new_paper.py --upgrade [--apply] [--dir PATH]

Without --project the current folder (or --dir) becomes the paper. With --project the
paper goes to projects/<name>/ and .active-project points at it. --party names the
catalogue personas of the paper's review party (default: all but the clinician); the
author's own experts are party/<id>.md files, added later. Existing files are never
overwritten.

--upgrade brings a workspace from an earlier plugin version up to date: the deny rules
and sandbox paths the settings lack, the plugin's current CLAUDE.md (the author's copy
is kept under .cowriting/upgrade/<time>/), the party roster in paper.json, and template
files that are missing. Without --apply it only reports. Standard library only.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parent.parent / "templates" / "workspace"
# the catalogue in plugin/hooks/personas.ts; the clinician is field-specific and joins on request
CATALOG = ("grammar-guy", "statistics-nerd", "reviewer-2", "librarian", "architect", "integrity-guardian", "lay-reader",
           "style-coach", "terminologist", "clinician")
DEFAULT_PARTY = tuple(p for p in CATALOG if p != "clinician")
SETTINGS = Path(".claude") / "settings.json"


def union(old: list, new: list) -> list:
    return old + [x for x in new if x not in old]


def merged_settings(current: dict, fresh: dict) -> tuple[dict, list[str]]:
    """The settings with the paper's deny rules and sandbox paths added, and what the addition is."""
    out = json.loads(json.dumps(current))
    permissions = out.setdefault("permissions", {})
    deny = permissions.get("deny", [])
    permissions["deny"] = union(deny, fresh["permissions"]["deny"])
    sandbox = out.setdefault("sandbox", {})
    was_enabled = sandbox.get("enabled") is True
    sandbox["enabled"] = True
    fs = sandbox.setdefault("filesystem", {})
    paths = fs.get("denyWrite", [])
    fs["denyWrite"] = union(paths, fresh["sandbox"]["filesystem"]["denyWrite"])
    network = sandbox.setdefault("network", {})
    network["allowLocalBinding"] = True
    network["allowedDomains"] = union(network.get("allowedDomains", []), fresh["sandbox"]["network"]["allowedDomains"])
    added = []
    if len(permissions["deny"]) > len(deny):
        added.append(f"{len(permissions['deny']) - len(deny)} deny rule(s)")
    if len(fs["denyWrite"]) > len(paths):
        added.append(f"{len(fs['denyWrite']) - len(paths)} sandbox path(s)")
    if not was_enabled:
        added.append("the sandbox switched on")
    return out, added


def merge_settings(path: Path, fresh: dict) -> list[str]:
    """Add the paper's deny rules and sandbox paths to the folder's Claude Code settings, keeping what is there.

    Claude Code reads project settings from the folder it runs in, so with --project the rules
    live at the workspace root, prefixed with projects/<name>/, one paper after another.
    """
    current = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    merged, added = merged_settings(current, fresh)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(merged, indent=2) + "\n", encoding="utf-8")
    return added


def render_values(name: str, fmt: str, lang: str, prefix: str) -> dict[str, str]:
    return {
        "{{name}}": name,
        "{{lang}}": lang,
        "{{language}}": "German (Deutsch)" if lang == "de" else "English",
        "{{format}}": "LaTeX" if fmt == "latex" else "Markdown",
        "{{babel}}": "ngerman" if lang == "de" else "english",
        "{{ltexLanguage}}": "de-DE" if lang == "de" else "en-US",
        # the paper's files as Claude Code's settings see them from the folder it runs in
        "{{prefix}}": prefix,
    }


def rendered(src: Path, values: dict[str, str]) -> str:
    text = src.read_text(encoding="utf-8")
    for k, v in values.items():
        text = text.replace(k, v)
    return text


def upgrade(root: Path, apply: bool) -> int:
    """Report (or with apply, make) the changes that bring an older workspace up to this plugin version."""
    paper_json = root / "paper.json"
    if not paper_json.exists():
        print(f"{root} is not a CoWriting paper: no paper.json.")
        return 1
    paper = json.loads(paper_json.read_text(encoding="utf-8"))
    # a paper under projects/<name>/ keeps its settings at the workspace root
    is_project = root.parent.name == "projects" and not (root / SETTINGS).exists()
    prefix = f"projects/{root.name}/" if is_project else ""
    settings_path = (root.parent.parent if is_project else root) / SETTINGS
    values = render_values(paper.get("name", root.name), paper.get("format", "markdown"), paper.get("language", "en"), prefix)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    backups = root / ".cowriting" / "upgrade" / stamp
    todo, done = [], []

    def backup(rel: str) -> None:
        backups.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / rel, backups / rel)

    # the settings: additive, so the author's own rules stay
    fresh = json.loads(rendered(TEMPLATE / SETTINGS, values))
    current = json.loads(settings_path.read_text(encoding="utf-8")) if settings_path.exists() else {}
    merged, added = merged_settings(current, fresh)
    shown = settings_path.relative_to(root) if settings_path.is_relative_to(root) else settings_path
    if added:
        todo.append(f"~ {shown}: {', '.join(added)} to add")
        if apply:
            settings_path.parent.mkdir(parents=True, exist_ok=True)
            settings_path.write_text(json.dumps(merged, indent=2) + "\n", encoding="utf-8")
            done.append(f"~ {shown}: {', '.join(added)} added")

    # CLAUDE.md: the plugin's rules; the author's copy is kept next to the log
    rules = rendered(TEMPLATE / "CLAUDE.md", values)
    rules_path = root / "CLAUDE.md"
    if not rules_path.exists():
        todo.append("+ CLAUDE.md")
        if apply:
            rules_path.write_text(rules, encoding="utf-8")
            done.append("+ CLAUDE.md")
    elif rules_path.read_text(encoding="utf-8") != rules:
        todo.append(f"~ CLAUDE.md: differs from the plugin's current rules (your copy goes to .cowriting/upgrade/{stamp}/CLAUDE.md)")
        if apply:
            backup("CLAUDE.md")
            rules_path.write_text(rules, encoding="utf-8")
            done.append(f"~ CLAUDE.md: replaced, your copy is at .cowriting/upgrade/{stamp}/CLAUDE.md")

    # paper.json: a roster instead of the domain pack
    if not isinstance(paper.get("party"), list):
        party = list(CATALOG) if paper.get("domainPack") == "medicine" else list(DEFAULT_PARTY)
        todo.append(f"~ paper.json: party roster to add ({', '.join(party)})")
        if apply:
            paper = {k: v for k, v in paper.items() if k != "domainPack"}
            paper["party"] = party
            paper_json.write_text(json.dumps(paper, indent=2) + "\n", encoding="utf-8")
            done.append("~ paper.json: party roster added")

    # template files the workspace lacks; what exists is the author's and stays
    skip = {"main.md", "main.tex", "CLAUDE.md"}
    for src in sorted(TEMPLATE.rglob("*")):
        rel = src.relative_to(TEMPLATE)
        if src.is_dir() or src.name in skip or rel == SETTINGS:
            continue
        dst = root / rel
        if dst.exists():
            continue
        todo.append(f"+ {rel}")
        if apply:
            dst.parent.mkdir(parents=True, exist_ok=True)
            if src.suffix in (".md", ".tex", ".json", ".bib", "") or src.name.startswith("."):
                dst.write_text(rendered(src, values), encoding="utf-8")
            else:
                shutil.copy2(src, dst)
            done.append(f"+ {rel}")

    print(f"Paper workspace: {root}")
    if not todo:
        print("  Up to date with this plugin version: nothing to do.")
        return 0
    for line in done if apply else todo:
        print(f"  {line}")
    print("Upgraded." if apply else "Nothing changed yet.")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--format", choices=("latex", "markdown"))
    parser.add_argument("--lang", choices=("en", "de"), default="en")
    parser.add_argument("--party", default=",".join(DEFAULT_PARTY),
                        help="comma-separated catalogue personas of the review party (default: all but clinician)")
    parser.add_argument("--project", help="create the paper under projects/<project>/")
    parser.add_argument("--name", help="display name (default: folder or project name)")
    parser.add_argument("--dir", type=Path, help="folder to set up (default: the current folder)")
    parser.add_argument("--upgrade", action="store_true", help="bring an existing paper up to this plugin version")
    parser.add_argument("--apply", action="store_true", help="with --upgrade: make the changes instead of listing them")
    args = parser.parse_args()

    if args.upgrade:
        raise SystemExit(upgrade((args.dir.expanduser().resolve() if args.dir else Path.cwd()), args.apply))
    if args.format is None:
        parser.error("--format is required (latex or markdown)")

    party = [p for p in args.party.replace(" ", "").split(",") if p]
    unknown = [p for p in party if p not in CATALOG]
    if unknown:
        parser.error(f"not in the catalogue: {', '.join(unknown)} (it has {', '.join(CATALOG)})")

    cwd = args.dir.expanduser().resolve() if args.dir else Path.cwd()
    root = cwd / "projects" / args.project if args.project else cwd
    root.mkdir(parents=True, exist_ok=True)
    name = args.name or args.project or root.name

    values = render_values(name, args.format, args.lang, f"projects/{args.project}/" if args.project else "")

    def render(src: Path) -> str:
        return rendered(src, values)

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
