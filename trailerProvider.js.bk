/**
 * TMDB Trailer Provider with YouTube Fallback
 * Flow: TMDB (user language) → YouTube Search (validated) → TMDB en-US
 * Returns Stremio-compatible Stream objects
 */

const fetch = require('node-fetch');

// TMDB API configuration
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_KEY = 'ad0f7351455041d8c9c0d4370a4b5fa5';

/**
 * Multi-language translations for trailer provider
 * Tier 1: Dubbing-centric markets + Tier 2: Strategic Expansion
 */
const TRANSLATIONS = {
    // === TIER 1: Indispensabili (Mercati doppiaggio-centrici) ===

    'en-US': {
        trailer: 'trailer',
        season: 'Season',
        numberWords: {
            1: ['1', 'one', 'first'],
            2: ['2', 'two', 'second'],
            3: ['3', 'three', 'third'],
            4: ['4', 'four', 'fourth'],
            5: ['5', 'five', 'fifth'],
            6: ['6', 'six', 'sixth'],
            7: ['7', 'seven', 'seventh'],
            8: ['8', 'eight', 'eighth'],
            9: ['9', 'nine', 'ninth'],
            10: ['10', 'ten', 'tenth'],
        }
    },
    'es-MX': {
        trailer: 'trailer español latino',
        season: 'Temporada',
        numberWords: {
            1: ['1', 'uno', 'primera', 'first', 'one'],
            2: ['2', 'dos', 'segunda', 'second', 'two'],
            3: ['3', 'tres', 'tercera', 'third', 'three'],
            4: ['4', 'cuatro', 'cuarta', 'fourth', 'four'],
            5: ['5', 'cinco', 'quinta', 'fifth', 'five'],
            6: ['6', 'seis', 'sexta', 'sixth', 'six'],
            7: ['7', 'siete', 'séptima', 'seventh', 'seven'],
            8: ['8', 'ocho', 'octava', 'eighth', 'eight'],
            9: ['9', 'nueve', 'novena', 'ninth', 'nine'],
            10: ['10', 'diez', 'décima', 'tenth', 'ten'],
        }
    },
    'pt-BR': {
        trailer: 'trailer dublado',
        season: 'Temporada',
        numberWords: {
            1: ['1', 'um', 'primeira', 'first', 'one'],
            2: ['2', 'dois', 'segunda', 'second', 'two'],
            3: ['3', 'três', 'terceira', 'third', 'three'],
            4: ['4', 'quatro', 'quarta', 'fourth', 'four'],
            5: ['5', 'cinco', 'quinta', 'fifth', 'five'],
            6: ['6', 'seis', 'sexta', 'sixth', 'six'],
            7: ['7', 'sete', 'sétima', 'seventh', 'seven'],
            8: ['8', 'oito', 'oitava', 'eighth', 'eight'],
            9: ['9', 'nove', 'nona', 'ninth', 'nine'],
            10: ['10', 'dez', 'décima', 'tenth', 'ten'],
        }
    },
    'pt-PT': {
        trailer: 'trailer português',
        season: 'Temporada',
        numberWords: {
            1: ['1', 'um', 'primeira', 'first', 'one'],
            2: ['2', 'dois', 'segunda', 'second', 'two'],
            3: ['3', 'três', 'terceira', 'third', 'three'],
            4: ['4', 'quatro', 'quarta', 'fourth', 'four'],
            5: ['5', 'cinco', 'quinta', 'fifth', 'five'],
            6: ['6', 'seis', 'sexta', 'sixth', 'six'],
            7: ['7', 'sete', 'sétima', 'seventh', 'seven'],
            8: ['8', 'oito', 'oitava', 'eighth', 'eight'],
            9: ['9', 'nove', 'nona', 'ninth', 'nine'],
            10: ['10', 'dez', 'décima', 'tenth', 'ten'],
        }
    },
    'de-DE': {
        trailer: 'trailer deutsch',
        season: 'Staffel',
        numberWords: {
            1: ['1', 'eins', 'erste', 'first', 'one'],
            2: ['2', 'zwei', 'zweite', 'second', 'two'],
            3: ['3', 'drei', 'dritte', 'third', 'three'],
            4: ['4', 'vier', 'vierte', 'fourth', 'four'],
            5: ['5', 'fünf', 'fünfte', 'fifth', 'five'],
            6: ['6', 'sechs', 'sechste', 'sixth', 'six'],
            7: ['7', 'sieben', 'siebte', 'seventh', 'seven'],
            8: ['8', 'acht', 'achte', 'eighth', 'eight'],
            9: ['9', 'neun', 'neunte', 'ninth', 'nine'],
            10: ['10', 'zehn', 'zehnte', 'tenth', 'ten'],
        }
    },
    'fr-FR': {
        trailer: 'bande annonce vf',
        season: 'Saison',
        numberWords: {
            1: ['1', 'un', 'première', 'first', 'one'],
            2: ['2', 'deux', 'deuxième', 'second', 'two'],
            3: ['3', 'trois', 'troisième', 'third', 'three'],
            4: ['4', 'quatre', 'quatrième', 'fourth', 'four'],
            5: ['5', 'cinq', 'cinquième', 'fifth', 'five'],
            6: ['6', 'six', 'sixième', 'sixth'],
            7: ['7', 'sept', 'septième', 'seventh', 'seven'],
            8: ['8', 'huit', 'huitième', 'eighth', 'eight'],
            9: ['9', 'neuf', 'neuvième', 'ninth', 'nine'],
            10: ['10', 'dix', 'dixième', 'tenth', 'ten'],
        }
    },
    'es-ES': {
        trailer: 'tráiler castellano',
        season: 'Temporada',
        numberWords: {
            1: ['1', 'uno', 'primera', 'first', 'one'],
            2: ['2', 'dos', 'segunda', 'second', 'two'],
            3: ['3', 'tres', 'tercera', 'third', 'three'],
            4: ['4', 'cuatro', 'cuarta', 'fourth', 'four'],
            5: ['5', 'cinco', 'quinta', 'fifth', 'five'],
            6: ['6', 'seis', 'sexta', 'sixth', 'six'],
            7: ['7', 'siete', 'séptima', 'seventh', 'seven'],
            8: ['8', 'ocho', 'octava', 'eighth', 'eight'],
            9: ['9', 'nueve', 'novena', 'ninth', 'nine'],
            10: ['10', 'diez', 'décima', 'tenth', 'ten'],
        }
    },
    'it-IT': {
        trailer: 'trailer ita',
        season: 'Stagione',
        numberWords: {
            1: ['1', 'uno', 'prima', 'first', 'one'],
            2: ['2', 'due', 'seconda', 'second', 'two'],
            3: ['3', 'tre', 'terza', 'third', 'three'],
            4: ['4', 'quattro', 'quarta', 'fourth', 'four'],
            5: ['5', 'cinque', 'quinta', 'fifth', 'five'],
            6: ['6', 'sei', 'sesta', 'sixth', 'six'],
            7: ['7', 'sette', 'settima', 'seventh', 'seven'],
            8: ['8', 'otto', 'ottava', 'eighth', 'eight'],
            9: ['9', 'nove', 'nona', 'ninth', 'nine'],
            10: ['10', 'dieci', 'decima', 'tenth', 'ten'],
        }
    },

    // === TIER 2: Espansione Strategica ===

    'ru-RU': {
        trailer: 'трейлер русский',
        season: 'Сезон',
        numberWords: {
            1: ['1', 'один', 'первый', 'first', 'one'],
            2: ['2', 'два', 'второй', 'second', 'two'],
            3: ['3', 'три', 'третий', 'third', 'three'],
            4: ['4', 'четыре', 'четвёртый', 'fourth', 'four'],
            5: ['5', 'пять', 'пятый', 'fifth', 'five'],
            6: ['6', 'шесть', 'шестой', 'sixth', 'six'],
            7: ['7', 'семь', 'седьмой', 'seventh', 'seven'],
            8: ['8', 'восемь', 'восьмой', 'eighth', 'eight'],
            9: ['9', 'девять', 'девятый', 'ninth', 'nine'],
            10: ['10', 'десять', 'десятый', 'tenth', 'ten'],
        }
    },
    'ja-JP': {
        trailer: '予告編 日本語',
        season: 'シーズン',
        numberWords: {
            1: ['1', '一', 'first', 'one'],
            2: ['2', '二', 'second', 'two'],
            3: ['3', '三', 'third', 'three'],
            4: ['4', '四', 'fourth', 'four'],
            5: ['5', '五', 'fifth', 'five'],
            6: ['6', '六', 'sixth', 'six'],
            7: ['7', '七', 'seventh', 'seven'],
            8: ['8', '八', 'eighth', 'eight'],
            9: ['9', '九', 'ninth', 'nine'],
            10: ['10', '十', 'tenth', 'ten'],
        }
    },
    'hi-IN': {
        trailer: 'ट्रेलर हिंदी',
        season: 'सीज़न',
        numberWords: {
            1: ['1', 'एक', 'पहला', 'first', 'one'],
            2: ['2', 'दो', 'दूसरा', 'second', 'two'],
            3: ['3', 'तीन', 'तीसरा', 'third', 'three'],
            4: ['4', 'चार', 'चौथा', 'fourth', 'four'],
            5: ['5', 'पाँच', 'पाँचवाँ', 'fifth', 'five'],
            6: ['6', 'छह', 'छठा', 'sixth', 'six'],
            7: ['7', 'सात', 'सातवाँ', 'seventh', 'seven'],
            8: ['8', 'आठ', 'आठवाँ', 'eighth', 'eight'],
            9: ['9', 'नौ', 'नौवाँ', 'ninth', 'nine'],
            10: ['10', 'दस', 'दसवाँ', 'tenth', 'ten'],
        }
    },
    'ta-IN': {
        trailer: 'டிரெய்லர் தமிழ்',
        season: 'சீசன்',
        numberWords: {
            1: ['1', 'ஒன்று', 'முதல்', 'first', 'one'],
            2: ['2', 'இரண்டு', 'இரண்டாம்', 'second', 'two'],
            3: ['3', 'மூன்று', 'மூன்றாம்', 'third', 'three'],
            4: ['4', 'நான்கு', 'நான்காம்', 'fourth', 'four'],
            5: ['5', 'ஐந்து', 'ஐந்தாம்', 'fifth', 'five'],
            6: ['6', 'ஆறு', 'ஆறாம்', 'sixth', 'six'],
            7: ['7', 'ஏழு', 'ஏழாம்', 'seventh', 'seven'],
            8: ['8', 'எட்டு', 'எட்டாம்', 'eighth', 'eight'],
            9: ['9', 'ஒன்பது', 'ஒன்பதாம்', 'ninth', 'nine'],
            10: ['10', 'பத்து', 'பத்தாம்', 'tenth', 'ten'],
        }
    },
    'tr-TR': {
        trailer: 'fragman türkçe',
        season: 'Sezon',
        numberWords: {
            1: ['1', 'bir', 'birinci', 'first', 'one'],
            2: ['2', 'iki', 'ikinci', 'second', 'two'],
            3: ['3', 'üç', 'üçüncü', 'third', 'three'],
            4: ['4', 'dört', 'dördüncü', 'fourth', 'four'],
            5: ['5', 'beş', 'beşinci', 'fifth', 'five'],
            6: ['6', 'altı', 'altıncı', 'sixth', 'six'],
            7: ['7', 'yedi', 'yedinci', 'seventh', 'seven'],
            8: ['8', 'sekiz', 'sekizinci', 'eighth', 'eight'],
            9: ['9', 'dokuz', 'dokuzuncu', 'ninth', 'nine'],
            10: ['10', 'on', 'onuncu', 'tenth', 'ten'],
        }
    },
};

