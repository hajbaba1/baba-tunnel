// --- scripts/check-imports.js ---
// Validates bidirectional import integrity:
// 1. All relative require() calls resolve strictly inside fenix-standalone.
// 2. All required npm packages are declared in package.json.
// 3. No declared dependency in package.json is unused.

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
    'node:test', 'node:assert'
]);

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const declaredDeps = new Set(Object.keys(pkg.dependencies || {}));
const declaredDevDeps = new Set(Object.keys(pkg.devDependencies || {}));
const allDeclared = new Set([...declaredDeps, ...declaredDevDeps]);

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
let errors = [];
const usedNpmPackages = new Set();

console.log(`Checking ${jsFiles.length} JavaScript files in fenix-standalone...`);

for (const file of jsFiles) {
    const relFile = path.relative(ROOT_DIR, file);
    // Skip browser-side frontend scripts
    if (relFile.startsWith('public' + path.sep)) continue;

    const content = fs.readFileSync(file, 'utf8');
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match;

    while ((match = requireRegex.exec(content)) !== null) {
        const reqTarget = match[1];

        // Skip internal template strings or self-check literals
        if (reqTarget.includes('$')) continue;

        if (BUILTINS.has(reqTarget)) {
            continue;
        }

        if (reqTarget.startsWith('.')) {
            const resolvedPath = path.resolve(path.dirname(file), reqTarget);
            const relToRoot = path.relative(ROOT_DIR, resolvedPath);
            if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
                errors.push(`[ESCAPE] ${relFile} escapes project: require('${reqTarget}')`);
                continue;
            }

            const candidates = [
                resolvedPath,
                resolvedPath + '.js',
                resolvedPath + '.json',
                path.join(resolvedPath, 'index.js'),
            ];
            const exists = candidates.some((c) => fs.existsSync(c));
            if (!exists) {
                errors.push(`[MISSING_FILE] ${relFile} requires non-existent local path: '${reqTarget}'`);
            }
        } else {
            const basePkg = reqTarget.startsWith('@') ? reqTarget.split('/').slice(0, 2).join('/') : reqTarget.split('/')[0];
            usedNpmPackages.add(basePkg);
            if (!allDeclared.has(basePkg)) {
                errors.push(`[UNDECLARED_PKG] ${relFile} requires '${basePkg}' but it is not in package.json`);
            }
        }
    }
}

// Reverse check: are there declared packages that are not used?
for (const dep of declaredDeps) {
    if (!usedNpmPackages.has(dep)) {
        errors.push(`[UNUSED_DEPENDENCY] '${dep}' is in dependencies but never required`);
    }
}

for (const devDep of declaredDevDeps) {
    if (!usedNpmPackages.has(devDep)) {
        // electron might be used via electron CLI in scripts: { "start": "electron ." }
        if (devDep === 'electron' && pkg.scripts && pkg.scripts.start && pkg.scripts.start.includes('electron')) {
            continue;
        }
        // electron-builder is used via CLI in build/dist scripts
        if (devDep === 'electron-builder' && pkg.scripts && (pkg.scripts.dist || pkg.scripts.build)) {
            continue;
        }
        errors.push(`[UNUSED_DEV_DEPENDENCY] '${devDep}' is in devDependencies but never used`);
    }
}

console.log('Detected used npm packages:', Array.from(usedNpmPackages));

if (errors.length === 0) {
    console.log('[PASS] All relative imports are strictly isolated, and package.json is 100% matched.');
    process.exit(0);
} else {
    console.error(`[FAIL] Found ${errors.length} issue(s):`);
    errors.forEach((e) => console.error('  - ' + e));
    process.exit(1);
}
