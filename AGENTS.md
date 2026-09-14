# AGENTS.md — Skiss

Instructions for AI agents (Claude Code and others) working in this
repository. Read this file in full before making any change. It is the
contract between the product owner and the agents that implement the work.

The product owner reviews **the spec, the design notes, ADRs, fixtures and
PR descriptions**, not implementation files line by line. Your job is to
make that mode of working safe: produce code that is mechanically
verified, stays inside its issue, and surfaces anything a human must
decide.

---

## 1. Project overview

**Skiss** is a text notation for sketching data models, a library that
parses and compiles it to LinkML, and a command-line tool. It is published
as one npm package, `skiss`. See `README.md` for what it is for.

Stack (frozen unless an ADR changes it):

| Area | Choice |
| --- | --- |
| Language | **TypeScript**, strict |
| Package manager | **pnpm** |
| Build | **tsup**, two entry points |
| Tests | **vitest**, golden fixtures |
| Lint and format | **Biome**, enforced in CI |
| Runtime dependency | **`yaml`** and nothing else in the library |
| CI | **GitHub Actions**: a Node job and a Python job that runs the real LinkML validator |

---

## 2. Layout and boundaries

```
src/index.ts       ← the library. Browser-safe. Depends on `yaml` only.
src/cli.ts         ← the command. Node-only. The only file that touches files.
test/fixtures/     ← golden files. A language feature does not exist until it has one.
docs/              ← SPEC.md, DESIGN.md, ARCHITECTURE.md, ROADMAP.md, RELEASING.md, adr/
```

Rules:

- **The library imports no Node built-ins.** No `fs`, no `path`, no
  `process`. If the CLI needs logic, the logic goes in the library and the
  CLI calls it; never the other way round.
- **The library never depends on an editor or host application.** Editors
  and plugins live in their own repositories and depend on this package.
  Nothing here knows they exist.
- **`parse` and `resolve` never throw.** Bad input produces diagnostics and
  a partial document. If you find yourself writing `throw` on the parse
  path, stop.
- **Every line parses on its own.** State carried from one line to the next
  inside `parse` belongs in `resolve`.

`docs/ARCHITECTURE.md` explains the pipeline and the diagnostic codes.

---

## 3. Source of truth: the specification

`docs/SPEC.md` defines the language. It is the product owner's primary
contract. Code implements the spec; the spec is not updated to match
what the code happens to do.

**The change order for a language change is strict:**

1. Change **`docs/SPEC.md`** (and `docs/DESIGN.md` if the reasoning
   changes). This step is the product owner's, or is explicitly approved by
   them in the issue.
2. Add or change the **fixture** under `test/fixtures/` that exercises the
   change, including the mid-typing state in `broken.skiss` if the change
   introduces one.
3. Change the **code** until the fixture passes.
4. Update **`docs/ARCHITECTURE.md`** if a diagnostic code, API signature
   or mapping table changed.

A PR that changes the language without a spec change in the same PR or an
issue that references one is not mergeable.

---

## 4. Issue-driven workflow

Work items are GitHub issues. Every issue that reaches a worker carries:

- **Goal** in one paragraph, and which roadmap milestone it belongs to.
- **Acceptance criteria**, numbered, each verifiable by a test or by
  reading a file.
- **Out of scope**, explicit.
- **Working defaults**: decisions the tech lead has already made so the
  worker does not have to ask. A worker may veto one by stopping and
  saying why, never by silently doing something else.

Then:

- **Do not exceed the acceptance criteria.** Implement what the issue
  asks, no more. Respect *Out of scope*.
- **Stop and ask if anything is ambiguous.** Do not invent a rule to fill
  a gap in the spec (Section 11).
- One issue = one branch = one PR.

---

## 5. Verification loop

`pnpm verify` runs the full quality gate, cheapest first. **A task is
complete only when it exits green.** Never report success on a red gate
or red CI.

1. `biome check` (seconds)
2. `tsc --noEmit` (seconds)
3. `vitest run`: unit and golden tests (seconds)
4. LinkML validation of every generated fixture with the real toolchain
   (needs Python; bootstrapped into `.venv/` by `scripts/linkml-env.sh`)

`pnpm verify` skips step 4 only when Python is unavailable, and says so.
A tool that is present and fails is a failed gate. CI runs all four.

Publishing is not part of the loop: `docs/RELEASING.md` is the procedure that
turns a merged change into the package users install.

> **Bootstrap note:** `pnpm verify`, `scripts/linkml-env.sh`, the Biome
> config and the CI workflow are created during repository bootstrap. Until
> a gate's tooling exists, a PR states which gates are not yet active
> instead of being blocked by them. Creating them is the first
> implementation work of the repository.

---

## 6. Architecture decisions (ADRs)

Architecture decisions live in `docs/adr/` in **MADR** format (Context ·
Decision · Consequences · Alternatives considered), numbered sequentially
and **append-only**. Each carries a status: `Proposed`, `Accepted`, or
`Superseded by ADR-NNNN`. Replacing a decision means writing a new ADR and
flipping the old one's status, never editing the old one's content.

- **Check existing ADRs before proposing an architectural change.** The
  decision may already be made.
- To change an accepted decision, **draft a new ADR first** and surface it
  for review. Do not change the architecture and document it afterwards.
- Implementation must stay consistent with accepted ADRs. Language design
  reasoning that is not a decision with alternatives goes in
  `docs/DESIGN.md`, not an ADR.

---

## 7. PR descriptions

The product owner does not routinely read implementation files, so the PR
description is the primary review surface. It is **mandatory** and follows
`.github/pull_request_template.md`:

