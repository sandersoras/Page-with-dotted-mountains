# Competitor logos, slide 10

Three files, and the slide picks them up with no further work:

    anduril.svg
    helsing.svg
    stark.svg

**SVG, and the artwork must be a single colour.** `.colog` in `css/deck.css`
runs `grayscale(1) brightness(0) invert(.62)`, which flattens whatever comes in
to one grey. A logo with its own colours therefore loses them, which is the
point -- these sit in a comparison table, not a partner wall, and the row is
about the valuation next to them. A logo that is already a flat wordmark
survives this cleanly; one with a gradient or a photographic mark will come out
as a grey blob and should be swapped for the wordmark version.

Trim the file to the mark's own bounding box before dropping it in. Height is
set to 34px and the width follows; a 200-unit-wide viewBox with 80 units of
padding renders as a small logo floating in a large gap.

**A missing file is not a broken slide.** Each `<img>` carries
`onerror="this.remove()"` and the company name sits beside it as a plain
`<span>`, so until a file exists the row is exactly what it was: the name, set
in type. Drop one in and the logo appears next to it.

Nothing here is committed yet. These are third-party marks -- check the usage
terms before shipping the deck outside the room.
