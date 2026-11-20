// --- scripts/verify-isolation.js ---
// Validates that all require() calls in fenix-standalone resolve locally or to declared npm packages.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const BUILTINS = new Set([
    'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
    'constants', 'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'fs/promises',
    'http', 'http2', 'https', 'inspector', 'module', 'net', 'os', 'path',
    'perf_hooks', 'process', 'punycode', 'querystring', 'readline', 'repl',
    'stream', 'string_decoder', 'timers', 'tls', 'trace_events', 'tty',
    'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
    'electron'
]);

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const DECLARED_DEPS = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
]);

function getAllJsFiles(dir) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(getAllJsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            results.push(fullPath);
        }
    }
    return results;
}

const jsFiles = getAllJsFiles(ROOT_DIR);
let errorsFound = 0;

console.log(`Analyzing ${jsFiles.length} JavaScript files in fenix-standalone...`);

for (const file of jsFiles) {
    const relFile = path.relative(ROOT_DIR, file);
    // Skip public browser scripts and this verification script itself
    if (relFile.startsWith('public' + path.sep) || relFile.startsWith('scripts' + path.sep)) continue;

    const content = fs.readFileSync(file, 'utf8');
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match;

    while ((match = requireRegex.exec(content)) !== null) {
        const reqTarget = match[1];

        if (BUILTINS.has(reqTarget)) {
            continue;
        }

        if (reqTarget.startsWith('.')) {
            const resolvedPath = path.resolve(path.dirname(file), reqTarget);
            // Verify path does not escape ROOT_DIR
            const relToRoot = path.relative(ROOT_DIR, resolvedPath);
            if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
                console.error(`[ERROR] File ${relFile} escapes project root: require('${reqTarget}') -> ${resolvedPath}`);
                errorsFound++;
                continue;
            }

            // Verify file exists
            const candidates = [
                resolvedPath,
                resolvedPath + '.js',
                resolvedPath + '.json',
                path.join(resolvedPath, 'index.js'),
            ];
            const exists = candidates.some((c) => fs.existsSync(c));
            if (!exists) {
                console.error(`[ERROR] File ${relFile} requires non-existent local file: require('${reqTarget}')`);
                errorsFound++;
            }
        } else {
            // Must be declared in package.json
            const basePkg = reqTarget.startsWith('@') ? reqTarget.split('/').slice(0, 2).join('/') : reqTarget.split('/')[0];
            if (!DECLARED_DEPS.has(basePkg) && !BUILTINS.has(basePkg)) {
                console.error(`[ERROR] File ${relFile} requires undeclared dependency: '${reqTarget}' (package '${basePkg}')`);
                errorsFound++;
            }
        }
    }
}

if (errorsFound === 0) {
    console.log('[SUCCESS] All require() calls are strictly isolated within fenix-standalone.');
    process.exit(0);
} else {
    console.error(`[FAILURE] Found ${errorsFound} import/isolation errors.`);
    process.exit(1);
}
