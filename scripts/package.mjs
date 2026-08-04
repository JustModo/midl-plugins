#!/usr/bin/env node
// scripts/package.mjs
// Packages apps in midl-plugins/apps/ into zips/ and generates root index.json / index.min.json
// Automatically detects environment: Dev Mode locally (keeps index.json untouched) vs CI Mode in GitHub Actions.

import { execSync, execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parsePluginManifest } from './parsers/index.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const APPS_DIR = join(ROOT_DIR, 'apps');
const ZIPS_DIR = join(ROOT_DIR, 'zips');
const INDEX_JSON = join(ROOT_DIR, 'index.json');
const INDEX_MIN_JSON = join(ROOT_DIR, 'index.min.json');

// ─── Environment Auto-Detection ──────────────────────────────────────────────

const isCI = process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true';
const hasWriteIndexFlag = process.argv.includes('--write-index') || process.argv.includes('--ci');
const isForce = process.argv.includes('--force') || process.argv.includes('--force-all');

// Automatically dev mode locally unless running in CI or --write-index flag is passed
const isDev = !isCI && !hasWriteIndexFlag;
const RELEASE_TAG = process.env.RELEASE_TAG || '';

function readJsonFile(filePath) {
    if (!existsSync(filePath)) return null;
    try {
        return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch (e) {
        throw new Error(`Invalid JSON file at ${filePath}: ${e.message}`);
    }
}

// ─── Strict Metadata Auto-Detection (No Hardcoded Fallbacks for CI) ──────────

const pkgJson = readJsonFile(join(ROOT_DIR, 'package.json'));
if (!pkgJson) {
    throw new Error('Could not read package.json in repository root.');
}

const REGISTRY_NAME = pkgJson.displayName || pkgJson.name;
if (!REGISTRY_NAME || typeof REGISTRY_NAME !== 'string' || !REGISTRY_NAME.trim()) {
    throw new Error('Missing "displayName" or "name" in package.json.');
}

function getRepoPath() {
    // 1. CI / GitHub Actions environment
    if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY.trim()) {
        return process.env.GITHUB_REPOSITORY.trim();
    }
    // 2. Git origin remote URL
    try {
        const gitRemote = execSync('git config --get remote.origin.url', { cwd: ROOT_DIR, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        if (gitRemote) {
            const match = gitRemote.match(/github\.com[:/]([^/]+\/[^/.]+)(\.git)?/);
            if (match && match[1]) return match[1];
        }
    } catch {
        // ignore git command error
    }
    // 3. Optional repository field in package.json if present
    if (pkgJson && pkgJson.repository) {
        const urlStr = typeof pkgJson.repository === 'object' ? pkgJson.repository.url : pkgJson.repository;
        if (urlStr && typeof urlStr === 'string') {
            const match = urlStr.match(/github\.com[:/]([^/]+\/[^/.]+)(\.git)?/);
            if (match && match[1]) return match[1];
        }
    }
    if (isDev) {
        return 'local/dev';
    }
    throw new Error(
        'Could not determine GitHub repository path. Ensure GITHUB_REPOSITORY is set in CI or git remote origin is configured.'
    );
}

const GITHUB_REPO = getRepoPath();

function getZipUrl(zipName) {
    if (RELEASE_TAG) {
        return `https://github.com/${GITHUB_REPO}/releases/download/${RELEASE_TAG}/${zipName}`;
    }
    if (isDev) {
        return `http://localhost:3000/zips/${zipName}`;
    }
    throw new Error(`RELEASE_TAG environment variable is required to generate release zipUrl for ${zipName}.`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) {
    process.stdout.write(msg + '\n');
}

function logError(msg) {
    process.stderr.write(`❌ ERROR: ${msg}\n`);
}

function sha256OfFile(filePath) {
    const hash = createHash('sha256');
    hash.update(readFileSync(filePath));
    return hash.digest('hex');
}

function zipDir(srcDir, destZip) {
    execFileSync(
        'zip',
        ['-r', destZip, '.', '-x', '*.DS_Store', '-x', '__MACOSX/*', '-x', 'node_modules/*', '-x', '.git/*', '-x', '.turbo/*'],
        { cwd: srcDir, stdio: 'inherit' }
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

log('');
log('╔══════════════════════════════════════════╗');
log('║         midl-apps  ·  packager           ║');
log('╚══════════════════════════════════════════╝');
log(` Name: ${REGISTRY_NAME}`);
log(` Repo: ${GITHUB_REPO}`);
log(` Mode: ${isDev ? 'DEV (Local build - index.json un-mutated)' : isForce ? 'CI/CD RELEASE (Force repackage all)' : 'CI/CD RELEASE (Incremental)'}`);
if (RELEASE_TAG) {
    log(` Release Tag: ${RELEASE_TAG}`);
}
log('');

// Clean existing zips directory so zips/ contains only freshly generated zips for this run
if (existsSync(ZIPS_DIR)) {
    const existingZips = readdirSync(ZIPS_DIR);
    for (const file of existingZips) {
        if (file.endsWith('.zip')) {
            rmSync(join(ZIPS_DIR, file), { force: true });
        }
    }
} else {
    mkdirSync(ZIPS_DIR, { recursive: true });
}

const existingIndex = readJsonFile(INDEX_JSON);
const existingPluginsMap = new Map();
if (existingIndex && Array.isArray(existingIndex.plugins)) {
    for (const plugin of existingIndex.plugins) {
        if (plugin && plugin.id) {
            existingPluginsMap.set(plugin.id, plugin);
        }
    }
}

const appDirs = readdirSync(APPS_DIR).filter((entry) => {
    return statSync(join(APPS_DIR, entry)).isDirectory();
});

if (appDirs.length === 0) {
    log('⚠  No apps found in apps/. Exiting.');
    process.exit(0);
}

const plugins = [];
const processedIds = new Set();
let hasValidationFailures = false;
let newlyPackagedCount = 0;
let skippedCount = 0;

for (const appName of appDirs) {
    const appDir = join(APPS_DIR, appName);
    log(`──────────────────────────────────────────`);
    log(`📂 Processing: ${appName}`);

    let rawManifest;
    try {
        rawManifest = readJsonFile(join(appDir, 'manifest.json'));
    } catch (err) {
        logError(err.message);
        hasValidationFailures = true;
        continue;
    }

    const { errors: validationErrors, plugin: parsedPlugin } = parsePluginManifest(rawManifest, appName, appDir);
    if (validationErrors.length > 0 || !parsedPlugin) {
        validationErrors.forEach((err) => logError(err));
        hasValidationFailures = true;
        continue;
    }

    const { id, version, dir = '.' } = parsedPlugin;

    processedIds.add(id);

    const existingEntry = existingPluginsMap.get(id);
    const isUnchanged = !isForce && existingEntry && existingEntry.version === version && existingEntry.zipUrl && existingEntry.sha256;

    if (isUnchanged && !isDev) {
        log(`   ⏩ Unchanged (v${version}). Preserving existing index entry & zipUrl.`);
        log(`   🔐 sha256: ${existingEntry.sha256.slice(0, 16)}...`);
        log(`   🔗 zipUrl: ${existingEntry.zipUrl}`);

        const pluginObj = {
            ...parsedPlugin,
            zipUrl: existingEntry.zipUrl,
            sha256: existingEntry.sha256
        };
        delete pluginObj.dir;

        plugins.push(pluginObj);
        skippedCount++;
        log(`   ✅ Done (Skipped zipping)`);
        continue;
    }

    const srcDir = resolve(appDir, dir);

    if (!existsSync(srcDir)) {
        logError(`Resolved dir "${dir}" does not exist at ${srcDir}`);
        hasValidationFailures = true;
        continue;
    }

    const zipName = `${id}-${version}.zip`;
    const zipRelPath = `zips/${zipName}`;
    const zipAbsolutePath = join(ZIPS_DIR, zipName);

    log(`   📦 Zipping ${srcDir} → ${zipRelPath}`);
    try {
        zipDir(srcDir, zipAbsolutePath);
    } catch (err) {
        logError(`zip failed for ${appName}: ${err.message}`);
        hasValidationFailures = true;
        continue;
    }

    const zipSha256 = sha256OfFile(zipAbsolutePath);
    const zipUrl = getZipUrl(zipName);

    log(`   🔐 sha256: ${zipSha256.slice(0, 16)}...`);
    log(`   🔗 zipUrl: ${zipUrl}`);

    const pluginObj = {
        ...parsedPlugin,
        zipUrl,
        sha256: zipSha256
    };
    delete pluginObj.dir;

    plugins.push(pluginObj);
    newlyPackagedCount++;
    log(`   ✅ Done (Packaged new zip)`);
}

// Log removed plugins that were in index.json but no longer in apps/
let removedCount = 0;
for (const [existingId] of existingPluginsMap) {
    if (!processedIds.has(existingId)) {
        log(`──────────────────────────────────────────`);
        log(`🗑  Removed plugin from index: ${existingId}`);
        removedCount++;
    }
}

if (hasValidationFailures) {
    log('');
    logError('Schema validation failed for one or more plugins. Aborting packaging.');
    process.exit(1);
}

log('──────────────────────────────────────────');
log('');

if (isDev) {
    log(`ℹ  Dev mode (Local execution). Skipping update of index.json & index.min.json.`);
    log(`🎉 Packaged ${newlyPackagedCount} plugin zip(s) in zips/ for local dev testing.`);
} else {
    const index = {
        version: 1,
        name: REGISTRY_NAME,
        plugins,
    };

    const indexJson = JSON.stringify(index, null, 2);
    const indexMinJson = JSON.stringify(index);

    writeFileSync(INDEX_JSON, indexJson, 'utf-8');
    writeFileSync(INDEX_MIN_JSON, indexMinJson, 'utf-8');

    log(`📄 index.json      (${(indexJson.length / 1024).toFixed(1)} KB)`);
    log(`📄 index.min.json  (${(indexMinJson.length / 1024).toFixed(1)} KB)`);
    log('');
    log(`🎉 Summary: ${plugins.length} total plugin(s) in index.`);
    log(`   • ${newlyPackagedCount} newly packaged zip(s) generated in zips/`);
    log(`   • ${skippedCount} unchanged plugin(s) preserved`);
    if (removedCount > 0) {
        log(`   • ${removedCount} plugin(s) removed`);
    }
}
log('');
