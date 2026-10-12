# Skills

`skiss/` is an [Agent Skill](https://agentskills.io): a `SKILL.md` with the language on one screen, the workflow an assistant should follow, and reference files it reads when it needs the exact Mermaid mapping, a diagnostic code or a worked example. It is written so that an assistant produces *valid* Skiss and never a look-alike, with or without a shell to run the compiler in.

## Claude

- **claude.ai**: Settings → Capabilities → Skills → upload the `skiss` folder (zipped). The skill then applies in any chat where a data model comes up.
- **Claude Code**: copy `skills/skiss` to `~/.claude/skills/skiss` (every project) or to `.claude/skills/skiss` inside a project. Claude Code loads it on the next session and can run the compiler itself.

## OpenAI and other assistants

- **A custom GPT**: paste `SKILL.md` into the instructions and attach the three files under `reference/` as knowledge.
- **Any assistant with a system prompt**: paste `SKILL.md`, then the reference files, as one system message. Everything an assistant needs to write and draw a sketch is in the text; the compiler is only needed for LinkML output.

## Keeping it true

Every ```skiss fence in these files is compiled in CI (`test/skills.test.ts`); a fence that produces an error fails the build, and the Mermaid shown is what `skiss diagram` writes for its sketch. When the language moves, this folder moves with it in the same release.
