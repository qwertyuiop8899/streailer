const assert = require('assert');
// The fixture replaces node-fetch before the provider/modules are imported.
const fixture = require('./fixtures/trailer-fetch');
const { reset, ids, dubbed, subtitled, playerHtml } = fixture;
const { getTrailerStreams } = require('../trailerProvider');
const {
    getYouTubeVideoMetadata, parseIsoDuration, isVideoExcluded,
    audioLanguageBonus, clearYouTubeMetadataCache
} = require('../youtubeMetadata');

let passed = 0;
const originalKey = process.env.YOUTUBE_API_KEY;
process.env.YOUTUBE_API_KEY = 'test-only-no-real-key';

async function test(name, run) {
    clearYouTubeMetadataCache();
    reset();
    await run();
    passed++;
    console.log('PASS API: ' + name);
}

function video(id, overrides = {}) {
    return {
        id,
        snippet: {
            title: 'Primetime (2026) Trailer', channelId: 'channel-123',
            channelTitle: 'Test Film Studio', liveBroadcastContent: 'none',
            ...overrides.snippet
        },
        contentDetails: {
            duration: 'PT2M30S', caption: 'false',
            ...overrides.contentDetails
        },
        status: {
            privacyStatus: 'public', uploadStatus: 'processed', embeddable: true,
            ...overrides.status
        }
    };
}

function tmdb(id, extra = {}) {
    return {
        site: 'YouTube', type: 'Trailer', official: true,
        key: id, name: 'Official Trailer',
        iso_639_1: 'pt', iso_3166_1: 'BR', ...extra
    };
}

function trailers({ strict = false, target = 'internal' } = {}) {
    return getTrailerStreams('movie', 'tt34206385', 'Primetime',
        undefined, 123, 'pt-BR', false, target, strict);
}

function apiCalls(state) {
    return state.calls.filter(url => url.hostname === 'www.googleapis.com');
}

