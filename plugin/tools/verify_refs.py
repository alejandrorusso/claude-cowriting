#!/usr/bin/env python3
"""Verify the DOIs of a BibTeX/BibLaTeX file against Crossref.

Prints one line per entry: OK, MISMATCH (title or year differ), NOT FOUND,
NO DOI, or ERROR, and writes a summary to literature/.verify.json next to
the .bib (read by the CoWriting pane). Standard library only.

    python3 verify_refs.py literature/references.bib [--mailto you@example.org]
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ENTRY = re.compile(r"@(\w+)\s*\{\s*([^,\s]+)\s*,(.*?)\n\}", re.S)


def field(body: str, name: str) -> str | None:
    m = re.search(rf"\b{name}\s*=\s*", body, re.I)
    if not m:
        return None
    rest = body[m.end():]
    if rest.startswith("{"):
        depth, out = 0, []
        for ch in rest:
            if ch == "{":
                depth += 1
                if depth == 1:
                    continue
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    break
            out.append(ch)
        return "".join(out)
    if rest.startswith('"'):
        return rest[1:].split('"', 1)[0]
    return re.split(r"[,\n]", rest, 1)[0].strip()


def norm(s: str) -> str:
    s = re.sub(r"\\[a-zA-Z]+|[{}$\\]", "", s)
    return re.sub(r"\W+", " ", s).strip().lower()


def crossref(doi: str, mailto: str | None) -> dict | None:
    url = "https://api.crossref.org/works/" + urllib.parse.quote(doi, safe="/:;()")
    agent = "CoWriting-verify-refs/0.1" + (f" (mailto:{mailto})" if mailto else "")
    req = urllib.request.Request(url, headers={"User-Agent": agent})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.load(resp)["message"]
    except urllib.error.HTTPError as err:
        if err.code == 404:
            return None
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("bib", type=Path)
    parser.add_argument("--mailto", help="your e-mail for Crossref's polite pool (optional)")
    args = parser.parse_args()

    text = args.bib.read_text(encoding="utf-8")
    counts = {"ok": 0, "mismatch": 0, "not_found": 0, "no_doi": 0, "error": 0}
    for kind, key, body in ENTRY.findall(text):
        if kind.lower() in ("comment", "string", "preamble"):
            continue
        doi = field(body, "doi")
        title = field(body, "title") or ""
        year = field(body, "year") or (field(body, "date") or "")[:4]
        if not doi:
            counts["no_doi"] += 1
            print(f"NO DOI     {key}")
            continue
        doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi.strip())
        try:
            msg = crossref(doi, args.mailto)
        except Exception as err:  # network trouble is reported, not fatal
            counts["error"] += 1
            print(f"ERROR      {key}  {doi}  ({err})")
            continue
        if msg is None:
            counts["not_found"] += 1
            print(f"NOT FOUND  {key}  {doi}")
            continue
        remote_title = (msg.get("title") or [""])[0]
        parts = (msg.get("issued") or {}).get("date-parts") or [[None]]
        remote_year = str(parts[0][0] or "")
        similarity = difflib.SequenceMatcher(None, norm(title), norm(remote_title)).ratio()
        if similarity >= 0.85 and (not year or not remote_year or year == remote_year):
            counts["ok"] += 1
            print(f"OK         {key}")
        else:
            counts["mismatch"] += 1
            print(f"MISMATCH   {key}  {doi}\n           bib:      {title} ({year})\n           crossref: {remote_title} ({remote_year})")
        time.sleep(0.2)

    summary = args.bib.parent / ".verify.json"
    summary.write_text(json.dumps({**counts, "bib": args.bib.name, "checked": time.strftime("%Y-%m-%dT%H:%M:%S")}, indent=2) + "\n", encoding="utf-8")
    print("\n" + "  ".join(f"{k}: {v}" for k, v in counts.items()))
    sys.exit(1 if counts["mismatch"] or counts["not_found"] else 0)


if __name__ == "__main__":
    main()
