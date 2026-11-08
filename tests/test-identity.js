const assert = require('assert');
const fixture = require('./fixtures/trailer-fetch');
const { ids, reset } = fixture;
const { getTrailerStreams } = require(process.env.BASELINE_PROVIDER || '../trailerProvider');

// These fixtures model distinct TMDB identities sharing a localized title. The
// YouTube order and language labels deliberately favor the incorrect remake.
const rebel = { id: 977942, title: 'O Rebelde', original_title: 'The Uprising', release_date: '2026-09-10' };
const screenshotWrong = { ytId: ids.unknown, title: 'Tuff Turf: O Rebelde 1985 Trailer Legendado' };
const rebelCorrect = { ytId: ids.subtitled, title: 'O Rebelde (2026) | Trailer Legendado PT-BR' };
const originalCorrect = { ytId: ids.subtitled, title: 'A REVOLTA (The Uprising) | Trailer Legendado PT | Andrew Garfield (2026)' };
const realTmdbVideo = {
    site: 'YouTube', key: 'zzPbA9yalhc', type: 'Trailer', official: true,
    name: 'A REVOLTA (The Uprising) | Trailer Legendado PT | Andrew Garfield',
    iso_639_1: 'pt', iso_3166_1: 'BR'
};

let passed = 0;
let failed = 0;
async function test(name, run) {
    reset({ metadata: rebel });
    try {
        await run();
        passed++;
        console.log('PASS ' + name);
    } catch (error) {
        failed++;
        console.error('FAIL ' + name + ': ' + error.message);
    }
}
function trailers(options = {}) {
    const { type = 'movie', title = 'O Rebelde', season, tmdbId = 977942, language = 'pt-BR', strict = true } = options;
    return getTrailerStreams(type, 'tt36983905', title, season, tmdbId, language, false, 'internal', strict);
}
function movie(title, year, original = title) {
    return { id: 977942, title, original_title: original, release_date: year + '-01-01' };
}
function candidate(title, ytId = ids.dubbed) {
    return { ytId, title };
}
function assertVideo(streams, expected) {
    assert.strictEqual(streams.length, 1, 'expected one verified stream');
    assert.strictEqual(streams[0].ytId, expected);
}

