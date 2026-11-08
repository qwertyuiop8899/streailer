// Language hints are evidence from titles, not audio-language detection.
const LANGUAGE_HINTS = {
    en: /\b(english|ingles)\b/u,
    pt: /\b(portugues|portuguese|dublado|legendado|pt br|pt pt)\b/u,
    de: /\b(german|deutsch|alemao)\b/u,
    fr: /\b(french|francais|frances|vf|vostfr)\b/u,
    es: /\b(spanish|espanol|castellano|latino)\b/u,
    it: /\b(italian|italiano|ita)\b/u,
    ru: /\b(russian|russo)\b|русск/u,
    ja: /\b(japanese|japones)\b|日本語/u,
    hi: /\b(hindi)\b|हिन्दी|हिंदी/u,
    ta: /\b(tamil)\b|தமிழ்/u,
    tr: /\b(turkish|turkce)\b/u,
    pl: /\b(polish|polski)\b/u,
    nl: /\b(dutch|nederlands)\b/u,
    hu: /\b(hungarian|magyar)\b/u
};

function normalizeTitle(value) {
    return (typeof value === 'string' ? value : '').toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
}

function identityTitles(titles) {
    return [...new Set(titles.map(normalizeTitle).filter(Boolean))].sort((a, b) => b.length - a.length);
}

function withoutTitles(title, titles) {
    let remaining = ' ' + normalizeTitle(title) + ' ';
    for (const alias of identityTitles(titles)) {
        remaining = remaining.replace(' ' + alias + ' ', ' ');
    }
    return remaining;
}

// The search result title alone is insufficient: the same movie name/year is
// commonly used for complete films, reviews and full episodes.
const TRAILER_CUE = /\b(?:trailer|teaser|preview|promo|promotional|previa|chamada|avance|adelanto|bande annonce|vorschau|anteprima|fragman|zwiastun|voorproefje|elozetes|anons)\b|予告|ティーザー|ट्रेलर|टीजर|प्रोमो|டிரெய்லர்|டீசர்|трейлер|тизер|промо/u;
const NON_TRAILER_CUE = [
    /\b(?:(?:full|complete|entire|whole)\s+(?:movie|film|episode|series|season)|(?:movie|film|episode|series|season|filme|episodio|pelicula|serie|temporada)\s+(?:full|complete|completo|completa|inteiro|inteira|entero|entera|integral))\b(?!\s+(?:(?:official|oficial|final|new)\s+)?(?:trailer|teaser|preview|previa|chamada)\b)/u,
    /\b(?:review|revisao|resenha|analise|analysis|explained|explicado|recap|resumo|resumen|reaction|reacao|react|gameplay|walkthrough|breakdown|entrevista|interview|making of|behind the scenes|documentary|documentario|critica|spoilers?|ending explained|final explicado|commentary|commentario|recensione|reseña|reaccion|zusammenfassung|reaktion|отзыв|обзор)\b/u,
    /映画全編|全話|全編|本編|完全版|全エピソード|реакция|объяснение|फुल मूवी|पूरी फिल्म|முழு படம்/u
];

// Remove the known media titles before interpreting keywords. For instance,
// a movie called "The Review" must not be mistaken for an actual review.
function isNonTrailerContent(title, knownTitles = []) {
    const remainder = withoutTitles(title, knownTitles);
    return NON_TRAILER_CUE.some(pattern => pattern.test(remainder));
}

function isTrailerLikeTitle(title, knownTitles = []) {
    const remainder = withoutTitles(title, knownTitles);
    return TRAILER_CUE.test(remainder) && !isNonTrailerContent(title, knownTitles);
}

