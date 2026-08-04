#!/usr/bin/env node
// scripts/check-versions.mjs
// Standalone validator to verify plugin versions, SDK compatibility declarations, and package.json synchronization across apps/

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parsePluginManifest } from './parsers/index.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const APPS_DIR = join(ROOT_DIR, 'apps');

function readJsonFile(filePath) {
    if (!existsSync(filePath)) return null;
    try {
        return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch (e) {
        throw new Error(`Invalid JSON at ${filePath}: ${e.message}`);
    }
}

function log(msg) {
    process.stdout.write(msg + '\n');
}

function logError(msg) {
    process.stderr.write(`❌ ERROR: ${msg}\n`);
}

log('');
log('🔍 Checking plugin versions & SDK compatibility declarations...');
log('');

if (!existsSync(APPS_DIR)) {
    logError('apps/ directory does not exist.');
    process.exit(1);
}

const appDirs = readdirSync(APPS_DIR).filter((entry) => {
    return statSync(join(APPS_DIR, entry)).isDirectory();
});

if (appDirs.length === 0) {
    log('⚠ No plugins found in apps/.');
    process.exit(0);
}

let totalErrors = 0;
let checkedCount = 0;

for (const appName of appDirs) {
    const appDir = join(APPS_DIR, appName);
    const manifestPath = join(appDir, 'manifest.json');

    if (!existsSync(manifestPath)) {
        logError(`apps/${appName}: Missing manifest.json`);
        totalErrors++;
        continue;
    }

    let rawManifest;
    try {
        rawManifest = readJsonFile(manifestPath);
    } catch (err) {
        logError(`apps/${appName}/manifest.json: ${err.message}`);
        totalErrors++;
        continue;
    }

    const { errors: appErrors, plugin } = parsePluginManifest(rawManifest, appName, appDir);

    if (appErrors && appErrors.length > 0) {
        logError(`apps/${appName}:`);
        appErrors.forEach((err) => process.stderr.write(`    • ${err}\n`));
        totalErrors += appErrors.length;
    } else if (plugin) {
        checkedCount++;
        log(`  ✅ apps/${appName} (v${plugin.version}, SDK: ${plugin.minSdkVersion}, Schema: v${plugin.schemaVersion})`);
    }
}

log('');
if (totalErrors > 0) {
    logError(`Version check failed with ${totalErrors} error(s).`);
    process.exit(1);
} else {
    log(`🎉 All ${checkedCount} plugin(s) passed version & SDK compatibility checks.`);
    process.exit(0);
}
