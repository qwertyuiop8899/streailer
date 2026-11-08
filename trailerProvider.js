/**
 * TMDB Trailer Provider with YouTube Fallback
 * Flow: TMDB (user language) → YouTube Search (validated) → TMDB en-US
 * Returns Stremio-compatible Stream objects
 */

const fetch = require('node-fetch');
const { normalizeTitle, withoutTitles, languageScore, matchesSearchIdentity, parseSearchCandidates, isAvailableInRegion, playerVideoInfo, isTrailerLikeTitle, isNonTrailerContent } = require('./trailerSelection');
const YOUTUBE_HEADERS = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' };

// TMDB API configuration
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.TMDB_KEY || 'ad0f7351455041d8c9c0d4370a4b5fa5';
const DEFAULT_TIMEOUT_MS = 8000;
// Configurable upper bound, shared by TMDB and YouTube search candidates.
// An invalid setting falls back to ten minutes rather than disabling safety.
const configuredDuration = Number(process.env.MAX_TRAILER_DURATION_SECONDS);
const MAX_TRAILER_DURATION_SECONDS = Number.isInteger(configuredDuration) && configuredDuration >= 30 && configuredDuration <= 3600
    ? configuredDuration : 600;

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { timeout: timeoutMs, ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

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
    'pl-PL': {
        trailer: 'zwiastun polski',
        season: 'Sezon',
        numberWords: {
            1: ['1', 'jeden', 'pierwszy', 'first', 'one'],
            2: ['2', 'dwa', 'drugi', 'second', 'two'],
            3: ['3', 'trzy', 'trzeci', 'third', 'three'],
            4: ['4', 'cztery', 'czwarty', 'fourth', 'four'],
            5: ['5', 'pięć', 'piąty', 'fifth', 'five'],
            6: ['6', 'sześć', 'szósty', 'sixth', 'six'],
            7: ['7', 'siedem', 'siódmy', 'seventh', 'seven'],
            8: ['8', 'osiem', 'ósmy', 'eighth', 'eight'],
            9: ['9', 'dziewięć', 'dziewiąty', 'ninth', 'nine'],
            10: ['10', 'dziesięć', 'dziesiąty', 'tenth', 'ten'],
        }
    },
    'nl-NL': {
        trailer: 'trailer nederlands',
        season: 'Seizoen',
        numberWords: {
            1: ['1', 'een', 'eerste', 'first', 'one'],
            2: ['2', 'twee', 'tweede', 'second', 'two'],
            3: ['3', 'drie', 'derde', 'third', 'three'],
            4: ['4', 'vier', 'vierde', 'fourth', 'four'],
            5: ['5', 'vijf', 'vijfde', 'fifth', 'five'],
            6: ['6', 'zes', 'zesde', 'sixth', 'six'],
            7: ['7', 'zeven', 'zevende', 'seventh', 'seven'],
            8: ['8', 'acht', 'achtste', 'eighth', 'eight'],
            9: ['9', 'negen', 'negende', 'ninth', 'nine'],
            10: ['10', 'tien', 'tiende', 'tenth', 'ten'],
        }
    },
    'hu-HU': {
        trailer: 'előzetes magyar',
        season: 'Évad',
        numberWords: {
            1: ['1', 'egy', 'első', 'first', 'one'],
            2: ['2', 'kettő', 'második', 'second', 'two'],
            3: ['3', 'három', 'harmadik', 'third', 'three'],
            4: ['4', 'négy', 'negyedik', 'fourth', 'four'],
            5: ['5', 'öt', 'ötödik', 'fifth', 'five'],
            6: ['6', 'hat', 'hatodik', 'sixth', 'six'],
            7: ['7', 'hét', 'hetedik', 'seventh', 'seven'],
            8: ['8', 'nyolc', 'nyolcadik', 'eighth', 'eight'],
            9: ['9', 'kilenc', 'kilencedik', 'ninth', 'nine'],
            10: ['10', 'tíz', 'tizedik', 'tenth', 'ten'],
        }
    },
};

// Helper to get translation with fallback to English
function getTranslation(language) {
    return TRANSLATIONS[language] || TRANSLATIONS['en-US'];
}

function mediaIdentity(item = {}, type) {
    const title = (type === 'series' ? item.name : item.title) || '';
    const originalTitle = (type === 'series' ? item.original_name : item.original_title) || '';
    const date = type === 'movie' ? item.release_date : null;
    const year = typeof date === 'string' && /^(?:18|19|20|21)\d{2}-\d{2}-\d{2}$/.test(date) ? Number(date.slice(0, 4)) : null;
    return { id: item.id, title, originalTitle, year, titles: [title, originalTitle].filter(Boolean) };
}

