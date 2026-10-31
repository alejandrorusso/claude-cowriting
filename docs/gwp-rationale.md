# How CoWriting maps to good scientific practice

## Sources

- DFG, *Leitlinien zur Sicherung guter wissenschaftlicher Praxis* (Code of Conduct, 2019)
- DFG Executive Committee (Präsidium), *Stellungnahme zum Einfluss generativer Modelle für die Text- und Bilderstellung auf die Wissenschaften und das Förderhandeln der DFG* (statement on generative models, September 2023). The DFG revised its position for peer review in December 2025, see <https://www.dfg.de/KI>.
- DFG, *KI in der Antragstellung* (AI in grant proposals): disclosure of model, purpose and extent. Grammar, style and translation tools need no disclosure, and individual passages need not be marked.
- Leibniz Association, recommendation on AI and good scientific practice (2024): AI output has no scientific validity of its own.
- University templates for the declaration of authorship (Eigenständigkeitserklärung) with an AI register (KI-Verzeichnis): for example Potsdam, Bochum, Koblenz, HTW Berlin.

## Mapping

| Principle | Source | CoWriting feature |
|---|---|---|
| Only responsible natural persons are authors | DFG statement 2023; DFG Code guideline 14 (authorship) | The manuscript guard (`tool.call` hook and deny rules) refuses the writes into `manuscript/` it can recognise and logs every change it detects during a tool call as a `guard` entry, which the disclosure lists. Skills and personas give hints, not text. |
| Responsibility can't be delegated to AI | DFG statement 2023 | The author annotates every AI input (adopted / adapted / rejected / info). The disclosure states the author's responsibility. |
| Disclose which models, for what purpose, to what extent | DFG statement 2023, DFG proposals page; university templates that ask for prompts | The automatic log stores model id, Claude Code and plugin versions, category, date and tools. `ailog.py disclosure` aggregates purpose, extent, use and chapters; `ailog.py prompts` writes the prompts appendix. |
| Transparency and traceability of the research process | DFG statement 2023; DFG Code guideline 12 (documentation) | Append-only `ai-log/`, the git history of the human-written manuscript, AI notes kept separately and labelled. |
| No plagiarism, no infringement of intellectual property | DFG statement 2023 | Integrity Guardian, "AI summary – read the original" labels, no quotes without page numbers, `[AI-TEXT]` marker for any AI wording. |
| Correct referencing, honesty | DFG Code, general principles | No invented references: DOI verification (`verify_refs.py`), citekeys only from the user's own `.bib`, `UNVERIFIED` marking. |
| Confidentiality of review material | DFG statement 2023 and the 2026 peer-review guideline | Role contract: no confidential review material or unpublished third-party data in prompts. |
| Self-critical doubt | DFG Code, general principles | Reviewer #2, Statistics Nerd, Lay Reader: perspectives that question the text rather than polish it. |
| Learning from other authors' style without copying | DFG statement 2023 (no plagiarism) | The Style Coach describes patterns of model papers (numbers and moves), quotes them only up to ~5 words with the source, and never offers sentences. Model papers are git-ignored, so they aren't redistributed. |
| Continuous AI feedback stays transparent and assistive | DFG statement 2023 (transparency, responsibility) | Live review (`/cw:watch`) is opt-in per session. It sends only the changed paragraphs, gives at most 3 hints and no rewrites, and logs every review (origin `watch`, model id) for the disclosure. |
| Documenting how the text came about | DFG Code guideline 12 (documentation) | Autosave commits `manuscript/` and `ai-log/` after each writing pause under the author's own git identity, unchanged, with the word delta and the new log entries in the message. The history shows the text growing by the author's hand, interleaved with the AI input that preceded each step. |
| Language corrections | DFG proposals page | Allowed with corrected forms, logged under a separate category, and footnoted in the disclosure (no DFG disclosure needed, but some universities require it). |

## What CoWriting can't do

- It can't make an AI write into `manuscript/` impossible. A shell variable, a script file or a symlink can get past the command patterns. It refuses what it recognises, records what it detects afterwards, and the disclosure says so rather than claiming technical prevention.
- It can't stop someone from copying AI chat output into the manuscript by hand. It makes that visible instead (`[AI-TEXT]` flags) and makes writing yourself the rewarded path.
- It doesn't know your institution's rules. Adapt the generated disclosure to them.

*Guideline numbers refer to the DFG Code (2019). Check the current wording at <https://wissenschaftliche-integritaet.de>.*
