---
name: summon
description: Ask one persona of the review party for a review.
argument-hint: "<persona> [file or section]"
disable-model-invocation: true
---

The CoWriting plugin normally answers this command itself. If it did not: the first word of `$ARGUMENTS` is a persona id (grammar-guy, statistics-nerd, reviewer-2, librarian, architect, integrity-guardian, lay-reader, style-coach, terminologist, clinician); the rest names the file or section. Use the `cw:<persona>` agent to review it, and relay its hints and questions as given, without rewritten text.
