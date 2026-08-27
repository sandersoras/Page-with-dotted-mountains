# Competitor logos, slide 10

Three files, and the slide picks them up with no further work:

    anduril.png    526x96
    helsing.png    414x96
    stark.png      425x96

**They replace the company name, they do not sit beside it.** The column is
four marks read against four valuations.

## What the files have to be

Greyscale + alpha PNG, cropped tight to the artwork, 96px tall.

Colour is thrown away: `.colog` in `css/deck.css` runs
`grayscale(1) brightness(0) invert(.62)`, which flattens whatever comes in to
one steel grey. That is deliberate -- this is a comparison table, not a partner
wall, and three brand palettes in a row would out-shout the numbers the row
exists for. So a logo with a gradient or a photographic mark will come out as a
grey blob and should be swapped for the flat wordmark version. Since the colour
is discarded anyway, the files are saved as greyscale + alpha, which is a third
of the size of RGBA for the same result.

**Cropping matters more than it sounds like it should.** The slide sets height
and lets width follow, so the only thing making four logos look evenly sized is
that each file is tight to its own ink. An export with its own padding renders
as a small logo floating in a gap. The originals as supplied all had it. To
redo one:

```python
from PIL import Image
im = Image.open('new.png').convert('RGBA')
im = im.crop(im.getchannel('A').getbbox())          # tight to the artwork
w, h = im.size
im.resize((round(w * 96 / h), 96), Image.LANCZOS).convert('LA').save('out.png', optimize=True)
```

96px for a 32px slot, so it holds up on a retina screen and in the PDF.

`source/` holds the untouched files as they arrived. Keep them: the crop is
lossy and you cannot get back to the original from what is in here.

## A missing file is not a broken slide

Each `<img>` carries an `onerror` that replaces it with the company name set in
type, so the table never loses a row.

These are third-party marks. Check the usage terms before the deck travels
outside the room.
