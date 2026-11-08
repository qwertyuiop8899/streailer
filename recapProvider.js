/**
 * Recap Provider - Season Recap Videos for TV Series
 * Searches YouTube for season recaps with language-specific fallback
 */

const fetch = require('node-fetch');
const { parseSearchCandidates, normalizeTitle, isAvailableInRegion, playerVideoInfo } = require('./trailerSelection');

// TMDB API configuration
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.TMDB_KEY || 'ad0f7351455041d8c9c0d4370a4b5fa5';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_SEASON = 50;

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

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
    'tr-TR': { recap: 'özet', season: 'Sezon', langKeyword: 'türkçe' },
    'pl-PL': { recap: 'skrót', season: 'Sezon', langKeyword: 'polski' },
    'nl-NL': { recap: 'recap', season: 'Seizoen', langKeyword: 'nederlands' },
    'hu-HU': { recap: 'összefoglaló', season: 'Évad', langKeyword: 'magyar' }
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
    'tr-TR': 'TR',
    'pl-PL': 'PL',
    'nl-NL': 'NL',
    'hu-HU': 'HU'
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
 * Validation helper: video title must contain series name
 */
function validateVideoTitle(videoTitle, seriesName) {
    if (!videoTitle || !seriesName) return false;
    const t = ' ' + normalizeTitle(videoTitle) + ' ';
    const s = ' ' + normalizeTitle(seriesName) + ' ';
    return s.trim().length > 1 && t.includes(s);
}

// Recap is a distinct feature from trailers and may be much longer.
// Reject full episodes and unverified results, but leave generous room for
// genuine season summaries.
const configuredRecapDuration = Number(process.env.MAX_RECAP_DURATION_SECONDS);
const MAX_RECAP_DURATION_SECONDS = Number.isInteger(configuredRecapDuration) &&
    configuredRecapDuration >= 60 && configuredRecapDuration <= 7200 ? configuredRecapDuration : 3600;
const RECAP_CUE = /(?:^|\s)(?:recap|recapitulation|recapitulacion|summary|summarized|resumen|resumo|riassunto|zusammenfassung|ozet|skrot|osszefoglalo|samenvatting|previously)(?=\s|$)|総集編|まとめ|あらすじ|要約|содержание|кратко|சுருக்கம்|सारांश/u;
const EPISODE_OR_MOVIE = /(?:^|\s)(?:(?:episode|episodio|episod|capitulo|ep)\s*0*\d+(?=\s|$)|(?:filme|film|movie|pelicula|episodio|episode)\s+(?:completo|completa|full|entire|complete)|(?:full|entire|complete)\s+(?:film|movie|episode))(?=\s|$)/u;
const SEASON_MARKER = /(?:^|\s)(?:season|temporada|stagione|staffel|saison|sezon|seizoen|evad|сезон|シーズン|सीज़न|சீசன்)\s*(\d{1,2})(?=\s|$)|(?:^|\s)(\d{1,2})\s*(?:season|temporada|stagione|staffel|saison|sezon|seizoen|evad|сезон|シーズン|सीज़न|சீசன்)(?=\s|$)|(?:^|\s)s(\d{1,2})(?=\s|$)/gu;

function isRelevantRecap(title, seriesName, season = null) {
    if (!validateVideoTitle(title, seriesName)) return false;
    const clean = normalizeTitle(title);
    if (!RECAP_CUE.test(clean) || EPISODE_OR_MOVIE.test(clean)) return false;
    if (season === null || season === undefined) return true;
    const seasons = [...clean.matchAll(SEASON_MARKER)].map(match => Number(match[1] || match[2] || match[3]));
    return seasons.length > 0 && seasons.every(n => n === season);
}

/**
 * Search YouTube using HTML scraping
 * @param {string} query - Search query
 * @param {string} language - Language code (e.g. 'it-IT')
 */
