/**
 * Kitsu ID to TMDB ID Converter
 * Primary: anime.stremio-italia.eu API
 * Secondary: Fribb anime-lists JSON (cached 6 hours)
 * Tertiary: API chain (Kitsu Mappings API → TMDB Find API)
 */

const fetch = require('node-fetch');

const TMDB_KEY = process.env.TMDB_KEY || 'ad0f7351455041d8c9c0d4370a4b5fa5';
const STREMIO_ITALIA_BASE = 'https://anime.stremio-italia.eu/kitsu';
const FRIBB_URL = 'https://cdn.jsdelivr.net/gh/Fribb/anime-lists@master/anime-list-full.json';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
const DEFAULT_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

// In-memory cache for Fribb data
let fribbCache = {
    data: null,
    timestamp: 0,
    loading: null
};

/**
 * Extract season number from title or slug string
 */
function extractSeason(title = '', slug = '') {
    const text = `${title} ${slug}`;

    const seasonMatch = text.match(/(?:season|stagione|temporada|staffel|saison)\s*(\d+)/i) ||
                        text.match(/(\d+)(?:st|nd|rd|th)\s+season/i) ||
                        text.match(/\bS(\d+)\b/i);

    if (seasonMatch) {
        const s = parseInt(seasonMatch[1], 10);
        if (s > 0) return s;
    }

    // Trailing number check (e.g., "KonoSuba 2", "Mob Psycho 100 II")
    const romanMatch = text.match(/\b(II|III|IV|V)\b/i);
    if (romanMatch) {
        const romanMap = { II: 2, III: 3, IV: 4, V: 5 };
        return romanMap[romanMatch[1].toUpperCase()];
    }

    const trailingNum = title.trim().match(/\s+(\d+)$/);
    if (trailingNum) {
        const s = parseInt(trailingNum[1], 10);
        if (s > 1 && s <= 20) return s;
    }

    return 1;
}

/**
 * Primary: Resolve Kitsu ID using anime.stremio-italia.eu
 */
async function resolveWithStremioItalia(kitsuId) {
    const url = `${STREMIO_ITALIA_BASE}/${kitsuId}`;
    console.log(`[KitsuProvider] Querying anime.stremio-italia.eu for Kitsu ${kitsuId}...`);

    try {
        const res = await fetchWithTimeout(url, {
            headers: {
                'User-Agent': 'Streailer/1.5.0',
                'Accept': 'application/json'
            }
        });

        if (!res.ok) {
            console.log(`[KitsuProvider] anime.stremio-italia.eu returned ${res.status}`);
            return null;
        }

        const data = await res.json();
        if (!data || !data.ok || !data.mappings?.ids) {
            return null;
        }

        const tmdbRaw = data.mappings.ids.tmdb;
        const imdbId = data.mappings.ids.imdb || null;
        const tvdbId = data.mappings.ids.tvdb ? parseInt(data.mappings.ids.tvdb, 10) : undefined;
        const canonicalTitle = data.kitsu?.canonicalTitle || data.kitsu?.titles?.en || data.kitsu?.titles?.en_jp || '';
        const slug = data.kitsu?.slug || '';
        const subtype = (data.kitsu?.subtype || '').toUpperCase();
        const mediaType = subtype === 'MOVIE' ? 'movie' : 'series';

        let tmdbId = null;
        if (typeof tmdbRaw === 'number') {
            tmdbId = tmdbRaw;
        } else if (typeof tmdbRaw === 'string' && tmdbRaw.trim() !== '') {
            tmdbId = parseInt(tmdbRaw, 10);
        } else if (typeof tmdbRaw === 'object' && tmdbRaw !== null) {
            tmdbId = tmdbRaw.tv || tmdbRaw.movie || null;
        }

        if (!tmdbId || isNaN(tmdbId)) {
            return null;
        }

        const season = mediaType === 'series' ? extractSeason(canonicalTitle, slug) : undefined;

        console.log(`[KitsuProvider] ✓ anime.stremio-italia.eu found: Kitsu ${kitsuId} → TMDB ${tmdbId} ("${canonicalTitle}", Season: ${season || 'N/A'})`);

        return {
            tmdbId,
            imdbId,
            tvdbId,
            season,
            type: mediaType,
            title: canonicalTitle
        };
    } catch (e) {
        console.warn(`[KitsuProvider] anime.stremio-italia.eu error: ${e.message}`);
        return null;
    }
}

