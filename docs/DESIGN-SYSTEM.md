# SafeTag Design System

The visual language extracted from the landing page (`docs/index.html`).
Reusable stylesheet: **`docs/theme.css`**. Build any new page to match by linking
`theme.css` + the two fonts, then using the classes below.

```html
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="theme.css">
```

---

## 1. Design tokens (CSS variables on `:root`)

| Token | Value | Use |
|---|---|---|
| `--navy` | `#0A2342` | headings, dark sections, primary text-on-teal |
| `--teal` | `#0D9488` | brand / primary actions |
| `--teal-d` | `#0f766e` | hover, links, accents |
| `--amber` | `#f59e0b` | stars / warm accent |
| `--ink` | `#0f172a` | body text |
| `--muted` | `#5b6b7f` | secondary text |
| `--line` | `#e8edf3` | borders / dividers |
| `--cream` | `#fbfaf7` | alt section background |
| `--white` | `#ffffff` | base background |
| `--shadow` | `0 24px 60px rgba(10,35,66,.10)` | raised cards / media |
| `--shadow-sm` | `0 8px 24px rgba(10,35,66,.08)` | subtle cards |
| `--r` | `20px` | default card radius |

Other recurring values: pills use `border-radius:999px`; a lighter teal tint
`#e6fbf7` backs the eyebrow + hero badge dot; success green `#22c55e`; danger
`#dc2626`.

## 2. Typography
- **Headings** (`h1,h2,h3`): **Sora**, weight 700–800, `line-height:1.12`, `letter-spacing:-.02em`, color `--navy`.
- **Body**: **Inter**, 400–700, `line-height:1.6`, color `--ink`.
- **Fluid sizes:** section `h2` = `clamp(1.9rem,4vw,2.9rem)`; hero `h1` = `clamp(2.3rem,5.2vw,3.7rem)`; CTA `h2` = `clamp(2rem,4.5vw,3rem)`.
- **`.lead`** — intro paragraph: `1.1rem`, `--muted`, `max-width:44rem`.

## 3. Layout primitives
- **`.wrap`** — page container: `max-width:1120px`, centered, `padding:0 20px`.
- **`.section`** — vertical rhythm block: `padding:5.5rem 0`.
- **`.center`** — centers text (and centers `.lead`).
- **`.eyebrow`** — small uppercase pill label above a heading (teal on `#e6fbf7`).

## 4. Buttons
| Class | Look |
|---|---|
| `.btn` | teal pill, white text, teal glow shadow, lifts on hover |
| `.btn-ghost` | transparent, navy text, 1.5px border → teal on hover |
| `.btn-light` | white pill for dark backgrounds |

## 5. Component catalog (class → purpose)

**Header** — `header` sticky glass bar (`blur(14px)`), `.nav` flex row, `.brand`
(logo + Sora wordmark), `.nav-links` (hidden < 820px), a `.btn` CTA.

**Hero** — `.hero` (soft teal→white radial+linear gradient), `.hero-grid`
(1.05fr / 1fr, stacks < 900px), `.hero h1 .hl` (teal highlight word),
`.hero-cta`, `.hero-trust` (inline trust points). Media: `.hero-slider`
carousel (`.hero-track`, `.hero-slide`, `.hero-nav`, `.hero-dots`, `.single`).
Optional floating `.hero-badge`.

**Stat bar** — `.stats` (navy band), `.stats .grid` (4 → 2 cols), `.stat b` big
Sora number + `.stat span` muted label.

**Story** — `.story` (cream), `.story-grid` (1fr/1.05fr), `.story .big` lead line.

**Steps / how-it-works** — `.steps` (3 → 1 col), `.step` card with numbered
`.step .n` teal circle.

**ID-card mock** — `.idcard` (teal `.top` header + avatar `.av`, `.body`,
`.idrow` k/v rows, `.v.red` for alerts, green `.call` button).

**Use-case tiles** — `.uses` (3/2/1 cols), `.use` square image with gradient
`.cap` caption overlay; image zooms on hover.

**Dark feature band** — `.many` (navy), `.chips` + `.chip` (translucent pills).

**Features** — `.feat` (3 → 1), `.fcard` (icon `.ic` + `h3` + `p`).

**Testimonials** — `.tgrid`, `.quote` (cream, italic), `.who` (avatar + name),
`.stars` (amber).

**Products** — `.prods` (4 → 2), `.prod` card (image + `.pb` body + `.price`),
lifts on hover.

**Privacy grid** — `.privacy` (`#f4faf9`), `.privacy-grid` (2 → 1), `.pitem`
(icon + title + text).

**FAQ** — native `details`/`summary` accordion with a `+ / –` toggle marker.

**Final CTA** — `.cta` teal→navy gradient band, centered white heading + `.lead`
+ `.btn-light`.

**Footer** — `footer` (navy), `.fgrid` columns, `.fcol h4` labels, `.fbottom` bar.

## 6. Section background rhythm
Alternate backgrounds for depth as you stack sections:
`--white` → `--cream` (`.story`) → `#f4faf9` (`.privacy`/`.preview` gradient) →
**navy** (`.stats`, `.many`, `footer`) → **teal→navy gradient** (`.cta`).

## 7. Interactions
- **Reveal on scroll:** add class `rv` to any block; it fades/rises in when it
  enters the viewport (respects `prefers-reduced-motion`). Requires this JS:
  ```html
  <script>
  (function(){
    var els=document.querySelectorAll('.rv');
    if(!('IntersectionObserver' in window)){els.forEach(e=>e.classList.add('in'));return;}
    var io=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.12,rootMargin:'0px 0px -40px 0px'});
    els.forEach(function(e){io.observe(e);});
  })();
  </script>
  ```
