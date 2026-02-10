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