/**
 * Load Fribb anime-lists JSON (cached for 6 hours)
 */
async function loadFribbData() {
    const now = Date.now();

    if (fribbCache.data && (now - fribbCache.timestamp) < CACHE_TTL) {
        return fribbCache.data;
    }

    if (fribbCache.loading) {
        return fribbCache.loading;
    }

    console.log('[KitsuProvider] Downloading Fribb anime-lists...');
    fribbCache.loading = (async () => {
        try {
            const response = await fetchWithTimeout(FRIBB_URL, {
                headers: { 'User-Agent': 'Streailer/1.5.0' }
            });

            if (!response.ok) {
                console.log(`[KitsuProvider] Fribb download failed: ${response.status}`);
                return null;
            }

            const data = await response.json();
            fribbCache.data = data;
            fribbCache.timestamp = now;
            console.log(`[KitsuProvider] Fribb loaded: ${data.length} entries`);
            return data;
        } catch (error) {
            console.error('[KitsuProvider] Fribb download error:', error);
            return null;
        } finally {
            fribbCache.loading = null;
        }
    })();

    return fribbCache.loading;
}

/**
 * Search Fribb data for Kitsu ID with support for modern schema
 */
async function searchFribb(kitsuId) {
    const data = await loadFribbData();
    if (!data) return null;

    const kitsuIdNum = parseInt(kitsuId, 10);
    const entry = data.find(item => item.kitsu_id === kitsuIdNum);

    if (entry && entry.themoviedb_id) {
        let tmdbId = null;
        let mediaType = (entry.type || '').toUpperCase() === 'MOVIE' ? 'movie' : 'series';

        if (typeof entry.themoviedb_id === 'object' && entry.themoviedb_id !== null) {
            if (entry.themoviedb_id.tv) {
                tmdbId = entry.themoviedb_id.tv;
                mediaType = 'series';
            } else if (entry.themoviedb_id.movie) {
                tmdbId = entry.themoviedb_id.movie;
                mediaType = 'movie';
            }
        } else {
            tmdbId = parseInt(entry.themoviedb_id, 10);
        }

        if (!tmdbId || isNaN(tmdbId)) return null;

        let season = undefined;
        if (mediaType === 'series') {
            if (entry.season && typeof entry.season === 'object') {
                season = entry.season.tmdb || entry.season.tvdb || 1;
            } else if (typeof entry.season === 'number') {
                season = entry.season;
            } else {
                season = 1;
            }
        }

        const imdbId = Array.isArray(entry.imdb_id) ? entry.imdb_id[0] : (entry.imdb_id || null);
        const tvdbId = entry.tvdb_id || entry.thetvdb_id || null;

        console.log(`[KitsuProvider] Fribb found: Kitsu ${kitsuId} → TMDB ${tmdbId} (Season: ${season || 'N/A'})`);
        return {
            tmdbId,
            imdbId,
            tvdbId,
            season,
            type: mediaType
        };
    }

    console.log(`[KitsuProvider] Fribb: no mapping for Kitsu ${kitsuId}`);
    return null;
}

/**
 * API Chain fallback: Kitsu Mappings → TMDB Find
 */