async function run() {
    await test('Model Citizen 2026 excludes the unrelated 2020 Autodale short and falls back to a real trailer', async () => {
        const metadata = {
            id: 1792170, title: 'Model Citizen', original_title: 'Model Citizen',
            release_date: '2026-11-03', runtime: 93
        };
        const wrong = {
            site: 'YouTube', key: 'mdlwrong001', type: 'Trailer', official: true,
            name: 'Model Citizen (2026) Trailer Legendado PT-BR',
            iso_639_1: 'pt', iso_3166_1: 'BR'
        };
        const correct = {
            site: 'YouTube', key: 'mdlright001', type: 'Trailer', official: true,
            name: 'Official Trailer', iso_639_1: 'en', iso_3166_1: 'US'
        };
        const source = reset({
            metadata, localized: [wrong], portugal: [], candidates: [],
            english: [correct],
            watch: {
                [wrong.key]: fixture.playerHtml(['BR', 'US'], '', 284, false,
                    '"Model Citizen"(Cidadão Modelo) - David James PT-BR Legendado/tradução',
                    '2020-01-10'),
                [correct.key]: fixture.playerHtml(['BR', 'US'], '', 126, false,
                    'Model Citizen | Official Trailer | Warner Bros. Entertainment',
                    '2026-10-07')
            }
        });
        const streams = await getTrailerStreams('movie', 'tt13884466', 'Model Citizen',
            undefined, 1792170, 'pt-BR', false, 'internal', false);
        assertVideo(streams, correct.key);
        assert.ok(streams[0].name.includes('🇬🇧'));
        assert.ok(source.calls.some(url => url.searchParams.get('language') === 'en-US'));
    });

    await test('Model Citizen rejects TMDB-associated conflicting years, creator shorts and missing alternatives', async () => {
        const metadata = {
            id: 1792170, title: 'Model Citizen',
            original_title: 'Model Citizen', release_date: '2026-11-03', runtime: 93
        };
        for (const title of [
            '"Model Citizen"(Cidadão Modelo) - David James PT-BR Legendado/tradução',
            'Model Citizen (2020) Animated Short Film Trailer',
            'Model Citizen (2026) Animated Short Film Trailer'
        ]) {
            reset({
                metadata, localized: [{
                    site: 'YouTube', key: 'mdlwrong001', type: 'Trailer',
                    official: true, name: 'Model Citizen Trailer Legendado',
                    iso_639_1: 'pt', iso_3166_1: 'BR'
                }], candidates: [], english: [],
                watch: { mdlwrong001: fixture.playerHtml(['BR'], '', 284, false, title) }
            });
            const streams = await getTrailerStreams('movie', 'tt13884466', 'Model Citizen',
                undefined, 1792170, 'pt-BR', false, 'internal', false);
            assert.deepStrictEqual(streams, []);
        }
    });

    await test('Model Citizen youtube search snippet cannot override contradictory watch metadata', async () => {
        reset({
            metadata: { id: 1792170, title: 'Model Citizen', original_title: 'Model Citizen',
                release_date: '2026-11-03', runtime: 93 },
            candidates: [{ ytId: 'mdlwrong001',
                title: 'Model Citizen (2026) Trailer Dublado PT-BR', durationSeconds: 284 }],
            localized: [], portugal: [], english: [],
            watch: { mdlwrong001: fixture.playerHtml(['BR'], '', 284, false,
                'Model Citizen - Curta animado de David James') }
        });
        assert.deepStrictEqual(await getTrailerStreams('movie', 'tt13884466',
            'Model Citizen', undefined, 1792170, 'pt-BR', false, 'internal', false), []);
    });

    await test('O Rebelde 2026 skips the exact Tuff Turf 1985 screenshot result', async () => {
        reset({ metadata: rebel, candidates: [screenshotWrong, rebelCorrect] });
        assertVideo(await trailers(), ids.subtitled);
    });
    await test('real O Rebelde pt-PT trailers remain valid alternate outcomes', async () => {
        const portugal = [
            { site: 'YouTube', key: 'A2MA-QCwDGU', type: 'Trailer', official: true,
                name: 'A REVOLTA (The Uprising) - Trailer Oficial Legendado PT',
                iso_639_1: 'pt', iso_3166_1: 'PT' },
            { ...realTmdbVideo, iso_3166_1: 'PT' }
        ];
        // Either is an acceptable associated Portuguese trailer; the result
        // should be chosen by ordinary ranking and order, not a special ID.
        for (const videos of [portugal, [...portugal].reverse()]) {
            const state = reset({
                metadata: rebel, localized: [], portugal: videos,
                candidates: [{
                    ytId: 'yNj2h2SiyX8',
                    title: 'THE UPRISING Official Trailer (2026) Andrew Garfield, Action Movie [4K]',
                    durationSeconds: 155
                }],
                english: [{ site: 'YouTube', key: ids.english, type: 'Trailer', official: true,
                    name: 'Official Trailer', iso_639_1: 'en', iso_3166_1: 'US' }]
            });
            const streams = await trailers({ strict: false });
            assertVideo(streams, videos[0].key);
            assert.ok(streams[0].name.includes('🇵🇹'));
            assert.deepStrictEqual(streams[0].behaviorHints, { notWebReady: true, bingeGroup: 'trailer' });
            assert.ok(state.calls.some(url => url.searchParams.get('language') === 'pt-PT'));
            assert.ok(!state.calls.some(url => url.searchParams.get('language') === 'en-US'));
        }
    });
    await test('O Rebelde pt-PT fallback skips unavailable and long trailers', async () => {
        const first = { site: 'YouTube', key: 'A2MA-QCwDGU', type: 'Trailer', official: true,
            name: 'A REVOLTA (The Uprising) - Trailer Oficial Legendado PT',
            iso_639_1: 'pt', iso_3166_1: 'PT' };
        for (const invalid of [fixture.playerHtml(['PT']), fixture.playerHtml(['BR', 'PT'], '', 800)]) {
            reset({ metadata: rebel, localized: [], candidates: [],
                portugal: [first, { ...realTmdbVideo, iso_3166_1: 'PT' }], watch: { [first.key]: invalid } });
            assertVideo(await trailers({ strict: false }), realTmdbVideo.key);
        }
    });
    await test('O Rebelde strict pt-BR keeps cross-region fallback disabled', async () => {
        const state = reset({ metadata: rebel, localized: [], candidates: [],
            portugal: [realTmdbVideo] });
        assert.deepStrictEqual(await trailers({ strict: true }), []);
        assert.ok(!state.calls.some(url => url.searchParams.get('language') === 'pt-PT'));
    });
    await test('O Rebelde uses an eligible pt-BR trailer before any pt-PT alternative', async () => {
        const state = reset({ metadata: rebel, localized: [realTmdbVideo].map(v =>
            ({ ...v, key: ids.dubbed, iso_3166_1: 'BR', name: 'O Rebelde Trailer Legendado PT-BR' })),
            portugal: [realTmdbVideo], candidates: [] });
        assertVideo(await trailers({ strict: false }), ids.dubbed);
        assert.ok(!state.calls.some(url => url.searchParams.get('language') === 'pt-PT'));
    });
    await test('O Rebelde rejects a matching-year full movie review (real incident)', async () => {
        const wrong = { ytId: 'I29NFB4moLk', title: 'O Rebelde (2026) Filme completo em português Revisão e fatos', durationSeconds: 7380 };
        reset({ metadata: rebel, candidates: [wrong, rebelCorrect] });
        assertVideo(await trailers({ strict: false }), ids.subtitled);
        reset({ metadata: rebel, candidates: [wrong] });
        assert.deepStrictEqual(await trailers({ strict: false }), []);
    });
    await test('O Rebelde rejects a movie-length result even when advertised as a trailer', async () => {
        reset({ metadata: rebel, candidates: [
            { ytId: 'I29NFB4moLk', title: 'O Rebelde (2026) Official Trailer', durationSeconds: 7550 },
            rebelCorrect
        ] });
        assertVideo(await trailers({ strict: false }), ids.subtitled);
    });
    await test('an unrelated release cannot win through stronger dubbing evidence', async () => {
        reset({ metadata: rebel, candidates: [candidate('O Rebelde (1985) Trailer Dublado'), rebelCorrect] });
        assertVideo(await trailers(), ids.subtitled);
    });
    await test('the wrong O Rebelde is rejected even when it is the only available result', async () => {
        reset({ metadata: rebel, candidates: [screenshotWrong] });
        assert.deepStrictEqual(await trailers({ strict: false }), []);
    });
    await test('canonical original title aliases identify a differently localized release', async () => {
        reset({ metadata: rebel, candidates: [screenshotWrong, originalCorrect] });
        assertVideo(await trailers(), ids.subtitled);
    });
    await test('searches carry canonical movie titles and their known release year', async () => {
        const state = reset({ metadata: rebel, candidates: [originalCorrect] });
        assertVideo(await trailers(), ids.subtitled);
        const queries = state.calls.filter(url => url.pathname === '/results').map(url => url.searchParams.get('search_query'));
        assert.ok(queries.some(query => query.includes('O Rebelde') && query.includes('2026')));
        assert.ok(queries.some(query => query.includes('The Uprising') && query.includes('2026')));
    });
    await test('an unrecognized duplicate title cannot suppress a later verified alias', async () => {
        reset({ metadata: rebel, candidates: url => [candidate(url.searchParams.get('search_query').includes('The Uprising')
            ? 'The Uprising (2026) Trailer Dublado' : 'A Rebelião (2026) Trailer Dublado')] });
        assertVideo(await trailers(), ids.dubbed);
    });
    await test('a duplicate with unknown language cannot suppress a later Portuguese title', async () => {
        reset({ metadata: rebel, candidates: url => [candidate(url.searchParams.get('search_query').includes('The Uprising')
            ? 'The Uprising (2026) Trailer Dublado' : 'O Rebelde (2026) Official Trailer')] });
        assertVideo(await trailers(), ids.dubbed);
    });
    await test('canonical yearless TMDB-associated trailer remains valid', async () => {
        const state = reset({ metadata: rebel, localized: [realTmdbVideo], candidates: [screenshotWrong] });
        assertVideo(await trailers(), realTmdbVideo.key);
        assert.ok(!state.calls.some(url => url.pathname === '/results'));
    });
    await test('scraped original and localized aliases need independent year evidence', async () => {
        for (const title of ['O Rebelde Trailer Dublado', realTmdbVideo.name]) {
            reset({ metadata: rebel, candidates: [candidate(title)] });
            assert.deepStrictEqual(await trailers({ strict: false }), [], title);
        }
    });
    await test('matching original title cannot override a contradictory release year', async () => {
        reset({ metadata: rebel, candidates: [candidate('The Uprising (1985) Trailer Dublado')] });
        assert.deepStrictEqual(await trailers(), []);
    });
    await test('a compilation containing both the expected and conflicting years is rejected', async () => {
        reset({ metadata: rebel, candidates: [candidate('O Rebelde (1985 / 2026) Trailer Dublado')] });
        assert.deepStrictEqual(await trailers(), []);
    });
    await test('same release year alone cannot make another movie a match', async () => {
        reset({ metadata: rebel, candidates: [candidate('Tuff Turf (2026) Trailer Dublado')] });
        assert.deepStrictEqual(await trailers(), []);
    });
    await test('IMDb resolution retains localized title, original title, and release year', async () => {
        for (const accepted of [rebelCorrect, originalCorrect]) {
            const state = reset({ metadata: rebel, candidates: [screenshotWrong, accepted] });
            assertVideo(await trailers({ tmdbId: null, title: '' }), ids.subtitled);
            assert.ok(state.calls.some(url => url.pathname.includes('/find/tt36983905')));
        }
    });
    await test('direct TMDB requests resolve identity even when the caller supplies a stale name', async () => {
        const state = reset({ metadata: rebel, candidates: [candidate('Caller Supplied Film (2026) Trailer Dublado'), rebelCorrect] });
        assertVideo(await trailers({ title: 'Caller Supplied Film' }), ids.subtitled);
        assert.ok(state.calls.some(url => url.pathname === '/3/movie/977942'));
    });
    await test('caller-supplied names do not become additional unverified movie aliases', async () => {
        reset({ metadata: rebel, candidates: [candidate('Caller Supplied Film (2026) Trailer Dublado')] });
        assert.deepStrictEqual(await trailers({ title: 'Caller Supplied Film' }), []);
    });
    await test('IMDb requests with caller titles still use the resolved canonical identity', async () => {
        reset({ metadata: rebel, candidates: [candidate('Caller Supplied Film (2026) Trailer Dublado'), originalCorrect] });
        assertVideo(await trailers({ tmdbId: null, title: 'Caller Supplied Film' }), ids.subtitled);
    });
    await test('missing movie dates cannot certify a scraped result', async () => {
        for (const release_date of [undefined, null, '', 'not-a-date']) {
            reset({ metadata: { ...rebel, release_date }, candidates: [rebelCorrect] });
            assert.deepStrictEqual(await trailers(), [], String(release_date));
        }
    });
    await test('metadata failures cannot certify a caller-name search result', async () => {
        for (const failure of [{ metadataError: true }, { metadataStatus: 500 }, { metadata: {} }, { metadata: null }]) {
            reset({ metadata: rebel, candidates: [rebelCorrect], ...failure });
            assert.deepStrictEqual(await trailers({ strict: false }), []);
        }
    });
    await test('canonical TMDB videos survive missing dates and unavailable details', async () => {
        for (const missing of [{ metadata: { ...rebel, release_date: '' } }, { metadataError: true }, { metadataStatus: 500 }]) {
            reset({ metadata: rebel, localized: [realTmdbVideo], ...missing });
            assertVideo(await trailers(), realTmdbVideo.key);
        }
    });
    await test('year-like movie names do not conflict with their actual release year', async () => {
        for (const [title, year] of [['1917', 2019], ['1984', 1984], ['2001: A Space Odyssey', 1968]]) {
            reset({ metadata: movie(title, year), candidates: [candidate(title + ' (' + year + ') Trailer Dublado')] });
            assertVideo(await trailers({ title }), ids.dubbed);
        }
    });
    await test('a year in the movie title is not release-year evidence', async () => {
        for (const title of ['1917', '1984', '2001: A Space Odyssey']) {
            const year = Number(title.slice(0, 4));
            reset({ metadata: movie(title, year), candidates: [candidate(title + ' Trailer Dublado')] });
            assert.deepStrictEqual(await trailers({ title }), [], title);
        }
    });
    await test('a numeric movie title does not hide a genuinely conflicting release year', async () => {
        reset({ metadata: movie('1917', 2019), candidates: [candidate('1917 (2020) Trailer Dublado')] });
        assert.deepStrictEqual(await trailers({ title: '1917' }), []);
    });
    await test('unused numeric aliases cannot erase the actual release year', async () => {
        reset({ metadata: movie('Nineteen Eighty-Four', 1984, '1984'), candidates: [candidate('Nineteen Eighty-Four (1984) Trailer Dublado')] });
        assertVideo(await trailers(), ids.dubbed);
    });
    await test('unused numeric aliases cannot hide a contradictory release year', async () => {
        reset({ metadata: movie('1987 When the Day Comes', 2017, '1987'), candidates: [candidate('1987 When the Day Comes (1987 / 2017) Trailer Dublado')] });
        assert.deepStrictEqual(await trailers(), []);
    });
    await test('movie titles containing localized punctuation and accents remain searchable', async () => {
        reset({ metadata: movie('Ação: O Retorno', 2026), candidates: [candidate('ACAO - O RETORNO (2026) Trailer Dublado')] });
        assertVideo(await trailers({ title: 'Ação: O Retorno' }), ids.dubbed);
    });
    await test('an alias language word is not mistaken for a foreign-language trailer label', async () => {
        reset({ metadata: movie('A Crônica Francesa', 2021, 'The French Dispatch'), candidates: [candidate('The French Dispatch (2021) Trailer Dublado')] });
        assertVideo(await trailers({ title: 'A Crônica Francesa' }), ids.dubbed);
    });
    await test('numeric and named sequel suffixes do not match a base movie', async () => {
        for (const sequel of ['Rocky 2', 'Rocky II', 'Rocky Part Two', 'Rocky Parte Dois', 'Rocky Chapter 2']) {
            reset({ metadata: movie('Rocky', 1976), candidates: [candidate(sequel + ' (1976) Trailer Dublado')] });
            assert.deepStrictEqual(await trailers({ title: 'Rocky' }), [], sequel);
        }
    });
    await test('a requested sequel cannot be satisfied by its shorter base title', async () => {
        reset({ metadata: movie('Rocky II', 1979), candidates: [candidate('Rocky (1979) Trailer Dublado')] });
        assert.deepStrictEqual(await trailers({ title: 'Rocky II' }), []);
    });
    await test('the complete sequel title remains a valid match', async () => {
        reset({ metadata: movie('Rocky II', 1979), candidates: [candidate('Rocky II (1979) Trailer Dublado')] });
        assertVideo(await trailers({ title: 'Rocky II' }), ids.dubbed);
    });

    const series = { id: 977942, name: 'Primetime', original_name: 'Primetime', first_air_date: '2010-01-01' };
    await test('complete TV episode must never be selected as a series trailer', async () => {
        const dragon = { id: 977942, name: 'Encontro com o Dragão', original_name: 'Miss The Dragon', first_air_date: '2021-01-01' };
        reset({ metadata: dragon, candidates: [
            { ytId: 'I29NFB4moLk', title: 'Encontro com o Dragão EP01 | Miss The Dragon | 遇龙 (Legendado PT-BR)', durationSeconds: 2700 }
        ] });
        assert.deepStrictEqual(await trailers({ type: 'series', title: 'Encontro com o Dragão', strict: false }), []);
    });
    await test('later TV seasons are not constrained to a series premiere year', async () => {
        reset({ metadata: series, candidates: [candidate('Primetime Temporada 2 (2026) Trailer Dublado')] });
        assertVideo(await trailers({ type: 'series', title: 'Primetime', season: 2 }), ids.dubbed);
    });
    await test('explicitly different seasons are rejected before language ranking', async () => {
        reset({ metadata: series, candidates: [candidate('Primetime Temporada 1 Trailer Dublado'), candidate('Primetime Temporada 2 Trailer Legendado PT-BR', ids.subtitled)] });
        assertVideo(await trailers({ type: 'series', title: 'Primetime', season: 2 }), ids.subtitled);
    });
    await test('season-specific searches need actual requested-season evidence', async () => {
        for (const title of ['Primetime Trailer Dublado', 'Primetime Temporada 1 Trailer Dublado', 'Primetime Temporada 12 Trailer Dublado']) {
            reset({ metadata: series, candidates: [candidate(title)] });
            assert.deepStrictEqual(await trailers({ type: 'series', title: 'Primetime', season: 2 }), [], title);
        }
    });
    await test('season numbers support translated words, reversed wording, and compact markers', async () => {
        const cases = [
            ['pt-BR', 'Primetime Segunda Temporada Trailer Dublado'],
            ['pt-BR', 'Primetime Temporada Dois Trailer Dublado'],
            ['pt-BR', 'Primetime 2 temporada Trailer Dublado'],
            ['pt-BR', 'Primetime 2ª temporada Trailer Dublado'],
            ['pt-BR', 'Primetime S2 Trailer Dublado'],
            ['en-US', 'Primetime Second Season Official English Trailer'],
            ['en-US', 'Primetime Season Two Official English Trailer'],
            ['it-IT', 'Primetime Seconda Stagione Trailer Italiano'],
            ['de-DE', 'Primetime Zweite Staffel Trailer Deutsch']
        ];
        for (const [language, title] of cases) {
            reset({ metadata: series, candidates: [candidate(title)], watch: { [ids.dubbed]: fixture.playerHtml([language.split('-')[1]]) } });
            assertVideo(await trailers({ type: 'series', title: 'Primetime', season: 2, language }), ids.dubbed);
        }
    });
    await test('conflicting season markers do not certify a combined-season video', async () => {
        reset({ metadata: series, candidates: [candidate('Primetime Season 1 Season 2 Trailer Dublado')] });
        assert.deepStrictEqual(await trailers({ type: 'series', title: 'Primetime', season: 2 }), []);
    });
    await test('numbers and ordinal words inside a show title are not season markers', async () => {
        for (const title of ['24', 'The 100', 'The First']) {
            reset({ metadata: { ...series, name: title, original_name: title }, candidates: [candidate(title + ' Season 2 Trailer Dublado')] });
            assertVideo(await trailers({ type: 'series', title, season: 2 }), ids.dubbed);
        }
    });
    await test('series without a requested season can use a yearless show trailer', async () => {
        reset({ metadata: series, candidates: [candidate('Primetime Trailer Dublado')] });
        assertVideo(await trailers({ type: 'series', title: 'Primetime' }), ids.dubbed);
    });
    await test('season TMDB association remains valid without season words in video titles', async () => {
        reset({ metadata: series, localized: [{ ...realTmdbVideo, name: 'Official Trailer' }] });
        assertVideo(await trailers({ type: 'series', title: 'Primetime', season: 2 }), realTmdbVideo.key);
    });
    console.log(passed + ' identity regression tests passed; ' + failed + ' failed');
    if (failed) process.exitCode = 1;
}

run().catch(error => { console.error(error); process.exitCode = 1; });
