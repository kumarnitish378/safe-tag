# SafeTag — Landing Page (GitHub Pages)

A self-contained, static marketing landing page for SafeTag. No build step, no
dependencies — just HTML, inline CSS and a few lines of vanilla JS.

## Preview locally
Open `index.html` directly in a browser, or serve the folder:

```bash
# from the docs/ folder
python -m http.server 8080
# then open http://localhost:8080
```

## Publish on GitHub Pages
1. Push this branch and merge to `master` (via PR — `master` is protected).
2. GitHub repo → **Settings → Pages**.
3. **Source:** `Deploy from a branch` → Branch: `master` → Folder: `/docs` → **Save**.
4. Your site goes live at `https://<username>.github.io/<repo>/` in ~1 minute.

### Custom domain (sftg.in)
- Add a `CNAME` file in this folder containing `sftg.in`, and point the domain's
  DNS at GitHub Pages. Until then the `github.io` URL works.
- The page references `https://sftg.in` in its SEO/OG tags and sitemap. If you
  host on a different URL, find-and-replace `https://sftg.in` in `index.html`,
  `robots.txt` and `sitemap.xml`.

## Notes
- All **"Get your SafeTag"** buttons link to the live store
  (`https://safe-tag.onrender.com/store`); the **demo** button links to
  `/demo`. Update these if the app URL changes.
- Images live in `images/` (copied from the app's `public/images`).
- SEO built in: title/description, Open Graph + Twitter cards, JSON-LD
  (Organization, Product, FAQPage), semantic headings, alt text, lazy-loaded
  images, `robots.txt` and `sitemap.xml`.
