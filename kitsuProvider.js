/**
 * Kitsu ID to TMDB ID Converter
 * Primary: Fribb anime-lists JSON (cached 6 hours)
 * Fallback: API chain (Kitsu Mappings API → TMDB Find API)
 */

const fetch = require('node-fetch');

const TMDB_KEY = process.env.TMDB_KEY;
const FRIBB_URL = 'https://cdn.jsdelivr.net/gh/Fribb/anime-lists@master/anime-list-full.json';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

// In-memory cache for Fribb data
let fribbCache = {
    data: null,
    timestamp: 0,
    loading: null // Promise to prevent duplicate fetches
};

/**
 * Load Fribb anime-lists JSON (cached for 6 hours)
 */
async function loadFribbData() {
    const now = Date.now();

    // Return cached data if still valid
    if (fribbCache.data && (now - fribbCache.timestamp) < CACHE_TTL) {
        return fribbCache.data;
    }

    // If already loading, wait for it
    if (fribbCache.loading) {
        return fribbCache.loading;
    }

    // Start loading
    console.log('[KitsuProvider] Downloading Fribb anime-lists...');
    fribbCache.loading = (async () => {
        try {
            const response = await fetch(FRIBB_URL, {
                headers: { 'User-Agent': 'Streailer/1.0' }
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
 * Search Fribb data for Kitsu ID
 */
async function searchFribb(kitsuId) {
    const data = await loadFribbData();
    if (!data) return null;

    const kitsuIdNum = parseInt(kitsuId, 10);
    const entry = data.find(item => item.kitsu_id === kitsuIdNum);

    if (entry && entry.themoviedb_id) {
        console.log(`[KitsuProvider] Fribb found: Kitsu ${kitsuId} → TMDB ${entry.themoviedb_id}`);
        return {
            tmdbId: entry.themoviedb_id,
            imdbId: entry.imdb_id,
            tvdbId: entry.thetvdb_id
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
        // Step 1: Get mappings from Kitsu
        const kitsuUrl = `https://kitsu.io/api/edge/anime/${kitsuId}/mappings`;
        const kitsuResponse = await fetch(kitsuUrl, {
            headers: {
                'Accept': 'application/vnd.api+json',
                'User-Agent': 'Streailer/1.0'
            }
        });

        if (!kitsuResponse.ok) {
            console.log(`[KitsuProvider] Kitsu API error: ${kitsuResponse.status}`);
            return null;
        }

        const kitsuData = await kitsuResponse.json();

        // Step 2: Extract external IDs
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

        if (!externalId) {
            console.log(`[KitsuProvider] No external mapping for Kitsu ${kitsuId}`);
            return null;
        }

        console.log(`[KitsuProvider] Found ${externalSource}: ${externalId}`);

        // Step 3: TMDB Find
        const tmdbUrl = `https://api.themoviedb.org/3/find/${externalId}?api_key=${TMDB_KEY}&external_source=${externalSource}&language=${language}`;
        const tmdbResponse = await fetch(tmdbUrl);

        if (!tmdbResponse.ok) {
            console.log(`[KitsuProvider] TMDB API error: ${tmdbResponse.status}`);
            return null;
        }

        const tmdbData = await tmdbResponse.json();

        if (tmdbData.tv_results && tmdbData.tv_results.length > 0) {
            const result = tmdbData.tv_results[0];
            return { tmdbId: result.id, type: 'series', title: result.name };
        }

        if (tmdbData.movie_results && tmdbData.movie_results.length > 0) {
            const result = tmdbData.movie_results[0];
            return { tmdbId: result.id, type: 'movie', title: result.title };
        }

        return null;
    } catch (error) {
        console.error('[KitsuProvider] API Chain error:', error);
        return null;
    }
}

/**
 * Convert Kitsu ID to TMDB ID
 * Primary: Fribb (cached 6h) | Fallback: API Chain
 */
async function kitsuToTmdb(kitsuId, language = 'en-US') {
    console.log(`[KitsuProvider] Converting Kitsu ID: ${kitsuId}`);

    // Try Fribb first
    const fribbResult = await searchFribb(kitsuId);
    if (fribbResult && fribbResult.tmdbId) {
        // Get title from TMDB
        try {
            const url = `https://api.themoviedb.org/3/tv/${fribbResult.tmdbId}?api_key=${TMDB_KEY}&language=${language}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.name) {
                console.log(`[KitsuProvider] ✓ Fribb: Kitsu ${kitsuId} → TMDB ${fribbResult.tmdbId} ("${data.name}")`);
                return { tmdbId: fribbResult.tmdbId, type: 'series', title: data.name };
            }
        } catch (e) {
            // Try as movie
            try {
                const url = `https://api.themoviedb.org/3/movie/${fribbResult.tmdbId}?api_key=${TMDB_KEY}&language=${language}`;
                const response = await fetch(url);
                const data = await response.json();

                if (data.title) {
                    console.log(`[KitsuProvider] ✓ Fribb: Kitsu ${kitsuId} → TMDB ${fribbResult.tmdbId} ("${data.title}")`);
                    return { tmdbId: fribbResult.tmdbId, type: 'movie', title: data.title };
                }
            } catch (e2) { }
        }

        // Return without title if TMDB lookup failed
        return { tmdbId: fribbResult.tmdbId, type: 'series', title: '' };
    }

    // Fallback to API Chain
    const apiResult = await apiChainFallback(kitsuId, language);
    if (apiResult) {
        console.log(`[KitsuProvider] ✓ API Chain: Kitsu ${kitsuId} → TMDB ${apiResult.tmdbId} ("${apiResult.title}")`);
        return apiResult;
    }

    console.log(`[KitsuProvider] ✗ No mapping found for Kitsu ${kitsuId}`);
    return null;
}

module.exports = { kitsuToTmdb };
