# TubeFix — YouTube Metadata Fixer

Fix a video's title, description, tags and thumbnail without re-uploading it.
A static web app — no server, no cost, everything runs in your browser.

## What it does

1. **Connect** — sign in with Google (YouTube permission). TubeFix never sees
   your password; revoke anytime at myaccount.google.com/permissions.
2. **Pick a video** — loads your recent uploads, click one to edit it.
3. **Metadata** — type a short topic, generate 6 title options, a description
   and tags (same generator as the TubeFix extension), edit anything, then
   **Apply to YouTube**.
4. **Thumbnail** — pick an image (1280 × 720 recommended) and set it on the
   video. Custom thumbnails need a phone-verified YouTube account.

## Run it

Google sign-in does not work from a file opened directly, so serve the folder:

```bash
cd tubefix
python3 -m http.server 8000
```

Then open http://localhost:8000

## First-time setup (free, about 10 minutes)

1. Go to Google Cloud Console and create a project (any name).
2. APIs & Services → Library → search **YouTube Data API v3** → Enable.
3. APIs & Services → Credentials → Create Credentials → OAuth client ID →
   application type **Web application**.
4. Under **Authorized JavaScript origins**, add `http://localhost:8000`
   (add your live site origin later the same way).
5. Paste the client ID into TubeFix's Connect step and save it. It is stored
   only in your own browser.

For personal use the app can stay in Testing mode — no Google verification
needed. For a public launch, Google must verify the app and approve a quota
increase.

## Quota (free, not a price)

YouTube gives each app project 10,000 API units a day, free, shared across
all its users. A metadata fix costs 50 units, a thumbnail set costs 50.
If the day's allowance runs out, actions pause until tomorrow — nobody is
charged. Quota increases are requested from Google via review, not purchase.

## Files

- `index.html` — the app page (4 steps: Connect, Pick a video, Metadata, Thumbnail)
- `styles.css` — plain, organized styling
- `app.js` — sign-in, video list, metadata update, thumbnail upload, generator
