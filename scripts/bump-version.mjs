#!/usr/bin/env node
// scripts/bump-version.mjs
// CLI utility to bump plugin versions and update SDK requirements consistently

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const APPS_DIR = join(ROOT_DIR, 'apps');

const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function readJsonFile(filePath) {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function writeJsonFile(filePath, content) {
    writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf-8');
}

function bumpSemver(currentVersion, bumpType) {
    const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
        throw new Error(`Cannot bump non-standard semver string: ${currentVersion}`);
    }
    let major = parseInt(match[1], 10);
    let minor = parseInt(match[2], 10);
    let patch = parseInt(match[3], 10);

    if (bumpType === 'major') {
        major++;
        minor = 0;
        patch = 0;
    } else if (bumpType === 'minor') {
        minor++;
        patch = 0;
    } else if (bumpType === 'patch') {
        patch++;
    } else if (SEMVER_REGEX.test(bumpType)) {
        return bumpType;
    } else {
        throw new Error(`Invalid bump type or semver: "${bumpType}". Must be major, minor, patch, or X.Y.Z.`);
    }

    return `${major}.${minor}.${patch}`;
}

// ─── CLI Argument Parsing ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: pnpm bump <plugin-id-or-app-folder> <patch|minor|major|x.y.z> [--sdk <sdk-version>]

Examples:
  pnpm bump echo patch
  pnpm bump echo minor --sdk 1.1.0
  pnpm bump tictactoe 2.0.0
`);
    process.exit(0);
}

const targetPlugin = args[0];
const bumpType = args[1];
let targetSdkVersion = null;

const sdkIndex = args.indexOf('--sdk');
if (sdkIndex !== -1 && args[sdkIndex + 1]) {
    targetSdkVersion = args[sdkIndex + 1];
}

// Locate plugin app folder
const appDirs = readdirSync(APPS_DIR).filter((entry) => statSync(join(APPS_DIR, entry)).isDirectory());
let foundAppDir = null;
let foundManifestPath = null;

for (const appName of appDirs) {
    const appDir = join(APPS_DIR, appName);
    const manifestPath = join(appDir, 'manifest.json');
    if (appName === targetPlugin) {
        foundAppDir = appDir;
        foundManifestPath = manifestPath;
        break;
    }
    if (existsSync(manifestPath)) {
        const m = readJsonFile(manifestPath);
        if (m && m.id === targetPlugin) {
            foundAppDir = appDir;
            foundManifestPath = manifestPath;
            break;
        }
    }
}

if (!foundAppDir || !foundManifestPath || !existsSync(foundManifestPath)) {
    console.error(`❌ ERROR: Could not find plugin "${targetPlugin}" in apps/`);
    process.exit(1);
}

const manifest = readJsonFile(foundManifestPath);
const oldVersion = manifest.version || '1.0.0';
const newVersion = bumpSemver(oldVersion, bumpType);

manifest.version = newVersion;
if (targetSdkVersion) {
    manifest.minSdkVersion = targetSdkVersion;
}

writeJsonFile(foundManifestPath, manifest);
console.log(`✅ Updated ${foundManifestPath}`);
console.log(`   • version: ${oldVersion} → ${newVersion}`);
if (targetSdkVersion) {
    console.log(`   • minSdkVersion: ${targetSdkVersion}`);
}

const pkgPath = join(foundAppDir, 'package.json');
if (existsSync(pkgPath)) {
    const pkg = readJsonFile(pkgPath);
    if (pkg) {
        pkg.version = newVersion;
        writeJsonFile(pkgPath, pkg);
        console.log(`✅ Updated ${pkgPath} (version: ${newVersion})`);
    }
}
