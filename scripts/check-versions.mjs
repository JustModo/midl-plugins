#!/usr/bin/env node
// scripts/check-versions.mjs
// Standalone validator to verify plugin versions, SDK compatibility declarations, and package.json synchronization across apps/

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const APPS_DIR = join(ROOT_DIR, 'apps');

const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const SDK_VERSION_REGEX = /^(?:[~^>=<]*)\s*(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\w.]+)?(?:\+[\w.]+)?$/;

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
    const pkgPath = join(appDir, 'package.json');

    if (!existsSync(manifestPath)) {
        logError(`apps/${appName}: Missing manifest.json`);
        totalErrors++;
        continue;
    }

    let manifest;
    try {
        manifest = readJsonFile(manifestPath);
    } catch (err) {
        logError(`apps/${appName}/manifest.json: ${err.message}`);
        totalErrors++;
        continue;
    }

    const appErrors = [];

    // 1. Check version in manifest.json
    if (!manifest.version || typeof manifest.version !== 'string' || !manifest.version.trim()) {
        appErrors.push(`Missing "version" field in manifest.json`);
    } else if (!SEMVER_REGEX.test(manifest.version.trim())) {
        appErrors.push(`Invalid SemVer format for "version": "${manifest.version}" (expected format: X.Y.Z)`);
    }

    // 2. Check minSdkVersion (or sdkVersion) in manifest.json
    const sdkVersion = manifest.minSdkVersion || manifest.sdkVersion;
    if (!sdkVersion || typeof sdkVersion !== 'string' || !sdkVersion.trim()) {
        appErrors.push(`Missing "minSdkVersion" (or "sdkVersion") field in manifest.json`);
    } else if (!SDK_VERSION_REGEX.test(sdkVersion.trim())) {
        appErrors.push(`Invalid version format for "minSdkVersion": "${sdkVersion}"`);
    }

    // 3. Check synchronization with package.json if present
    if (existsSync(pkgPath)) {
        let pkg;
        try {
            pkg = readJsonFile(pkgPath);
        } catch (err) {
            appErrors.push(`Invalid package.json: ${err.message}`);
        }

        if (pkg && pkg.version) {
            if (pkg.version.trim() !== (manifest.version || '').trim()) {
                appErrors.push(
                    `Version mismatch: manifest.json has "${manifest.version}" but package.json has "${pkg.version}"`
                );
            }
        }
    }

    if (appErrors.length > 0) {
        logError(`apps/${appName}:`);
        appErrors.forEach((err) => process.stderr.write(`    • ${err}\n`));
        totalErrors += appErrors.length;
    } else {
        checkedCount++;
        log(`  ✅ apps/${appName} (v${manifest.version}, SDK: ${sdkVersion})`);
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
