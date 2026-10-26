# Concurrent sessions

Use a dedicated Git worktree for each implementation or prototype session that
switches branches, commits, or merges. Read-only exploration can share the main
checkout. Separate worktrees give each session its own working files and index;
branches, refs, and the stash remain shared.

## Setup

1. Inspect `git status --short --branch` and `git worktree list`. If this session
   already owns a dedicated worktree, continue there.
2. Choose a unique branch and an absolute worktree path within permitted writable
   directories. Create it from the intended base, for example
   `git worktree add -b <session-branch> <absolute-path> dev`. Use a sibling checkout
   when permitted; if the writable scope requires a directory inside this checkout,
   exclude that directory locally before creating it. Use the normal approval
   mechanism if the selected location requires additional access.
3. Run edits, dependency setup, and validation from the new worktree. Preserve
   changes already present in the main checkout; ask about ownership if the task
   depends on uncommitted work there. Do not stash another session's changes to
   make branch operations possible.

## Integration

Before integrating, re-read the destination branch and working-tree status; an
earlier clean check can become stale while another session commits. Coordinate a
single integration writer for the destination checkout. If it is busy or contains
unowned changes, leave the completed commits on the session branch and report the
integration blocker rather than switching, stashing, or resetting shared work.

After integration, validate affected behavior against the combined result. Remove
only this session's clean worktree when its commits are retained. Preserve prototype
or research branches required by the invoked skill.
