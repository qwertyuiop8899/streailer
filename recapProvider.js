/**
 * Recap Provider - Season Recap Videos for TV Series
 * Searches YouTube for season recaps with language-specific fallback
 */

const fetch = require('node-fetch');

// TMDB API configuration
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_KEY = 'ad0f7351455041d8c9c0d4370a4b5fa5';

/**
 * Recap translations for YouTube search queries
 * langKeyword forces YouTube to return results in the correct language
 */
const RECAP_TRANSLATIONS = {
    'en-US': { recap: 'recap', season: 'Season', langKeyword: '' },
    'it-IT': { recap: 'recap', season: 'Stagione', langKeyword: 'italiano' },
    'es-MX': { recap: 'resumen', season: 'Temporada', langKeyword: 'español latino' },
    'es-ES': { recap: 'resumen', season: 'Temporada', langKeyword: 'español' },
    'pt-BR': { recap: 'recap', season: 'Temporada', langKeyword: 'português' },
    'pt-PT': { recap: 'recap', season: 'Temporada', langKeyword: 'português' },
    'de-DE': { recap: 'Recap', season: 'Staffel', langKeyword: 'deutsch' },
    'fr-FR': { recap: 'recap', season: 'Saison', langKeyword: 'français' },
    'ru-RU': { recap: 'recap', season: 'Сезон', langKeyword: 'русский' },
    'ja-JP': { recap: 'recap', season: 'シーズン', langKeyword: '日本語' },
    'hi-IN': { recap: 'recap', season: 'सीज़न', langKeyword: 'हिंदी' },
    'ta-IN': { recap: 'recap', season: 'சீசன்', langKeyword: 'தமிழ்' },
    'tr-TR': { recap: 'özet', season: 'Sezon', langKeyword: 'türkçe' }
};

/**
 * Language code to TMDB country code mapping
 */
const LANGUAGE_TO_COUNTRY = {
    'en-US': 'US',
    'it-IT': 'IT',
    'es-MX': 'MX',
    'es-ES': 'ES',
    'pt-BR': 'BR',
    'pt-PT': 'PT',
    'de-DE': 'DE',
    'fr-FR': 'FR',
    'ru-RU': 'RU',
    'ja-JP': 'JP',
    'hi-IN': 'IN',
    'ta-IN': 'IN',
    'tr-TR': 'TR'
};

/**
 * Provider ID to display name for YouTube search
 */
const PROVIDER_NAMES = {
    8: 'Netflix',
    119: 'Prime Video',
    9: 'Prime Video',
    337: 'Disney Plus',
    384: 'HBO Max',
    1899: 'Max',
    15: 'Hulu',
    350: 'Apple TV',
    531: 'Paramount Plus',
    283: 'Crunchyroll',
    2: 'Apple TV',
    3: 'Google Play',
    10: 'Amazon Video'
};

/**
 * Get recap translation for a language
 */
function getRecapTranslation(language) {
    return RECAP_TRANSLATIONS[language] || RECAP_TRANSLATIONS['en-US'];
}

/**
 * Search YouTube using HTML scraping
 * @param {string} query - Search query
 * @param {string} language - Language code (e.g. 'it-IT')
 */
async function searchYouTubeScraping(query, language = 'en-US') {
    try {
        const encodedQuery = encodeURIComponent(query);
        // Extract country and lang from language code (e.g. 'it-IT' -> gl=IT, hl=it)
        const [lang, country] = language.split('-');
        const gl = country || 'US';
        const hl = lang || 'en';
        const url = `https://www.youtube.com/results?search_query=${encodedQuery}&gl=${gl}&hl=${hl}`;

        console.log(`[RecapProvider] YouTube search: ${query} (gl=${gl}, hl=${hl})`);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept-Language': `${hl}-${gl},${hl};q=0.9,en;q=0.8`,
                'Cookie': `PREF=hl=${hl}&gl=${gl}; CONSENT=YES+`
            }
        });

        if (response.status !== 200) {
            console.log('[RecapProvider] YouTube scraping failed:', response.status);
            return null;
        }

        const html = await response.text();

        // Extract video ID
        const videoIdMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (!videoIdMatch) {
            console.log('[RecapProvider] No video ID found');
            return null;
        }

        const ytId = videoIdMatch[1];

        // Try to extract title
        let videoTitle = '';
        const titleMatch = html.match(/"title":\s*{\s*"runs":\s*\[\s*{\s*"text":\s*"([^"]+)"/);
        if (titleMatch) {
            videoTitle = titleMatch[1];
        } else {
            const simpleTitleMatch = html.match(/"title":\s*"([^"]+)"/);
            if (simpleTitleMatch) {
                videoTitle = simpleTitleMatch[1];
            }
        }

        if (!videoTitle) {
            console.log('[RecapProvider] Could not extract title');
            return null;
        }

        // Decode HTML entities
        videoTitle = videoTitle
            .replace(/\\u0026/g, '&')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');

        console.log(`[RecapProvider] Found: "${videoTitle}" (${ytId})`);
        return { ytId, title: videoTitle };

    } catch (e) {
        console.error('[RecapProvider] YouTube scraping error:', e);
        return null;
    }
}

/**
 * Get watch providers from TMDB for a TV series
 */
