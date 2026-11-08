#!/usr/bin/env node

require('dotenv').config();

const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const express = require('express');
const path = require('path');
const { getTrailerStreams, isTrailerProviderAvailable, imdbToTmdbWithLanguage } = require('./trailerProvider');
const { getRecapStreams } = require('./recapProvider');
const { kitsuToTmdb } = require('./kitsuProvider');

const MAX_SEASON = 50;
const MAX_CONCURRENT_STREAMS = Number(process.env.MAX_CONCURRENT_STREAMS) || 20;

let activeStreamRequests = 0;

// Supported languages - Tier 1 (Dubbing-centric) + Tier 2 (Strategic Expansion)
const SUPPORTED_LANGUAGES = [
    // Tier 1: Indispensabili (Mercati doppiaggio-centrici)
    { code: 'en-US', name: 'English (US)' },
    { code: 'es-MX', name: 'Español (Latinoamérica)' },
    { code: 'pt-BR', name: 'Português (Brasil)' },
    { code: 'pt-PT', name: 'Português (Portugal)' },
    { code: 'de-DE', name: 'Deutsch' },
    { code: 'fr-FR', name: 'Français' },
    { code: 'es-ES', name: 'Español (España)' },
    { code: 'it-IT', name: 'Italiano' },
    // Tier 2: Espansione Strategica
    { code: 'ru-RU', name: 'Русский' },
    { code: 'ja-JP', name: '日本語' },
    { code: 'hi-IN', name: 'हिन्दी' },
    { code: 'ta-IN', name: 'தமிழ்' },
    { code: 'tr-TR', name: 'Türkçe' },
    { code: 'pl-PL', name: 'Polski' },
    { code: 'nl-NL', name: 'Nederlands' },
    { code: 'hu-HU', name: 'Magyar' }
];

// Manifest definition
const manifest = {
    id: 'org.streailer.trailer',
    version: '1.5.0',
    name: 'Streailer | ElfHosted',
    description: 'Trailer provider with multi-language support. TMDB → YouTube fallback → TMDB en-US. Season recaps for TV series.',
    logo: 'https://i.imgur.com/F7dxBVt.png',
    background: 'https://i.imgur.com/rEN6X72.jpeg',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'tmdb:', 'kitsu:'],  // Supports IMDb (tt...), TMDB (tmdb:), and Kitsu (kitsu:)
    catalogs: [],
    behaviorHints: {
        configurable: true
    },
    config: [
        {
            key: 'language',
            type: 'select',
            title: 'Lingua Trailer / Trailer Language',
            options: SUPPORTED_LANGUAGES.map(l => l.code),
            default: 'it-IT',
            required: true
        },
        {
            key: 'youtubeApiKey',
            type: 'text',
            title: 'YouTube Data API Key (optional; visible in addon install URL)'
        },
        {
            key: 'strictLanguage',
            type: 'checkbox',
            title: 'Strict Trailer Language (Disable English Fallback)'
        },
        {
            key: 'playerTarget',
            type: 'select',
            title: 'Player Target / Modalità Riproduzione',
            options: ['internal', 'youtube', 'smarttube', 'tizentube'],
            default: 'internal'
        },
        {
            key: 'externalLink',
            type: 'checkbox',
            title: 'External Link'
        },
        {
            key: 'showRecap',
            type: 'checkbox',
            title: 'Season Recaps (TV Series)'
        },
        {
            key: 'onlyRecaps',
            type: 'checkbox',
            title: 'Only Recaps (No Trailers)'
        }
    ],
    stremioAddonsConfig: {
        "issuer": "https://stremio-addons.net",
        "signature": "eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..MOCSVn-poAicpFB3yI8QcQ.aEx1Ql37vvzQQHVyihr5z6_LJYCWZYzfFTDStX-icgNnh6YT85Qoy9YqfMyoDSc4-tUxCtKuZ_yEzzr0nXxW4t5TEAM1wMBbbqqE_L22-iV8ErpMNmsDZWESVt6rqlJD._aRFyhZLN7gQAVhy9dKadA"
    }
};

