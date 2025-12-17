# 🎬 Streailer - Multi-Language Trailer Provider for Stremio

Watch movie and TV series trailers in **your language** directly within Stremio!

![Streailer Configuration](https://github.com/Stremio/stremio-art/raw/main/originals/tymmesyde.gif)

## ✨ Features

- **11 Languages Supported**: English, Spanish (Latin America & Spain), Portuguese (Brazil), German, French, Italian, Russian, Japanese, Hindi, Turkish
- **Smart Fallback System**: TMDB → YouTube → TMDB English
- **Localized Search**: Finds dubbed trailers in your preferred language
- **No API Key Required**: Works out of the box

## 🎯 How It Works

```
1️⃣ TMDB (Your Language) → Found? ✅ Done!
                              ↓ Not found
2️⃣ YouTube Search         → Found? ✅ Done!
   (localized query)          ↓ Not found  
3️⃣ TMDB (English)         → Fallback trailer
```

## 📺 Supported Languages

| Tier 1 - Dubbing Markets | Tier 2 - Strategic |
|--------------------------|-------------------|
| 🇺🇸 English (US) | 🇷🇺 Russian |
| 🇲🇽 Spanish (Latin America) | 🇯🇵 Japanese |
| 🇧🇷 Portuguese (Brazil) | 🇮🇳 Hindi |
| 🇩🇪 German | 🇹🇷 Turkish |
| 🇫🇷 French | |
| 🇪🇸 Spanish (Spain) | |
| 🇮🇹 Italian | |

## 🚀 Installation

1. Go to the [Configure Page](https://9aa032f52161-strealier.baby-beamup.club/configure)
3. Select your preferred trailer language
4. Click **Install Addon**
5. Enjoy trailers in your language! 🎉

## 🛠️ Self-Hosting

```bash
git clone https://github.com/YOUR_USERNAME/streailer.git
cd streailer
npm install
npm start
```

The addon will be available at `http://localhost:7000`

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 7000 |
| `TMDB_API_KEY` | Custom TMDB API key | Built-in |

## 📝 Stream Icons

| Icon | Source |
|------|--------|
| 🎬 Trailer | TMDB (your language) |
| 🎬▶️ Trailer | YouTube |
| 🎬🇬🇧 Trailer | TMDB (English fallback) |

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

## 📄 License

MIT

---

**Made with ❤️ for the Stremio community**