async function getWatchProviders(tmdbId, language = 'it-IT') {
    if (!TMDB_KEY) return null;

    const country = LANGUAGE_TO_COUNTRY[language] || 'US';

    try {
        const url = `${TMDB_BASE}/tv/${tmdbId}/watch/providers?api_key=${TMDB_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.results && data.results[country]) {
            const countryData = data.results[country];
            if (countryData.flatrate && countryData.flatrate.length > 0) {
                const provider = countryData.flatrate[0];
                const providerName = PROVIDER_NAMES[provider.provider_id] || provider.provider_name;
                console.log(`[RecapProvider] Watch provider for ${country}: ${providerName}`);
                return providerName;
            }
        }

        // Fallback to US
        if (country !== 'US' && data.results && data.results['US']) {
            const usData = data.results['US'];
            if (usData.flatrate && usData.flatrate.length > 0) {
                const provider = usData.flatrate[0];
                const providerName = PROVIDER_NAMES[provider.provider_id] || provider.provider_name;
                console.log(`[RecapProvider] Watch provider (US fallback): ${providerName}`);
                return providerName;
            }
        }

        console.log(`[RecapProvider] No watch provider found`);
        return null;
    } catch (e) {
        console.error('[RecapProvider] Error fetching watch providers:', e);
        return null;
    }
}

/**
 * Search for recap video on YouTube with fallback logic
 */
async function searchRecapVideo(seriesName, season, provider, language = 'it-IT') {
    const recapT = getRecapTranslation(language);
    const isEnglish = language.startsWith('en');
    const langKeyword = recapT.langKeyword ? ` ${recapT.langKeyword}` : '';

    // Step 1: Localized with provider + language keyword
    if (provider) {
        const query1 = `${seriesName} ${recapT.recap} ${recapT.season} ${season} ${provider}${langKeyword}`;
        const result1 = await searchYouTubeScraping(query1, language);
        if (result1) {
            console.log(`[RecapProvider] ✓ Found (step 1)`);
            return result1;
        }
    }

    // Step 2: Localized without provider + language keyword
    const query2 = `${seriesName} ${recapT.recap} ${recapT.season} ${season}${langKeyword}`;
    const result2 = await searchYouTubeScraping(query2, language);
    if (result2) {
        console.log(`[RecapProvider] ✓ Found (step 2)`);
        return result2;
    }

    // Skip English fallback if already English
    if (isEnglish) {
        console.log(`[RecapProvider] ✗ No recap found`);
        return null;
    }

    // Step 3: English with provider
    if (provider) {
        const query3 = `${seriesName} recap Season ${season} ${provider}`;
        const result3 = await searchYouTubeScraping(query3, 'en-US');
        if (result3) {
            console.log(`[RecapProvider] ✓ Found (step 3 EN)`);
            return result3;
        }
    }

    // Step 4: English without provider
    const query4 = `${seriesName} recap Season ${season}`;
    const result4 = await searchYouTubeScraping(query4, 'en-US');
    if (result4) {
        console.log(`[RecapProvider] ✓ Found (step 4 EN)`);
        return result4;
    }

    console.log(`[RecapProvider] ✗ No recap found`);
    return null;
}

/**
 * Get recap streams for a TV series
 * Returns array of recap streams for seasons 1 to (currentSeason - 1)
 * Order: Previous season first, then 1, 2, 3... up to (currentSeason - 2)
 */
async function getRecapStreams(tmdbId, seriesName, currentSeason, language = 'it-IT', useExternalLink = false, imdbId = null) {
    // Only for season >= 2
    if (currentSeason < 2) {
        console.log(`[RecapProvider] Season ${currentSeason} - no recaps needed`);
        return [];
    }

    console.log(`[RecapProvider] Searching recaps for "${seriesName}" (season ${currentSeason})`);

    const streams = [];
    const recapT = getRecapTranslation(language);

    // Get watch provider (only if we have tmdbId)
    let provider = null;
    if (tmdbId) {
        provider = await getWatchProviders(tmdbId, language);
    } else {
        console.log(`[RecapProvider] No TMDB ID - skipping watch providers`);
    }

    // Get recap for previous season first (most important)
    const previousSeason = currentSeason - 1;
    console.log(`[RecapProvider] Searching recap for Season ${previousSeason}`);

    const prevRecap = await searchRecapVideo(seriesName, previousSeason, provider, language);
    if (prevRecap) {
        const recapStreamName = useExternalLink
            ? `🔗 📝 Recap ${recapT.season} ${previousSeason}`
            : `📝 Recap ${recapT.season} ${previousSeason}`;

        const recapStream = {
            name: recapStreamName,
            title: prevRecap.title,
            behaviorHints: {
                notWebReady: true,
                bingeGroup: 'recap'
            }
        };

        if (useExternalLink) {
            recapStream.externalUrl = `https://www.youtube.com/watch?v=${prevRecap.ytId}`;
        } else {
            recapStream.ytId = prevRecap.ytId;
        }

        streams.push(recapStream);
    }

    // Get recaps for seasons 1 to (currentSeason - 2)
    for (let s = 1; s < previousSeason; s++) {
        console.log(`[RecapProvider] Searching recap for Season ${s}`);
        const recap = await searchRecapVideo(seriesName, s, provider, language);
        if (recap) {
            const recapStreamName = useExternalLink
                ? `🔗 📝 Recap ${recapT.season} ${s}`
                : `📝 Recap ${recapT.season} ${s}`;

            const recapStream = {
                name: recapStreamName,
                title: recap.title,
                behaviorHints: {
                    notWebReady: true,
                    bingeGroup: 'recap'
                }
            };

            if (useExternalLink) {
                recapStream.externalUrl = `https://www.youtube.com/watch?v=${recap.ytId}`;
            } else {
                recapStream.ytId = recap.ytId;
            }

            streams.push(recapStream);
        }
    }

    console.log(`[RecapProvider] Total recaps found: ${streams.length}`);
    return streams;
}

module.exports = {
    getRecapStreams,
    getWatchProviders,
    getRecapTranslation
};
