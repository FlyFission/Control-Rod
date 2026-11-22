## Workflow: Superpowers (Jesse Vincent)

This request runs under the Superpowers workflow. Read `inputs/workflow/superpowers/brainstorming/SKILL.md` and `inputs/workflow/superpowers/writing-plans/SKILL.md` in full before you draft anything, and follow them with the changes below.

**Design first, by assumptions.** Brainstorming is a conversation, and nobody can answer you during this run. Do its work anyway: explore the request, the attachments and the code you can read, settle what you can, and write every question you would have asked as an `assumptions` entry with `requires_confirmation: true` and `owner: "owner"`. The owner answers them in guided preparation before anything is released. That is the design approval brainstorming asks for.

**Then the plan, as packages.** Write the plan the way writing-plans describes, for an engineer who has never seen this codebase, and draft **one package per plan task**:
- `objective`: the task, in a sentence or two, naming the files it creates or changes.
- `acceptance_criteria`: the tests that prove the task and the exact checks to run, each one testable.
- `deliverables`: the files the task produces.
- `design_inputs`: the earlier task packages this one builds on.
- `depends_on`: only the tasks that truly must be accepted first. Independent tasks run in parallel.
- Size each task as writing-plans' right-sizing section says. The plan's global constraints go into every task's criteria that they bind.

**Last, the whole-branch review.** Add one final package that depends on every task package. Its objective is the review subagent-driven-development runs over the whole branch at the end; its deliverable is `REVIEW.md`; its role is `general-author`.

Set no `workflow` field yourself; the server sets it from the request. Do not create worktrees or branches, and do not commit, push or open pull requests.
