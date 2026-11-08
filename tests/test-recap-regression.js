const assert = require('assert');
const { reset, ids, playerHtml } = require('./fixtures/trailer-fetch');
const { getRecapStreams, searchGenericRecap } = require('../recapProvider');

let passed = 0;
async function test(name, fn) {
    await fn();
    passed++;
    console.log('PASS recap: ' + name);
}
const candidate = (ytId, title, durationSeconds = 900, live = false) =>
    ({ ytId, title, durationSeconds, live });
async function recaps(candidates, overrides = {}, language = 'pt-BR') {
    reset({ candidates, ...overrides });
    return getRecapStreams(null, 'Primetime', 2, language, false, null, 'internal');
}

async function run() {
    await test('selects recap matching video ID and title, not unrelated first result', async () => {
        const result = await recaps([
            candidate(ids.unknown, 'Unrelated Movie Trailer (2026)'),
            candidate(ids.subtitled, 'Primetime Temporada 1 Recap Legendado PT-BR')
        ]);
        assert.strictEqual(result[0]?.ytId, ids.subtitled);
    });
    await test('wrong season recap cannot satisfy previous-season request', async () => {
        const result = await recaps([
            candidate(ids.unknown, 'Primetime Temporada 2 Recap Dublado'),
            candidate(ids.subtitled, 'Primetime Temporada 1 Recap Dublado')
        ]);
        assert.strictEqual(result[0]?.ytId, ids.subtitled);
    });
    await test('full episode EP01 with the correct series name is not a recap', async () => {
        const result = await recaps([
            candidate(ids.unknown, 'Primetime EP01 Legendado PT-BR', 2600)
        ]);
        assert.deepStrictEqual(result, []);
    });
    await test('season recaps reject episode notation S01E01, E01 and 1x01', async () => {
        const wrong = [
            candidate(ids.unknown, 'Primetime Temporada 1 Recap S01E01', 400),
            candidate(ids.dubbed, 'Primetime Temporada 1 Recap E01', 400),
            candidate(ids.german, 'Primetime Temporada 1 Recap 1x01', 400)
        ];
        const result = await recaps([
            ...wrong, candidate(ids.subtitled, 'Primetime Temporada 1 Recap Legendado PT-BR', 700)
        ]);
        assert.strictEqual(result[0]?.ytId, ids.subtitled);
    });
    await test('generic anime recap excludes individual episode summaries', async () => {
        reset({ candidates: [
            candidate(ids.unknown, 'Primetime Recap S01E01', 300),
            candidate(ids.dubbed, 'Primetime Recap 1x01', 300),
            candidate(ids.german, 'Primetime Recap E01', 300)
        ] });
        assert.strictEqual(await searchGenericRecap('Primetime', 'pt-BR'), null);
    });
    await test('full film and live streams cannot masquerade as recap', async () => {
        const result = await recaps([
            candidate(ids.unknown, 'Primetime Temporada 1 Recap Full Episode', 7000),
            candidate(ids.dubbed, 'Primetime Temporada 1 Recap Dublado', 250, true),
            candidate(ids.subtitled, 'Primetime Temporada 1 Recap Dublado', 800)
        ]);
        assert.strictEqual(result[0]?.ytId, ids.subtitled);
    });
    await test('watch duration overrides short search duration', async () => {
        const result = await recaps([
            candidate(ids.unknown, 'Primetime Temporada 1 Recap Dublado', 200),
            candidate(ids.subtitled, 'Primetime Temporada 1 Recap Legendado PT-BR', 1000)
        ], { watch: { [ids.unknown]: playerHtml(['BR'], '', 7800) } });
        assert.strictEqual(result[0]?.ytId, ids.subtitled);
    });
    await test('region-blocked recap is skipped', async () => {
        const result = await recaps([
            candidate(ids.unknown, 'Primetime Temporada 1 Recap Dublado', 500),
            candidate(ids.subtitled, 'Primetime Temporada 1 Recap Dublado', 500)
        ], { watch: { [ids.unknown]: playerHtml(['US']) } });
        assert.strictEqual(result[0]?.ytId, ids.subtitled);
    });
    await test('unverified recap duration fails closed', async () => {
        const result = await recaps([
            { ytId: ids.subtitled, title: 'Primetime Temporada 1 Recap Legendado PT-BR' }
        ], { watch: { [ids.subtitled]: '<html>Consent required</html>' } });
        assert.deepStrictEqual(result, []);
    });
    await test('localized Spanish recap title with matching season is supported', async () => {
        const result = await recaps([
            candidate(ids.subtitled, 'Primetime Temporada 1 Resumen Español', 650)
        ], { watch: { [ids.subtitled]: playerHtml(['ES']) } }, 'es-ES');
        assert.strictEqual(result[0]?.ytId, ids.subtitled);
    });
    await test('generic anime recap requires matching title and recap cue', async () => {
        reset({ candidates: [
            candidate(ids.unknown, 'Another Series Recap (2026)', 420),
            candidate(ids.subtitled, 'Primetime Recap Dublado', 520)
        ] });
        const result = await searchGenericRecap('Primetime', 'pt-BR', false, 'internal');
        assert.strictEqual(result?.ytId, ids.subtitled);
    });
    for (const target of ['internal', 'youtube', 'smarttube', 'tizentube']) {
        await test('recap player target ' + target, async () => {
            reset({ candidates: [candidate(ids.subtitled, 'Primetime Recap Dublado', 450)] });
            const result = await searchGenericRecap('Primetime', 'pt-BR', false, target);
            assert.ok(result);
            if (target === 'internal') assert.strictEqual(result.ytId, ids.subtitled);
            else assert.ok(result.externalUrl.includes(ids.subtitled));
            assert.strictEqual(result.behaviorHints.bingeGroup, 'recap');
        });
    }
    console.log(passed + ' recap regression tests passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
