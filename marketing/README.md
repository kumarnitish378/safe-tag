# SafeTag Instagram poster generator

Auto-creates the 30 daily posters from `instagram-poster-prompts.md`:
**AI makes the background scene → the script overlays the slogan + logo + `sftg.in`**
with real fonts (so the Hindi/English never garbles). Then you bulk-schedule the
images in a planner. No new npm packages — uses the project's `sharp` + Node's
built-in `fetch`.

## Prerequisites
- **Node 20+** (for global `fetch`).
- An **OpenAI API key** with image access. ⚠️ `gpt-image-1` requires your OpenAI
  **organization to be verified** (Settings → Organization → Verify). Without it
  the API returns a 403.
- That's it — `sharp` is already a project dependency.

## Run it
```bash
# 1. See all 30 parsed slogans — no API, no cost:
node marketing/generate.js --dry-run

# 2. Generate ONE day (cheap test) with your key:
OPENAI_API_KEY=sk-xxx node marketing/generate.js --day 1 --quality low

# 3. Generate the whole month:
OPENAI_API_KEY=sk-xxx node marketing/generate.js
```
On Windows PowerShell, set the key first:
```powershell
$env:OPENAI_API_KEY="sk-xxx"; node marketing/generate.js --day 1 --quality low
```

### Flags
- `--dry-run` — parse only, print slogans, no images (free).
- `--day N` — generate just day N.
- `--quality low|medium|high` — gpt-image-1 quality (cost vs. detail). Default `medium`.

## Output
- `marketing/out/day-01.png … day-30.png` — finished 1080×1350-ish posters (1024×1536).
- `marketing/out/captions.txt` — the caption + hashtags for each day, ready to paste.

(`out/` is gitignored. `sample-day-01.png` there is an overlay demo on a plain
gradient — real runs replace the gradient with the AI scene.)

## Option A — Bulk-schedule (simplest, no coding)
1. Open **Meta Business Suite → Planner** (free), or Buffer / Later.
2. Upload the 30 PNGs, paste each day's caption from `captions.txt`, set one per day.
3. Done — it posts automatically.

> Avoid unofficial "auto-poster" tools — they break Instagram's ToS and get
> accounts banned. Use the official Graph API (Option B) for full automation.

---

## Option B — Fully hands-off (auto-generate + auto-post daily)
A GitHub Actions cron runs `.github/workflows/ig-daily.yml` every day: it
generates today's poster (rotating through the 30) and publishes it to Instagram
via the official **Instagram Graph API**. Zero manual steps once set up.

```
cron (daily) → generate.js --today → imgbb (host) → Instagram Graph API (publish)
```

### One-time setup

**1. Instagram account**
- Convert your Instagram to a **Business** or **Creator** account.
- Link it to a **Facebook Page** (Instagram app → Settings → linked Page).

**2. Meta app + token** (you post to your OWN account, so **no App Review needed** —
App Review is only required to publish on *other* people's accounts)
- Create an app at <https://developers.facebook.com> → add **Instagram Graph API**.
- In **Graph API Explorer**, grant scopes: `instagram_basic`,
  `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`.
- Get your **Instagram Business account ID** (`IG_USER_ID`):
  `GET /me/accounts` → your Page → `GET /{page-id}?fields=instagram_business_account`.
- ⚠️ **Token must not expire** for true hands-off. Use a **System User token**:
  Business Settings → **System Users** → add one → **Generate token** with the
  scopes above and **no expiry**. That's your `IG_ACCESS_TOKEN`.
  *(A normal user token expires in ~60 days and will silently break the cron.)*

**3. Free image host** (Instagram needs a public image URL)
- Get a free key at <https://api.imgbb.com> → `IMGBB_API_KEY`.

**4. OpenAI**
- `OPENAI_API_KEY` from an OpenAI org that is **verified** (for `gpt-image-1`).

**5. Add GitHub repo secrets** (Repo → Settings → Secrets and variables → Actions):
| Secret | Value |
|---|---|
| `OPENAI_API_KEY` | your OpenAI key |
| `IG_USER_ID` | Instagram Business account id |
| `IG_ACCESS_TOKEN` | non-expiring System User token |
| `IMGBB_API_KEY` | imgbb key |

(Optional variable `IMG_QUALITY` = `low`/`medium`/`high`.)

### Use it
- **Test now:** repo → **Actions → Instagram daily poster → Run workflow** (manual trigger).
- **Automatic:** it then runs daily at **09:30 IST** (`cron: '0 4 * * *'` — edit in the workflow).
- Change the time or rotation, or a slogan/scene, by editing the workflow / the `.md`.

### Test the poster locally first (recommended)
```powershell
$env:OPENAI_API_KEY="sk-xxx"; node marketing/generate.js --today
$env:IG_USER_ID="17841..."; $env:IG_ACCESS_TOKEN="EAAG..."; $env:IMGBB_API_KEY="xxx"
node marketing/post.js            # posts marketing/daily/poster.png
# or preview without posting:
node marketing/post.js --dry-run
```

## Customise
- **Slogans / scenes / captions:** edit `instagram-poster-prompts.md` — it's the
  single source of truth; the script re-reads it every run.
- **Logo text, colours, fonts, layout:** edit `overlaySvg()` in `generate.js`.
- **Wordmark:** currently "SafeTag" — change to "LIFE-TAG" in `overlaySvg()`.

## Cost (rough)
gpt-image-1 ≈ a few US cents to ~US$0.15 per image depending on `--quality`.
30 images ≈ a few dollars. Start with `--day 1 --quality low` to sanity-check.
