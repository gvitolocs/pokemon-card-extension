# Icon Generation

## Required Formats

The extension uses PNG icons referenced by `manifest.json`.

Required sizes:

- `16x16` (toolbar/small contexts)
- `32x32` (extension management)
- `48x48` (store/management views)
- `128x128` (store listing and high-res contexts)

## Source and Output

- Approved source: `/Users/giuseppe/pokoinpos/src/logo/assets/pokoin.svg`
  (the 32x32 monster coin mark).
- Do not restore the older Pikachu-like artwork.
- Export final PNG files used by the manifest into `icons/`.
- Keep the web-accessible shared assets in `assets/pokoin.svg` and
  `assets/pokoin-512.png`.

Current manifest references:

- `icons/icon-16.png`
- `icons/icon-32.png`
- `icons/icon-48.png`
- `icons/icon-128.png`

Legacy/debug variants such as `icons/icon-default*.png`, `icons/icon-green.png`,
`icons/icon-red.png`, and `icons/icon-512.png` should be regenerated from the
same source asset when the brand mark changes, even if they are not currently
referenced by `manifest.json`.

If you add per-size icons, update the manifest mapping accordingly.

## Conversion Options

You can convert SVG to PNG with:

- Inkscape
- GIMP
- Photoshop
- Online converters (if no local editor is available)

## Quality Checklist

- Use square canvas
- Preserve transparency where needed
- Verify readability at 16x16
- Re-check icon paths after edits to `manifest.json`