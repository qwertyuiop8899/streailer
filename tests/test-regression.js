const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const fixture = require('./fixtures/trailer-fetch');
const { ids, german, dubbed, subtitled, reset, searchHtml, playerHtml } = fixture;
const { getTrailerStreams } = require(process.env.BASELINE_PROVIDER || '../trailerProvider');
const { languageScore, parseSearchCandidates, isAvailableInRegion } = require('../trailerSelection');

let passed = 0;
async function test(name, run) {
    reset();
    await run();
    passed++;
    console.log('PASS ' + name);
}
function trailers(options = {}) {
    const { language = 'pt-BR', strict = false, target = 'internal', external = false, type = 'movie', season } = options;
    return getTrailerStreams(type, 'tt34206385', 'Primetime', season, 123, language, external, target, strict);
}
function tmdb(key, extra = {}) {
    return { site: 'YouTube', type: 'Trailer', official: true, key, name: 'Official Trailer', iso_639_1: 'pt', iso_3166_1: 'BR', ...extra };
}
function getJson(port, route) {
    return new Promise((resolve, reject) => {
        http.get({ hostname: '127.0.0.1', port, path: route }, response => {
            let body = '';
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => {
                try { assert.strictEqual(response.statusCode, 200); resolve(JSON.parse(body)); }
                catch (error) { reject(error); }
            });
        }).on('error', reject);
    });
}