/**
 * Convert IMDb ID to TMDB ID and get title in specified language
 */
async function imdbToTmdbWithLanguage(imdbId, type, language) {
    if (!TMDB_KEY) return null;

    try {
        const url = `${TMDB_BASE}/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id&language=${language}`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) return null;
        const data = await response.json();

        const results = type === 'series' ? data.tv_results : data.movie_results;
        if (results && results.length > 0) {
            return mediaIdentity(results[0], type);
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
        const response = await fetchWithTimeout(url);
        const data = await response.json();

        return Array.isArray(data.results) ? data.results : [];
    } catch (e) {
        console.error('[TrailerProvider] Error fetching TMDB videos:', e);
        return [];
    }
}

/** Inspect once per YouTube ID, preserving availability checks and candidate order. */
async function inspectYouTubeVideo(ytId, region) {
    try {
        const response = await fetchWithTimeout(
            'https://www.youtube.com/watch?v=' + ytId + '&hl=en',
            { headers: YOUTUBE_HEADERS }, 3000);
        // Transient HTTP errors do not establish video unavailability.
        if (!response.ok) return { available: true, durationSeconds: null, live: false };
        const html = await response.text();
        return { available: isAvailableInRegion(html, region), ...playerVideoInfo(html) };
    } catch (_) {
        // A timeout or bot challenge is not proof of a regional block. The
        // duration rule below still fails closed for unverified scraped videos.
        return { available: true, durationSeconds: null, live: false };
    }
}

/** Check a bounded set of candidates while preserving their ranked order. */
async function selectAvailableTrailer(candidates, language, availability, requireDuration = false) {
    const region = language.split('-')[1];
    for (let offset = 0; offset < Math.min(candidates.length, 10); offset += 5) {
        const checked = await Promise.all(candidates.slice(offset, offset + 5).map(async candidate => {
            if (candidate.live === true || (candidate.durationSeconds != null &&
                candidate.durationSeconds > MAX_TRAILER_DURATION_SECONDS)) return null;
            if (!availability.has(candidate.ytId)) {
                availability.set(candidate.ytId, inspectYouTubeVideo(candidate.ytId, region));
            }
            const video = await availability.get(candidate.ytId);
            if (!video.available || video.live) return null;
            if (video.durationSeconds !== null && video.durationSeconds > MAX_TRAILER_DURATION_SECONDS) return null;
            // TMDB links have a verified movie/series association, whereas
            // scraped search results must establish their duration to qualify.
            if (requireDuration && video.durationSeconds === null &&
                candidate.durationSeconds == null) return null;
            return candidate;
        }));
        const available = checked.find(Boolean);
        if (available) return available;
    }
    return null;
}

async function selectBestTrailer(videos, contentName, language, strictLanguage, availability, regionLanguage = language) {
    const typePriority = ['Trailer', 'Teaser', 'Clip'];
    const candidates = videos.filter(v => v.site === 'YouTube' && /^[\w-]{11}$/.test(v.key) &&
        typePriority.includes(v.type) && !isNonTrailerContent(v.name, contentName) &&
        (v.type !== 'Clip' || isTrailerLikeTitle(v.name, contentName)))
        .map(video => ({
            ytId: video.key,
            title: video.name,
            score: languageScore(video.name, contentName, language, video),
            priority: (video.official ? 0 : 3) + typePriority.indexOf(video.type),
            supported: typePriority.includes(video.type)
        }))
        .filter(v => v.score >= (strictLanguage ? 1 : 0))
        .sort((a, b) => b.score - a.score || Number(b.supported) - Number(a.supported) || a.priority - b.priority);
    return selectAvailableTrailer(candidates, regionLanguage, availability);
}

async function findTMDBTrailer(tmdbId, type, language, season, contentName, strictLanguage, availability, regionLanguage = language) {
    const videos = await fetchTMDBVideos(tmdbId, type, language, season);
    const trailer = await selectBestTrailer(videos, contentName, language, strictLanguage, availability, regionLanguage);
    if (trailer || type !== 'series' || !(season > 0)) return trailer;
    const seriesVideos = await fetchTMDBVideos(tmdbId, type, language);
    return selectBestTrailer(seriesVideos, contentName, language, strictLanguage, availability, regionLanguage);
}

