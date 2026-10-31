---
name: brief
description: Tell a persona what to look for in this project; without text it interviews you.
argument-hint: "[persona|all] [what to look for]"
disable-model-invocation: true
---

The plugin answers the list (no arguments) and the one-line form (persona and text) itself. What reaches you is the interview: `$ARGUMENTS` is the heading of the section of `party.md` to fill, `everyone — the whole party` or `<persona id> — <Name>`.

Brief that persona (or the whole party) for this paper. For a persona, speak as it, from the perspective of the `cowrite:<persona id>` agent; for everyone, speak for the party. Interview the author about what you (or the party) should look for in this project: one question at a time, 3 to 5 questions (field and its conventions, target journal or examiner, audience, known weak spots, what to ignore).

Then write the answers as a short bullet list into the `## $ARGUMENTS` section of `party.md` (add the section if the file has none): replace only that section's text, keep its comment line and all other sections, and use the author's words. Show them the result.
