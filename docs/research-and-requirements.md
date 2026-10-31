# Claude Co-Writing Environment: Research & Requirements

*Researched 2026-10-28. Note: this file was compiled by Claude (AI) as a planning document. It is not part of any manuscript.*

## 1. Normative framework (DFG and German universities)

### DFG Presidium statement on generative models (Sept 2023)
Source: <https://www.dfg.de/resource/blob/289674/ff57cf46c5ca109cb18533b21fba49bd/230921-stellungnahme-praesidium-ki-ai-data.pdf>

Core principles, which still apply to research and writing:
1. **Transparency and traceability** of the research process for third parties are basic principles of scientific integrity.
2. **Responsibility stays with the researcher.** Using AI "kann Wissenschaftlerinnen und Wissenschaftler von dieser inhaltlichen und formalen Verantwortung nicht entbinden" (cannot release researchers from responsibility for content and form).
3. **Disclosure.** Researchers should disclose "ob und welche generativen Modelle sie zu welchem Zweck und in welchem Umfang eingesetzt haben" (whether they used generative models, which ones, for what purpose, and to what extent).
4. **Authorship.** Only responsible natural persons can be authors. They must make sure that AI use infringes no third-party IP and leads to no plagiarism.
5. **Confidentiality.** Review material must not be used as input to AI. In Dec 2025 the DFG revised its position on AI in peer review: since 16 Apr 2026 AI may support peer review under the "Leitlinie zur Nutzung von KI in der Begutachtung" (confidentiality, transparency, quality assurance, responsibility). Overview: <https://www.dfg.de/KI>

### DFG "KI in der Antragstellung" (current)
Source: <https://www.dfg.de/de/grundlagen-themen/digitale-themen/ki/antragstellung>
- Disclose model, purpose and extent, e.g. for literature review, method development, data analysis or hypothesis generation.
- Pure grammar, style, spelling or translation tools do **not** need disclosure.
- Marking individual passages is explicitly **not** required for proposals.

### DFG Code "Leitlinien zur Sicherung guter wissenschaftlicher Praxis" (2019)
Its 19 guidelines are binding for German institutions. The ones relevant here are honesty and self-critical doubt, documentation (LL 12), authorship (LL 14), and citing and avoiding plagiarism.

