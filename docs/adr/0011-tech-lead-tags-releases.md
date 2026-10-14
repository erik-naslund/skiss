# ADR-0011 — The tech lead tags releases

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** Erik

## Context

From the first plan, the product owner pushed every release tag by hand: the tag is the one step that cannot be undone (an npm version is burned forever), and at the start the publish depended on credentials tied to the product owner's accounts. Keeping a human on that trigger was the brake.

Both reasons have since gone. Publishing uses trusted publishing with GitHub's own identity ([ADR-0009](0009-scoped-npm-package.md) and `release.yml`): a tag pushed by anyone with push access produces the identical release, and the provenance names the workflow run, not the person. And every tag follows a release PR the tech lead has already reviewed and merged under the product owner's standing delegation, so the tag restates a decision already taken. In practice the manual step added risk: twice the commands ran in the wrong clone and tags had to be repaired.

## Decision

- **The tech lead tags.** After merging a release PR, the tech lead pushes the tag on the merged `main` commit and confirms the release run. The product owner gets a confirmation, not a command to run.
- **The release PR is the brake.** Holding a release means not merging the release PR. Nothing is tagged that is not on `main` through a merged PR with green CI.
- **Workers never tag.** A worker that believes a task needs a tag stops and reports.
- **The same holds in the plugin and the playground.** Their `AGENTS.md` and `RELEASING.md` point here.

## Consequences

- Releases are one message shorter and one copy-paste safer.
- Account-level actions stay the product owner's: npm and GitHub settings, the community directory, anything that needs a login the agents do not have.
- If the tech lead's environment refuses a tag push, the fallback is the old procedure: the exact commands, from the right folder, in one message. As of 2026-10-14 the cloud session's git proxy answers a tag push with HTTP 403 (branch pushes go through), so the fallback is in effect; the tech lead tries the push once per release and does not retry a 403.

## Alternatives considered

- **Keep the product owner on the tag.** Rejected: it no longer carries a credential or a decision, only a chance to run it in the wrong folder.
- **Tag from the release workflow on merge of a `release/*` branch.** Rejected for now: it would make every merge to `main` of such a branch a publish with no second look at all; the tech lead's push after the merge keeps one deliberate step without a human copy-paste.