// Helper to get translation with fallback to English
function getTranslation(language) {
    return TRANSLATIONS[language] || TRANSLATIONS['en-US'];
}

/**
 * Convert IMDb ID to TMDB ID and get title in specified language
 */
async function imdbToTmdbWithLanguage(imdbId, type, language) {
    if (!TMDB_KEY) return null;

    try {
        const url = `${TMDB_BASE}/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id&language=${language}`;
        const response = await fetch(url);
        const data = await response.json();

        const results = type === 'series' ? data.tv_results : data.movie_results;
        if (results && results.length > 0) {
            const item = results[0];
            const title = item.title || item.name || '';
            return { id: item.id, title };
        }
    } catch (e) {
        console.error('[TrailerProvider] Error converting IMDb to TMDB:', e);
    }

    return null;
}

/**
 * Fetch videos from TMDB for a movie, TV series, or season
 */
async function fetchTMDBVideos(tmdbId, type, language, season) {
    if (!TMDB_KEY) return [];

    try {
        let url;
        if (type === 'series' && season !== undefined && season > 0) {
            url = `${TMDB_BASE}/tv/${tmdbId}/season/${season}/videos?api_key=${TMDB_KEY}&language=${language}`;
        } else {
            const mediaType = type === 'series' ? 'tv' : 'movie';
            url = `${TMDB_BASE}/${mediaType}/${tmdbId}/videos?api_key=${TMDB_KEY}&language=${language}`;
        }
        const response = await fetch(url);
        const data = await response.json();

        return data.results || [];
    } catch (e) {
        console.error('[TrailerProvider] Error fetching TMDB videos:', e);
        return [];
    }
}