### University practice (theses), stricter than the DFG
Many German universities now require an **AI register (KI-Verzeichnis) in the declaration of authorship (Eigenständigkeitserklärung)**: tool, version, purpose, prompts and affected chapters, often as a table in the appendix.
Examples: Uni Potsdam ([table](https://www.uni-potsdam.de/fileadmin/projects/medienbildung/Abschlussarbeiten-relevantes-Zeug/Eigenst%C3%A4ndigkeitserkl%C3%A4rung_und_KI_Tabelle.pdf)), RUB Bochum (prompts required), Uni Koblenz (template from Apr 2026), HTW Berlin (KI-Verzeichnis), DHBW Stuttgart.
**Check your own examination regulations (Prüfungsordnung) and faculty template.**

The Leibniz Association recommendation (Nov 2024) adds that AI output has **no scientific validity of its own** and must always be checked: <https://zenodo.org/records/14420893/files/Leibniz_Empfehlung_zur_KI.pdf>

## 2. Similar approaches found

| Approach | Idea worth borrowing | Source |
|---|---|---|
| **Writor** (2026) | Non-directive, writing-center style feedback. Never writes for the user. Experts rated it equal to or better than chat LLMs. | arXiv 2602.04047 |
| **Scraft** | Socratic questions to provoke critical thinking. Risk: questions can be off-topic or factually wrong. | arXiv 2304.10543 |
| **Socratic gatekeeper tutor** (JMIR preprint) | Gives no draft text until the author has engaged substantively. Not validated. | preprints.jmir.org/preprint/106483 |
| **DAISY** (2026) | Structured disclosure form: tools and versions, data shared, safeguards, human review, authorship boundaries. Produces more complete disclosures. | arXiv 2604.02760 |
| **"tW" audit trail** | 5-line log entry per AI use: date, purpose, prompt, what was kept or changed, link to the draft. | thesify.substack.com |
| **Keystroke/temporal provenance research** | Process logs as proof of authorship. Retrospective self-reporting is unreliable, so log automatically. | arXiv 2511.12468, 2609.17883 |
| **Claude Code academic setups** (claude-code-my-workflow, academic-research-skills, paper-writing skill) | CLAUDE.md, slash commands and skills per task. Layering: fixed pipeline → personal style rules → per-project context. Note: most of these *write* text, which contradicts our goal. | GitHub / skill registries |

**Gap:** none of the tools combines *non-writing assistance* + *automatic, complete AI logging* + *a generated disclosure*. That combination is the niche for this environment.

## 3. Requirements

### R1 Role contract: Claude assists, never authors
- R1.1 Claude does not produce prose meant for the manuscript: no paragraphs, rewrites or "improved versions".
- R1.2 Allowed: questions (Socratic), critique and diagnosis of the user's text, structural and argument feedback, explaining concepts, finding and summarising literature, checklists, overviews (concept maps, argument maps, outlines of *the literature*, not of the user's text).
- R1.3 Language feedback points at a problem and names the rule or principle. It does not supply the corrected sentence. Optional "language level" switch for grammar/spelling, which the DFG does not require disclosing.
- R1.4 The user can override this per request, but every override is logged and marked as such.

### R2 Technical enforcement
- R2.1 Manuscript files (`manuscript/`) are **read-only for Claude**: a PreToolUse hook blocks Write/Edit there.
- R2.2 Claude may only write to `notes/ai/`, `ai-log/`, `literature/`.

### R3 Complete, automatic AI log (provenance)
- R3.1 Hooks log every prompt and every response (timestamp, model ID, session, project/chapter) to `ai-log/*.jsonl`, append-only.
- R3.2 The user annotates entries: purpose category (literature, concept, structure, language, feedback) and what was adopted, adapted or rejected.
- R3.3 The manuscript is versioned in git, so the human writing process stays traceable (DFG LL 12, documentation).

### R4 Disclosure generation
- R4.1 A `/disclosure` command builds a KI-Verzeichnis table from the log: tool and version, purpose, extent, example prompts, affected chapters.
- R4.2 Configurable template per institution or journal.

### R5 Source integrity
- R5.1 Never invent references. Every citation needs a DOI or URL, verified through a lookup (e.g. Consensus/Crossref). Unverified items are marked as such.
- R5.2 Summaries are labelled "AI summary, read the original". Claude gives no direct quotes without page numbers from the source.
- R5.3 Claude flags possible plagiarism risks, such as text in the manuscript that is too close to a source.

### R6 Confidentiality and data protection
- R6.1 No confidential review material and no unpublished third-party data are passed to the model. The user gets a warning if they try.
- R6.2 Personal or research data follows the project's privacy rules.

### R7 Tools for overview
- R7.1 Literature search and maps (Consensus MCP, Zotero/BibTeX).
- R7.2 Argument and structure check of the user's own outline ("where is the claim unsupported?").
- R7.3 Reviewer simulation: critical questions only, no fixes.
- R7.4 Concept explainer and glossary in `notes/ai/`.
- R7.5 Progress and consistency overview (terms, abbreviations, cross-references).

## 4. Proposed structure

```
Claude_CoWriting/
├── CLAUDE.md                 # role contract (R1), GWP rules, citation rules
├── .claude/
│   ├── settings.json         # hooks: logging (R3), manuscript write-block (R2)
│   ├── hooks/                # log_prompt.sh, log_response.sh, guard_manuscript.sh
│   └── skills/               # feedback, socratic, sources, reviewer, disclosure, explain
├── projects/<thesis|article>/
│   ├── manuscript/           # human-written only, git-versioned
│   ├── literature/           # .bib, verified source notes
│   ├── notes/ai/             # AI-generated notes, clearly marked
│   └── ai-log/               # append-only JSONL + user annotations
└── templates/disclosure/     # KI-Verzeichnis templates per institution
```

## 5. Open questions for the user
1. Which institution or faculty template applies (thesis declaration of authorship, journal policy)?
2. Manuscript format: LaTeX, Markdown/Quarto, or Word?
3. Reference manager: Zotero, BibTeX or other?
4. Should grammar/spelling feedback be allowed to give the corrected form, or only point at the problem?
5. Language of the texts: German, English or both?
