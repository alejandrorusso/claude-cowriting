#!/usr/bin/env python3
"""Measure writing-style features of model papers and of the manuscript.

Prints a Markdown table, one column per corpus, so the Style Coach can
ground its hints in numbers. Reads .txt, .md, .tex and (with pdftotext
on the PATH) .pdf files. The figures are rough heuristics: they show
tendencies, not grammar. Standard library only.

    python3 style_profile.py literature/style-models manuscript [--lang en|de]
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import statistics
import subprocess
from pathlib import Path

TEXT_SUFFIXES = {".txt", ".md", ".markdown", ".tex"}

WORDS = {
    "en": {
        "first_person": {"i", "we", "my", "our", "me", "us"},
        "hedges": {"may", "might", "could", "possibly", "perhaps", "likely", "unlikely", "suggest", "suggests",
                   "suggested", "appear", "appears", "seem", "seems", "indicate", "indicates", "potentially", "presumably"},
        "connectors": {"however", "therefore", "thus", "moreover", "furthermore", "consequently", "hence",
                       "nevertheless", "nonetheless", "whereas", "although", "accordingly", "instead", "similarly"},
        "nominal": re.compile(r"\w{3,}(tion|sion|ment|ness|ity|ance|ence)s?$"),
        "passive": re.compile(r"\b(is|are|was|were|be|been|being)\s+(\w+ly\s+)?\w+(ed|en)\b", re.I),
    },
    "de": {
        "first_person": {"ich", "wir", "mein", "meine", "unser", "unsere", "uns", "mir", "mich"},
        "hedges": {"möglicherweise", "vermutlich", "wahrscheinlich", "eventuell", "scheint", "scheinen", "könnte",
                   "könnten", "dürfte", "dürften", "deutet", "deuten", "offenbar", "tendenziell", "gegebenenfalls"},
        "connectors": {"jedoch", "daher", "deshalb", "somit", "zudem", "außerdem", "folglich", "dennoch",
                       "allerdings", "hingegen", "während", "obwohl", "demnach", "ebenso", "darüber"},
        "nominal": re.compile(r"\w{3,}(ung|heit|keit|tion|ität|ismus)(en)?$"),
        "passive": re.compile(r"\b(wird|werden|wurde|wurden|worden)\b", re.I),
    },
}


def strip_markup(text: str, suffix: str) -> str:
    if suffix == ".tex":
        text = re.sub(r"(?<!\\)%.*", "", text)
        text = re.sub(r"\\begin\{(figure|table|equation|align)\*?\}.*?\\end\{\1\*?\}", " ", text, flags=re.S)
        text = re.sub(r"\$[^$]*\$", " ", text)
        text = re.sub(r"\\(cite\w*|ref|label|eqref|autoref)\*?(\[[^\]]*\])*\{[^}]*\}", " ", text)
        text = re.sub(r"\\(section|subsection|subsubsection|chapter|paragraph)\*?\{[^}]*\}", "\n\n", text)
        text = re.sub(r"\\[a-zA-Z]+\*?(\[[^\]]*\])?", " ", text)
        text = re.sub(r"[{}]", "", text)
    elif suffix in (".md", ".markdown"):
        text = re.sub(r"\A---\n.*?\n---\n", "", text, flags=re.S)
        text = re.sub(r"```.*?```", " ", text, flags=re.S)
        text = re.sub(r"^#+ .*$", "\n", text, flags=re.M)
        text = re.sub(r"\[@[^\]]*\]|@\w+", " ", text)
        text = re.sub(r"[*_`>#]", "", text)
    return text


def read_file(path: Path) -> str | None:
    if path.suffix.lower() == ".pdf":
        if shutil.which("pdftotext") is None:
            return None
        out = subprocess.run(["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True)
        text = out.stdout if out.returncode == 0 else ""
        # join hyphenated line breaks, keep blank lines as paragraph breaks
        text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
        return re.sub(r"(?<!\n)\n(?!\n)", " ", text)
    if path.suffix.lower() in TEXT_SUFFIXES:
        return strip_markup(path.read_text(encoding="utf-8", errors="replace"), path.suffix.lower())
    return None


def collect(target: Path) -> tuple[list[str], list[str], list[str]]:
    """Return (texts, files read, files skipped)."""
    files = [target] if target.is_file() else sorted(p for p in target.rglob("*") if p.is_file())
    texts, read, skipped = [], [], []
    for f in files:
        if f.name.lower() == "readme.md" or f.name.startswith("."):
            continue
        text = read_file(f)
        if text is None:
            skipped.append(f.name)
        else:
            texts.append(text)
            read.append(f.name)
    return texts, read, skipped


SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9\"„(])")
ABBREVIATIONS = re.compile(r"\b(e\.g|i\.e|et al|vs|cf|Fig|Tab|Eq|z\.B|d\.h|bzw|ca|vgl|u\.a|S|Abb|Nr)\.", re.I)


def measure(texts: list[str], lang: str) -> dict[str, float] | None:
    w = WORDS[lang]
    sentences: list[list[str]] = []
    paragraphs: list[int] = []
    passive = 0
    for text in texts:
        for para in re.split(r"\n\s*\n", text):
            para = " ".join(para.split())
            if len(para.split()) < 8:  # headings, captions, page furniture
                continue
            passive += len(w["passive"].findall(para))
            protected = ABBREVIATIONS.sub(lambda m: m.group(0).replace(".", "§"), para)
            sents = [s.replace("§", ".") for s in SENTENCE_END.split(protected) if s.strip()]
            paragraphs.append(len(sents))
            for s in sents:
                tokens = re.findall(r"[^\W\d_]+(?:[-'][^\W\d_]+)*", s.lower())
                if tokens:
                    sentences.append(tokens)
    if not sentences:
        return None
    lengths = [len(s) for s in sentences]
    tokens = [t for s in sentences for t in s]
    n = len(tokens)
    per_k = lambda count: round(1000 * count / n, 1)  # noqa: E731
    return {
        "words": n,
        "sentences": len(sentences),
        "mean sentence length (words)": round(statistics.mean(lengths), 1),
        "sentence length SD": round(statistics.pstdev(lengths), 1),
        "long sentences > 35 words (%)": round(100 * sum(l > 35 for l in lengths) / len(lengths), 1),
        "short sentences < 12 words (%)": round(100 * sum(l < 12 for l in lengths) / len(lengths), 1),
        "sentences per paragraph": round(statistics.mean(paragraphs), 1),
        "first person (per 1000 words)": per_k(sum(t in w["first_person"] for t in tokens)),
        "passive constructions (per 1000 words)": per_k(passive),
        "hedges (per 1000 words)": per_k(sum(t in w["hedges"] for t in tokens)),
        "connectors (per 1000 words)": per_k(sum(t in w["connectors"] for t in tokens)),
        "nominalisations (per 1000 words)": per_k(sum(bool(w["nominal"].match(t)) for t in tokens)),
        "long words ≥ 13 letters (%)": round(100 * sum(len(t) >= 13 for t in tokens) / n, 1),
    }


STOPWORDS = {
    "en": {"the", "and", "of", "to", "in", "is", "that", "with", "for", "was"},
    "de": {"der", "die", "und", "das", "ist", "nicht", "mit", "von", "den", "zu"},
}


def guess_lang(texts: list[str], fallback: str) -> str:
    tokens = re.findall(r"[^\W\d_]+", " ".join(texts).lower())
    counts = {lang: sum(t in words for t in tokens) for lang, words in STOPWORDS.items()}
    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else fallback


def paper_lang(start: Path) -> str:
    for d in [start.resolve(), *start.resolve().parents]:
        paper = d / "paper.json"
        if paper.exists():
            try:
                return json.loads(paper.read_text(encoding="utf-8")).get("language", "en")
            except (OSError, ValueError):
                return "en"
    return "en"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("targets", nargs="+", type=Path, help="folders or files, e.g. literature/style-models manuscript")
    parser.add_argument("--lang", choices=("en", "de"), help="force one language (default: detected per corpus)")
    args = parser.parse_args()
    fallback = args.lang or paper_lang(Path.cwd())

    columns, notes = [], []
    for target in args.targets:
        if not target.exists():
            notes.append(f"- `{target}`: not found")
            continue
        texts, read, skipped = collect(target)
        lang = args.lang or guess_lang(texts, fallback)
        result = measure(texts, lang)
        if result is None:
            notes.append(f"- `{target}`: no readable text")
        else:
            columns.append((f"{target.name or target} ({lang})", result))
            notes.append(f"- `{target}`: {len(read)} file(s) read" + (f": {', '.join(read)}" if len(read) <= 8 else ""))
        if skipped:
            hint = " (install poppler for pdftotext, or read them directly)" if any(s.lower().endswith(".pdf") for s in skipped) else ""
            notes.append(f"  - skipped: {', '.join(skipped)}{hint}")

    print("# Style profile (heuristics: read them as tendencies)\n")
    print("Word-list features (first person, hedges, connectors, nominalisations, passive) are language-specific; compare them across languages with care.\n")
    if columns:
        keys = list(columns[0][1])
        print("| Feature | " + " | ".join(f"`{name}`" for name, _ in columns) + " |")
        print("|---|" + "---:|" * len(columns))
        for k in keys:
            print(f"| {k} | " + " | ".join(f"{r[k]:g}" for _, r in columns) + " |")
    print("\n## Sources\n" + "\n".join(notes))
    return 0 if columns else 1


if __name__ == "__main__":
    raise SystemExit(main())