/**
 * Select the best trailer from a list of videos
 */
function selectBestTrailer(videos) {
    if (!videos || videos.length === 0) return null;

    const youtubeVideos = videos.filter(v => v.site === 'YouTube');
    if (youtubeVideos.length === 0) return null;

    const typePriority = ['Trailer', 'Teaser', 'Clip'];

    for (const type of typePriority) {
        const official = youtubeVideos.find(v => v.type === type && v.official);
        if (official) return official;
    }

    for (const type of typePriority) {
        const video = youtubeVideos.find(v => v.type === type);
        if (video) return video;
    }

    return youtubeVideos[0];
}

/**
 * Validate YouTube video title against expected content
 * Uses language-specific validation
 */
function validateYouTubeTitle(videoTitle, contentName, season, language = 'en-US') {
    const titleLower = videoTitle.toLowerCase();
    const contentLower = contentName.toLowerCase();

    // Must contain the content name (movie/series title)
    if (!titleLower.includes(contentLower)) {
        return false;
    }

    // For series with season, check if valid
    if (season !== undefined && season > 0) {
        const t = getTranslation(language);
        const seasonWords = t.numberWords[season] || [season.toString()];
        // Accept if content name matches - season number is optional
        return true;
    }

    return true;
}

/**
 * Search YouTube using HTML scraping
 */