async function searchYouTubeScraping(query, language = 'en-US', seriesName = '', season = null) {
    try {
        const [lang, country] = language.split('-');
        const gl = country || 'US';
        const hl = lang || 'en';
        const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query) +
            '&gl=' + encodeURIComponent(gl) + '&hl=' + encodeURIComponent(hl);
        console.log('[RecapProvider] YouTube search: ' + query + ' (gl=' + gl + ', hl=' + hl + ')');
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': hl + '-' + gl + ',' + hl + ';q=0.9,en;q=0.8'
        };
        const response = await fetchWithTimeout(url, { headers });
        if (!response.ok) return null;

        // Keep each title paired with its own videoId; the old independent
        // regular expressions could combine unrelated titles and IDs.
        const candidates = parseSearchCandidates(await response.text());
        const eligible = candidates.filter(candidate =>
            isRelevantRecap(candidate.title, seriesName, season) && !candidate.live &&
            (candidate.durationSeconds == null ||
                candidate.durationSeconds <= MAX_RECAP_DURATION_SECONDS)).slice(0, 5);
        // Probe in parallel, but choose in YouTube result order. This avoids
        // stacking five 3-second watch timeouts on every recap query.
        const checked = await Promise.all(eligible.map(async candidate => {
            let watched = { durationSeconds: null, live: false };
            try {
                const page = await fetchWithTimeout(
                    'https://www.youtube.com/watch?v=' + candidate.ytId + '&hl=en',
                    { headers }, 3000);
                if (page.ok) {
                    const html = await page.text();
                    if (!isAvailableInRegion(html, gl)) return null;
                    watched = playerVideoInfo(html);
                }
            } catch (_) {
                // The result may have a search duration even if the watch
                // page is rate-limited; only verified durations are accepted.
            }
            if (watched.live || (watched.durationSeconds !== null &&
                watched.durationSeconds > MAX_RECAP_DURATION_SECONDS)) return null;
            if (watched.durationSeconds === null && candidate.durationSeconds == null) return null;
            return { ytId: candidate.ytId, title: candidate.title };
        }));
        const found = checked.find(Boolean) || null;
        if (found) console.log('[RecapProvider] Found verified recap: "' + found.title + '" (' + found.ytId + ')');
        return found;
    } catch (e) {
        console.error('[RecapProvider] YouTube scraping error:', e.message);
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
        const response = await fetchWithTimeout(url);
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
        const result1 = await searchYouTubeScraping(query1, language, seriesName, season);
        if (result1 && validateVideoTitle(result1.title, seriesName)) {
            console.log(`[RecapProvider] ✓ Found (step 1)`);
            return result1;
        }
    }

    // Step 2: Localized without provider + language keyword
    const query2 = `${seriesName} ${recapT.recap} ${recapT.season} ${season}${langKeyword}`;
    const result2 = await searchYouTubeScraping(query2, language, seriesName, season);
    if (result2 && validateVideoTitle(result2.title, seriesName)) {
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
        const result3 = await searchYouTubeScraping(query3, 'en-US', seriesName, season);
        if (result3 && validateVideoTitle(result3.title, seriesName)) {
            console.log(`[RecapProvider] ✓ Found (step 3 EN)`);
            return result3;
        }
    }

    // Step 4: English without provider
    const query4 = `${seriesName} recap Season ${season}`;
    const result4 = await searchYouTubeScraping(query4, 'en-US', seriesName, season);
    if (result4 && validateVideoTitle(result4.title, seriesName)) {
        console.log(`[RecapProvider] ✓ Found (step 4 EN)`);
        return result4;
    }

    console.log(`[RecapProvider] ✗ No recap found`);
    return null;
}

