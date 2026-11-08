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
2️⃣ YouTube Search          → Found? ✅ Done!
   (localized query)             ↓ Not found  
3️⃣ TMDB (English)          → Fallback trailer
```

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
playing unrelated episodes as recaps, although some valid long/atypically
named videos may be omitted.

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
