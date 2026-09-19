# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A classic Tetris game implemented in vanilla JavaScript with HTML5 Canvas and CSS — no dependencies, no build step, no package.json. The whole game is three files: `index.html`, `style.css`, `game.js`.

## Running the game

There's no build/test/lint tooling. To run it, just serve or open the static files:

```bash
# Open directly
start index.html       # Windows
open index.html         # macOS

# Or serve locally (needed if testing anything that requires http:// instead of file://)
python3 -m http.server 8000
npx serve .
```

Then open `http://localhost:8000` (or the file directly) in a browser. Since there's no build process, changes to `game.js`/`style.css`/`index.html` are reflected on a simple page reload.

## Architecture

Everything runs in a single `requestAnimationFrame` game loop in `game.js`, driven entirely by global mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) — there are no classes or modules.

Key pieces, in `game.js`:

- **Board model**: a `ROWS × COLS` matrix where each cell is `0` (empty) or a color index `1–7` identifying which piece locked there.
- **Pieces**: the 7 standard tetrominoes (`PIECES`) as square matrices, paired with `COLORS`. Rotation is done via `rotateCW` (transpose + reverse), not by storing rotation states.
- **Collision** (`collide`): checks a shape against board bounds and already-locked cells.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until one doesn't collide, else the rotation is discarded.
- **Game loop** (`loop`): accumulates elapsed time each frame; when it exceeds `dropInterval`, the piece drops one row or locks (`lockPiece`) if it can't.
- **Locking → clearing → spawning**: `lockPiece` merges the piece into `board` (`merge`), clears full rows bottom-up (`clearLines`, which reinserts an empty row at the top and re-checks the same index since rows shift down), then spawns the next piece (`spawn`). `spawn` also checks for game-over (new piece colliding immediately).
- **Scoring/leveling**: `LINE_SCORES = [0, 100, 300, 500, 800]` × current level on line clears; hard drop adds 2 pts/row, soft drop 1 pt/row. Level increments every 10 lines and `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Ghost piece**: `ghostY()` projects the current piece straight down to its landing row; drawn at `globalAlpha = 0.2`.
- **Rendering** (`draw`, `drawNext`, `drawBlock`, `drawGrid`): plain Canvas 2D, redrawn from scratch every frame — grid lines, locked board, ghost piece, then the active piece; a separate small canvas (`nextCanvas`) previews the next piece.
- **Input**: a single `keydown` listener maps arrow keys / `X` / `Space` / `P` to movement, rotation, soft/hard drop, and pause; ignored while paused or game-over (except `P`).

If you change `COLS`, `ROWS`, or `BLOCK` in `game.js`, also update the `#board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).

Note: the README (in Spanish) is the primary source of documentation for this project and stays in sync with the architecture described above — update it alongside `game.js` if behavior changes.

## GitHub Actions / Claude automation

- `.github/workflows/claude.yml` — responds to `@claude` mentions in issue/PR comments and reviews.
- `.github/workflows/claude-code-review.yml` — automatic code review on every PR.
- `.github/workflows/claude-issue-triage.yml` — runs on issue `opened`/`edited`/`reopened` (skips issues that mention `@claude`, which the workflow above handles instead). Applies labels and posts a single sticky diagnostic comment (marked with `<!-- claude-triage -->`, rewritten on each edit rather than duplicated).
  - Prompt: `.claude/commands/triage-issue.md` (the `/triage-issue` slash command).
  - Write actions go through scoped scripts, not raw `gh`: `scripts/edit-issue-labels.sh` (add/remove labels, filtered against the repo's real label list, issue number read from the event payload) and `scripts/upsert-issue-comment.sh` (create-or-update the sticky comment).
  - `scripts/setup-labels.sh` — one-off, run by hand (`bash scripts/setup-labels.sh`) to create the `area:*` and `P1`/`P2`/`P3` labels the triage workflow assigns, on top of the repo's original 10 labels.
  - If you add/rename labels or areas of the codebase, update both `scripts/setup-labels.sh` and the label guidance in `.claude/commands/triage-issue.md`.
