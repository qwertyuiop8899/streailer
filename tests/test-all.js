require('dotenv').config();
const assert = require('assert');
const fetch = require('node-fetch');
const http = require('http');
const { kitsuToTmdb } = require('../kitsuProvider');
const { getTrailerStreams, isTrailerProviderAvailable } = require('../trailerProvider');
const { getRecapStreams } = require('../recapProvider');

let totalTests = 0;
let passedTests = 0;

function it(name, fn) {
    totalTests++;
    return fn()
        .then(() => {
            passedTests++;
            console.log(`  ✅ PASS: ${name}`);
        })
        .catch((err) => {
            console.error(`  ❌ FAIL: ${name}`);
            console.error(`     Error: ${err.message}`);
            throw err;
        });
}

async function runAllTests() {
    console.log('====================================================');
    console.log('       STREAILER COMPREHENSIVE TEST SUITE           ');
    console.log('====================================================\n');

    console.log('👉 SUITE 1: TMDB & Kitsu Anime Resolution');

    await it('TMDB Provider is available with configured key', async () => {
        assert.strictEqual(isTrailerProviderAvailable(), true);
    });

    await it('Kitsu AoT Season 1 resolves via anime.stremio-italia.eu', async () => {
        const res = await kitsuToTmdb('7442', 'it-IT');
        assert.ok(res, 'Result should exist');
        assert.strictEqual(res.tmdbId, 1429);
        assert.strictEqual(res.season, 1);
        assert.strictEqual(res.type, 'series');
    });

    await it('Kitsu AoT Season 2 resolves and identifies Season 2 (Issue #2)', async () => {
        const res = await kitsuToTmdb('8671', 'it-IT');
        assert.ok(res, 'Result should exist');
        assert.strictEqual(res.tmdbId, 1429);
        assert.strictEqual(res.season, 2);
        assert.strictEqual(res.type, 'series');
    });

    console.log('\n👉 SUITE 2: Multi-Language & Player Intent Target Formats');

    await it('Generates standard In-App ytId for internal player', async () => {
        const streams = await getTrailerStreams('movie', 'tt1375666', 'Inception', undefined, 27205, 'it-IT', false, 'internal');
        assert.ok(streams.length > 0, 'Should return at least 1 stream');
        assert.ok(streams[0].ytId, 'Should have ytId');
        assert.strictEqual(streams[0].externalUrl, undefined, 'Should not have externalUrl');
    });

    await it('Generates YouTube external link when playerTarget is youtube', async () => {
        const streams = await getTrailerStreams('movie', 'tt1375666', 'Inception', undefined, 27205, 'it-IT', false, 'youtube');
        assert.ok(streams.length > 0, 'Should return at least 1 stream');
        assert.ok(streams[0].externalUrl.startsWith('https://www.youtube.com/watch?v='), 'Should have YouTube URL');
    });

    await it('Generates SmartTube intent URL for Android TV (Issue #14 & #20)', async () => {
        const streams = await getTrailerStreams('movie', 'tt1375666', 'Inception', undefined, 27205, 'it-IT', false, 'smarttube');
        assert.ok(streams.length > 0, 'Should return at least 1 stream');
        assert.ok(streams[0].externalUrl.includes('package=com.teamsmart.videomanager.tv'), 'Should target SmartTube package');
        assert.ok(streams[0].name.includes('📺'), 'Should have TV icon');
    });

    await it('Generates TizenTube Cobalt intent URL for Samsung TV', async () => {
        const streams = await getTrailerStreams('movie', 'tt1375666', 'Inception', undefined, 27205, 'it-IT', false, 'tizentube');
        assert.ok(streams.length > 0, 'Should return at least 1 stream');
        assert.ok(streams[0].externalUrl.includes('package=io.gh.reisxd.tizentube.cobalt'), 'Should target TizenTube package');
    });

    await it('Fetches localized Spanish (es-MX) trailer when requested', async () => {
        const streams = await getTrailerStreams('movie', 'tt1375666', 'Inception', undefined, 27205, 'es-MX', false, 'internal');
        assert.ok(streams.length > 0, 'Should return stream in Spanish');
        assert.ok(streams[0].ytId, 'Should have trailer ytId');
    });

    console.log('\n👉 SUITE 3: Full HTTP Addon & Configuration Normalization');

    await it('Live HTTP server parses query-string config into proper language and SmartTube intent', async () => {
        // Start index server on test port 7099
        process.env.PORT = '7099';
        // Spawn server in child process or require index.js
        const { spawn } = require('child_process');
        const srv = spawn('node', ['index.js'], { cwd: process.cwd(), env: process.env });

        // Wait 1.5s for server startup
        await new Promise(r => setTimeout(r, 1500));

        try {
            // Test manifest
            const mRes = await fetch('http://localhost:7099/manifest.json');
            assert.strictEqual(mRes.status, 200);
            const mJson = await mRes.json();
            assert.strictEqual(mJson.id, 'org.streailer.trailer');

            // Test query-string config parsing via stream route
            // Request with lang=es-MX and playerTarget=smarttube
            const sRes = await fetch('http://localhost:7099/lang=es-MX&player=smarttube/stream/movie/tt1375666.json');
            assert.strictEqual(sRes.status, 200);
            const sJson = await sRes.json();
            assert.ok(sJson.streams && sJson.streams.length > 0, 'Should return streams');
            const stream = sJson.streams[0];
            assert.ok(stream.externalUrl.includes('package=com.teamsmart.videomanager.tv'), 'Stream should use SmartTube intent from query string');

            // Test Kitsu AoT S2 stream route
            const kRes = await fetch('http://localhost:7099/kitsu:8671/stream/series/kitsu:8671:1.json');
            assert.strictEqual(kRes.status, 200);
            const kJson = await kRes.json();
            assert.ok(kJson.streams && kJson.streams.length > 0, 'Should return streams for Kitsu AoT S2');
        } finally {
            srv.kill();
        }
    });

    console.log(`\n====================================================`);
    console.log(`RESULT: ${passedTests}/${totalTests} tests passed successfully! 🚀`);
    console.log(`====================================================\n`);
}

runAllTests().catch((err) => {
    console.error('\nTest suite failed:', err);
    process.exit(1);
});
