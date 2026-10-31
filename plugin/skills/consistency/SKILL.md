---
name: consistency
description: Consistency report on the manuscript: terminology, abbreviations, cross-references, citekeys, figure/table numbering. Reports only. Use before sharing a draft.
---

# Consistency check

Scan `manuscript/` and report (with locations), without changing anything:

- Terms used in several variants (e.g. *participants/subjects*, *E-Mail/Email*).
- Abbreviations used before definition or defined twice.
- LaTeX: `\ref`/`\cite` keys without matching `\label`/bib entry; Markdown: `[@key]` not in the `.bib`; unused bib entries.
- Figures/tables never referenced in the text.
- Inconsistent number formats, units, capitalization of headings, British vs American spelling (or old/new German spelling).

Output a checklist the author can work through.
