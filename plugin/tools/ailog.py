#!/usr/bin/env python3
"""CoWriting AI log: list, annotate, stats and disclosure (AI register).

The log lives in <paper>/ai-log/YYYY-MM.jsonl and is append-only. The
CoWriting plugin writes prompt and response entries; this tool appends the
author's annotations and builds the disclosure from all of them.
Standard library only.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

USES = ("adopted", "adapted", "rejected", "info")

CATEGORY_LABELS = {
    "en": {
        "literature": "Literature search and source checks",
        "methods": "Methods and statistics feedback",
        "feedback": "Feedback and critique of own text",
        "structure": "Structure and argumentation feedback",
        "language": "Grammar, spelling and punctuation corrections",
        "style": "Hints on writing style (compared with model papers)",
        "terminology": "Checks of field-specific terminology",
        "concepts": "Explanation of concepts",
        "content": "Domain-specific content feedback",
        "integrity": "Research integrity checks",
        "general": "General questions",
    },
    "de": {
        "literature": "Literaturrecherche und Quellenprüfung",
        "methods": "Feedback zu Methodik und Statistik",
        "feedback": "Feedback und Kritik zum eigenen Text",
        "structure": "Feedback zu Aufbau und Argumentation",
        "language": "Korrektur von Grammatik, Rechtschreibung und Zeichensetzung",
        "style": "Hinweise zum Schreibstil (im Vergleich mit Vorbild-Artikeln)",
        "terminology": "Prüfung der Fachterminologie",
        "concepts": "Erklärung von Konzepten",
        "content": "Fachliches Feedback",
        "integrity": "Prüfung guter wissenschaftlicher Praxis",
        "general": "Allgemeine Fragen",
    },
}

USE_LABELS = {
    "en": {"adopted": "adopted", "adapted": "adapted", "rejected": "rejected", "info": "information only", "open": "not annotated"},
    "de": {"adopted": "übernommen", "adapted": "angepasst", "rejected": "verworfen", "info": "nur Information", "open": "nicht annotiert"},
}


def find_paper(start: Path) -> Path:
    if (start / "paper.json").exists():
        return start
    marker = start / ".active-project"
    if marker.exists():
        root = start / "projects" / marker.read_text(encoding="utf-8").strip()
        if (root / "paper.json").exists():
            return root
    sys.exit("No CoWriting paper here (no paper.json or .active-project). Run /cw:init first.")


def read_entries(root: Path) -> list[dict]:
    entries: list[dict] = []
    for path in sorted((root / "ai-log").glob("*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return entries


def turns(entries: list[dict]) -> list[dict]:
    """Prompt + response + latest annotation, for every completed, non-meta turn."""
    responses = {e["ref"]: e for e in entries if e.get("type") == "response"}
    notes = {}
    for e in entries:
        if e.get("type") == "annotation":
            notes[e["ref"]] = e
    out = []
    for p in entries:
        if p.get("type") != "prompt" or p.get("category") == "meta":
            continue
        r = responses.get(p["id"])
        if r is None:
            continue
        a = notes.get(p["id"])
        out.append({"prompt": p, "response": r, "annotation": a, "category": (a or {}).get("category") or p.get("category", "general")})
    return out


def append(root: Path, entry: dict) -> None:
    now = dt.datetime.now(dt.timezone.utc)
    path = root / "ai-log" / f"{now:%Y-%m}.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def cmd_list(root: Path, args) -> None:
    for t in turns(read_entries(root))[-args.last:]:
        p, a = t["prompt"], t["annotation"]
        mark = f"✓ {a['use']}" if a else "• open"
        flag = " [AI-TEXT]" if t["response"].get("ai_text_flag") else ""
        text = f"↩ report from {p.get('agent', 'a subagent')}" if p.get("origin") == "agent" else " ".join(p.get("text", "").split())[:70]
        print(f"{p['id']}  {p['ts'][:16].replace('T', ' ')}  {t['category']:<10} {mark:<11}{flag} {text}")


def cmd_annotate(root: Path, args) -> None:
    all_turns = turns(read_entries(root))
    if not all_turns:
        sys.exit("The log has no turns to annotate yet.")
    if args.ref == "last":
        open_turns = [t for t in all_turns if t["annotation"] is None]
        ref = (open_turns or all_turns)[-1]["prompt"]["id"]
    else:
        matches = [t for t in all_turns if t["prompt"]["id"].startswith(args.ref)]
        if len(matches) != 1:
            sys.exit(f"No unique turn starts with {args.ref!r}.")
        ref = matches[0]["prompt"]["id"]
    entry = {"type": "annotation", "ref": ref, "ts": dt.datetime.now(dt.timezone.utc).isoformat(), "use": args.use}
    for key in ("chapter", "note", "category"):
        value = getattr(args, key)
        if value:
            entry[key] = value
    append(root, entry)
    print(f"Annotated {ref} as {args.use}.")


def cmd_stats(root: Path, args) -> None:
    ts = turns(read_entries(root))
    by_cat = Counter(t["category"] for t in ts)
    open_count = sum(1 for t in ts if t["annotation"] is None)
    ai_text = sum(1 for t in ts if t["response"].get("ai_text_flag"))
    print(f"Turns: {len(ts)}  unannotated: {open_count}  [AI-TEXT]: {ai_text}")
    for cat, n in by_cat.most_common():
        print(f"  {cat:<12} {n}")


def tex_escape(s: str) -> str:
    for a, b in (("\\", r"\textbackslash{}"), ("&", r"\&"), ("%", r"\%"), ("$", r"\$"), ("#", r"\#"),
                 ("_", r"\_"), ("{", r"\{"), ("}", r"\}"), ("~", r"\textasciitilde{}"), ("^", r"\^{}")):
        s = s.replace(a, b)
    return s


def cmd_disclosure(root: Path, args) -> None:
    lang, fmt = args.lang, args.format
    ts = turns(read_entries(root))
    paper = json.loads((root / "paper.json").read_text(encoding="utf-8"))
    groups: dict[str, list[dict]] = defaultdict(list)
    for t in ts:
        groups[t["category"]].append(t)

    labels = CATEGORY_LABELS[lang]
    use_labels = USE_LABELS[lang]
    de = lang == "de"
    rows = []
    for cat, items in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        dates = sorted(t["prompt"]["ts"][:10] for t in items)
        models = sorted({t["response"].get("model", "unknown") for t in items})
        uses = Counter((t["annotation"] or {}).get("use", "open") for t in items)
        chapters = sorted({t["annotation"]["chapter"] for t in items if t["annotation"] and t["annotation"].get("chapter")})
        own = [t for t in items if t["prompt"].get("origin") not in ("agent", "watch", "scope")]
        examples = [" ".join(t["prompt"].get("text", "").split())[:120] for t in own[:3]]
        rows.append({
            "purpose": labels.get(cat, cat),
            "tool": "Claude Code" + (f" ({', '.join(models)})" if models else ""),
            "extent": (
                f"{len(items)} {'Anfrage' if len(items) == 1 else 'Anfragen'}, {dates[0]} bis {dates[-1]}" if de
                else f"{len(items)} {'request' if len(items) == 1 else 'requests'}, {dates[0]} to {dates[-1]}"
            ),
            "use": ", ".join(f"{use_labels[u]}: {n}" for u, n in uses.most_common()),
            "chapters": ", ".join(chapters) or "–",
            "examples": examples,
            "is_language": cat == "language",
        })
    ai_text = [t for t in ts if t["response"].get("ai_text_flag")]

    title = "KI-Verzeichnis" if de else "AI register (disclosure of AI use)"
    intro = (
        f"Für die Arbeit „{paper.get('name', root.name)}“ wurde das generative KI-Modell Claude (Anthropic) über Claude Code mit dem "
        "Plugin CoWriting ausschließlich assistierend eingesetzt: für Hinweise, Rückfragen, Erklärungen und Literaturhilfe. "
        "Der Text des Manuskripts wurde vollständig von der Autorin bzw. dem Autor verfasst; das Plugin verhindert technisch, "
        "dass die KI Manuskriptdateien verändert. Alle KI-Eingaben wurden automatisch protokolliert (ai-log/)."
        if de else
        f"For “{paper.get('name', root.name)}”, the generative AI model Claude (Anthropic) was used via Claude Code with the CoWriting "
        "plugin in an assisting role only: for hints, questions, explanations and literature support. The manuscript text was written "
        "entirely by the author; the plugin technically prevents the AI from changing manuscript files. All AI interactions were "
        "logged automatically (ai-log/)."
    )
    head = ["Zweck", "Werkzeug / Modell", "Umfang", "Verwendung", "Kapitel"] if de else ["Purpose", "Tool / model", "Extent", "Use", "Chapters"]
    lang_note = (
        "Reine Sprachkorrekturen (Grammatik/Rechtschreibung) müssen laut DFG in Anträgen nicht offengelegt werden; manche Hochschulen verlangen es dennoch."
        if de else
        "Pure language corrections (grammar/spelling) need no disclosure in DFG proposals; some universities still require it."
    )
    ai_text_head = "Von der KI formulierte Textstellen ([AI-TEXT])" if de else "Text formulated by the AI ([AI-TEXT])"
    ai_text_none = "Keine." if de else "None."
    examples_head = "Beispielhafte Anfragen" if de else "Example prompts"
    resp = (
        "Die Verantwortung für Inhalt, Quellen und Formulierungen liegt vollständig bei der Autorin bzw. dem Autor. Bitte an die Vorgaben der Zielinstitution anpassen."
        if de else
        "The author bears full responsibility for content, sources and wording. Adapt this statement to the target institution's rules."
    )

    if fmt == "md":
        out = [f"# {title}", "", intro, "", "| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
        for r in rows:
            out.append(f"| {r['purpose']}{' ¹' if r['is_language'] else ''} | {r['tool']} | {r['extent']} | {r['use']} | {r['chapters']} |")
        out += ["", f"¹ {lang_note}", "", f"## {examples_head}", ""]
        for r in rows:
            out.append(f"**{r['purpose']}**")
            out += [f"- „{e}“" if de else f"- “{e}”" for e in r["examples"]]
            out.append("")
        out += [f"## {ai_text_head}", ""]
        out += [f"- {t['prompt']['ts'][:10]}: {' '.join(t['prompt'].get('text', '').split())[:120]}" for t in ai_text] or [ai_text_none]
        out += ["", f"*{resp}*", ""]
    else:
        e = tex_escape
        out = [f"\\section*{{{e(title)}}}", "", e(intro), "", "\\begin{tabular}{p{.22\\linewidth}p{.18\\linewidth}p{.2\\linewidth}p{.2\\linewidth}p{.1\\linewidth}}",
               "\\hline", " & ".join(f"\\textbf{{{e(h)}}}" for h in head) + " \\\\", "\\hline"]
        for r in rows:
            out.append(" & ".join(e(x) for x in (r["purpose"] + (" (1)" if r["is_language"] else ""), r["tool"], r["extent"], r["use"], r["chapters"])) + " \\\\")
        out += ["\\hline", "\\end{tabular}", "", f"\\noindent(1) {e(lang_note)}", "", f"\\subsection*{{{e(examples_head)}}}", "\\begin{itemize}"]
        for r in rows:
            for ex in r["examples"]:
                out.append(f"  \\item \\textit{{{e(r['purpose'])}:}} {e(ex)}")
        out += ["\\end{itemize}", f"\\subsection*{{{e(ai_text_head)}}}"]
        if ai_text:
            out.append("\\begin{itemize}")
            out += [f"  \\item {t['prompt']['ts'][:10]}: {e(' '.join(t['prompt'].get('text', '').split())[:120])}" for t in ai_text]
            out.append("\\end{itemize}")
        else:
            out.append(e(ai_text_none))
        out += ["", f"\\textit{{{e(resp)}}}", ""]

    target = root / "disclosure" / f"ai-register.{lang}.{fmt}"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("\n".join(out), encoding="utf-8")
    print(f"Wrote {target}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, help="paper folder (default: found from the current folder)")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("list")
    p.add_argument("--last", type=int, default=10)
    p = sub.add_parser("annotate")
    p.add_argument("ref", help="turn id (or a unique prefix), or 'last' for the latest unannotated turn")
    p.add_argument("--use", choices=USES, required=True)
    p.add_argument("--chapter")
    p.add_argument("--note")
    p.add_argument("--category")
    sub.add_parser("stats")
    p = sub.add_parser("disclosure")
    p.add_argument("--lang", choices=("en", "de"), default="en")
    p.add_argument("--format", choices=("md", "tex"), default="md")
    args = parser.parse_args()
    root = args.root or find_paper(Path.cwd())
    {"list": cmd_list, "annotate": cmd_annotate, "stats": cmd_stats, "disclosure": cmd_disclosure}[args.cmd](root, args)


if __name__ == "__main__":
    main()