async function searchYouTubeScraping(query, language) {
    try {
        const [hl, gl] = language.split('-');
        const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query) +
            '&hl=' + encodeURIComponent(hl) + '&gl=' + encodeURIComponent(gl || 'US');
        const response = await fetchWithTimeout(url, { headers: YOUTUBE_HEADERS });
        if (!response.ok) return [];
        return parseSearchCandidates(await response.text());
    } catch (e) {
        console.error('[TrailerProvider] YouTube scraping error:', e.message);
        return [];
    }
}

function matchesSeason(title, season, language, titles) {
    if (!(season > 0)) return true;
    const normalized = withoutTitles(title, titles);
    const translations = [getTranslation(language), TRANSLATIONS['en-US']];
    const markers = [...new Set(translations.map(t => normalizeTitle(t.season)))];
    let found = false;
    // Also recognize another season explicitly, so "Season 1 & Season 2"
    // compilations cannot silently stand in for the requested season.
    const numbers = new Map();
    for (const t of translations) {
        for (const [n, words] of Object.entries(t.numberWords)) {
            for (const word of words) numbers.set(normalizeTitle(word), Number(n));
        }
    }
    for (const marker of markers) {
        const patterns = ['(?:^| )' + marker + ' (\\S+)', '(?:^| )(\\S+) ' + marker + '(?= |$)'];
        for (const source of patterns) {
            for (const match of normalized.matchAll(new RegExp(source, 'gu'))) {
                const word = match[1];
                const numeral = word.match(/^(\d+)(?:a|o|ª|º)?$/u);
                const n = numbers.get(word) || (numeral ? Number(numeral[1]) : null);
                if (n !== null) {
                    if (n !== Number(season)) return false;
                    found = true;
                }
            }
        }
    }
    for (const match of normalized.matchAll(/\bs(\d+)\b/gu)) {
        if (Number(match[1]) !== Number(season)) return false;
        found = true;
    }
    return found;
}

