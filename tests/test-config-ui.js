const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '../public/configure.html'), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, 'configuration JavaScript must exist');

function createPage(pathname = '/configure') {
    const names = [
        'languageSelect', 'strictLanguageToggle', 'youtubeApiKeyInput',
        'youtubeApiKeyVisibility', 'youtubeApiKeyHelp', 'youtubeApiKeyWarning',
        'playerSelect', 'playerLabel', 'playerDescription', 'externalLinkToggle',
        'recapToggle', 'onlyRecapsToggle', 'installBtn', 'copyBtn',
        'kofiText', 'toast', 'toggleDescription', 'recapDescription',
        'onlyRecapsDescription'
    ];
    const elements = Object.fromEntries(names.map(id => [id, {
        id,
        value: '', checked: false, type: id === 'youtubeApiKeyInput' ? 'password' : '',
        style: {}, attributes: {}, listeners: {},
        classList: { add() {}, remove() {} },
        addEventListener(event, callback) { this.listeners[event] = callback; },
        setAttribute(name, value) { this.attributes[name] = value; },
        closest() { return { style: {} }; }
    }]));
    elements.languageSelect.value = 'en-US';
    elements.languageSelect.options = [{ value: 'en-US' }, { value: 'pt-BR' }];
    elements.playerSelect.value = 'internal';
    const copied = [];
    const location = {
        pathname, host: 'streailer.test.example', origin: 'https://streailer.test.example',
        href: ''
    };
    const sandbox = {
        document: {
            getElementById: id => elements[id],
            createElement: () => ({
                value: '', select() {}, remove() {}
            }),
            body: { appendChild() {}, removeChild() {} },
            execCommand() {}
        },
        navigator: {
            language: 'pt-BR',
            clipboard: { async writeText(value) { copied.push(value); } }
        },
        window: { location },
        setTimeout() {},
        atob: data => Buffer.from(data, 'base64').toString('utf8'),
        encodeURIComponent, decodeURIComponent,
        console
    };
    vm.createContext(sandbox);
    vm.runInContext(match[1], sandbox, { timeout: 2000 });
    return { elements, sandbox, location, copied };
}

let passed = 0;
async function test(name, fn) {
    await fn();
    console.log('PASS UI: ' + name);
    passed++;
}

async function run() {
    await test('optional API key field is masked and warns about install URL exposure', () => {
        assert.match(html, /id="youtubeApiKeyInput"[^>]+type="password"/);
        assert.match(html, /id="youtubeApiKeyWarning"/);
        const page = createPage();
        assert.strictEqual(page.elements.youtubeApiKeyInput.type, 'password');
        assert.match(page.elements.youtubeApiKeyWarning.textContent, /URL de instalação/);
    });

    await test('blank key omits credential and preserves server-side fallback', () => {
        const page = createPage();
        const encoded = vm.runInContext('getConfig()', page.sandbox);
        const cfg = JSON.parse(decodeURIComponent(encoded));
        assert.strictEqual(cfg.youtubeApiKey, undefined);
        assert.strictEqual(cfg.language, 'pt-BR');
        assert.strictEqual(cfg.playerTarget, 'internal');
    });

    await test('entered key is included only in generated user config', () => {
        const page = createPage();
        page.elements.youtubeApiKeyInput.value = 'test-ui-key-not-real';
        const config = JSON.parse(decodeURIComponent(vm.runInContext('getConfig()', page.sandbox)));
        assert.strictEqual(config.youtubeApiKey, 'test-ui-key-not-real');
        const manifest = vm.runInContext('getManifestUrl()', page.sandbox);
        const url = new URL(manifest);
        const configPath = url.pathname.split('/')[1];
        assert.strictEqual(JSON.parse(decodeURIComponent(configPath)).youtubeApiKey, 'test-ui-key-not-real');
        assert.ok(!html.includes('test-ui-key-not-real'));
    });

    await test('existing install configuration restores key in masked input', () => {
        const previous = encodeURIComponent(JSON.stringify({
            language: 'pt-BR', playerTarget: 'youtube', youtubeApiKey: 'existing-test-key'
        }));
        const page = createPage('/' + previous + '/configure');
        assert.strictEqual(page.elements.youtubeApiKeyInput.value, 'existing-test-key');
        assert.strictEqual(page.elements.youtubeApiKeyInput.type, 'password');
        assert.strictEqual(page.elements.playerSelect.value, 'youtube');
        const again = vm.runInContext('getConfig()', page.sandbox);
        assert.strictEqual(JSON.parse(decodeURIComponent(again)).youtubeApiKey, 'existing-test-key');
    });

    await test('visibility toggle and Stremio install link work without persisting key separately', () => {
        const page = createPage();
        const input = page.elements.youtubeApiKeyInput;
        input.value = 'not-a-real-key';
        page.elements.youtubeApiKeyVisibility.listeners.click();
        assert.strictEqual(input.type, 'text');
        assert.strictEqual(page.elements.youtubeApiKeyVisibility.attributes['aria-pressed'], 'true');
        page.elements.youtubeApiKeyVisibility.listeners.click();
        assert.strictEqual(input.type, 'password');
        page.elements.installBtn.listeners.click({ preventDefault() {} });
        assert.ok(page.location.href.startsWith('stremio://'));
        const cfg = JSON.parse(decodeURIComponent(page.location.href.split('/')[3]));
        assert.strictEqual(cfg.youtubeApiKey, 'not-a-real-key');
    });

    await test('copy manifest action includes optional user configuration', async () => {
        const page = createPage();
        page.elements.youtubeApiKeyInput.value = 'copy-test-key';
        await page.elements.copyBtn.listeners.click();
        assert.strictEqual(page.copied.length, 1);
        const cfg = JSON.parse(decodeURIComponent(new URL(page.copied[0]).pathname.split('/')[1]));
        assert.strictEqual(cfg.youtubeApiKey, 'copy-test-key');
    });

    console.log(passed + ' configuration UI regression tests passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
