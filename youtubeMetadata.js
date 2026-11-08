/**
 * Optional YouTube Data API v3 verification for trailer candidates.
 * Uses only YOUTUBE_API_KEY from the server environment; never ships a key
 * to browsers or logs URLs containing credentials.
 *
 * videos.list provides default *spoken* audio language, not alternate
 * audio tracks or the actual caption languages. A caption=true flag must
 * never be interpreted as proof of Portuguese subtitles.
 */
const fetch = require('node-fetch');

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const BATCH_SIZE = 50;
const MAX_CACHE_ITEMS = 1000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MISSING_TTL_MS = 15 * 60 * 1000;
const TIMEOUT_MS = 4000;
const cache = new Map();
const inflight = new Map();

function parseIsoDuration(value) {
    if (typeof value !== 'string') return null;
    const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
    if (!match || !match.slice(1).some(Boolean)) return null;
    const seconds = Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 +
        Number(match[3] || 0) * 60 + Number(match[4] || 0);
    return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

function normalizeVideo(item) {
    if (!item || !VIDEO_ID.test(item.id || '')) return null;
    const snippet = item.snippet || {};
    const details = item.contentDetails || {};
    const status = item.status || {};
    return {
        id: item.id,
        title: snippet.title || '',
        channelId: snippet.channelId || null,
        channelTitle: snippet.channelTitle || null,
        defaultAudioLanguage: snippet.defaultAudioLanguage || null,
        // defaultLanguage refers only to the video's text metadata.
        defaultLanguage: snippet.defaultLanguage || null,
        captionAvailable: details.caption === 'true' || details.caption === true,
        durationSeconds: parseIsoDuration(details.duration),
        regionRestriction: details.regionRestriction || null,
        live: snippet.liveBroadcastContent === 'live' ||
            snippet.liveBroadcastContent === 'upcoming',
        privacyStatus: status.privacyStatus || null,
        uploadStatus: status.uploadStatus || null,
        embeddable: typeof status.embeddable === 'boolean' ? status.embeddable : null
    };
}

function isVideoExcluded(video, region, maxDurationSeconds) {
    if (!video) return true;
    if (video.live || video.privacyStatus === 'private' ||
        ['rejected', 'failed', 'deleted'].includes(video.uploadStatus)) return true;
    if (video.durationSeconds !== null && video.durationSeconds > maxDurationSeconds) return true;
    const restriction = video.regionRestriction || {};
    if (region && Array.isArray(restriction.allowed) && !restriction.allowed.includes(region)) return true;
    if (region && Array.isArray(restriction.blocked) && restriction.blocked.includes(region)) return true;
    return false;
}

function audioLanguageBonus(video, requested, initialScore = 0) {
    const spoken = (video?.defaultAudioLanguage || '').toLowerCase().replace('_', '-');
    const locale = (requested || '').toLowerCase().replace('_', '-');
    if (!spoken || !locale) return 0;
    // A region-specific value is positive evidence for the requested audio.
    if (spoken === locale) return 6;
    // Generic "pt" never certifies Brazilian or European Portuguese.
    // It may reinforce pre-existing title evidence, but cannot make an
    // unknown-language candidate pass strict mode by itself.
    const base = locale.split('-')[0];
    if (spoken === base && initialScore > 0) return 1;
    return 0;
}

function saveCache(id, video) {
    cache.delete(id);
    cache.set(id, {
        video,
        expiresAt: Date.now() + (video ? CACHE_TTL_MS : MISSING_TTL_MS)
    });
    while (cache.size > MAX_CACHE_ITEMS) cache.delete(cache.keys().next().value);
}

async function loadBatch(ids, apiKey) {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet,contentDetails,status');
    url.searchParams.set('id', ids.join(','));
    url.searchParams.set('key', apiKey);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(url.toString(), { signal: controller.signal });
        if (!response.ok) throw new Error('YouTube Data API unavailable');
        const data = await response.json();
        if (!Array.isArray(data.items)) throw new Error('Invalid YouTube Data API response');
        const found = new Map();
        for (const item of data.items) {
            const video = normalizeVideo(item);
            if (video && ids.includes(video.id)) found.set(video.id, video);
        }
        return found;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * null means API disabled or failed; Map means a successful authoritative
 * lookup. A Map entry with value null means that ID was absent from the API.
 * Successful requests are cached for six hours; missing IDs for 15 minutes.
 */
async function getYouTubeVideoMetadata(videoIds) {
    const apiKey = typeof process.env.YOUTUBE_API_KEY === 'string'
        ? process.env.YOUTUBE_API_KEY.trim() : '';
    if (!apiKey) return null;
    const ids = [...new Set((videoIds || []).filter(id => VIDEO_ID.test(id)))];
    if (!ids.length) return new Map();
    const result = new Map();
    const missing = [];
    for (const id of ids) {
        const cached = cache.get(id);
        if (cached && cached.expiresAt > Date.now()) result.set(id, cached.video);
        else {
            if (cached) cache.delete(id);
            missing.push(id);
        }
    }
    if (!missing.length) return result;
    try {
        for (let i = 0; i < missing.length; i += BATCH_SIZE) {
            const batch = missing.slice(i, i + BATCH_SIZE);
            const batchKey = batch.slice().sort().join(',');
            let pending = inflight.get(batchKey);
            if (!pending) {
                pending = loadBatch(batch, apiKey);
                inflight.set(batchKey, pending);
            }
            let fetched;
            try { fetched = await pending; }
            finally { if (inflight.get(batchKey) === pending) inflight.delete(batchKey); }
            for (const id of batch) {
                const video = fetched.get(id) || null;
                saveCache(id, video);
                result.set(id, video);
            }
        }
        return result;
    } catch (_) {
        // 403/quota errors, timeout and transient network failures must not
        // disable legacy TMDB and YouTube discovery. Never log the key or URL.
        return null;
    }
}

function clearYouTubeMetadataCache() {
    cache.clear();
    inflight.clear();
}

module.exports = {
    getYouTubeVideoMetadata, parseIsoDuration, isVideoExcluded,
    audioLanguageBonus, clearYouTubeMetadataCache
};
