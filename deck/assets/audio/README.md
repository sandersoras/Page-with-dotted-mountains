# Audio

Soundtracks for slides that carry film. Small enough to live in git, unlike
`assets/video/`, so these travel with the repo.

| File | Slide | Status |
|---|---|---|
| `rocket-origin.m4a` | 02, the rocket aftermovie | **not here yet** |
| `exile-quote.m4a` | 08, Exile on mothership drones | here, 1:24, 2.4 MB |

`exile-quote.m4a` arrived named `Exile quote.m4a` and was renamed. A space in an
asset path has to be percent-encoded in every reference to it and silently 404s
wherever someone forgets, so assets in this repo are kebab-case without
exception.

Slide 08 needs no particular length or sync: the presenter starts it and the
slide has no film for it to ride. Slide 02 is the one with a length
requirement, below.

## What slide 02 needs

The aftermovie's own mix, as `rocket-origin.m4a`. It should be **2:10.86 long**,
matching `assets/video/rocket-origin.mp4` exactly, because the deck syncs the
audio off the video's clock and a length mismatch shows up as drift on the loop.

None of the three `rocket-origin*.mp4` encodes carries an audio track. They were
all built with `-an`, and the master was too, so the sound does not exist
anywhere in this repo. It has to come off the CapCut project.

Export audio only from CapCut, then:

```bash
ffmpeg -i exported.wav -c:a aac -b:a 192k -movflags +faststart rocket-origin.m4a
```

If CapCut will only give you a video, pull the audio out of it:

```bash
ffmpeg -i exported.mp4 -vn -c:a aac -b:a 192k -movflags +faststart rocket-origin.m4a
```

Confirm the duration matches before committing:

```bash
ffmpeg -i rocket-origin.m4a 2>&1 | grep Duration    # want 00:02:10.86
```

Any audio file works, including a music bed rather than the real launch sound.
Sync only matters if the audio is diegetic.