function formatStreamTarget(ytId, playerTarget = 'internal', useExternalLink = false) {
    let target = playerTarget || 'internal';
    if (target === 'internal' && (useExternalLink === true || useExternalLink === 'true')) {
        target = 'youtube';
    }

    if (target === 'smarttube') {
        return {
            streamProps: {
                externalUrl: `intent://www.youtube.com/watch?v=${ytId}#Intent;scheme=https;package=com.teamsmart.videomanager.tv;end`
            },
            prefix: '📺 '
        };
    } else if (target === 'tizentube') {
        return {
            streamProps: {
                externalUrl: `intent://www.youtube.com/watch?v=${ytId}#Intent;scheme=https;package=io.gh.reisxd.tizentube.cobalt;end`
            },
            prefix: '📺 '
        };
    } else if (target === 'youtube') {
        return {
            streamProps: {
                externalUrl: `https://www.youtube.com/watch?v=${ytId}`
            },
            prefix: '🔗 '
        };
    } else {
        return {
            streamProps: {
                ytId
            },
            prefix: ''
        };
    }
}

/**
 * Get recap streams for a TV series
 * Returns array of recap streams for seasons 1 to (currentSeason - 1)
 * Order: Previous season first, then 1, 2, 3... up to (currentSeason - 2)
 */
async function getRecapStreams(tmdbId, seriesName, currentSeason, language = 'it-IT', useExternalLink = false, imdbId = null, playerTarget = 'internal') {
    // Only for season >= 2, and max to prevent DoS
    if (currentSeason < 2 || currentSeason > MAX_SEASON) {
        console.log(`[RecapProvider] Season ${currentSeason} - outside supported range (2-${MAX_SEASON})`);
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
        const targetFormat = formatStreamTarget(prevRecap.ytId, playerTarget, useExternalLink);
        const recapStreamName = `${targetFormat.prefix}📝 Recap ${recapT.season} ${previousSeason}`;

        const recapStream = {
            name: recapStreamName,
            title: prevRecap.title,
            behaviorHints: {
                notWebReady: true,
                bingeGroup: 'recap'
            },
            ...targetFormat.streamProps
        };

        streams.push(recapStream);
    }

    // Get recaps for seasons (currentSeason - 2) down to 1 (closest to farthest)
    for (let s = previousSeason - 1; s >= 1; s--) {
        console.log(`[RecapProvider] Searching recap for Season ${s}`);
        const recap = await searchRecapVideo(seriesName, s, provider, language);
        if (recap) {
            const targetFormat = formatStreamTarget(recap.ytId, playerTarget, useExternalLink);
            const recapStreamName = `${targetFormat.prefix}📝 Recap ${recapT.season} ${s}`;

            const recapStream = {
                name: recapStreamName,
                title: recap.title,
                behaviorHints: {
                    notWebReady: true,
                    bingeGroup: 'recap'
                },
                ...targetFormat.streamProps
            };

            streams.push(recapStream);
        }
    }

    console.log(`[RecapProvider] Total recaps found: ${streams.length}`);
    return streams;
}

/**
 * Search for a generic recap video (for Kitsu anime where seasons are separate entries)
 * Returns a single recap stream with spoiler warning
 */
async function searchGenericRecap(seriesName, language = 'it-IT', useExternalLink = false, playerTarget = 'internal') {
    console.log(`[RecapProvider] Searching generic recap for "${seriesName}"`);

    const recapT = getRecapTranslation(language);
    const langKeyword = recapT.langKeyword ? ` ${recapT.langKeyword}` : '';

    // Search without season number
    const query = `${seriesName} ${recapT.recap}${langKeyword}`;
    const result = await searchYouTubeScraping(query, language, seriesName);

    if (!result) {
        console.log(`[RecapProvider] ✗ No generic recap found for "${seriesName}"`);
        return null;
    }

    console.log(`[RecapProvider] ✓ Generic recap found: "${result.title}"`);

    const targetFormat = formatStreamTarget(result.ytId, playerTarget, useExternalLink);
    const recapStreamName = `${targetFormat.prefix}⚠️ Recap (Spoiler Alert!)`;

    const recapStream = {
        name: recapStreamName,
        title: result.title,
        behaviorHints: {
            notWebReady: true,
            bingeGroup: 'recap'
        },
        ...targetFormat.streamProps
    };

    return recapStream;
}

module.exports = {
    getRecapStreams,
    getWatchProviders,
    getRecapTranslation,
    searchGenericRecap
};
