# Icon Generation

## Required Formats

The extension uses PNG icons referenced by `manifest.json`.

Required sizes:

- `16x16` (toolbar/small contexts)
- `32x32` (extension management)
- `48x48` (store/management views)
- `128x128` (store listing and high-res contexts)

## Source and Output

- Keep source assets under `icons/` (SVG or high-resolution PNG).
- Export final PNG files used by the manifest into `icons/`.

Current manifest references:

- `icons/icon-default.png` for `16`, `32`, `48`, `128`

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