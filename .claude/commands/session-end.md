# /session-end

Update CLAUDE_JOURNAL.md at the repo root to capture the current session's state before closing. Follow these steps:

1. **Add a new Session Log entry** at the top of the `## Session Log` section (below the heading, above existing entries). Date it today. Include:
   - What shipped (committed stages and their commit hashes)
   - What was attempted but not shipped
   - What's stashed on WIP branches (if any)
   - What's open for the next session

2. **Update the Current State section** (as of today's date):
   - Current branch
   - Current commit hash
   - Working tree state (clean / dirty)
   - Vite environment (port, running state)
   - Claude Code environment
   - Next action

3. **Update the Phase 1 Roadmap table** — change the status column for any stages completed this session.

4. **Add entries to these sections if applicable:**
   - Known Bugs — any new bugs discovered
   - Phase 2 Feature Requests — any new deferred features
   - Key Design Decisions — any new locked decisions
   - Lessons Banked (Technical) — any new technical insights
   - Pricing Framework — if tiers or add-ons evolved

5. **Report back a summary** of what changed in the journal so the user can review before committing. Do not auto-commit; let the user stage and commit the journal update alongside their code.

Follow the End-of-Session Protocol at the bottom of CLAUDE_JOURNAL.md as the authoritative reference.