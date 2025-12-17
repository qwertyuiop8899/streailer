#!/usr/bin/env node

const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const express = require('express');
const path = require('path');
const { getTrailerStreams, isTrailerProviderAvailable } = require('./trailerProvider');

// Supported languages - Tier 1 (Dubbing-centric) + Tier 2 (Strategic Expansion)
const SUPPORTED_LANGUAGES = [
    // Tier 1: Indispensabili (Mercati doppiaggio-centrici)
    { code: 'en-US', name: 'English (US)' },
    { code: 'es-MX', name: 'Español (Latinoamérica)' },
    { code: 'pt-BR', name: 'Português (Brasil)' },
    { code: 'de-DE', name: 'Deutsch' },
    { code: 'fr-FR', name: 'Français' },
    { code: 'es-ES', name: 'Español (España)' },
    { code: 'it-IT', name: 'Italiano' },
    // Tier 2: Espansione Strategica
    { code: 'ru-RU', name: 'Русский' },
    { code: 'ja-JP', name: '日本語' },
    { code: 'hi-IN', name: 'हिन्दी' },
    { code: 'tr-TR', name: 'Türkçe' }
];

// Manifest definition
const manifest = {
    id: 'org.streailer.trailer',
    version: '1.0.0',
    name: 'Streailer - Trailer Provider',
    description: 'Trailer provider with multi-language support. TMDB → YouTube fallback → TMDB en-US',
    logo: 'https://github.com/qwertyuiop8899/streamvix/blob/main/public/icon.png?raw=true',
    background: 'https://i.imgur.com/0bF00cA.png',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'tmdb:'],  // Supports both IMDb (tt...) and TMDB (tmdb:12345)
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
        }
    ]
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

    // Get language from config, default to it-IT
    const language = config?.language || 'it-IT';

    // Parse ID (supports IMDb tt..., TMDB tmdb:12345, or direct TMDB numeric)
    let imdbId = null;
    let tmdbId = null;
    let season = undefined;

    // Detect ID type
    if (id.startsWith('tmdb:')) {
        // TMDB format: tmdb:12345 or tmdb:12345:1:1
        const parts = id.split(':');
        tmdbId = parseInt(parts[1], 10);
        if (parts.length >= 3) {
            season = parseInt(parts[2], 10);
        }
    } else if (id.startsWith('tt')) {
        // IMDb format: tt1234567 or tt1234567:1:1
        const parts = id.split(':');
        imdbId = parts[0];
        if (parts.length >= 2) {
            season = parseInt(parts[1], 10);
        }
    } else if (/^\d+/.test(id)) {
        // Direct TMDB numeric: 12345 or 12345:1:1
        const parts = id.split(':');
        tmdbId = parseInt(parts[0], 10);
        if (parts.length >= 2) {
            season = parseInt(parts[1], 10);
        }
    } else {
        console.log(`[Streailer] Unknown ID format: ${id}`);
        return { streams: [] };
    }

    try {
        const streams = await getTrailerStreams(
            type === 'series' ? 'series' : 'movie',
            imdbId,
            undefined, // contentName - will be fetched from TMDB
            season,
            tmdbId,    // Pass TMDB ID if available
            language
        );

        console.log(`[Streailer] Returning ${streams.length} stream(s)`);
        return { streams };
    } catch (error) {
        console.error('[Streailer] Error fetching trailer:', error);
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

// Manual manifest route to preserve behaviorHints (SDK strips them)
app.get('/:config/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(manifest);
});

// Also handle base manifest
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(manifest);
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
