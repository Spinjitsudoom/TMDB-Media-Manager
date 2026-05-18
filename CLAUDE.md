# CLAUDE — Coding Guidelines (excerpt)

Purpose: concise behavioral guidelines to reduce common LLM coding mistakes
and keep edits safe, simple, and goal-oriented.

1. Think Before Coding
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them instead of choosing silently.
- Prefer simpler approaches; call out tradeoffs before implementing.

2. Simplicity First
- Write the minimum code that solves the stated problem.
- Avoid speculative features, one-off abstractions, or unnecessary config.
- If code can be much shorter, prefer the simpler rewrite.

3. Surgical Changes
- Touch only what the task requires; match the surrounding style.
- Do not refactor unrelated code or remove pre-existing dead code.
- Remove only the artifacts your change created (unused imports, variables).

4. Goal-Driven Execution
- Define clear, verifiable success criteria for each task.
- For multi-step work, present a short plan and mark progress.

5. Daily Project Backup
- Once per day, create a compressed backup of the project directory.
- Save it to `~/Documents/Media Manager/backups/` named with the date: `TMDB-Media-Manager-YYYY-MM-DD.zip`.
- Do not back up `node_modules/`, `.venv/`, `dist/`, or `complete builds/`.
- If a backup for today already exists, skip without prompting.

6. Save Chatlog Before Compaction
- Before context compaction occurs, write the full conversation to a file.
- Save path: `~/Documents/Claude/TMDB-Media-Manager/chat-YYYY-MM-DD-HHMMSS.md`.
- Create the directory if it does not exist.
- Format: turn-by-turn (User / Assistant), including code blocks and command output.
- Do not truncate or summarise — write the complete transcript.

7. Use Codex to Save Usage
- Only delegate to Codex when weekly Claude usage is above 80%.
- Below 80%, handle all work inline as normal.
- Above 80%, prefer delegating research, investigation, diagnosis, and multi-file edits to Codex.
- Use the `codex:rescue` skill to delegate. Synthesize the results yourself before responding.

8. Version Bumping
- Version lives in `frontend/package.json` (e.g. `1.0.1-test.3`).
- After making code changes in a session, bump the version before building or testing.
- Dev/test builds: increment the pre-release number (`-test.N` → `-test.N+1`).
- Feature releases: increment the patch and reset pre-release (`1.0.1-test.N` → `1.0.2`).
- Minor releases (new user-facing feature set): increment minor (`1.0.x` → `1.1.0`).
- Never skip a version; never bump without an actual change.

Additional: Merge this file into project agent docs where useful.

Source: Adapted from forrestchang/andrej-karpathy-skills CLAUDE.md.