async function apiChainFallback(kitsuId, language) {
    console.log(`[KitsuProvider] API Chain fallback for Kitsu ${kitsuId}`);

    try {
        const kitsuUrl = `https://kitsu.io/api/edge/anime/${kitsuId}/mappings`;
        const kitsuResponse = await fetchWithTimeout(kitsuUrl, {
            headers: {
                'Accept': 'application/vnd.api+json',
                'User-Agent': 'Streailer/1.5.0'
            }
        });

        if (!kitsuResponse.ok) {
            console.log(`[KitsuProvider] Kitsu API error: ${kitsuResponse.status}`);
            return null;
        }

        const kitsuData = await kitsuResponse.json();
        let externalId = null;
        let externalSource = null;

        for (const mapping of kitsuData.data || []) {
            const site = mapping.attributes?.externalSite;
            const id = mapping.attributes?.externalId;

            if (site === 'thetvdb/series' || site === 'thetvdb') {
                externalId = id;
                externalSource = 'tvdb_id';
                break;
            } else if (site === 'thetvdb/movie') {
                externalId = id;
                externalSource = 'tvdb_id';
            } else if (site === 'imdb' && !externalId) {
                externalId = id;
                externalSource = 'imdb_id';
            }
        }

        if (!externalId || !TMDB_KEY) {
            return null;
        }

        const tmdbUrl = `https://api.themoviedb.org/3/find/${externalId}?api_key=${TMDB_KEY}&external_source=${externalSource}&language=${language}`;
        const tmdbResponse = await fetchWithTimeout(tmdbUrl);

        if (!tmdbResponse.ok) {
            return null;
        }

        const tmdbData = await tmdbResponse.json();

        if (tmdbData.tv_results && tmdbData.tv_results.length > 0) {
            const result = tmdbData.tv_results[0];
            return { tmdbId: result.id, type: 'series', season: 1, title: result.name };
        }

        if (tmdbData.movie_results && tmdbData.movie_results.length > 0) {
            const result = tmdbData.movie_results[0];
            return { tmdbId: result.id, type: 'movie', season: undefined, title: result.title };
        }

        return null;
    } catch (error) {
        console.error('[KitsuProvider] API Chain error:', error);
        return null;
    }
}

/**
 * Convert Kitsu ID to TMDB ID with season support
 * Priority: 1) anime.stremio-italia.eu -> 2) Fribb -> 3) API Chain
 */
async function kitsuToTmdb(kitsuId, language = 'en-US') {
    console.log(`[KitsuProvider] Converting Kitsu ID: ${kitsuId}`);

    // Level 1: anime.stremio-italia.eu
    const italiaResult = await resolveWithStremioItalia(kitsuId);
    if (italiaResult && italiaResult.tmdbId) {
        // If TMDB title lookup is available in the desired language, fetch it
        if (TMDB_KEY) {
            try {
                const mediaPath = italiaResult.type === 'movie' ? 'movie' : 'tv';
                const url = `https://api.themoviedb.org/3/${mediaPath}/${italiaResult.tmdbId}?api_key=${TMDB_KEY}&language=${language}`;
                const response = await fetchWithTimeout(url);
                if (response.ok) {
                    const data = await response.json();
                    const localizedTitle = data.title || data.name;
                    if (localizedTitle) {
                        italiaResult.title = localizedTitle;
                    }
                }
            } catch (e) {
                // Keep canonical title
            }
        }
        return italiaResult;
    }

    // Level 2: Fribb anime-lists
    const fribbResult = await searchFribb(kitsuId);
    if (fribbResult && fribbResult.tmdbId) {
        let title = '';
        if (TMDB_KEY) {
            try {
                const mediaPath = fribbResult.type === 'movie' ? 'movie' : 'tv';
                const url = `https://api.themoviedb.org/3/${mediaPath}/${fribbResult.tmdbId}?api_key=${TMDB_KEY}&language=${language}`;
                const response = await fetchWithTimeout(url);
                if (response.ok) {
                    const data = await response.json();
                    title = data.title || data.name || '';
                }
            } catch (e) { }
        }
        return {
            tmdbId: fribbResult.tmdbId,
            type: fribbResult.type,
            season: fribbResult.season,
            title
        };
    }

    // Level 3: API Chain fallback
    const apiResult = await apiChainFallback(kitsuId, language);
    if (apiResult) {
        return apiResult;
    }

    console.log(`[KitsuProvider] ✗ No mapping found for Kitsu ${kitsuId}`);
    return null;
}

module.exports = { kitsuToTmdb };