// Create addon builder
const builder = new addonBuilder(manifest);

// Stream handler
builder.defineStreamHandler(async ({ type, id, config }) => {
    if (activeStreamRequests >= MAX_CONCURRENT_STREAMS) {
        console.warn('[Streailer] Too many concurrent requests, rejecting');
        return { streams: [] };
    }

    activeStreamRequests += 1;

    try {
        // Log only an explicit allowlist: never print credential contents or
        // unexpected configuration fields supplied by clients.
        const safeConfig = {
            language: config?.language,
            strictLanguage: config?.strictLanguage,
            playerTarget: config?.playerTarget,
            showRecap: config?.showRecap,
            onlyRecaps: config?.onlyRecaps,
            hasYoutubeApiKey: Boolean(config?.youtubeApiKey)
        };
        console.log(`[Streailer] Stream request: type=${type}, id=${id}, config=${JSON.stringify(safeConfig)}`);

        if (!isTrailerProviderAvailable()) {
            console.warn('[Streailer] TMDB API key not configured');
            return { streams: [] };
        }

        // Get config options
        const language = config?.language || 'it-IT';
        const playerTarget = config?.playerTarget || (config?.externalLink ? 'youtube' : 'internal');
        const useExternalLink = playerTarget !== 'internal' || config?.externalLink === 'true' || config?.externalLink === true;
        const showRecap = config?.showRecap === 'true' || config?.showRecap === true;
        const onlyRecaps = config?.onlyRecaps === 'true' || config?.onlyRecaps === true;
        const strictLanguage = config?.strictLanguage === 'true' || config?.strictLanguage === true;

        // Parse ID (supports IMDb tt..., TMDB tmdb:12345, or direct TMDB numeric)
        let imdbId = null;
        let tmdbId = null;
        let season = undefined;
        let episode = undefined;
        let isKitsu = false;
        let kitsuTitle = '';

        // Detect ID type
        if (id.startsWith('tmdb:')) {
            const parts = id.split(':');
            tmdbId = parseInt(parts[1], 10);
            if (parts.length >= 3) {
                season = parseInt(parts[2], 10);
            }
            if (parts.length >= 4) {
                episode = parseInt(parts[3], 10);
            }
        } else if (id.startsWith('tt')) {
            const parts = id.split(':');
            imdbId = parts[0];
            if (parts.length >= 2) {
                season = parseInt(parts[1], 10);
            }
            if (parts.length >= 3) {
                episode = parseInt(parts[2], 10);
            }
        } else if (/^\d+/.test(id)) {
            const parts = id.split(':');
            tmdbId = parseInt(parts[0], 10);
            if (parts.length >= 2) {
                season = parseInt(parts[1], 10);
            }
            if (parts.length >= 3) {
                episode = parseInt(parts[2], 10);
            }
        } else if (id.startsWith('kitsu:')) {
            // Kitsu anime ID - convert to TMDB
            // Kitsu format: kitsu:ID:episode
            isKitsu = true;
            const parts = id.split(':');
            const kitsuId = parts[1];
            if (parts.length >= 3) {
                episode = parseInt(parts[2], 10);
            }

            console.log(`[Streailer] Converting Kitsu ID: ${kitsuId} (episode: ${episode})`);
            const kitsuResult = await kitsuToTmdb(kitsuId, language);
            if (kitsuResult && kitsuResult.tmdbId) {
                tmdbId = kitsuResult.tmdbId;
                kitsuTitle = kitsuResult.title || '';
                if (kitsuResult.season !== undefined) {
                    season = kitsuResult.season;
                }
                console.log(`[Streailer] Kitsu ${kitsuId} → TMDB ${tmdbId} ("${kitsuTitle}", Season: ${season || 'N/A'})`);
            } else {
                console.log(`[Streailer] Could not convert Kitsu ID: ${kitsuId}`);
                return { streams: [] };
            }
        } else {
            console.log(`[Streailer] Unknown ID format: ${id}`);
            return { streams: [] };
        }

        if (season !== undefined) {
            if (!Number.isFinite(season) || season < 1) {
                season = undefined;
            } else if (season > MAX_SEASON) {
                console.log(`[Streailer] Season ${season} exceeds max ${MAX_SEASON}, skipping`);
                return { streams: [] };
            }
        }

        // For series: only show streams on episode 1 of each season (exempt Kitsu so anime episodes show trailers)
        if (type === 'series' && !isKitsu && episode !== undefined && episode !== 1) {
            console.log(`[Streailer] Episode ${episode} - skipping (only episode 1 shows trailer/recap)`);
            return { streams: [] };
        }

        try {
            // Get trailer streams
            const trailerStreams = await getTrailerStreams(
                type === 'series' ? 'series' : 'movie',
                imdbId,
                undefined,
                season,
                tmdbId,
                language,
                useExternalLink,
                playerTarget,
                strictLanguage,
                config?.youtubeApiKey || ''
            );

            // Get recap streams for TV series if enabled
            let recapStreams = [];

            if (showRecap && type === 'series') {
                if (isKitsu && season !== undefined && season >= 2) {
                    // Kitsu with season >= 2: search season-specific recaps
                    console.log(`[Streailer] Kitsu season ${season} recap search for "${kitsuTitle}"`);
                    recapStreams = await getRecapStreams(tmdbId, kitsuTitle, season, language, useExternalLink, imdbId, playerTarget);
                } else if (isKitsu && kitsuTitle) {
                    // Kitsu: fallback search generic recap
                    console.log(`[Streailer] Kitsu generic recap search for "${kitsuTitle}"`);
                    const { searchGenericRecap } = require('./recapProvider');
                    const genericRecap = await searchGenericRecap(kitsuTitle, language, useExternalLink, playerTarget);
                    if (genericRecap) {
                        recapStreams = [genericRecap];
                    }
                } else if (season !== undefined && season >= 2 && (tmdbId || imdbId)) {
                    // Normal: search season-specific recaps
                    let recapTmdbId = tmdbId;
                    let seriesName = '';

                    if (imdbId) {
                        const converted = await imdbToTmdbWithLanguage(imdbId, 'series', language);
                        if (converted) {
                            recapTmdbId = recapTmdbId || converted.id;
                            seriesName = converted.title;
                            console.log(`[Streailer] TMDB info: ID=${recapTmdbId}, Title="${seriesName}"`);
                        }
                    }

                    // Fallback: try to extract from trailer title if TMDB failed
                    if (!seriesName && trailerStreams.length > 0 && trailerStreams[0].title) {
                        seriesName = trailerStreams[0].title.split(/\s+(Season|Stagione|Temporada|Staffel|Saison|Сезон|シーズン|सीज़न|சீசன்|Sezon|S\.\d|S\d)/i)[0].trim();
                        console.log(`[Streailer] Fallback series name from trailer: "${seriesName}"`);
                    }

                    if (seriesName && recapTmdbId) {
                        recapStreams = await getRecapStreams(recapTmdbId, seriesName, season, language, useExternalLink, imdbId, playerTarget);
                    }
                }
            }

            // Combine streams based on config
            let streams;
            if (onlyRecaps) {
                streams = recapStreams;
                console.log(`[Streailer] Returning ${streams.length} stream(s) (recaps only)`);
            } else {
                streams = [...trailerStreams, ...recapStreams];
                console.log(`[Streailer] Returning ${streams.length} stream(s) (${trailerStreams.length} trailer + ${recapStreams.length} recaps)`);
            }

            return { streams };
        } catch (error) {
            console.error('[Streailer] Error fetching streams:', error);
            return { streams: [] };
        }
    } finally {
        activeStreamRequests = Math.max(0, activeStreamRequests - 1);
    }
});