async function run() {
    await test('issue #22 skips the first German result and prefers dubbed over subtitled', async () => {
        const streams = await trailers();
        assert.strictEqual(streams[0].ytId, ids.dubbed);
        assert.strictEqual(streams[0].title, dubbed.title);
    });
    await test('strict mode returns Portuguese subtitles when dubbing is absent', async () => {
        reset({ candidates: [german, subtitled] });
        assert.strictEqual((await trailers({ strict: true }))[0].ytId, ids.subtitled);
    });
    await test('subtitle search finds releases missing from dubbed search', async () => {
        reset({ candidates: url => url.searchParams.get('search_query').includes('legendado') ? [subtitled] : [german] });
        assert.strictEqual((await trailers({ strict: true }))[0].ytId, ids.subtitled);
    });
    await test('strict mode rejects unknown language and disables English fallback', async () => {
        const state = reset({ candidates: [german, { ytId: ids.unknown, title: 'Primetime Official Trailer' }], english: [tmdb(ids.english, { iso_639_1: 'en', iso_3166_1: 'US' })] });
        assert.deepStrictEqual(await trailers({ strict: 'true' }), []);
        assert.ok(!state.calls.some(url => url.searchParams.get('language') === 'en-US'));
    });
    await test('legacy configs retain neutral search results', async () => {
        reset({ candidates: [{ ytId: ids.unknown, title: 'Primetime Official Trailer' }] });
        assert.strictEqual((await trailers({ strict: 'false' }))[0].ytId, ids.unknown);
    });
    await test('legacy configs retain labeled TMDB English fallback', async () => {
        reset({ candidates: [german], english: [tmdb(ids.english, { iso_639_1: 'en', iso_3166_1: 'US' })] });
        const streams = await trailers();
        assert.strictEqual(streams[0].ytId, ids.english);
        assert.ok(streams[0].name.includes('🇬🇧'));
    });
    await test('regional availability skips blocked dubbed videos', async () => {
        reset({ watch: { [ids.dubbed]: playerHtml(['DE']) } });
        assert.strictEqual((await trailers())[0].ytId, ids.subtitled);
    });
    await test('private video is skipped', async () => {
        reset({ watch: { [ids.dubbed]: playerHtml(['BR'], 'This video is private.') } });
        assert.strictEqual((await trailers())[0].ytId, ids.subtitled);
    });
    await test('subtitle search still runs when a dubbed search result is blocked', async () => {
        reset({ candidates: url => url.searchParams.get('search_query').includes('legendado') ? [subtitled] : [dubbed], watch: { [ids.dubbed]: playerHtml(['DE']) } });
        assert.strictEqual((await trailers({ strict: true }))[0].ytId, ids.subtitled);
    });
    await test('availability checks continue past five blocked results', async () => {
        const blocked = Array.from({ length: 5 }, (_, i) => ({ ytId: 'blocked000' + i, title: 'Primetime Trailer Dublado ' + i }));
        reset({ candidates: [...blocked, dubbed], watch: Object.fromEntries(blocked.map(video => [video.ytId, playerHtml(['DE'])])) });
        assert.strictEqual((await trailers({ strict: true }))[0].ytId, ids.dubbed);
    });
    await test('unknown availability preserves eligible candidates', async () => {
        reset({ watch: { [ids.dubbed]: new Error('timeout') } });
        assert.strictEqual((await trailers())[0].ytId, ids.dubbed);
        assert.strictEqual(isAvailableInRegion('<html>Consent required</html>', 'BR'), true);
        assert.strictEqual(isAvailableInRegion(playerHtml(['BR'], "Sign in to confirm you're not a bot"), 'BR'), true);
    });
    await test('English fallback is checked against the requested Brazilian region', async () => {
        reset({ candidates: [], english: [tmdb(ids.english, { iso_639_1: 'en', iso_3166_1: 'US' })], watch: { [ids.english]: playerHtml(['US']) } });
        assert.deepStrictEqual(await trailers(), []);
    });
    await test('TMDB metadata verifies neutral localized titles in strict mode', async () => {
        reset({ localized: [tmdb(ids.dubbed)] });
        assert.strictEqual((await trailers({ strict: true }))[0].ytId, ids.dubbed);
    });
    await test('TMDB rejects mismatched titles, metadata, and Portuguese regions', async () => {
        reset({ localized: [tmdb(ids.german, { name: german.title }), tmdb(ids.unknown, { iso_639_1: 'de' }), tmdb(ids.english, { iso_3166_1: 'PT' }), tmdb(ids.dubbed)] });
        assert.strictEqual((await trailers({ strict: true }))[0].ytId, ids.dubbed);
    });
    await test('TMDB checks the next candidate after an unavailable official video', async () => {
        reset({ localized: [tmdb(ids.unknown), tmdb(ids.dubbed, { official: false })], watch: { [ids.unknown]: playerHtml(['DE']) } });
        assert.strictEqual((await trailers())[0].ytId, ids.dubbed);
    });
    await test('TMDB ranks official trailers before teasers and clips for equal language evidence', async () => {
        reset({ localized: [tmdb(ids.unknown, { type: 'Clip' }), tmdb(ids.subtitled, { type: 'Teaser' }), tmdb(ids.dubbed)] });
        assert.strictEqual((await trailers())[0].ytId, ids.dubbed);
    });
    await test('invalid IDs and unrelated video titles are rejected', async () => {
        reset({ candidates: [{ ytId: ids.dubbed, title: 'Another Movie Trailer Dublado' }, { ytId: 'bad', title: dubbed.title }], localized: [tmdb('invalid')] });
        assert.deepStrictEqual(await trailers({ strict: true }), []);
    });
    await test('malformed search pages and HTTP failures return empty streams safely', async () => {
        for (const state of [{ html: 'var ytInitialData = {broken}' }, { searchStatus: 429 }, { searchError: true }]) {
            reset(state);
            assert.deepStrictEqual(await trailers({ strict: true }), []);
        }
    });
    await test('search parser keeps each ID with its escaped title and deduplicates results', async () => {
        const candidate = { ytId: ids.dubbed, title: 'Primetime "{2026}" \\ Trailer Dublado & ação' };
        const html = '<script>{"videoId":"' + ids.german + '"}</script>' + searchHtml([candidate, candidate]);
        assert.deepStrictEqual(parseSearchCandidates(html), [candidate]);
        assert.deepStrictEqual(parseSearchCandidates(''), []);
    });
    await test('all supported language hints accept their own locale and reject other languages', async () => {
        const languages = { 'en-US': 'English', 'pt-BR': 'Dublado', 'pt-PT': 'Português Portugal', 'de-DE': 'Deutsch', 'fr-FR': 'VF', 'es-MX': 'Español Latino', 'es-ES': 'Castellano', 'it-IT': 'Italiano', 'ru-RU': 'русский', 'ja-JP': '日本語', 'hi-IN': 'हिन्दी', 'ta-IN': 'தமிழ்', 'tr-TR': 'Türkçe', 'pl-PL': 'Polski', 'nl-NL': 'Nederlands', 'hu-HU': 'Magyar' };
        for (const [locale, hint] of Object.entries(languages)) {
            assert.ok(languageScore('Primetime Trailer ' + hint, 'Primetime', locale) > 0, locale);
            if (!locale.startsWith('pt')) assert.strictEqual(languageScore('Primetime Trailer ' + hint, 'Primetime', 'pt-BR'), -1, locale);
        }
    });
    await test('title words do not masquerade as language evidence', async () => {
        assert.strictEqual(languageScore('The French Dispatch Official Trailer', 'The French Dispatch', 'pt-BR'), 0);
        assert.strictEqual(languageScore('German Official Trailer Dublado', 'German', 'pt-BR'), 4);
        assert.strictEqual(languageScore('Primetime Trailer Português Portugal', 'Primetime', 'pt-BR'), -1);
        assert.strictEqual(languageScore('Primetime English Trailer legendado PT-BR', 'Primetime', 'pt-BR'), 2);
    });
    for (const target of ['internal', 'youtube', 'smarttube', 'tizentube']) {
        await test('player target regression ' + target, async () => {
            const stream = (await trailers({ target, strict: true }))[0];
            if (target === 'internal') assert.strictEqual(stream.ytId, ids.dubbed);
            else {
                assert.ok(stream.externalUrl.includes(ids.dubbed));
                assert.strictEqual(stream.ytId, undefined);
                if (target === 'smarttube') assert.ok(stream.externalUrl.includes('package=com.teamsmart.videomanager.tv'));
                if (target === 'tizentube') assert.ok(stream.externalUrl.includes('package=io.gh.reisxd.tizentube.cobalt'));
            }
            assert.deepStrictEqual(stream.behaviorHints, { notWebReady: true, bingeGroup: 'trailer' });
        });
    }
    await test('legacy externalLink still generates YouTube URLs', async () => {
        assert.strictEqual((await trailers({ external: true }))[0].externalUrl, 'https://www.youtube.com/watch?v=' + ids.dubbed);
    });
    await test('season-specific TMDB lookup retains series fallback', async () => {
        reset({ localized: url => url.pathname.includes('/season/') ? [] : [tmdb(ids.dubbed)] });
        assert.strictEqual((await trailers({ type: 'series', season: 2 }))[0].title, 'Primetime Temporada 2');
    });
    await test('rejected season videos also fall back to series videos', async () => {
        reset({ localized: url => url.pathname.includes('/season/') ? [tmdb(ids.german, { iso_639_1: 'de' })] : [tmdb(ids.dubbed)] });
        assert.strictEqual((await trailers({ type: 'series', season: 2, strict: true }))[0].ytId, ids.dubbed);
    });
    await test('real HTTP routes honor JSON, Base64 and query-string strict configuration', async () => {
        const server = spawn(process.execPath, ['-r', './tests/fixtures/trailer-fetch.js', 'index.js'], {
            cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe']
        });
        // index.js logs the actual bound port, allowing collision-free tests.
        try {
            const port = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000);
                server.once('error', error => { clearTimeout(timer); reject(error); });
                server.once('exit', code => { clearTimeout(timer); reject(new Error('Server exited ' + code)); });
                server.stdout.on('data', chunk => {
                    const match = chunk.toString().match(/Addon running at http:\/\/[^:]+:(\d+)/);
                    if (match) { clearTimeout(timer); resolve(Number(match[1])); }
                });
            });
            const manifest = await getJson(port, '/manifest.json');
            assert.ok(manifest.config.some(option => option.key === 'strictLanguage'));
            for (const strictLanguage of [true, 'true', false, 'false']) {
                const config = { language: 'pt-BR', strictLanguage, playerTarget: 'internal' };
                const encodings = [encodeURIComponent(JSON.stringify(config)), Buffer.from(JSON.stringify(config)).toString('base64'), 'lang=pt-BR&strictLanguage=' + strictLanguage];
                for (const encoded of encodings) {
                    const result = await getJson(port, '/' + encoded + '/stream/movie/tt34206385.json');
                    assert.strictEqual(result.streams[0].ytId, ids.dubbed);
                }
            }
            const strictGerman = await getJson(port, '/lang=fr-FR&strictLanguage=true/stream/movie/tt34206385.json');
            assert.deepStrictEqual(strictGerman.streams, []);
            const nonStrictFrench = await getJson(port, '/lang=fr-FR&strictLanguage=false/stream/movie/tt34206385.json');
            assert.strictEqual(nonStrictFrench.streams[0].ytId, ids.unknown);
            const episode = await getJson(port, '/lang=pt-BR/stream/series/tt34206385:2:2.json');
            assert.deepStrictEqual(episode.streams, []);
            const recapsOnly = await getJson(port, '/lang=pt-BR&onlyRecaps=true/stream/movie/tt34206385.json');
            assert.deepStrictEqual(recapsOnly.streams, []);
        } finally {
            server.kill();
        }
    });
    console.log(passed + ' regression tests passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
