---
name: ask
description: Ask one persona a question directly.
argument-hint: "<persona> <question>"
disable-model-invocation: true
---

The CoWriting plugin normally answers this command itself. If it did not: the first word of `$ARGUMENTS` is a persona id; the rest is the author's question. Use the `cw:<persona>` agent to answer it, and relay its answer as given, without rewritten text.