// Helper function to normalize various config formats (query string, JSON, Base64)
function normalizeConfigString(rawConfig) {
    if (!rawConfig) return null;
    let decoded = rawConfig;
    try {
        decoded = decodeURIComponent(rawConfig);
    } catch (e) { }

    // Direct JSON
    try {
        const obj = JSON.parse(decoded);
        if (obj && typeof obj === 'object') return obj;
    } catch (e) { }

    // Base64 JSON
    try {
        const fromB64 = Buffer.from(decoded, 'base64').toString('utf-8');
        const obj = JSON.parse(fromB64);
        if (obj && typeof obj === 'object') return obj;
    } catch (e) { }

    // Query string format (e.g. lang=es-MX&external=true&player=smarttube)
    if (decoded.includes('=') || decoded.includes('&')) {
        const obj = {};
        const pairs = decoded.split('&');
        for (const pair of pairs) {
            const [k, v] = pair.split('=');
            if (!k) continue;
            const key = decodeURIComponent(k).trim();
            const val = v !== undefined ? decodeURIComponent(v).trim() : 'true';

            if (key === 'lang' || key === 'language') obj.language = val;
            else if (key === 'youtubeApiKey') obj.youtubeApiKey = val;
            else if (key === 'external' || key === 'externalLink') obj.externalLink = (val === 'true');
            else if (key === 'recap' || key === 'showRecap') obj.showRecap = (val === 'true');
            else if (key === 'onlyRecaps') obj.onlyRecaps = (val === 'true');
            else if (key === 'player' || key === 'playerTarget') obj.playerTarget = val;
            else obj[key] = val;
        }
        return obj;
    }

    return null;
}

