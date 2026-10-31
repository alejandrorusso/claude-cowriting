---
name: summon
description: Ask one persona of the review party for a review.
argument-hint: "<persona> [file or section]"
disable-model-invocation: true
---

The first word of `$ARGUMENTS` is a persona id of the paper's review party (the plugin has checked it; `/cowrite:party` lists them). The rest names the file or section to review; empty, it is the section the author is working on (ask which, if unclear).

Use the `cowrite:<persona>` agent to review it. Relay its hints and questions as given, without rewritten text.
