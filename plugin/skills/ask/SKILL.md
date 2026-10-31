---
name: ask
description: Ask one persona a question directly.
argument-hint: "<persona> <question>"
disable-model-invocation: true
---

The first word of `$ARGUMENTS` is a persona id of the paper's review party (the plugin has checked it); the rest is the author's question.

Use the `cowrite:<persona>` agent to answer it. It may read the author's text, notes and `party.md`. Relay its answer as given, without rewritten text.
