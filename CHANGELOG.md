# Changelog

## 0.1.0 (2026-10-31)

First release, after a critical review of the initial build.

### The manuscript guard, honestly

- File tools are refused by path, now case-insensitively and with `..` resolved, so `Manuscript/` on macOS is covered.
- Shell commands are refused by pattern. The pattern now reads redirect targets and `cd`, catches `--write`, `-o`, editors and inline scripts, and no longer refuses reads such as `cat manuscript/main.md 2>/dev/null` or a note that merely mentions the folder.
- New third layer: after any writing tool ran, the manuscript's files are compared with how they were before. A change is logged as a `guard` entry, shown above the prompt, counted in the pane and listed in the disclosure. What the patterns cannot see, the comparison records.
- The disclosure no longer claims the plugin "technically prevents" AI edits. It says what is true: writes are refused, detected changes are listed, the git history shows how the text came about.

### Disclosure

- Live reviews and scope checks are their own rows, marked "hints only, no classification required", instead of counting as "not annotated".
- A turn that only launched a reviewer is classified through its report, not itself.
- The tool column names the Claude Code and CoWriting versions the log recorded.
- New `ailog.py prompts`: a prompts appendix (EN/DE, Markdown/LaTeX, optionally with answers) for universities that ask for it.

### Log

- Log writes of one paper are serialised, so an annotation during a live review cannot lose an entry.
- Response entries carry the plugin and Claude Code versions.

### Game

- "Full Party" is gone: it rewarded consulting the AI. "Own Voice" (decide against 5 hints) rewards the author's judgement instead.

### Project

- Initial commit on `main`, CI for the Python tools and the plugin tests, tests for the Python tools.
