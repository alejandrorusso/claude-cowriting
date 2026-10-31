# Contributing

Contributions are welcome, especially **personas and domain packs** for other fields: law, engineering, humanities, education, and so on.

## The one rule

Every feature must keep the author the author. Nothing in CoWriting may write manuscript text for the user, reward AI use in the game, or hide AI use from the log. If a feature makes AI help easier, it should also keep that help visible.

## Add a persona

1. **Agent:** add `plugin/agents/<id>.md`.
   - Copy an existing persona and keep its *Ground rules* and *Output format* sections word for word.
   - Write the perspective, the checklist and the voice.
   - Use read-only tools unless the persona really needs more.
2. **Sprite and metadata:** add an entry to `PERSONAS` in `plugin/hooks/personas.ts`:
   - `id`, the same as the agent file name
   - `name` and `role`
   - `category`, the log category used in the disclosure. Reuse an existing one if possible, or add a label to `CATEGORY_LABELS` in `plugin/tools/ailog.py` in both languages.
   - `pack`: `core` or your domain pack
   - `palette`
   - `sprite`: 12 rows of 12 characters. `.` is transparent, and every other character must be in the persona's palette or in `SHARED_PALETTE`.
3. **Images:** run `python3 scripts/render_sprites.py` and add the persona to the README table.
4. **Checks:** run `claude plugin test plugin`. The sprite test checks size and colours.

## Add a domain pack

1. Give your personas `pack: '<pack>'`.
2. Add `<pack>` to the `domainPack` options in `plugin/.claude-plugin/plugin.json`.
3. Personas of packs that aren't enabled are hidden from the model (`agent.offer`) and from the pane.

## Development

```
claude --plugin-dir plugin
claude plugin validate plugin
claude plugin test plugin
```

Hooks that take `$` must be `function` declarations at the top level of their file; the validator explains why. Pure logic goes in `plugin/hooks/core.ts`, where the tests can reach it without the engine. Python tools use the standard library only.
