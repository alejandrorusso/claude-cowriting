#!/usr/bin/env python3
"""Search the author's Zotero library.

Uses the Zotero 7 local API (Zotero running, and "Allow other applications on
this computer to communicate with Zotero" enabled in Settings → Advanced).
Falls back to searching literature/*.bib in the current paper.
Standard library only.

    python3 zotero_search.py "self-determination theory" [--limit 15]
"""

from __future__ import annotations

import argparse
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

API = "http://localhost:23119/api/users/0/items"


def from_zotero(query: str, limit: int) -> list[dict] | None:
    url = f"{API}?{urllib.parse.urlencode({'q': query, 'qmode': 'titleCreatorYear', 'limit': limit, 'itemType': '-attachment || note'})}"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            items = json.load(resp)
    except Exception:
        return None
    out = []
    for item in items:
        d = item.get("data", {})
        creators = [c.get("lastName") or c.get("name", "") for c in d.get("creators", [])]
        key = None
        m = re.search(r"Citation Key:\s*(\S+)", d.get("extra", "") or "")
        if m:
            key = m.group(1)
        out.append({
            "citekey": d.get("citationKey") or key,
            "title": d.get("title", ""),
            "authors": ", ".join(creators[:3]) + (" et al." if len(creators) > 3 else ""),
            "year": (d.get("date") or "")[:4],
            "doi": d.get("DOI", ""),
            "zotero": item.get("key"),
        })
    return out


def from_bib(query: str, limit: int) -> list[dict]:
    words = [w.lower() for w in query.split()]
    out = []
    for bib in sorted(Path("literature").glob("*.bib")) if Path("literature").exists() else []:
        for key, body in re.findall(r"@\w+\s*\{\s*([^,\s]+)\s*,(.*?)\n\}", bib.read_text(encoding="utf-8"), re.S):
            if all(w in body.lower() for w in words):
                def f(name: str) -> str:
                    m = re.search(rf"\b{name}\s*=\s*[{{\"](.*?)[}}\"]\s*,?\s*$", body, re.I | re.M)
                    return re.sub(r"[{}]", "", m.group(1)) if m else ""
                out.append({"citekey": key, "title": f("title"), "authors": f("author")[:60], "year": f("year") or f("date")[:4], "doi": f("doi")})
    return out[:limit]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("query")
    parser.add_argument("--limit", type=int, default=15)
    args = parser.parse_args()

    hits = from_zotero(args.query, args.limit)
    source = "Zotero (local API)"
    if hits is None:
        hits = from_bib(args.query, args.limit)
        source = "literature/*.bib (Zotero not reachable)"
    print(f"# {len(hits)} hit(s) from {source}")
    for h in hits:
        print(f"- [{h.get('citekey') or 'no citekey'}] {h['authors']} ({h['year']}). {h['title']}" + (f". doi:{h['doi']}" if h.get("doi") else ""))


if __name__ == "__main__":
    main()