- **Hover lift:** cards use `transform:translateY(-2px…-4px)` + a stronger shadow.

## 8. Responsive breakpoints
`900px` (hero/story/preview → 1 col) · `820px` (nav hides; steps/feat/tgrid/prods
→ fewer cols) · `720px` (stats/privacy → 2/1) · `640px`/`520px` (mobile tweaks).
Everything is fluid via `clamp()` + `%`/`fr` grids.

---

## 9. Icons

> ### ⛔ Rule: no emoji — always use icons
> Never use emoji (🛡️ ⚡ ❤️ 🆘 …) in the UI. They render differently on every
> device/OS, break visual consistency, and look unpolished. Use a proper icon
> everywhere an icon is needed — feature cards, chips, list items, buttons,
> badges, section markers. Sources below.
> *(`index.html` has been fully migrated to Material Symbols — keep it that way;
> the only intentional glyphs left are ★ rating stars and → button arrows, which
> are typographic and render consistently.)*

Two sources, both free-friendly. **Don't mix styles inside one component.**

### a) Google Material Symbols — default (Material 3 native)
Variable icon font; matches the M3 look and colours with brand tokens. Add to `<head>`:
```html
<link rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0" />
```
Use, and style to brand:
```html
<span class="material-symbols-outlined">qr_code_scanner</span>
<span class="material-symbols-outlined">favorite</span>
```
```css
.material-symbols-outlined{ color:var(--teal); font-size:1.7rem;
  font-variation-settings:'FILL' 0,'wght' 500,'opsz' 24; }
```
Browse names at **fonts.google.com/icons** (styles: Outlined / Rounded / Sharp).

### b) Icons8 — for coloured / duotone / illustrated icons
Use for richer marketing/hero icons Material doesn't cover. Download SVG/PNG from
**icons8.com**, drop into `docs/icons/`, then:
```html
<img src="icons/shield.svg" alt="" width="28" height="28" />
```
⚠️ Icons8 **free plan requires an attribution link** to icons8.com (or buy a
licence to remove it). Prefer SVG and pick **one** Icons8 style set (e.g. their
"iOS" or "Material" line pack) so icons stay cohesive.

> Rule of thumb: **Material Symbols** for UI / action / status icons; **Icons8**
> for hero / marketing / illustrative icons.

## 10. Material Design 3 (guiding reference)
We follow **Material Design 3** — <https://m3.material.io/get-started> — for
layout, components, states, motion and accessibility, while keeping SafeTag's own
palette + Sora/Inter type. Map of SafeTag tokens → M3 colour roles:

| M3 role | SafeTag token |
|---|---|
| Primary | `--teal` `#0D9488` |
| On-primary | `#ffffff` |
| Primary container | `#e6fbf7` (teal tint) |
| Secondary / accent | `--amber` `#f59e0b` |
| Surface | `--white` / `--cream` |
| On-surface | `--ink` `#0f172a` |
| On-surface variant | `--muted` `#5b6b7f` |
| Outline | `--line` `#e8edf3` |
| Error / Success | `#dc2626` / `#22c55e` |

M3 practices we keep: rounded shapes + pill buttons (`--r`, `999px`), soft
elevation (`--shadow`), clear type hierarchy, motion that respects
`prefers-reduced-motion`, and **≥44px touch targets**. Use M3 as the decision
guide; use `theme.css` tokens/classes as the implementation.

## 11. Starter page template
Copy this to a new `.html` file in `docs/` for an on-brand page:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>SafeTag — Page title</title>
  <meta name="theme-color" content="#0D9488" />
  <link rel="icon" type="image/png" href="images/faviconIcon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0" rel="stylesheet" />
  <link rel="stylesheet" href="theme.css" />
  <style>.material-symbols-outlined{color:var(--teal);font-variation-settings:'FILL' 0,'wght' 500,'opsz' 24}</style>
</head>
<body>
  <header>
    <div class="wrap nav">
      <a class="brand" href="/">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0D9488" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
        SafeTag
      </a>
      <nav class="nav-links"><a href="#">Link</a></nav>
      <a class="btn" href="https://safe-tag.onrender.com/store">Get your SafeTag</a>
    </div>
  </header>

  <section class="section center">
    <div class="wrap">
      <span class="eyebrow">Section label</span>
      <h2>A punchy headline</h2>
      <p class="lead">One or two supporting sentences that set the context.</p>
      <div class="feat rv">
        <div class="fcard"><div class="ic"><span class="material-symbols-outlined">health_and_safety</span></div><h3>Feature</h3><p>Short description.</p></div>
        <div class="fcard"><div class="ic"><span class="material-symbols-outlined">qr_code_scanner</span></div><h3>Feature</h3><p>Short description.</p></div>
        <div class="fcard"><div class="ic"><span class="material-symbols-outlined">favorite</span></div><h3>Feature</h3><p>Short description.</p></div>
      </div>
    </div>
  </section>

  <section class="cta">
    <div class="wrap">
      <h2>Ready when it matters</h2>
      <p class="lead">Protect the people you love.</p>
      <a class="btn btn-light" href="https://safe-tag.onrender.com/store">Get your SafeTag</a>
    </div>
  </section>

  <footer>
    <div class="wrap fbottom"><span>© SafeTag</span><span>sftg.in</span></div>
  </footer>

  <!-- reveal-on-scroll (see §7) -->
</body>
</html>
```