- **Issue** it closes.
- **Acceptance criteria implemented**, by number.
- **Tests added**: which fixture or test verifies which criterion.
- **Non-obvious decisions**: anything a reviewer could not infer from the
  diff.
- **Assumptions made**: anything you took as given that was not explicit.
- **Spec, design or ADR changes** in this PR, or "none".

Keep the description in the same register as the docs: plain, specific,
no filler.

---

## 8. Testing conventions

- **Golden fixtures are the primary tests.** A `.skiss` input next to its
  expected LinkML, Mermaid and diagnostics output. When output changes on
  purpose, update the fixture and let the diff be the review.
- **`broken.skiss` is the most important fixture.** Every diagnostic code
  in `docs/ARCHITECTURE.md` has at least one line there, and every one of
  those lines must still leave a usable partial document.
- **Unit tests only for logic that fixtures express badly**: the trailer
  delimiting rule, name normalisation, the enum-collision naming. Keep
  them small.
- **Generated LinkML is validated by LinkML.** Never by a hand-written
  approximation.
- **Test names say what they verify**, in the words of the spec section
  or the issue's acceptance criterion.

---

## 9. Code style

- Strict TypeScript. No `any`, no non-null assertions in the library.
- Plain data. The AST and the LinkML schema object are interfaces over
  plain objects, not classes. Consumers must be able to `JSON.stringify`
  them.
- No abstraction built on top of the Mermaid generator. It is a validation
  aid, not a rendering layer.
- Small files named for what they contain. A file called `utils.ts` is a
  smell.
- Biome decides formatting. Do not argue with it in a PR.
- Comments explain why, not what. The spec section a rule implements is a
  good comment; a restatement of the code is not.

---

## 10. Working alongside other agents

Multiple agent sessions work on this repository by design. The repository
is the **only shared memory** between them.

- **Claim before you code.** Before starting, pick an open, unassigned
  issue and comment that you are taking it, naming your branch. If no issue
  covers your task, stop: creating issues is the tech lead's job (Section
  13).
- **Branch from fresh `main`; reach `main` only via PR with green CI.**
  Never push to `main`, never force-push a shared branch, never rewrite
  `main` history.
- **Check for overlap before branching.** List open PRs and branches. If
  one covers your task, surface it instead of building a parallel version.
- **`docs/` belongs to the product owner.** The spec, the design notes and
  ADR content change only on explicit direction. Never overwrite or delete
  documentation you did not author; check `git log` for provenance first.
- **Fetch before every push; rebase your own branch on its remote.** Assume
  other sessions have moved things while you worked.
- **Leave the repository coherent.** If you find work that supersedes or
  conflicts with yours, say so in your PR description rather than silently
  overwriting it.

---

## 11. When unsure

Do **not** invent. But a worker also does **not** stop to ask: nobody is
watching a worker session, and a session that ends its turn with a
question shows up as a question to the product owner, which Section 13
forbids. If the spec is ambiguous or a decision needs judgment:

1. Pick the reading closest to the issue text and the spec, and continue.
2. Record it on the PR under **Assumptions made** as a vetoable working
   default: what you chose, what the alternative was, why.
3. If it is a language question, also add it to `docs/SPEC.md` §9 (Open
   questions) in the same PR.

Stop only when no default could make the work useful: the issue is
impossible as written, or a fixture contradicts the spec in a way the
spec does not settle. Then say exactly that in the PR description and end
the turn; the tech lead reads PRs, not session transcripts.

A worker never subscribes to its own PR, never schedules check-ins or
reminders for itself, and never wakes itself up later. The tech lead
watches the PR. When the PR is open and CI is green, the worker's job is
finished.

There is deliberately no "explain mode". Keep tutorials out of the code
and PRs; put understanding into the docs.

---

## 12. Session discipline

1. **One issue, one session.** When a new issue arrives in a session that
   has already merged its PR, recommend a fresh session and say why:
   context degradation is quiet.
2. **Every implementation PR gets a reviewer that is not its author.** A
   different session, a fresh subagent, or the automated PR reviewer must
   have posted a review before merging on green. Self-review by the
   authoring context does not count.
3. **Facts over recall.** Before stating how CI or publishing behaves, read
   the workflow file, not the README prose. Docs describe; workflows
   define.
4. **Prefer additive changes.** When the type checker starts fighting,
   stop and split the work into smaller PRs instead of pushing through
   with workarounds.

---

## 13. Orchestration (the tech-lead model)

One session acts as **tech lead** and is the product owner's single point
of contact.

1. **The tech lead plans; workers execute.** All work is planned as GitHub
   issues *before* a worker session is spawned. A worker gets exactly one
   issue, self-contained: goal, acceptance criteria, out of scope, working
   defaults. If writing the issue surfaces a question only the product
   owner can answer, the tech lead asks *before* spawning, never
   mid-flight.
2. **No product-owner decisions inside worker threads.** A worker that
   hits an ambiguity records it on its PR as a vetoable working default,
   or stops and reports to the tech lead. It never asks the product owner.
3. **Spec before build.** Language work starts only from a spec change
   the product owner has approved. Library work starts only from an
   issue the tech lead has written.
4. **Workers do not spawn workers.** Fan-out is the tech lead's job.
   Workers report through their PR; the tech lead reviews (itself or via
   a spawned reviewer, per Section 12.2) and handles merge, publish and
   follow-ups.
5. **Everything else in this contract binds workers unchanged.** This
   section only fixes who starts whom and where decisions live.