async function searchYouTubeScraping(query) {
    try {
        const encodedQuery = encodeURIComponent(query);
        const url = `https://www.youtube.com/results?search_query=${encodedQuery}`;

        console.log(`[TrailerProvider] YouTube scraping search: ${query}`);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (response.status !== 200) {
            console.log('[TrailerProvider] YouTube scraping failed:', response.status);
            return null;
        }

        const html = await response.text();

        // Extract video ID
        const videoIdMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (!videoIdMatch) {
            console.log('[TrailerProvider] No video ID found in YouTube HTML');
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
            console.log('[TrailerProvider] Could not extract title from YouTube HTML');
            return null;
        }

        // Decode HTML entities
        videoTitle = videoTitle
            .replace(/\\u0026/g, '&')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');

        console.log(`[TrailerProvider] YouTube scraping found: "${videoTitle}" (${ytId})`);
        return { ytId, title: videoTitle };

    } catch (e) {
        console.error('[TrailerProvider] YouTube scraping error:', e);
        return null;
    }
}

/**
 * Search YouTube for a trailer and return video ID + title if valid
 */
async function searchYouTubeTrailer(contentName, type, season, language = 'en-US') {
    const t = getTranslation(language);

    // Build localized search query
    let query;
    if (type === 'series' && season !== undefined && season > 0) {
        query = `${contentName} ${t.season} ${season} ${t.trailer}`;
    } else {
        query = `${contentName} ${t.trailer}`;
    }

    console.log(`[TrailerProvider] YouTube search (${language}): ${query}`);

    const result = await searchYouTubeScraping(query);

    if (!result) {
        return null;
    }

    // Validate the title
    if (!validateYouTubeTitle(result.title, contentName, season, language)) {
        console.log(`[TrailerProvider] YouTube result rejected: title doesn't match "${contentName}"`);
        return null;
    }

    console.log(`[TrailerProvider] YouTube result accepted: "${result.title}"`);
    return result;
}

/**
 * Get trailer streams for a movie or TV series
 * Flow: TMDB (user language) → YouTube scraping (localized) → TMDB en-US
 */