// Create Express app
const app = express();

// Redirect root to configure
app.get('/', (req, res) => {
    res.redirect('/configure');
});

// Serve custom configuration page
app.get('/configure', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'configure.html'));
});

// Also serve configure at /:config/configure for Stremio compatibility
app.get('/:config/configure', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'configure.html'));
});

// Serve static files
app.use('/static', express.static(path.join(__dirname, 'public')));

// Middleware to normalize query-string style configs into valid JSON URLs before the SDK router
app.use((req, res, next) => {
    const parts = req.url.split('/').filter(Boolean);
    if (parts.length > 0) {
        const firstSegment = parts[0];
        // Skip well-known non-config paths
        if (firstSegment !== 'configure' && firstSegment !== 'static' && firstSegment !== 'manifest.json' && firstSegment !== 'favicon.ico') {
            const normalized = normalizeConfigString(firstSegment);
            if (normalized) {
                const jsonEncoded = encodeURIComponent(JSON.stringify(normalized));
                if (firstSegment !== jsonEncoded) {
                    parts[0] = jsonEncoded;
                    req.url = '/' + parts.join('/');
                }
            }
        }
    }
    next();
});

// Intercept manifest requests to always serve our manifest
app.use((req, res, next) => {
    if (req.path.endsWith('/manifest.json')) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        const manifestToSend = { ...manifest };
        if (manifest.stremioAddonsConfig) {
            manifestToSend.stremioAddonsConfig = manifest.stremioAddonsConfig;
        }
        return res.json(manifestToSend);
    }
    next();
});

// Get the addon router and attach to Express
const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);
app.use('/', addonRouter);

// Start server
const port = process.env.PORT || 7020;
const host = '0.0.0.0';
const server = app.listen(port, host, () => {
    console.log(`[Streailer] Addon running at http://${host}:${server.address().port}`);
    console.log(`[Streailer] Configure: http://${host}:${port}/configure`);
    console.log(`[Streailer] Manifest: http://${host}:${port}/manifest.json`);
});
