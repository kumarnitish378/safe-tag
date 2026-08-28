# Hero carousel images

Drop images here and they **automatically** appear in the sliding hero on the
landing page (`docs/index.html` → blog.sftg.in). No code changes needed.

- **Formats:** `.jpg .jpeg .png .webp .gif .avif`
- **Recommended size:** 1440 × 1080 (4:3), landscape.
- **Order = filename** (natural sort). Prefix with numbers to control it:
  `1-crowd-scan.jpg`, `2-phone-scan.jpg`, `3-relief.jpg`, …
### Adding / removing images (one command)
A browser can't list a folder on a static site, so the carousel reads
`hero/manifest.json`. After you add or remove images here, regenerate it:

```
npm run hero
```

That scans this folder and rewrites `manifest.json` with every image (sorted by
name). Then commit both your images and `manifest.json` to publish.

How it works: the page loads `hero/manifest.json` (works locally + live). If it's
ever missing on the live site, it falls back to the GitHub Contents API, and then
to the slides hard-coded in `index.html`. So the hero never breaks.