async function run() {
    await test('disabled API preserves existing selection with no API calls', async () => {
        delete process.env.YOUTUBE_API_KEY;
        try {
            const state = reset({ localized: [tmdb(ids.dubbed)] });
            assert.strictEqual((await trailers())[0].ytId, ids.dubbed);
            assert.strictEqual(apiCalls(state).length, 0);
            assert.strictEqual(await getYouTubeVideoMetadata([ids.dubbed]), null);
        } finally {
            process.env.YOUTUBE_API_KEY = 'test-only-no-real-key';
        }
    });

    await test('per-user API key enables verification when no server key is configured', async () => {
        delete process.env.YOUTUBE_API_KEY;
        try {
            const state = reset({ localized: [tmdb(ids.dubbed)] });
            const streams = await getTrailerStreams('movie', 'tt34206385', 'Primetime',
                undefined, 123, 'pt-BR', false, 'internal', false, 'user-key-123');
            assert.strictEqual(streams[0].ytId, ids.dubbed);
            assert.strictEqual(apiCalls(state).length, 1);
            assert.strictEqual(apiCalls(state)[0].searchParams.get('key'), 'user-key-123');
        } finally {
            process.env.YOUTUBE_API_KEY = 'test-only-no-real-key';
        }
    });

    await test('per-user key overrides server key without changing environment', async () => {
        const state = reset({ localized: [tmdb(ids.dubbed)] });
        await getTrailerStreams('movie', 'tt34206385', 'Primetime',
            undefined, 123, 'pt-BR', false, 'internal', false, 'override-test-key');
        assert.strictEqual(apiCalls(state)[0].searchParams.get('key'), 'override-test-key');
        assert.strictEqual(process.env.YOUTUBE_API_KEY, 'test-only-no-real-key');
    });

    await test('cache isolation prevents two user keys from sharing API results', async () => {
        const state = reset({ localized: [tmdb(ids.dubbed)] });
        const first = await getTrailerStreams('movie', 'tt34206385', 'Primetime',
            undefined, 123, 'pt-BR', false, 'internal', false, 'user-key-one');
        assert.strictEqual(first[0].ytId, ids.dubbed);
        const second = await getTrailerStreams('movie', 'tt34206385', 'Primetime',
            undefined, 123, 'pt-BR', false, 'internal', false, 'user-key-two');
        assert.strictEqual(second[0].ytId, ids.dubbed);
        assert.deepStrictEqual(apiCalls(state).map(url => url.searchParams.get('key')),
            ['user-key-one', 'user-key-two']);
        await getTrailerStreams('movie', 'tt34206385', 'Primetime',
            undefined, 123, 'pt-BR', false, 'internal', false, 'user-key-one');
        assert.strictEqual(apiCalls(state).length, 2);
    });

    await test('per-user key still falls back to the legacy selection after API denial', async () => {
        const state = reset({ localized: [tmdb(ids.dubbed)], apiStatus: 403 });
        const streams = await getTrailerStreams('movie', 'tt34206385', 'Primetime',
            undefined, 123, 'pt-BR', false, 'internal', false, 'invalid-user-key');
        assert.strictEqual(streams[0].ytId, ids.dubbed);
        assert.strictEqual(apiCalls(state).length, 1);
    });

    await test('empty per-user key uses server environment key as before', async () => {
        const state = reset({ localized: [tmdb(ids.dubbed)] });
        const streams = await getTrailerStreams('movie', 'tt34206385', 'Primetime',
            undefined, 123, 'pt-BR', false, 'internal', false, '');
        assert.strictEqual(streams[0].ytId, ids.dubbed);
        assert.strictEqual(apiCalls(state)[0].searchParams.get('key'), 'test-only-no-real-key');
    });

    await test('ISO 8601 video lengths reject malformed, empty and long records', async () => {
        assert.strictEqual(parseIsoDuration('PT2M30S'), 150);
        assert.strictEqual(parseIsoDuration('PT1H2M3S'), 3723);
        assert.strictEqual(parseIsoDuration('P1DT1S'), 86401);
        assert.strictEqual(parseIsoDuration('PT'), null);
        assert.strictEqual(parseIsoDuration('bogus'), null);
        assert.strictEqual(parseIsoDuration('PT0S'), null);
    });

    await test('one videos.list batch verifies multiple candidates', async () => {
        const candidates = [tmdb(ids.unknown), tmdb(ids.dubbed), tmdb(ids.subtitled)];
        const state = reset({ localized: candidates });
        assert.strictEqual((await trailers())[0].ytId, ids.unknown);
        const calls = apiCalls(state);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].searchParams.get('part'), 'snippet,contentDetails,status');
        assert.deepStrictEqual(new Set(calls[0].searchParams.get('id').split(',')),
            new Set([ids.unknown, ids.dubbed, ids.subtitled]));
    });

    await test('successful metadata is cached across repeated trailer requests', async () => {
        const state = reset({ localized: [tmdb(ids.dubbed)] });
        assert.strictEqual((await trailers())[0].ytId, ids.dubbed);
        assert.strictEqual((await trailers())[0].ytId, ids.dubbed);
        assert.strictEqual(apiCalls(state).length, 1);
    });

    await test('missing API IDs are rejected but available alternatives remain eligible', async () => {
        const state = reset({
            localized: [tmdb(ids.unknown), tmdb(ids.dubbed)],
            apiVideos: { [ids.dubbed]: video(ids.dubbed) }
        });
        assert.strictEqual((await trailers())[0].ytId, ids.dubbed);
        assert.strictEqual(apiCalls(state).length, 1);
    });

    await test('verified API duration beats a short or missing watch duration', async () => {
        reset({
            localized: [tmdb(ids.unknown), tmdb(ids.dubbed)],
            apiVideos: {
                [ids.unknown]: video(ids.unknown, { contentDetails: { duration: 'PT1H32M' } }),
                [ids.dubbed]: video(ids.dubbed)
            }
        });
        assert.strictEqual((await trailers())[0].ytId, ids.dubbed);
    });

    await test('API region allowed/blocked restrictions reject Brazilian unavailability', async () => {
        for (const restriction of [
            { allowed: ['PT', 'US'] }, { allowed: [] }, { blocked: ['BR'] }
        ]) {
            clearYouTubeMetadataCache();
            reset({
                localized: [tmdb(ids.unknown), tmdb(ids.dubbed)],
                apiVideos: {
                    [ids.unknown]: video(ids.unknown,
                        { contentDetails: { regionRestriction: restriction } }),
                    [ids.dubbed]: video(ids.dubbed)
                }
            });
            assert.strictEqual((await trailers())[0].ytId, ids.dubbed);
        }
    });

    await test('private and live API entries are ignored', async () => {
        for (const exclusion of [
            { status: { privacyStatus: 'private' } },
            { snippet: { liveBroadcastContent: 'live' } },
            { snippet: { liveBroadcastContent: 'upcoming' } },
            { status: { uploadStatus: 'failed' } }
        ]) {
            clearYouTubeMetadataCache();
            reset({
                localized: [tmdb(ids.unknown), tmdb(ids.dubbed)],
                apiVideos: {
                    [ids.unknown]: video(ids.unknown, exclusion),
                    [ids.dubbed]: video(ids.dubbed)
                }
            });
            assert.strictEqual((await trailers())[0].ytId, ids.dubbed);
        }
    });

    await test('default PT-BR spoken audio outranks title-only subtitle hints', async () => {
        reset({
            localized: [
                tmdb(ids.subtitled, { name: 'Primetime (2026) Trailer Legendado PT-BR' }),
                tmdb(ids.dubbed, { name: 'Official Trailer' })
            ],
            apiVideos: {
                [ids.subtitled]: video(ids.subtitled,
                    { snippet: { defaultAudioLanguage: 'en' }, contentDetails: { caption: 'true' } }),
                [ids.dubbed]: video(ids.dubbed,
                    { snippet: { defaultAudioLanguage: 'pt-BR' } })
            }
        });
        assert.strictEqual((await trailers())[0].ytId, ids.dubbed);
    });

    await test('spoken PT-BR supports an otherwise neutral title in strict mode', async () => {
        reset({
            localized: [],
            candidates: [{ ytId: ids.unknown, title: 'Primetime (2026) Official Trailer', durationSeconds: 150 }],
            apiVideos: { [ids.unknown]: video(ids.unknown,
                { snippet: { defaultAudioLanguage: 'pt-BR' } }) }
        });
        assert.strictEqual((await trailers({ strict: true }))[0].ytId, ids.unknown);
    });

    await test('English audio and caption=true do NOT prove Portuguese subtitles', async () => {
        reset({
            localized: [],
            candidates: [{ ytId: ids.unknown, title: 'Primetime (2026) Official Trailer', durationSeconds: 150 }],
            apiVideos: { [ids.unknown]: video(ids.unknown,
                { snippet: { defaultAudioLanguage: 'en', defaultLanguage: 'pt-BR' },
                    contentDetails: { caption: 'true' } }) }
        });
        assert.deepStrictEqual(await trailers({ strict: true }), []);
    });

    await test('generic pt audio cannot certify a Brazilian region in strict mode', async () => {
        reset({
            localized: [],
            candidates: [{ ytId: ids.unknown, title: 'Primetime (2026) Official Trailer', durationSeconds: 150 }],
            apiVideos: { [ids.unknown]: video(ids.unknown,
                { snippet: { defaultAudioLanguage: 'pt' } }) }
        });
        assert.deepStrictEqual(await trailers({ strict: true }), []);
    });

    await test('API quota failure falls back to old TMDB and watch-page validation', async () => {
        const state = reset({ apiStatus: 403, localized: [tmdb(ids.dubbed)] });
        assert.strictEqual((await trailers())[0].ytId, ids.dubbed);
        assert.strictEqual(apiCalls(state).length, 1);
    });

    await test('API network timeout/error does not break legacy selection', async () => {
        reset({ apiError: true, candidates: [subtitled] });
        assert.strictEqual((await trailers({ strict: true }))[0].ytId, ids.subtitled);
    });

    await test('watch page may still reject a video allowed by YouTube Data API', async () => {
        reset({
            localized: [tmdb(ids.unknown), tmdb(ids.dubbed)],
            watch: { [ids.unknown]: playerHtml(['PT']) }
        });
        assert.strictEqual((await trailers())[0].ytId, ids.dubbed);
    });

    await test('portuguese TMDB fallback remains valid with API verification enabled', async () => {
        const portugalId = 'A2MA-QCwDGU';
        const state = reset({
            localized: [], candidates: [{
                ytId: ids.unknown, title: 'Primetime (2026) Official Trailer', durationSeconds: 180
            }],
            portugal: [tmdb(portugalId, {
                iso_639_1: 'pt', iso_3166_1: 'PT',
                name: 'Primetime Trailer Oficial Legendado PT'
            })],
            english: [tmdb(ids.english, { iso_639_1: 'en', iso_3166_1: 'US' })],
            apiVideos: {
                [ids.unknown]: video(ids.unknown, {
                    snippet: { defaultAudioLanguage: 'en' }
                }),
                [portugalId]: video(portugalId, {
                    snippet: { defaultAudioLanguage: 'en' },
                    contentDetails: { caption: 'true' }
                })
            }
        });
        const result = await trailers();
        assert.strictEqual(result[0].ytId, portugalId);
        assert.ok(result[0].name.includes('🇵🇹'));
        assert.ok(state.calls.some(url => url.searchParams.get('language') === 'pt-PT'));
    });

    await test('external YouTube and internal players retain their stream shapes', async () => {
        for (const target of ['internal', 'youtube', 'smarttube', 'tizentube']) {
            clearYouTubeMetadataCache();
            reset({ localized: [tmdb(ids.dubbed)] });
            const stream = (await trailers({ target }))[0];
            if (target === 'internal') assert.strictEqual(stream.ytId, ids.dubbed);
            else assert.ok(stream.externalUrl.includes(ids.dubbed));
        }
    });

    await test('nonembeddable videos are not falsely marked unavailable for external players', async () => {
        reset({
            localized: [tmdb(ids.dubbed)],
            apiVideos: { [ids.dubbed]: video(ids.dubbed, { status: { embeddable: false } }) }
        });
        const streams = await trailers({ target: 'youtube' });
        assert.ok(streams[0].externalUrl.includes(ids.dubbed));
    });

    await test('metadata utility does not infer subtitles from caption existence', async () => {
        const state = reset({ apiVideos: {
            [ids.subtitled]: video(ids.subtitled, {
                snippet: { defaultAudioLanguage: 'en', defaultLanguage: 'pt-BR' },
                contentDetails: { caption: 'true' }
            })
        } });
        const map = await getYouTubeVideoMetadata([ids.subtitled]);
        const entry = map.get(ids.subtitled);
        assert.strictEqual(entry.captionAvailable, true);
        assert.strictEqual(entry.defaultAudioLanguage, 'en');
        assert.strictEqual(entry.defaultLanguage, 'pt-BR');
        assert.strictEqual(entry.channelId, 'channel-123');
        assert.strictEqual(audioLanguageBonus(entry, 'pt-BR'), 0);
        assert.strictEqual(isVideoExcluded(entry, 'BR', 600), false);
        assert.strictEqual(apiCalls(state).length, 1);
    });

    console.log(passed + ' YouTube API regression tests passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => {
        if (originalKey === undefined) delete process.env.YOUTUBE_API_KEY;
        else process.env.YOUTUBE_API_KEY = originalKey;
    });
