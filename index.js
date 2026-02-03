#!/usr/bin/env node

require('dotenv').config();

const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const express = require('express');
const path = require('path');
const { getTrailerStreams, isTrailerProviderAvailable, imdbToTmdbWithLanguage } = require('./trailerProvider');
const { getRecapStreams } = require('./recapProvider');
const { kitsuToTmdb } = require('./kitsuProvider');

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
    version: '1.4.0',
    name: 'Streailer - Trailer Provider',
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
            key: 'externalLink',
            type: 'checkbox',
            title: 'External Link',
            default: false
        },
        {
            key: 'showRecap',
            type: 'checkbox',
            title: 'Season Recaps (TV Series)',
            default: false
        },
        {
            key: 'onlyRecaps',
            type: 'checkbox',
            title: 'Only Recaps (No Trailers)',
            default: false
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
    console.log(`[Streailer] Stream request: type=${type}, id=${id}, config=${JSON.stringify(config)}`);

    if (!isTrailerProviderAvailable()) {
        console.warn('[Streailer] TMDB API key not configured');
        return { streams: [] };
    }

    // Get config options
    const language = config?.language || 'it-IT';
    const useExternalLink = config?.externalLink === 'true' || config?.externalLink === true;
    const showRecap = config?.showRecap === 'true' || config?.showRecap === true;
    const onlyRecaps = config?.onlyRecaps === 'true' || config?.onlyRecaps === true;

    // Parse ID (supports IMDb tt..., TMDB tmdb:12345, or direct TMDB numeric)
    let imdbId = null;
    let tmdbId = null;
    let season = undefined;
    let episode = undefined;
    let isKitsu = false;
    let kitsuTitle = ''; // Store Kitsu title for recap search

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
        // Kitsu format: kitsu:ID:episode (each season has its own ID)
        isKitsu = true;
        const parts = id.split(':');
        const kitsuId = parts[1];
        if (parts.length >= 3) {
            episode = parseInt(parts[2], 10); // Kitsu's second param is episode, not season
        }
        // Kitsu doesn't have multi-season structure, so season stays undefined

        console.log(`[Streailer] Converting Kitsu ID: ${kitsuId} (episode: ${episode})`);
        const kitsuResult = await kitsuToTmdb(kitsuId, language);
        if (kitsuResult) {
            tmdbId = kitsuResult.tmdbId;
            kitsuTitle = kitsuResult.title;
            console.log(`[Streailer] Kitsu ${kitsuId} → TMDB ${tmdbId} ("${kitsuTitle}")`);
        } else {
            console.log(`[Streailer] Could not convert Kitsu ID: ${kitsuId}`);
            return { streams: [] };
        }
    } else {
        console.log(`[Streailer] Unknown ID format: ${id}`);
        return { streams: [] };
    }

    // For series: only show streams on episode 1 of each season (but not for Kitsu - each season has own ID)
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
            useExternalLink
        );

        // Get recap streams for TV series if enabled
        let recapStreams = [];

        if (showRecap && type === 'series') {
            if (isKitsu && kitsuTitle) {
                // Kitsu: search generic recap (each season has own ID, no multi-season structure)
                console.log(`[Streailer] Kitsu recap search for "${kitsuTitle}"`);
                const { searchGenericRecap } = require('./recapProvider');
                const genericRecap = await searchGenericRecap(kitsuTitle, language, useExternalLink);
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
                    recapStreams = await getRecapStreams(recapTmdbId, seriesName, season, language, useExternalLink);
                }
            }
        }

        // Combine streams based on config
        let streams;
        if (onlyRecaps) {
            // Only recaps mode: no trailers, even if no recaps are found
            streams = recapStreams;
            console.log(`[Streailer] Returning ${streams.length} stream(s) (recaps only)`);
        } else {
            // Normal mode: trailer first, then recaps
            streams = [...trailerStreams, ...recapStreams];
            console.log(`[Streailer] Returning ${streams.length} stream(s) (${trailerStreams.length} trailer + ${recapStreams.length} recaps)`);
        }

        return { streams };
    } catch (error) {
        console.error('[Streailer] Error fetching streams:', error);
        return { streams: [] };
    }
});

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

// Get the addon router
const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);

// IMPORTANT: Middleware to intercept ALL manifest.json requests BEFORE SDK router
// This ensures we always return OUR manifest, not the SDK's cached copy
app.use((req, res, next) => {
    if (req.path.endsWith('/manifest.json')) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        // Ensure we send a clean copy of the manifest with the config
        const manifestToSend = { ...manifest };
        // Explicitly ensure stremioAddonsConfig is present if defined
        if (manifest.stremioAddonsConfig) {
            manifestToSend.stremioAddonsConfig = manifest.stremioAddonsConfig;
        }
        return res.json(manifestToSend);
    }
    next();
});

// Use the addon router for other routes (streams, etc.)
app.use('/', addonRouter);

// Start server
const port = process.env.PORT || 7020;
const host = '0.0.0.0';
app.listen(port, host, () => {
    console.log(`[Streailer] Addon running at http://${host}:${port}`);
    console.log(`[Streailer] Configure: http://${host}:${port}/configure`);
    console.log(`[Streailer] Manifest: http://${host}:${port}/manifest.json`);
});
