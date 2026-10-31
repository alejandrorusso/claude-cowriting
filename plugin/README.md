# CoWriting (`cowrite`)

Assist-only academic co-writing for Claude Code, following the DFG's good scientific practice. Claude gives hints, critique and literature help; it never writes your manuscript. Every AI input is logged, the log becomes the AI disclosure you sign, and a pixel-art review party you compose yourself reads your text from ten perspectives.

The full documentation, with install steps, the commands, the review party and the DFG rationale, is in the repository: https://github.com/dozwa/claude-cowriting

## What the plugin does on your machine

- **Reads** your paper workspace: `manuscript/`, `literature/`, `party.md`, `scope.md`, and, if configured, your Obsidian vault.
- **Writes** only outside your text: the AI log (`ai-log/`), the disclosure (`disclosure/`), `notes/ai/`, `.cowriting/` (plan, game state, verification summary) and an `AI-Notes/` folder in your vault. `manuscript/` and your other files are guarded: a hook refuses writes it recognises, the workspace settings deny the rest, and any change that still happens during an AI tool call is logged as a `guard` entry.
- **Runs** its Python tools (standard library only) from the plugin folder: the AI log, the scaffold, the bibliography reader, the DOI check, the Zotero search and the sprite renderer. With pandoc installed, `.docx` and `.odt` manuscripts are converted to text for reading.
- **Commits** with git when autosave is on (the default): `manuscript/` and `ai-log/`, under your own git identity, after you pause for 30 seconds. Nothing is pushed.
- **Connects** to three places, and only when you ask: Crossref (`api.crossref.org`) to verify DOIs and look up titles during `/cowrite:sources`, `/cowrite:submit` and `verify_refs.py`; your running Zotero 7 on `localhost` when the local API is enabled; and the web through Claude Code's own search tools when a persona looks for literature. Nothing else leaves your machine. What Claude itself sees is governed by your Claude Code account and settings.
- **Shows** a pane beside the chat with the party, the log's open turns, your word counts and, optionally, a token meter.

## Settings

Obsidian vault path, AI notes folder, default language (`en`/`de`), autosave, gamification, Zotero local API, live-review model, focus mode and usage meter. All are asked at install and can be changed in `/config`.

## License

MIT. See the repository's LICENSE file.
