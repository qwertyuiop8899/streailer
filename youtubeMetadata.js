/**
 * Optional YouTube Data API v3 verification for trailer candidates.
 * Uses the request's optional key, or YOUTUBE_API_KEY in the environment.
 * Request-provided keys can be embedded in Stremio configuration URLs and
 * must never be printed in server logs.
 *
 * videos.list provides default *spoken* audio language, not alternate
 * audio tracks or the actual caption languages. A caption=true flag must
 * never be interpreted as proof of Portuguese subtitles.
 */
const fetch = require('node-fetch');
const { createHash } = require('crypto');

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const BATCH_SIZE = 50;
const MAX_CACHE_ITEMS = 1000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MISSING_TTL_MS = 15 * 60 * 1000;
const TIMEOUT_MS = 4000;
const FAILURE_COOLDOWN_MS = 60 * 1000;
const MAX_FAILURE_ENTRIES = 1000;
const cache = new Map();
const inflight = new Map();
const failures = new Map();

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

function saveCache(scopedId, video) {
    cache.delete(scopedId);
    cache.set(scopedId, {
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
async function getYouTubeVideoMetadata(videoIds, requestApiKey = '') {
    const selectedKey = typeof requestApiKey === 'string' && requestApiKey.trim()
        ? requestApiKey : process.env.YOUTUBE_API_KEY;
    const apiKey = typeof selectedKey === 'string' ? selectedKey.trim() : '';
    if (!apiKey || apiKey.length > 256) return null;
    // The key hash isolates cached authorization responses without retaining
    // raw credentials as cache or in-flight lookup keys.
    const scope = createHash('sha256').update(apiKey).digest('hex');
    if ((failures.get(scope) || 0) > Date.now()) return null;
    failures.delete(scope);
    const ids = [...new Set((videoIds || []).filter(id => VIDEO_ID.test(id)))];
    if (!ids.length) return new Map();
    const result = new Map();
    const missing = [];
    for (const id of ids) {
        const scopedId = scope + ':' + id;
        const cached = cache.get(scopedId);
        if (cached && cached.expiresAt > Date.now()) result.set(id, cached.video);
        else {
            if (cached) cache.delete(scopedId);
            missing.push(id);
        }
    }
    if (!missing.length) return result;
    try {
        for (let i = 0; i < missing.length; i += BATCH_SIZE) {
            const batch = missing.slice(i, i + BATCH_SIZE);
            const batchKey = scope + ':' + batch.slice().sort().join(',');
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
                saveCache(scope + ':' + id, video);
                result.set(id, video);
            }
        }
        failures.delete(scope);
        return result;
    } catch (_) {
        // Avoid repeatedly waiting for an expired key, quota failure or
        // transient network timeout for every fallback on the same request.
        // Keep the temporary breaker strictly scoped to the credential hash.
        failures.delete(scope);
        failures.set(scope, Date.now() + FAILURE_COOLDOWN_MS);
        while (failures.size > MAX_FAILURE_ENTRIES) failures.delete(failures.keys().next().value);
        // Never log the credential or its URL. Legacy fallback remains active.
        return null;
    }
}

function clearYouTubeMetadataCache() {
    cache.clear();
    inflight.clear();
    failures.clear();
}

module.exports = {
    getYouTubeVideoMetadata, parseIsoDuration, isVideoExcluded,
    audioLanguageBonus, clearYouTubeMetadataCache
};