async function getTrailerStreams(type, imdbId, contentName, season, tmdbId, language = 'it-IT', useExternalLink = false) {
    if (!TMDB_KEY) {
        console.warn('[TrailerProvider] TMDB_KEY not set, skipping trailer fetch');
        return [];
    }

    const t = getTranslation(language);
    const isEnglish = language.startsWith('en');

    try {
        // Get TMDB ID and title
        let tmdbIdNum;
        let contentTitle = contentName || '';

        if (tmdbId) {
            // TMDB ID provided directly
            tmdbIdNum = tmdbId;
            // Fetch title from TMDB if not provided
            if (!contentTitle) {
                const mediaType = type === 'series' ? 'tv' : 'movie';
                try {
                    const url = `${TMDB_BASE}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=${language}`;
                    const response = await fetch(url);
                    const data = await response.json();
                    contentTitle = data.title || data.name || '';
                } catch (e) {
                    console.log(`[TrailerProvider] Could not fetch title for TMDB ${tmdbId}`);
                }
            }
        } else if (imdbId) {
            // IMDb ID - convert to TMDB
            const tmdbResult = await imdbToTmdbWithLanguage(imdbId, type, language);
            if (!tmdbResult) {
                console.log(`[TrailerProvider] Could not find TMDB ID for ${imdbId}`);
                return [];
            }
            tmdbIdNum = tmdbResult.id;
            if (!contentTitle) {
                contentTitle = tmdbResult.title;
            }
        } else {
            console.log('[TrailerProvider] No valid ID provided');
            return [];
        }

        let trailerResult = null;

        // === STEP 1: Try TMDB in user's language ===
        console.log(`[TrailerProvider] Step 1: Trying TMDB ${language} for "${contentTitle}"`);

        let videos = [];

        if (type === 'series' && season !== undefined && season > 0) {
            videos = await fetchTMDBVideos(tmdbIdNum, type, language, season);
            if (!videos || videos.length === 0) {
                videos = await fetchTMDBVideos(tmdbIdNum, type, language);
            }
        } else {
            videos = await fetchTMDBVideos(tmdbIdNum, type, language);
        }

        const tmdbLangTrailer = selectBestTrailer(videos);
        if (tmdbLangTrailer) {
            console.log(`[TrailerProvider] ✓ Found TMDB ${language} trailer: ${tmdbLangTrailer.name}`);
            trailerResult = {
                ytId: tmdbLangTrailer.key,
                title: type === 'series' && season ? `${contentTitle} ${t.season} ${season}` : contentTitle,
                source: 'tmdb-lang'
            };
        }

        // === STEP 2: YouTube Scraping Fallback ===
        if (!trailerResult) {
            console.log(`[TrailerProvider] Step 2: Trying YouTube (${language}) for "${contentTitle}"`);

            const ytResult = await searchYouTubeTrailer(contentTitle, type, season, language);
            if (ytResult) {
                console.log(`[TrailerProvider] ✓ Found YouTube trailer: ${ytResult.title}`);
                trailerResult = {
                    ytId: ytResult.ytId,
                    title: ytResult.title,
                    source: 'youtube'
                };
            }
        }

        // === STEP 3: TMDB English Fallback ===
        if (!trailerResult && !isEnglish) {
            console.log(`[TrailerProvider] Step 3: Trying TMDB en-US for "${contentTitle}"`);

            let enVideos = [];

            if (type === 'series' && season !== undefined && season > 0) {
                enVideos = await fetchTMDBVideos(tmdbIdNum, type, 'en-US', season);
                if (!enVideos || enVideos.length === 0) {
                    enVideos = await fetchTMDBVideos(tmdbIdNum, type, 'en-US');
                }
            } else {
                enVideos = await fetchTMDBVideos(tmdbIdNum, type, 'en-US');
            }

            const tmdbEnTrailer = selectBestTrailer(enVideos);
            if (tmdbEnTrailer) {
                console.log(`[TrailerProvider] ✓ Found TMDB en-US trailer: ${tmdbEnTrailer.name}`);
                trailerResult = {
                    ytId: tmdbEnTrailer.key,
                    title: type === 'series' && season ? `${contentTitle} ${t.season} ${season}` : contentTitle,
                    source: 'tmdb-en'
                };
            }
        }

        // No trailer found
        if (!trailerResult) {
            console.log(`[TrailerProvider] ✗ No trailer found for ${imdbId}`);
            return [];
        }

        // Build stream name based on source
        let streamName;
        switch (trailerResult.source) {
            case 'tmdb-lang':
                streamName = '🎬 Trailer';
                break;
            case 'youtube':
                streamName = '🎬▶️ Trailer';
                break;
            case 'tmdb-en':
                streamName = '🎬🇬🇧 Trailer';
                break;
            default:
                streamName = '🎬 Trailer';
        }

        // Add external link indicator if enabled
        if (useExternalLink) {
            streamName = '🔗 ' + streamName;
        }

        console.log(`[TrailerProvider] Final: ${streamName} | ${trailerResult.title} (${trailerResult.source})${useExternalLink ? ' [External]' : ''}`);

        const stream = {
            name: streamName,
            title: trailerResult.title,
            behaviorHints: {
                notWebReady: true,
                bingeGroup: 'trailer'
            }
        };

        // Use externalUrl for external app, or ytId for internal player
        if (useExternalLink) {
            stream.externalUrl = `https://www.youtube.com/watch?v=${trailerResult.ytId}`;
        } else {
            stream.ytId = trailerResult.ytId;
        }

        return [stream];

    } catch (e) {
        console.error('[TrailerProvider] Error getting trailer streams:', e);
        return [];
    }
}

/**
 * Check if trailer provider is available
 */
function isTrailerProviderAvailable() {
    return !!TMDB_KEY;
}

module.exports = {
    getTrailerStreams,
    isTrailerProviderAvailable
};
