const assert = require('assert');

const ids = { german: 'MbyygcWY7yY', dubbed: 'dubbed00001', subtitled: 'subbed00001', unknown: 'unknown0001', english: 'english0001' };
const german = { ytId: ids.german, title: 'PRIMETIME Trailer German Deutsch (2026) Robert Pattinson' };
const dubbed = { ytId: ids.dubbed, title: 'Primetime (2026) | Trailer Dublado' };
const subtitled = { ytId: ids.subtitled, title: 'Primetime (2026) | Trailer Legendado PT-BR' };
const defaultMetadata = {
    id: 123, title: 'Primetime', original_title: 'Primetime', release_date: '2026-01-01',
    name: 'Primetime', original_name: 'Primetime', first_air_date: '2026-01-01'
};

function durationLabel(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = String(seconds % 60).padStart(2, '0');
    return minutes >= 60 ? Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') + ':' + remainder : minutes + ':' + remainder;
}

function searchHtml(candidates) {
    return '<script>var ytInitialData = ' + JSON.stringify({
        contents: { twoColumnSearchResultsRenderer: { primaryContents: {
            sectionListRenderer: { contents: [{ itemSectionRenderer: {
                contents: candidates.map(v => ({ videoRenderer: {
                    videoId: v.ytId, title: { runs: [{ text: v.title }] },
                    ...(Number.isInteger(v.durationSeconds) ? { lengthText: { simpleText: durationLabel(v.durationSeconds) } } : {}),
                    ...(v.live ? { thumbnailOverlays: [{ thumbnailOverlayTimeStatusRenderer: { style: 'LIVE' } }] } : {})
                } }))
            } }] }
        } } }
    }) + ';</script>';
}

function playerHtml(countries = ['BR', 'US', 'IT', 'PT', 'FR'], reason = '', durationSeconds = 150, live = false, title = null, publishDate = null) {
    return '<script>var ytInitialPlayerResponse = ' + JSON.stringify({
        playabilityStatus: { status: reason ? 'ERROR' : 'OK', reason },
        videoDetails: { lengthSeconds: String(durationSeconds), isLiveContent: live, ...(title ? { title } : {}) },
        microformat: { playerMicroformatRenderer: {
            availableCountries: countries, ...(publishDate ? { publishDate } : {})
        } }
    }) + ';</script>';
}

let state;
function reset(overrides = {}) {
    state = {
        candidates: [german, subtitled, dubbed, { ytId: ids.unknown, title: 'Primetime (2026) Official Trailer' }],
        metadata: { ...defaultMetadata }, localized: [], portugal: [], english: [], watch: {}, calls: [], ...overrides
    };
    return state;
}
reset();

function response(value, status = 200) {
    return { ok: status === 200, status, json: async () => value, text: async () => value };
}

async function fakeFetch(input) {
    const url = new URL(input);
    state.calls.push(url);
    if (url.hostname === 'www.googleapis.com' && url.pathname === '/youtube/v3/videos') {
        if (state.apiError) throw new Error('YouTube Data API offline');
        if (state.apiStatus && state.apiStatus !== 200) return response({ error: 'quota' }, state.apiStatus);
        const ids = (url.searchParams.get('id') || '').split(',').filter(Boolean);
        const provided = state.apiVideos;
        const items = ids.map(id => {
            if (provided && !Object.prototype.hasOwnProperty.call(provided, id)) return null;
            const media = state.metadata && typeof state.metadata === 'object' ?
                state.metadata : defaultMetadata;
            const mediaTitle = media.title || media.name || 'Primetime';
            const release = media.release_date || media.first_air_date || '';
            const year = /^\d{4}/.test(release) ? release.slice(0, 4) : '2026';
            return provided ? provided[id] : {
                id, snippet: { title: mediaTitle + ' (' + year + ') Official Trailer',
                    channelId: 'fixture-channel', liveBroadcastContent: 'none' },
                contentDetails: { duration: 'PT2M30S', caption: 'false' },
                status: { privacyStatus: 'public', uploadStatus: 'processed', embeddable: true }
            };
        }).filter(Boolean);
        return response({ items });
    }
    if (url.hostname === 'api.themoviedb.org') {
        if (url.pathname.endsWith('/videos')) {
            const locale = url.searchParams.get('language');
            const videos = locale === 'en-US' ? state.english : locale === 'pt-PT' ? state.portugal : state.localized;
            return response({ results: typeof videos === 'function' ? videos(url) : videos });
        }
        if (state.metadataError) throw new Error('TMDB metadata unavailable');
        const metadata = typeof state.metadata === 'function' ? state.metadata(url) : state.metadata;
        if (state.metadataStatus && state.metadataStatus !== 200) return response({ status_message: 'Metadata unavailable' }, state.metadataStatus);
        if (url.pathname.includes('/find/')) {
            return response(state.findResults || { movie_results: metadata ? [metadata] : [], tv_results: metadata ? [metadata] : [] });
        }
        return response(metadata);
    }
    assert.strictEqual(url.hostname, 'www.youtube.com', 'Unexpected network access');
    if (url.pathname === '/results') {
        if (state.searchError) throw new Error('Search failed');
        const candidates = typeof state.candidates === 'function' ? state.candidates(url) : state.candidates;
        return response(state.html === undefined ? searchHtml(candidates) : state.html, state.searchStatus || 200);
    }
    assert.strictEqual(url.pathname, '/watch');
    const watch = state.watch[url.searchParams.get('v')];
    if (watch instanceof Error) throw watch;
    return response(watch === undefined ? playerHtml() : watch);
}

// Preloading this file also isolates the real HTTP server from external services.
const fetchPath = require.resolve('node-fetch');
require(fetchPath);
require.cache[fetchPath].exports = fakeFetch;
module.exports = { ids, german, dubbed, subtitled, reset, searchHtml, playerHtml };
