# Audio

Soundtracks for slides that carry film. Small enough to live in git, unlike
`assets/video/`, so these travel with the repo.

| File | Slide | Status |
|---|---|---|
| `rocket-origin.m4a` | 08, the rocket aftermovie | here, 0:49.45, 0.8 MB |
| `exile-quote.m4a` | Appendix, Exile on mothership drones | here, 1:24, 2.4 MB |

`exile-quote.m4a` arrived named `Exile quote.m4a` and was renamed. A space in an
asset path has to be percent-encoded in every reference to it and silently 404s
wherever someone forgets, so assets in this repo are kebab-case without
exception.

The appendix clip needs no particular length or sync: the presenter starts it
and the slide has no film for it to ride. Slide 08 is the one with a length
requirement, below.

## What slide 08 needs

The aftermovie's own mix, as `rocket-origin.m4a`. It has to match
`assets/video/rocket-origin.mp4` **exactly** -- both are 0:49.45 today --
because the deck syncs the audio off the video's clock once a second and pulls
it back whenever the two are more than 0.35s apart. A length mismatch does not
show up as a glitch; it shows up as the sound being progressively wrong on
every loop after the first.

The current file was demuxed straight out of the video with `-c:a copy`, so it
is the same AAC stream the camera master carried, at 125 kb/s, and the two
cannot drift by construction. If the film is ever recut, recut the audio from
the same source in the same pass:

    ffmpeg -i <new cut>.mp4 -vn -c:a copy rocket-origin.m4a

**Sound is off until someone asks for it.** `audioOn` starts false in
`js/deck.js`, the film is muted in its own right -- a browser will not autoplay
it otherwise -- and the speaker button on slide 08 is what turns the separate
soundtrack up. That split is why adding audio never means re-encoding and
re-shipping the film.

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
