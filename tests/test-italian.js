require('dotenv').config();
const assert = require('assert');
const fetch = require('node-fetch');
const { kitsuToTmdb } = require('../kitsuProvider');
const { getTrailerStreams } = require('../trailerProvider');
const { getRecapStreams } = require('../recapProvider');

async function testItalian() {
    console.log('=== VERIFICA COMPLETA FUNZIONAMENTO ITALIANO ===\n');

    // 1. Film in italiano (Inception)
    console.log('1. Test Film Italiano (Inception - tt1375666)...');
    const movieTrailers = await getTrailerStreams('movie', 'tt1375666', 'Inception', undefined, 27205, 'it-IT', false, 'internal');
    console.log('   Risultato:', movieTrailers[0]?.name, '|', movieTrailers[0]?.title);
    assert.ok(movieTrailers.length > 0);
    assert.strictEqual(movieTrailers[0].ytId, 'BV7z0I90MJk');
    assert.strictEqual(movieTrailers[0].name, '🎬 Trailer');

    // 2. Serie TV in italiano (Breaking Bad S1)
    console.log('\n2. Test Serie TV Italiano (Breaking Bad S1 - tt0903747)...');
    const seriesTrailers = await getTrailerStreams('series', 'tt0903747', 'Breaking Bad', 1, 1396, 'it-IT', false, 'internal');
    console.log('   Risultato:', seriesTrailers[0]?.name, '|', seriesTrailers[0]?.title);
    assert.ok(seriesTrailers.length > 0);
    assert.ok(seriesTrailers[0].title.toLowerCase().includes('breaking bad'));

    // 3. Recap Serie TV in italiano (Breaking Bad S2)
    console.log('\n3. Test Recap Stagione 2 Italiano (Breaking Bad)...');
    const recaps = await getRecapStreams(1396, 'Breaking Bad', 2, 'it-IT', false, 'tt0903747', 'internal');
    console.log('   Recap trovati:', recaps.length);
    if (recaps.length > 0) {
        console.log('   Primo recap:', recaps[0].name, '|', recaps[0].title);
        assert.ok(recaps[0].ytId);
    }

    // 4. Anime Kitsu S1 (Attack on Titan S1: kitsu:7442)
    console.log('\n4. Test Anime Kitsu S1 (L\'attacco dei giganti S1: kitsu:7442)...');
    const kitsuS1 = await kitsuToTmdb('7442', 'it-IT');
    console.log('   Kitsu S1:', kitsuS1.title, '| TMDB:', kitsuS1.tmdbId, '| Stagione:', kitsuS1.season);
    assert.strictEqual(kitsuS1.tmdbId, 1429);
    assert.strictEqual(kitsuS1.season, 1);
    const animeTrailersS1 = await getTrailerStreams('series', kitsuS1.imdbId, kitsuS1.title, kitsuS1.season, kitsuS1.tmdbId, 'it-IT', false, 'internal');
    console.log('   Trailer S1:', animeTrailersS1[0]?.name, '|', animeTrailersS1[0]?.title, '| ytId:', animeTrailersS1[0]?.ytId);
    assert.ok(animeTrailersS1.length > 0);

    // 5. Anime Kitsu S2 (Attack on Titan S2: kitsu:8671)
    console.log('\n5. Test Anime Kitsu S2 (L\'attacco dei giganti S2: kitsu:8671)...');
    const kitsuS2 = await kitsuToTmdb('8671', 'it-IT');
    console.log('   Kitsu S2:', kitsuS2.title, '| TMDB:', kitsuS2.tmdbId, '| Stagione:', kitsuS2.season);
    assert.strictEqual(kitsuS2.tmdbId, 1429);
    assert.strictEqual(kitsuS2.season, 2);
    const animeTrailersS2 = await getTrailerStreams('series', kitsuS2.imdbId, kitsuS2.title, kitsuS2.season, kitsuS2.tmdbId, 'it-IT', false, 'internal');
    console.log('   Trailer S2:', animeTrailersS2[0]?.name, '|', animeTrailersS2[0]?.title, '| ytId:', animeTrailersS2[0]?.ytId);
    assert.ok(animeTrailersS2.length > 0);

    // 6. Test Endpoint HTTP di default (senza parametri config, default Italiano)
    console.log('\n6. Test HTTP server default (nessun config, fallback it-IT)...');
    process.env.PORT = '7098';
    const { spawn } = require('child_process');
    const srv = spawn('node', ['index.js'], { cwd: process.cwd(), env: process.env });
    await new Promise(r => setTimeout(r, 1500));

    try {
        const res = await fetch('http://localhost:7098/stream/movie/tt1375666.json');
        const json = await res.json();
        console.log('   Stream HTTP default:', JSON.stringify(json.streams[0]));
        assert.ok(json.streams.length > 0);
        assert.strictEqual(json.streams[0].ytId, 'BV7z0I90MJk');
        assert.strictEqual(json.streams[0].name, '🎬 Trailer');
        assert.strictEqual(json.streams[0].title, 'Inception');
    } finally {
        srv.kill();
    }

    console.log('\n TUTTI I TEST PER L\'ITALIANO SONO STATI SUPERATI AL 100%! ');
}

testItalian().catch(err => {
    console.error('Test fallito:', err);
    process.exit(1);
});