function parseDurationSeconds(value) {
    if (typeof value !== 'string') return null;
    const parts = value.trim().split(':');
    if (parts.length < 2 || parts.length > 3 || !parts.every(p => /^\d{1,3}$/.test(p))) return null;
    if (parts.slice(1).some(p => Number(p) >= 60)) return null;
    const seconds = parts.reduce((total, part) => total * 60 + Number(part), 0);
    return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

function playerVideoInfo(html) {
    const player = extractYouTubeData(html, 'ytInitialPlayerResponse');
    const rawDuration = player?.videoDetails?.lengthSeconds ?? player?.microformat?.playerMicroformatRenderer?.lengthSeconds;
    const seconds = typeof rawDuration === 'string' && /^\d+$/.test(rawDuration) ? Number(rawDuration) : null;
    return {
        durationSeconds: Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null,
        live: player?.videoDetails?.isLiveContent === true || player?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.isLiveNow === true
    };
}

// Search ranking is not a reliable media identifier. Require a canonical title
// and a corroborating release year for movies; TMDB-linked videos bypass this
// search-only check because they are already associated with the requested ID.
function matchesSearchIdentity(title, identity, type) {
    const normalized = ' ' + normalizeTitle(title) + ' ';
    const titles = identityTitles(identity.titles || []);
    const matched = titles.find(alias => normalized.includes(' ' + alias + ' '));
    if (!matched) return false;
    if (type !== 'movie') return true;
    const suffix = normalized.slice(normalized.indexOf(' ' + matched + ' ') + matched.length + 2);
    // A base title must not match a numbered sequel. Numbers after "Trailer"
    // are trailer editions, and a four-digit release year is not a sequel.
    if (/^(?:(?:part|chapter|parte|capitulo)\s+(?:\d+|[ivx]+|one|two|three|four|um|dois|tres|quatro)\b|(?:\d{1,3}|[ivx]+)\b)/u.test(suffix)) return false;
    if (!identity.year) return false;
    // Remove the title span that established the match, not unused numeric
    // aliases that may actually be the release year ("Nineteen Eighty-Four, 1984").
    const years = normalized.replace(' ' + matched + ' ', ' ').match(/\b(?:18|19|20|21)\d{2}\b/g) || [];
    return years.length > 0 && years.every(year => Number(year) === identity.year);
}

// -1 rejects a known mismatch, 0 is unknown, and higher scores prefer
// localized trailers. TMDB language metadata can verify otherwise neutral titles.
function languageScore(title, contentName, language, metadata = {}) {
    const hints = withoutTitles(title, Array.isArray(contentName) ? contentName : [contentName]);
    const [requested, region] = language.split('-');
    const matches = Object.entries(LANGUAGE_HINTS)
        .filter(([, pattern]) => pattern.test(hints)).map(([code]) => code);
    const subtitles = /\b(legendado|vostfr)\b/u.test(hints) ||
        /\b(subtitles?|subs?|subtitulado|untertitel)\s+(in\s+)?(brazilian\s+)?(portuguese|portugues|pt br)\b/u.test(hints);
    const portugueseRegion = /\b(pt pt|portugal|portugues europeu)\b/u.test(hints) ? 'PT' :
        /\b(pt br|brasil|brazil|brazilian|brasileiro|dublado|legendado)\b/u.test(hints) ? 'BR' : null;
    if (requested === 'pt' && portugueseRegion && portugueseRegion !== region) return -1;
    // Explicit localized subtitles can accompany original-language audio.
    if (matches.includes(requested) && subtitles && (requested === 'pt' || requested === 'fr')) return 2;
    if (matches.some(code => code !== requested)) return -1;
    if (metadata.iso_639_1 && metadata.iso_639_1 !== requested) return -1;
    if (requested === 'pt' && metadata.iso_3166_1 && metadata.iso_3166_1 !== region) return -1;
    if (matches.includes(requested)) {
        return requested === 'pt' && /\bdublado\b/u.test(hints) ? 4 : 3;
    }
    return metadata.iso_639_1 === requested ? 3 : 0;
}

// Parse only the JSON assigned to YouTube's data variable. Braces inside
// escaped titles must not terminate the object, and page JavaScript is never run.
function extractYouTubeData(html, variable) {
    const marker = new RegExp(`(?:var\\s+${variable}|window\\["${variable}"\\]|${variable})\\s*=\\s*`);
    const match = marker.exec(html);
    if (!match) return null;
    const start = match.index + match[0].length;
    if (html[start] !== '{') return null;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let i = start; i < html.length; i++) {
        const char = html[i];
        if (quoted) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === '{') depth++;
        else if (char === '}' && --depth === 0) {
            try { return JSON.parse(html.slice(start, i + 1)); }
            catch (_) { return null; }
        }
    }
    return null;
}

function parseSearchCandidates(html) {
    const data = extractYouTubeData(html, 'ytInitialData');
    const candidates = [];
    const seen = new Set();
    // Limit traversal to search results so sidebar recommendations and ads
    // cannot supply an unrelated ID or title.
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents;
    function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (node.videoRenderer) {
            const video = node.videoRenderer;
            const title = video.title?.simpleText || video.title?.runs?.map(run => run.text || '').join('');
            if (/^[\w-]{11}$/.test(video.videoId) && title && !seen.has(video.videoId)) {
                seen.add(video.videoId);
                const length = video.lengthText?.simpleText || video.lengthText?.runs?.map(run => run.text || '').join('');
                const durationSeconds = parseDurationSeconds(length);
                const overlay = video.thumbnailOverlays || [];
                const live = video.isLive === true || overlay.some(item => {
                    const style = item?.thumbnailOverlayTimeStatusRenderer?.style;
                    return style === 'LIVE' || style === 'UPCOMING';
                });
                const candidate = { ytId: video.videoId, title };
                if (durationSeconds !== null) candidate.durationSeconds = durationSeconds;
                if (live) candidate.live = true;
                candidates.push(candidate);
            }
            return;
        }
        for (const [key, value] of Object.entries(node)) {
            if (!/adSlot|promoted|secondary/i.test(key)) visit(value);
        }
    }
    visit(contents);
    // Keep enough candidates to survive unrelated top results; only the best
    // ten eligible videos are probed by selectAvailableTrailer.
    return candidates.slice(0, 30);
}

function isAvailableInRegion(html, region) {
    const player = extractYouTubeData(html, 'ytInitialPlayerResponse');
    const countries = player?.microformat?.playerMicroformatRenderer?.availableCountries;
    if (region && Array.isArray(countries) && !countries.includes(region)) return false;
    // A server-side playability failure alone may reflect the server's country
    // or bot challenge. Only definitive removal/private failures are portable.
    const status = player?.playabilityStatus;
    const reason = [status?.reason, ...(status?.messages || [])].join(' ');
    if (/video (is )?(unavailable|removed|private)|has been removed|private video|account.*terminated/i.test(reason)) return false;
    return true;
}

module.exports = { normalizeTitle, withoutTitles, languageScore, matchesSearchIdentity, extractYouTubeData, parseSearchCandidates, isAvailableInRegion, parseDurationSeconds, playerVideoInfo, isTrailerLikeTitle, isNonTrailerContent };
