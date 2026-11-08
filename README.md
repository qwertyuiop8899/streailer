# 🎬 Streailer - Multi-Language Trailer Provider for Stremio

Watch movie and TV series trailers in **your language** directly within Stremio!

![Streailer Configuration](https://i.imgur.com/rEN6X72.jpeg)

---

## 🆕 v1.1.2 - External Link Mode

> **Having playback issues?** Some users experience problems with the internal player (black screen, poster stuck in background, infinite buffering).

### ✅ The Solution: External Link

With the new **External Link** option, trailers open directly in your device's **YouTube app** instead of Stremio's built-in player.

**How to enable:**
1. Go to the [configuration page](https://streailer.elfhosted.com/configure)
2. Enable the **🔗 External Link** toggle
3. Click **Install Addon** (reinstall with new configuration)
4. Trailers now open in the external YouTube app! 🎉

---

## ✨ Features

- **11 Languages Supported**: English, Spanish, Portuguese, German, French, Italian, Russian, Japanese, Hindi, Turkish
- **Smart Fallback**: TMDB → YouTube → TMDB English
- **Dual ID Support**: Works with IMDb and TMDB IDs
- **Localized Search**: Finds dubbed trailers in your language
- **External Link Mode**: Open trailers in external YouTube app (fixes playback issues)

## 🎯 How It Works

```
1️⃣ TMDB (Your Language)    → Found? ✅ Done!
                                 ↓ Not found
2️⃣ YouTube Search          → Localized / dubbed / subtitled
                                 ↓ No eligible match
3️⃣ TMDB (pt-PT)           → Optional fallback for pt-BR
                                 ↓ Not found
4️⃣ TMDB (English)         → Fallback trailer
                                 ↓ Not found
5️⃣ Neutral YouTube         → Last fallback, when permitted
```

For a `pt-BR` request with strict language disabled, Streailer first tries
TMDB Brazil and localized YouTube search; when neither provides a localized
candidate, it also checks TMDB Portugal (`pt-PT`) before English TMDB trailers
or language-neutral YouTube uploads. Portuguese subtitles are not assumed to
be Brazilian merely because a title says `legendado`; TMDB locale and region
metadata are used when provided. Strict-language mode never permits the
cross-region fallback.

The optional **Strict Trailer Language** setting requires language evidence from
TMDB metadata or the YouTube title and disables the TMDB English fallback.
It defaults to off for existing installations. Configure it on the installation
page or pass `strictLanguage=true` in a query-string configuration.

YouTube search evaluates multiple matching videos and rejects explicit language
mismatches. Brazilian Portuguese searches prefer dubbed trailers, then localized
trailers and Portuguese subtitles. Movie searches use the canonical TMDB title,
original title, and release year. A search result must contain a canonical title
and that release year, with no contradictory year or numbered sequel suffix.
Yearless results and movies with missing identity metadata are skipped by the
search fallback; videos linked directly to the requested TMDB ID remain eligible.
Season searches require the requested season rather than the series premiere year.
This deliberately favors missing a trailer over selecting another film with the
same translated title. Search titles are still third-party metadata, not a
guarantee about the actual video content.

Scraped YouTube videos must show a trailer/teaser cue, a matching identity,
and a verified duration of no more than `MAX_TRAILER_DURATION_SECONDS`
(default: 600 seconds). A phrase such as "Full Movie Trailer" is allowed
when the video actually fits the duration limit; complete movies, full
episodes, reviews, and reactions are not. Search extraction considers up to
30 results, then probes no more than ten eligible candidates.

Recap searches separately validate each result's paired title and video ID,
series name, requested season and duration, with a default
`MAX_RECAP_DURATION_SECONDS` of 3600 seconds. This deliberately avoids
playing unrelated episodes as recaps, including numbered items such as
`EP01`, `E01`, `S01E01`, and `1x01`, although some valid long or atypically
named videos may be omitted.

### Optional YouTube Data API verification

Set `YOUTUBE_API_KEY` in the **server container environment** (recommended)
or paste a per-installation API key into the masked **YouTube Data API Key**
field on the `/configure` page. When the field is empty the server environment
key is used. A browser-provided key overrides the server key only for that
installation, and the app avoids printing credentials in its own request logs.

**Security warning:** Browser-entered keys must be included in the generated
Stremio installation/manifest URL, which is also stored by the client.
Anyone who can access that URL, browser history, proxy access logs or a shared
manifest link may recover the key. Password masking does not encrypt it.
Do not share such installation URLs, and prefer the server environment variable
on public or shared deployments. Never commit a key to GitHub. Apply Google Cloud
**YouTube Data API v3** API restrictions and suitable usage limits; use
source-IP application restrictions for server-side keys where supported.

The verifier queries the official YouTube Data API v3 `videos.list` endpoint
(parts `snippet,contentDetails,status`). Responses are cached separately for
each API key using SHA-256-scoped cache keys, so one user's verified result is
not reused under another user's credential. The legacy TMDB/YouTube fallback
still works if a key is missing, expired, rate-limited, or the API is unavailable.

The optional API checks each candidate's published duration, livestream,
private/deleted status and country restrictions; the existing YouTube watch
page check remains in place. Exact matching `snippet.defaultAudioLanguage`
provides positive evidence about the **default spoken audio track** and can
increase ranking confidence. An unspecified region such as `pt` does not
prove `pt-BR`. The `snippet.defaultLanguage` field describes metadata text,
not spoken audio. `contentDetails.caption=true` only indicates captions
exist: it cannot confirm **Portuguese** caption languages, hardcoded subtitles,
or optional alternative audio tracks. A video title claiming "legendado" or
"dublado" remains a *hint*, not a verified media-track inspection. The Data
API channel ID and channel title are identifiers, not proof of an official or
verified studio channel.

Successful responses are cached **in process for 6 hours**; missing video IDs
are cached for 15 minutes, up to 1,000 entries, without requiring Redis or
another service. A container restart clears this cache. Each API batch verifies
up to 50 IDs; current trailer selection requests metadata only for up to 30
ranked candidates per source/locale. Requests use a four-second timeout and
fall back to the existing checks after API errors. API region restrictions
refer to the country of the requested language (for example, `BR` for
`pt-BR`). Availability, identity and language still cannot be guaranteed
for every video, especially after changes to external metadata or playback
restrictions.

Availability checks use YouTube's published
country list for the country in the selected locale (for example, `BR` for `pt-BR`)
and skip known removed/private videos. Missing metadata or network failures leave
availability unknown. Titles and metadata cannot guarantee the spoken language
or playback from every user's location.

Run `npm run test:regression` for deterministic selection and HTTP configuration
tests. `npm test` also runs the existing live integration suite, which requires
TMDB, YouTube, and the Kitsu mapping service to be reachable.

## 📺 Supported Languages

| Tier 1 - Dubbing Markets | Tier 2 - Expansion |
|--------------------------|-------------------|
| 🇺🇸 English (US) | 🇷🇺 Russian |
| 🇲🇽 Spanish (Latin America) | 🇯🇵 Japanese |
| 🇧🇷 Portuguese (Brazil) | 🇮🇳 Hindi |
| 🇩🇪 German | 🇹🇷 Turkish |
| 🇫🇷 French | |
| 🇪🇸 Spanish (Spain) | |
| 🇮🇹 Italian | |

## 🚀 Installation

1. Go to the [Configuration Page](https://9aa032f52161-streailer.baby-beamup.club/configure)
2. Select your trailer language
3. **Optional**: Enable **External Link** if you have playback issues
4. Click **Install Addon**
5. Enjoy trailers in your language! 🎉

## 📝 Stream Icons

| Icon | Source |
|------|--------|
| 🎬 Trailer | TMDB (your language) |
| 🎬▶️ Trailer | YouTube |
| 🎬🇬🇧 Trailer | TMDB English fallback |
| 🔗 🎬 Trailer | External Link (YouTube app) |

## 🛠️ Self-Hosting

```bash
git clone https://github.com/YOUR_USERNAME/streailer.git
cd streailer
npm install
npm start
```

## 🚀 Deploy

See [README-BEAMUP.md](README-BEAMUP.md) for BeamUp deployment instructions.

## 📄 License

MIT

---

**Made with ❤️ for the Stremio community**
