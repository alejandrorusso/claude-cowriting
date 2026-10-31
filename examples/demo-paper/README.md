# Demo paper

A CoWriting workspace with a short, **fictional** example paper ("Walking breaks and concentration in university students"). The study, its data and its references are made up. The text has a few weaknesses on purpose, so the review party has something to find: an overclaim, a confounder, a grammar slip, open `TODO`/`??` markers, unequal groups and no effect size.

To try the plugin (installed as described in the main README):

```
cd examples/demo-paper
claude
```

Then try:
- `/cw:pane` opens the pane: the review party, live hints, the AI log, the scope and your progress.
- `/cw:summon reviewer-2 manuscript/main.md` asks Reviewer #2 for a review.
- `/cw:scope` shows the progress against `scope.md`, and `/cw:scope check` asks which planned points the text makes.
- `/cw:watch` starts live review: edit `manuscript/main.md`, pause, and hints appear above the prompt.

Autosave is off for this demo (`"autosave": false` in `paper.json`), because the folder sits inside the plugin's own repository. Your own papers commit as usual.
