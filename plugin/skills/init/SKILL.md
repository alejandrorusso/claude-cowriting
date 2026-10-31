---
name: init
description: Set up a CoWriting paper workspace (LaTeX or Markdown, EN/DE) with manuscript, literature, AI log, disclosure and VS Code settings. Use when starting a new thesis, article or report.
argument-hint: "[folder]"
---

# Set up a paper workspace

Target folder: `$ARGUMENTS` if given (a path, `~` allowed; it must exist), else the current folder. With a target folder the plugin has already switched the session to it.

1. Ask the author (one AskUserQuestion with up to four questions) unless they already said:
   - **Format**: LaTeX or Markdown
   - **Language**: English or German
   - **Layout** (only without a target folder): this folder is the paper, or a new paper under `projects/<name>/` (for several papers in one folder)
   - **Review party** (multiSelect): who joins from the catalogue. Offer the nine general personas as the default (Grammar Guy, Statistics Nerd, Reviewer #2, The Librarian, The Architect, Integrity Guardian, The Lay Reader, The Style Coach, The Terminologist), The Clinician for medical texts, and "an expert of my own" (an ontologist, a general practitioner, a neurologist, a lawyer, whoever the author's field needs).
   Also ask for a short paper name (lowercase, dashes) if a project layout is chosen.
2. Run:
   ```
   python3 "${CLAUDE_PLUGIN_ROOT}/tools/new_paper.py" --format <latex|markdown> --lang <en|de> --party <id,id,…> [--project <name>] [--dir "<target folder>"]
   ```
   `--party` takes the catalogue ids the author chose (grammar-guy, statistics-nerd, reviewer-2, librarian, architect, integrity-guardian, lay-reader, style-coach, terminologist, clinician); leave it out for the nine general ones.
   It never overwrites existing files and runs `git init` if the folder is not a repository. With a target folder, run every later shell command from it (`cd "<target folder>" && …`) and use absolute paths under it.
   If the output lists text outside the manuscript folder (`!` lines), tell the author to move those files into `manuscript/` themselves, in place of the skeleton file if they like. Don't move them yourself.
3. Show what was created and explain the next steps briefly:
   - Zotero: in Zotero, right-click your collection → *Export Collection…* → format **Better BibLaTeX**, tick **Keep updated**, save as `literature/references.bib`.
   - Write only in `manuscript/`; Claude can read but never change it.
   - `/cw:pane` opens the pane with the review party; `/cw:summon <persona>` asks one of them for a review, `/cw:ask <persona> <question>` asks it anything, `/cw:party` shows and changes who is in it.
   - From another folder, `/cw:paper <path>` opens this paper again; `/cw:paper` alone lists recent papers.
   - The manuscript and the AI log are committed automatically after each change (once the author pauses for 30 s), under their own git name, so the history documents their authorship. If `git config user.name` is empty, tell them to set it.
4. **The author's own experts.** For each expert the author asked for: ask, in one AskUserQuestion or a short exchange, which field or profession, what this expert looks at and asks, what counts as evidence there, the mistakes outsiders make, the guidelines that apply, and how they speak. Then write `party/<id>.md` in the paper folder (`<id>` lowercase with dashes, not a catalogue id):
   ```
   ---
   name: The Neurologist
   short: Neurologist
   role: Clinical neurology: diagnostics, patient relevance, guideline fit   (≤ 80 characters)
   category: content
   colour: "#1abc9c"
   ---
   You are **The Neurologist** … (4 to 8 sentences: perspective, what they ask, what they flag; then one voice line)
   ```
   The body is the persona's perspective only; the plugin appends the party's shared ground rules and output format itself. From the next turn on the expert is the `cw:<id>` agent, shown in the pane and summoned like the others. Later, `/cw:party new <id> "<Name>" <role>` creates one the same way, `/cw:party add|remove <id>` changes the catalogue members, `/cw:party` lists them.
5. **Brief the party.** Ask the author, in one AskUserQuestion or a short exchange, about the project: field and subfield, kind of text, target journal or examiner, audience, style guide (e.g. APA 7), US or British English. Write their answers, in their words, as a short bullet list under `## everyone` in `party.md` (keep the comment line). Then say that each persona can be briefed now or later: `/cw:brief <persona>` starts a short interview, `/cw:brief <persona> <text>` sets it directly, and `party.md` can be edited any time.
6. **Set the scope** (ask whether now or later). It is the author's plan: goal, points to make, words or pages, figures, tables, references, sections with targets and stage, deadline. Now: interview them one question at a time and write their answers, in their words, into `scope.md` following its structure; add no points of your own. Later: `/cw:scope edit`. The Scope tab and `/cw:scope` then show the progress, and `/cw:scope check` asks which points the text already makes.
7. Do **not** write any manuscript content. The skeleton contains headings only.