async function searchYouTubeTrailer(identity, type, season, language, strictLanguage, availability) {
    const titles = [...new Set(identity.titles.filter(title => normalizeTitle(title)))];
    if (!titles.length || (type === 'movie' && !identity.year)) return null;
    const t = getTranslation(language);
    const queries = titles.slice(0, 2).flatMap(title => {
        const name = type === 'series' && season > 0 ? title + ' ' + t.season + ' ' + season :
            type === 'movie' ? title + ' ' + identity.year : title;
        const localized = [name + ' ' + t.trailer];
        // Brazilian subtitled releases are often absent from a dubbed-only search.
        if (language === 'pt-BR') localized.push(name + ' trailer legendado pt-BR');
        return localized;
    });
    const results = await Promise.all(queries.map(query => searchYouTubeScraping(query, language)));
    const candidates = results.flat();
    const seen = new Set();
    const ranked = candidates.filter(candidate => {
        return !candidate.live &&
            (candidate.durationSeconds == null || candidate.durationSeconds <= MAX_TRAILER_DURATION_SECONDS) &&
            isTrailerLikeTitle(candidate.title, titles) &&
            matchesSearchIdentity(candidate.title, identity, type) &&
            (type !== 'series' || matchesSeason(candidate.title, season, language, titles));
    }).map(candidate => ({ ...candidate, score: languageScore(candidate.title, titles, language) }))
        .filter(candidate => candidate.score >= (strictLanguage ? 1 : 0))
        .sort((a, b) => b.score - a.score)
        .filter(candidate => {
            // YouTube can localize a video's title differently between queries.
            // Keep its best eligible caption rather than its first appearance.
            if (seen.has(candidate.ytId)) return false;
            seen.add(candidate.ytId);
            return true;
        });
    return selectAvailableTrailer(ranked, language, availability, true);
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
 * Get trailer streams for a movie or TV series
 * Flow: TMDB (user language) → YouTube scraping (localized) → TMDB en-US
 * Note: Recaps are now handled by recapProvider.js
 */
async function getTrailerStreams(type, imdbId, contentName, season, tmdbId, language = 'it-IT', useExternalLink = false, playerTarget = 'internal', strictLanguage = false) {
    if (!TMDB_KEY) {
        console.warn('[TrailerProvider] TMDB_KEY not set, skipping trailer fetch');
        return [];
    }

    strictLanguage = strictLanguage === true || strictLanguage === 'true';
    const availability = new Map();
    const t = getTranslation(language);
    const isEnglish = language.startsWith('en');

    try {
        // Get TMDB ID and title
        let tmdbIdNum;
        let contentTitle = contentName || '';
        let identity = mediaIdentity({}, type);

        if (tmdbId) {
            // TMDB ID provided directly
            tmdbIdNum = tmdbId;
            // Caller-supplied names (including Kitsu names) are display hints,
            // not proof of identity. Resolve canonical metadata even with a name.
            {
                const mediaType = type === 'series' ? 'tv' : 'movie';
                try {
                    const url = `${TMDB_BASE}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=${language}`;
                    const response = await fetchWithTimeout(url);
                    if (!response.ok) throw new Error('TMDB metadata unavailable');
                    const data = await response.json();
                    identity = mediaIdentity(data, type);
                    contentTitle = identity.title || contentTitle;
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
            identity = tmdbResult;
            contentTitle = identity.title || contentTitle;
        } else {
            console.log('[TrailerProvider] No valid ID provided');
            return [];
        }

        let trailerResult = null;

        // === STEP 1: Try TMDB in user's language ===
        console.log(`[TrailerProvider] Step 1: Trying TMDB ${language} for "${contentTitle}"`);

        const tmdbLangTrailer = await findTMDBTrailer(tmdbIdNum, type, language, season,
            identity.titles.length ? identity.titles : [contentTitle], strictLanguage, availability);
        if (tmdbLangTrailer) {
            console.log(`[TrailerProvider] ✓ Found TMDB ${language} trailer: ${tmdbLangTrailer.title}`);
            trailerResult = {
                ytId: tmdbLangTrailer.ytId,
                title: type === 'series' && season ? `${contentTitle} ${t.season} ${season}` : contentTitle,
                source: 'tmdb-lang'
            };
        }

        // === STEP 2: YouTube Scraping Fallback ===
        // A search localized to pt-BR (or another locale) can still return
        // English uploads from aggregators. Defer language-neutral results
        // until the directly associated TMDB English trailer has been checked.
        // A dubbed/subtitled/localized YouTube result keeps its priority.
        let deferredYouTubeResult = null;
        if (!trailerResult) {
            console.log(`[TrailerProvider] Step 2: Trying YouTube (${language}) for "${contentTitle}"`);

            const ytResult = await searchYouTubeTrailer(identity, type, season, language, strictLanguage, availability);
            if (ytResult) {
                if (ytResult.score === 0 && !strictLanguage && !isEnglish) {
                    console.log('[TrailerProvider] Deferring language-neutral YouTube result until TMDB English fallback');
                    deferredYouTubeResult = ytResult;
                } else {
                    console.log(`[TrailerProvider] ✓ Found YouTube trailer: ${ytResult.title}`);
                    trailerResult = {
                        ytId: ytResult.ytId,
                        title: ytResult.title,
                        source: 'youtube'
                    };
                }
            }
        }

        // === STEP 3: TMDB English Fallback ===
        if (!trailerResult && !isEnglish && !strictLanguage) {
            console.log(`[TrailerProvider] Step 3: Trying TMDB en-US for "${contentTitle}"`);

            const tmdbEnTrailer = await findTMDBTrailer(tmdbIdNum, type, 'en-US', season,
                identity.titles.length ? identity.titles : [contentTitle], false, availability, language);
            if (tmdbEnTrailer) {
                console.log(`[TrailerProvider] ✓ Found TMDB en-US trailer: ${tmdbEnTrailer.title}`);
                trailerResult = {
                    ytId: tmdbEnTrailer.ytId,
                    title: type === 'series' && season ? `${contentTitle} ${t.season} ${season}` : contentTitle,
                    source: 'tmdb-en'
                };
            }
        }

        // Keep legacy neutral-search coverage if TMDB has no eligible
        // associated trailer. This fallback is not verified as official.
        if (!trailerResult && deferredYouTubeResult) {
            console.log(`[TrailerProvider] ✓ Using unverified-language YouTube fallback: ${deferredYouTubeResult.title}`);
            trailerResult = {
                ytId: deferredYouTubeResult.ytId,
                title: deferredYouTubeResult.title,
                source: 'youtube'
            };
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

        const targetFormat = formatStreamTarget(trailerResult.ytId, playerTarget, useExternalLink);

        if (targetFormat.prefix) {
            streamName = targetFormat.prefix + streamName;
        }

        console.log(`[TrailerProvider] Final: ${streamName} | ${trailerResult.title} (${trailerResult.source}) [Target: ${playerTarget || 'internal'}]`);

        const trailerStream = {
            name: streamName,
            title: trailerResult.title,
            behaviorHints: {
                notWebReady: true,
                bingeGroup: 'trailer'
            },
            ...targetFormat.streamProps
        };

        return [trailerStream];

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
    isTrailerProviderAvailable,
    imdbToTmdbWithLanguage
};
