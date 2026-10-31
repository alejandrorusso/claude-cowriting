# CoWriting — write it yourself, with a review party at your side

![The review party](docs/img/party.png)

**CoWriting** is a [Claude Code](https://claude.com/claude-code) plugin for theses, articles and reports. **You write. Claude assists** with hints, questions, critique, explanations and literature help. It never ghostwrites your manuscript.

The setup follows the German Research Foundation's (DFG) rules for good scientific practice and its statement on generative AI:

- the research process stays transparent,
- responsibility stays with the author,
- AI use is disclosed (which model, for what, to what extent),
- only natural persons are authors.

CoWriting turns these rules into features:

| Rule | What the plugin does |
|---|---|
| You are the author | `manuscript/` is **read-only for Claude**. A hook refuses every edit, including from subagents and shell commands. |
| Transparency | Every prompt and answer is logged automatically to `ai-log/` (append-only, timestamped, with the model id). |
| Disclosure | `/cw:disclosure` turns the log into an **AI register** (EN/DE, Markdown/LaTeX) for your declaration of authorship or your journal. |
| Responsibility | You classify each AI input: **✓ used** (adopted), **✎ changed** (adapted), **✗ not used** (rejected) or **ℹ info**. The card shows who said it, what you asked and what it said. Claude never decides this for you. |
| No fabricated sources | References need a verified DOI or a citekey from your Zotero export. `verify_refs.py` checks your `.bib` against Crossref. |

The background research and requirements are in [docs/research-and-requirements.md](docs/research-and-requirements.md). How each feature maps to the DFG principles is in [docs/gwp-rationale.md](docs/gwp-rationale.md).

## Install

You need Claude Code (in a terminal or the VS Code extension) and Python 3. At the Claude Code prompt, type:

```
/plugin install cw --marketplace <owner>/<repo>
```

Answer `y` to add the marketplace, then pick a scope (user scope is recommended). The config screen asks for your options. All of them can be changed later in `/config`:

| Option | Meaning |
|---|---|
| Obsidian vault | Path to your vault. Claude reads it as your knowledge base and writes only to an `AI-Notes/` folder there. |
| Default language | `en` or `de` |
| Domain pack | `none` or `medicine` (adds *The Clinician*) |
| Autosave to git | On by default: commits `manuscript/` and `ai-log/` after each change, once you've paused for 30 s, under your own git name, with the words gained or lost and the new AI log entries in the message. Nothing else is committed. |
| Gamification | XP, levels and achievements on or off |
| Zotero local API | Search your running Zotero 7 |
| Live review model | Model for `/cw:watch` (default `haiku`) |
| Focus mode | How much of Claude Code's own work the transcript shows: `off`, `calm` (one dim line per action, the default) or `focus` (only you and the personas) |
| Usage meter | `off`, `tokens`, or `tokens+limits`: context tokens, live-review tokens and, on Pro/Max, the 5-hour and weekly limits, with a warning at 80 % and 95 % |

## Start a paper

Open your writing folder in VS Code (or a terminal), start Claude Code, and run:

```
/cw:init
```

Claude Code runs somewhere else, e.g. in your home folder? Give the paper's folder: `/cw:init ~/Papers/my-thesis` sets it up there. Later, `/cw:paper ~/Papers/my-thesis` opens it again from anywhere, and `/cw:paper` alone lists your recent papers to pick by number. If the folder already holds your draft (say `paper.md`), move it into `manuscript/` yourself afterwards; Claude never touches that folder.

Claude asks four questions:
- LaTeX or Markdown
- English or German
- this folder or a new `projects/<name>/` (for several papers in one folder)
- the domain pack

You get:

```
manuscript/            ← you write here (main.tex or main.md); Claude can only read it
literature/references.bib  ← Zotero auto-export
literature/style-models/   ← papers whose style you like (for the Style Coach)
party.md               ← your briefing: what each persona should look for in this project
notes/ai/              ← AI notes, clearly marked
ai-log/                ← automatic log of every AI interaction
disclosure/            ← generated AI register
paper.json, CLAUDE.md, .vscode/ (recommended extensions), .claude/settings.json
```

CoWriting commits your manuscript and the AI log for you after each change (once you pause for 30 s). The git history then documents how your text grew and which AI input came before each step, and with it your authorship. The commits use your own git name (`git config --global user.name` / `user.email`) and contain only `manuscript/` and `ai-log/`. Commit the rest (literature, notes) yourself when you like. Switch it off with the *Autosave to git* option, or for one paper with `"autosave": false` in its `paper.json`.

### Zotero

1. Install [Better BibTeX](https://retorque.re/zotero-better-bibtex/).
2. Right-click your paper's collection, choose **Export Collection…**, pick **Better BibLaTeX**, and tick ☑ **Keep updated**. Save it as `literature/references.bib`.
3. Optional: in Zotero 7, go to *Settings → Advanced* and enable **Allow other applications on this computer to communicate with Zotero**. *The Librarian* can then search your whole library.
4. VS Code: the recommended *Citation Picker for Zotero* inserts citekeys while you write.

### Obsidian

Set the vault path in the plugin options. Claude then:
- searches your notes and cites them as `[[note]]` so you can find your own thoughts again,
- puts its own notes only in `<vault>/AI-Notes/<paper>/`, with `ai_generated: true` frontmatter, so AI and human notes never mix.

To pull Zotero items into Obsidian, combine it with the Obsidian *Zotero Integration* plugin.

### VS Code

The workspace recommends these extensions:
- Claude Code
- LaTeX Workshop
- LTeX+ (local grammar checking)
- Citation Picker for Zotero
- Markdown All in One
- Pandoc Citer

The CoWriting pane works in the terminal and in the VS Code extension.

## Daily use

| Command | What it does |
|---|---|
| `/cw:pane [party\|live\|log\|progress]` | Opens the **CoWriting pane** (on that tab) with the keyboard in it. Click a persona's name to summon it. `1`–`4` switch tabs, `w` turns live review on or off, `r` refreshes, `a`/`d`/`x`/`i` annotate the latest open turn as adopted/adapted/rejected/info, `Esc` goes back to the prompt |
| `/cw:watch [on\|off] [persona …\|all]` | **Live review** while you write (see below). Default watchers: Grammar Guy, Terminologist, Style Coach, Architect |
| `/cw:ask <persona> <question>` | Talk to one persona directly, e.g. `/cw:ask terminologist is "sleep architecture" the usual term?` |
| `/cw:brief [persona\|all] [text]` | Tell a persona what to look for **in this project**. Without text it interviews you and saves your answers; with text it saves them directly. Without arguments it lists all briefs. |
| `/cw:summon <persona> [file]` | Asks one party member for feedback, e.g. `/cw:summon statistics-nerd manuscript/methods.tex` |
| `/cw:feedback` | Writing-center style feedback on a section: problems with their location, guiding questions, no rewrites |
| `/cw:socratic` | One question at a time, to think a section through before writing it |
| `/cw:structure` | Reverse outline, argument map and red-thread check |
| `/cw:language` | Grammar, spelling and punctuation, **with corrected forms** and the rule. No stylistic rewrites. |
| `/cw:sources` | Find literature, search your Zotero and Obsidian, verify DOIs, find claims without a citation |
| `/cw:explain` | Understand a concept, with an optional glossary entry in `notes/ai/` |
| `/cw:consistency` | Report on terms, abbreviations, cross-references, citekeys and figures |
| `/cw:annotate` | Record what you did with an AI input |
| `/cw:quiet [off\|calm\|focus]` | Switch the focus mode for this session. `ctrl+o` always shows everything in full. |
| `/cw:disclosure` | Generate the AI register |
| `/cw:scope [check\|edit]` | Progress against your plan in `scope.md`; `check` asks which of your points the text makes; `edit` sets the scope with you |
| `/cw:paper [path \| number \| name]` | Open a paper folder by path from wherever Claude Code runs, pick a recent one by number, or switch `projects/<name>`; alone, it lists recent papers |

The status line shows `✍ <paper> · assist-only · Lv3 · 2 to classify · ctx 42% · 5h 63%`. The pane opens with a transparent background, so it blends with your terminal (set your terminal profile to black for the dark look). When AI inputs pile up unclassified, or an answer contains AI-written text, a band above the prompt reminds you.

### Live review

`/cw:watch` turns on a reviewer that looks over your shoulder:
- **When it looks:** when you pause writing for about 20 seconds.
- **What it sends:** only the paragraphs you just changed, to a small, fast model (option *Live review model*, default `haiku`).
- **What you get back:** at most 3 short hints, each about one line, from the watching personas. They appear above the prompt and in the pane's **Live** tab.
- **The rules stay the same:** no rewritten sentences. Grammar Guy may give a corrected word, and the Terminologist may name the usual term.
- **Limits:** at most one review a minute and 20 an hour.
- **Logging:** every review is logged, so it shows up in your disclosure.
- **Annotation:** marking live hints is optional; they don't count toward the "unannotated" reminder.

Choose the watchers with `/cw:watch on terminologist grammar-guy`, or `/cw:watch on all`. Stop with `/cw:watch off`.

When a persona reviews on request, the transcript shows a single progress line (`🎭 The Terminologist ▰▰▰▱▱ 4 steps · Read main.tex`) and a one-line note when the report comes back. Press `ctrl+o` for the full text.

### Scope and progress

`scope.md` holds your plan for the paper, in your words:
- the goal
- the points you want to make, as a checklist
- the length in words or pages (300 words a page unless you say otherwise)
- figures, tables and references
- the sections, each with a word target and its stage: outline, draft, revised or final
- the deadline

`/cw:scope edit` sets it up with you in a short interview, or you edit the file yourself.

The pane's **Scope** tab (and `🎯 %` in the status line) measures your manuscript against it:
- **Content:** your points (counted double) and the quantities reached: words, figures, tables, cited references.
- **Finish:** an estimate of the fine-tuning, from each section's stage, less 5 % per open marker (`TODO`, `FIXME`, `??`, `UNVERIFIED`) left in it.
- **Overall:** 70 % content + 30 % finish. It's an estimate, and the tab says so.
- Words per section, by matching your section names to the headings.
- Days left to the deadline, and the words per day you'd need.

Counting needs no AI. Whether a point is actually *made* does: `/cw:scope check` (or `c` in the tab) asks the small live-review model to mark each point covered, partial or missing, with a file:line and a short note. It never suggests wording. The check is logged (origin `scope`) like every AI input. A point you tick yourself (`- [x]`) counts as done, whatever the check says.

### If you really want AI text

You can insist. Claude then marks the passage `[AI-TEXT]`, the log flags it, and the disclosure lists it. Nothing is hidden.

## The review party

### Briefing the party for your project

Each paper has a `party.md` file, written by you:
- **`everyone`:** the project for the whole party: field, target journal or examiner, audience, style guide, US or British English.
- **One section per persona:** what that persona should look for here. For example, *ICD-11 terms only* for the Terminologist, or *IMRaD, 8,000 words* for the Architect.

The plugin attaches the matching sections to a persona's task every time it reviews, whether you summoned it, asked it a question, or it's watching live. `/cw:init` asks about the project and fills in `everyone`. After that you can brief a persona at any time: `/cw:brief <persona>` starts a short interview, or edit `party.md` directly. In the pane, 📋 marks the personas you've briefed.

Each persona is a read-only subagent that looks at your text from one perspective. Each one gives hints and questions, never replacement text.

| | Persona | Perspective |
|---|---|---|
| ![](docs/img/grammar-guy.png) | **Grammar Guy** | Grammar, spelling, punctuation (EN/DE). The one persona that may show corrected sentences. |
| ![](docs/img/statistics-nerd.png) | **Statistics Nerd** | Design, tests, effect sizes, reporting guidelines |
| ![](docs/img/reviewer-2.png) | **Reviewer #2** | Weaknesses, limitations, overclaims |
| ![](docs/img/librarian.png) | **The Librarian** | Sources, Zotero, Obsidian, DOI checks |
| ![](docs/img/architect.png) | **The Architect** | Structure, argument flow, red thread |
| ![](docs/img/integrity-guardian.png) | **Integrity Guardian** | Good scientific practice, plagiarism closeness, disclosure gaps |
| ![](docs/img/lay-reader.png) | **The Lay Reader** | Clarity for non-experts |
| ![](docs/img/style-coach.png) | **The Style Coach** | Writing style compared with papers you like: put 3–5 of them into `literature/style-models/` (git-ignored). It measures sentence rhythm, voice, hedging and connectors with `style_profile.py`, then gives hints on patterns, never sentences to copy. |
| ![](docs/img/terminologist.png) | **The Terminologist** | Is this what the field calls it? Flags unusual, outdated or inconsistent terms, names the usual term with a source (thesaurus, guideline, your literature), and asks for a definition where you deviate on purpose. |
| ![](docs/img/clinician.png) | **The Clinician** *(medicine pack)* | Clinical relevance, patient perspective |

### The game

The game rewards **your own writing and your transparency, never AI use**:

- **Writer XP:** words you add to `manuscript/` (1 XP per 10 words). Only growth above your previous maximum counts, and text that was there before you started is the baseline.
- **Transparency XP:** annotations, verified references and generated disclosures.
- **Persona levels:** a persona levels up only when you *act* on its hints (annotated *adopted* or *adapted*). Summoning alone earns nothing.
- **Achievements:** First 1,000 own words, Seven-day streak, Clean Record, Citation Hunter, Survived Reviewer #2, Full Party, Transparent Scholar…
- **Overreliance nudge:** the Integrity Guardian speaks up when one persona does most of the work, or AI-written text keeps showing up.

## Privacy

Everything stays in your workspace: logs, notes, game state. CoWriting sends nothing anywhere. What Claude sees is governed by your Claude Code account and settings, as usual.

Do not put confidential review material or unpublished third-party data into prompts. Autosave commits `ai-log/`, which makes your process verifiable. The log holds your prompts, so before you push the repository anywhere public, check that you're happy to publish them, or switch autosave off.

## Disclaimer

CoWriting supports good practice. It doesn't replace the rules of your university, journal or funder, and it doesn't replace your own judgement. Check what your examination regulations or target journal require, and adapt the generated disclosure to them.

## Development

```
claude --plugin-dir plugin          # run Claude Code with the plugin from this folder
claude plugin validate plugin       # check manifest and hooks
claude plugin test plugin           # run plugin/tests/*.test.tsx
python3 scripts/render_sprites.py   # re-render the persona PNGs and the icon
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for adding personas and domain packs.

## License

[MIT](LICENSE)
