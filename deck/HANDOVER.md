# Setting up on a second machine

Everything needed to run and edit the deck is in git. Clone it and it works:

```bash
git clone https://github.com/strid2026/STRID.git
cd "STRID/Pitch Deck"
python serve.py
```

Open <http://localhost:8787> in Chrome, not in an editor preview pane.

## What is in the repo and what is not

| | Size | In git |
|---|---|---|
| `index.html`, `css/`, `js/`, `serve.py`, `*.md` | ~180 KB | yes |
| `assets/` logo, photo, render, source | ~5 MB | yes |
| `assets/video/matriarch-reveal.mp4` | 3.5 MB | yes, slide 06 needs it |
| `assets/video/matriarch-reveal-loop.mp4` | 0.5 MB | yes, slide 06 needs it |
| `assets/video/rocket-origin-light.mp4` | 39 MB | yes, so slide 02 works from a clone |
| `assets/video/rocket-origin.mp4` | 104 MB | **no**, over GitHub's limit |
| `assets/video/rocket-origin-full.mp4` | 383 MB | **no**, over GitHub's limit |
| `assets/audio/rocket-origin.m4a` | ~2 MB | not made yet, see `assets/audio/README.md` |

A clone gives you a complete, working deck. Slide 02 plays the 39 MB encode and slide 06 plays both its films. Nothing is broken and nothing needs copying to get started.

The two big encodes are the only things git cannot carry: GitHub rejects any file over 100 MB, and a blob that size is permanent in history once pushed. Both machines already hold them, and they do not change, so they never need to move again.

## If you have one of the big encodes

Put it at `assets/video/` under its own name and slide 02 will prefer it automatically:

```
assets/video/rocket-origin.mp4        104 MB, the default
assets/video/rocket-origin-full.mp4   383 MB, the camera master
```

No edit, no flag. `js/deck.js` walks the weights in order and takes the best one present, falling back to the light encode when it finds nothing. So the same `index.html` runs correctly on a machine with all three files and on a fresh clone with one.

To force a weight regardless of what is on disk:

| URL | Plays |
|---|---|
| `localhost:8787` | `rocket-origin.mp4` if present, else the light encode |
| `localhost:8787/?full` | the 383 MB master |
| `localhost:8787/?light` | the 39 MB encode, which is what you send out |

## Pushing back

Your big video files cannot be committed by accident. `.gitignore` excludes `assets/video/*` and re-admits only the three small files by name, and it is committed, so every clone inherits the rule. Check before a first push:

```bash
git status --short          # no rocket-origin.mp4, no rocket-origin-full.mp4
```

If one ever does appear, do not force it through. A push carrying a file over 100 MB is rejected by GitHub, and if it lands in a commit you have to rewrite history to get it out.

**Two people edit `index.html`.** It is one 1000-line file holding all fourteen slides, so parallel edits to different slides still land in the same file and can conflict. Pull before you start and push when you stop, and say which slide you are on.

## What does not come with the repo

**ffmpeg**, needed for anything touching video or audio. It ships inside a pip package:

```bash
python -m pip install imageio-ffmpeg
python -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"
```

Encoding recipes are in `RESUME.md` under "Adding video". Do not skip `-movflags +faststart`; it is the single thing that broke playback here.

**Claude's memory of the project.** Per-project memory lives outside the repo, under `~/.claude/projects/<path-with-dashes>/memory/`, so a clone starts cold. `RESUME.md` is written to carry that weight instead: the naming, the range figures, the rule about never claiming a flown drone, and why the video pipeline is the way it is are all in there. Read it first.

## Check it works

- slide 02 plays the rocket footage full-bleed, with no bright stripe along the bottom
- slide 06 plays the reveal, capability lines at 12s, the name at 14s, then the loop takes over
- leaving slide 06 part-way and coming back resumes where you left it; only `R` restarts it
- slide 07 draws the battlefield over 12 seconds, and no target ring has a line through it
- `N` then `P` produces a 12-page PDF

Then run the layout checker:

```bash
chrome --headless --virtual-time-budget=12000 --dump-dom http://localhost:8787/_check.html
```

All fourteen slides should report `ok`.

## Keep the repo private

It carries operator quotes from the Notion CRM, named units, and the internal NOTAT slides.
