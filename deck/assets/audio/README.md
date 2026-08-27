# Audio

Soundtracks for slides that carry film. Small enough to live in git, unlike
`assets/video/`, so these travel with the repo.

| File | Slide | Status |
|---|---|---|
| `exile-quote.m4a` | Appendix, Exile on mothership drones | here, 1:24, 2.4 MB |

`exile-quote.m4a` arrived named `Exile quote.m4a` and was renamed. A space in an
asset path has to be percent-encoded in every reference to it and silently 404s
wherever someone forgets, so assets in this repo are kebab-case without
exception.

It needs no particular length or sync: the presenter starts it and the slide
has no film for it to ride.

## There is no rocket-origin.m4a any more, and that is the fix

The rocket film's sound used to live here as a separate track, because the film
had no audio and re-shipping a 109 MB encode to add one was not worth it. The
deck kept the two together by seeking the audio back to the video's clock
whenever they drifted more than 0.35s.

That is fine on a laptop and bad on a phone. The correction fired roughly once
a second, every seek is a gap, and the sound stuttered continuously. No
threshold fixes it -- a higher one only makes the gaps rarer.

The film is 14 MB now and we control the encode, so **the track is muxed into
`assets/video/rocket-origin.mp4`**. One element, one clock, nothing to sync.
If it is ever recut:

    ffmpeg -i <cut>.mp4 -c:v libx264 -crf 27 -preset slow -pix_fmt yuv420p \
      -g 60 -c:a copy -movflags +faststart rocket-origin.mp4

**Sound is off until someone asks for it.** `audioOn` starts false in
`js/deck.js` and the film is `muted` in its own right -- no browser will
autoplay it otherwise. The speaker button on slide 08 clears `muted`, and `M`
does the same from the keyboard.

The `audio[data-slide-audio]` machinery is still in `deck.js` and still
correct. Nothing uses it. It is the answer for a film that carries no sound and
cannot be re-encoded, which is not a situation this deck is in today.
