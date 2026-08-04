// scripts/parsers/v1.mjs
// Version 1 Schema Parser & Validator for plugin manifests

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const SDK_VERSION_REGEX = /^(?:[~^>=<]*)\s*(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\w.]+)?(?:\+[\w.]+)?$/;

function readJsonFile(filePath) {
    if (!existsSync(filePath)) return null;
    try {
        return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
        return null;
    }
}

/**
 * Parses and validates a Version 1 plugin manifest.
 * @param {object} manifest Raw manifest.json object
 * @param {string} appName Directory name under apps/
 * @param {string} [appDir] Absolute path to app directory for package.json sync check
 * @returns {{ errors: string[], plugin: object|null }}
 */
export function parseV1(manifest, appName, appDir) {
    const errors = [];

    if (!manifest) {
        errors.push(`Missing or unparseable manifest.json in apps/${appName}`);
        return { errors, plugin: null };
    }

    if (!manifest.id || typeof manifest.id !== 'string' || !manifest.id.trim()) {
        errors.push(`apps/${appName}/manifest.json must specify a non-empty string "id"`);
    }

    if (!manifest.name || typeof manifest.name !== 'string' || !manifest.name.trim()) {
        errors.push(`apps/${appName}/manifest.json must specify a non-empty string "name"`);
    }

    if (!manifest.version || typeof manifest.version !== 'string' || !manifest.version.trim()) {
        errors.push(`apps/${appName}/manifest.json must specify a non-empty string "version"`);
    } else if (!SEMVER_REGEX.test(manifest.version.trim())) {
        errors.push(`apps/${appName}/manifest.json "version" ("${manifest.version}") is not a valid Semantic Version (e.g. 1.0.0)`);
    }

    const sdkVersionStr = manifest.minSdkVersion || manifest.sdkVersion;
    if (!sdkVersionStr || typeof sdkVersionStr !== 'string' || !sdkVersionStr.trim()) {
        errors.push(`apps/${appName}/manifest.json must specify a non-empty "minSdkVersion" (or "sdkVersion") e.g. "1.0.0" or ">=1.0.0"`);
    } else if (!SDK_VERSION_REGEX.test(sdkVersionStr.trim())) {
        errors.push(`apps/${appName}/manifest.json "minSdkVersion" ("${sdkVersionStr}") must be a valid version or range (e.g. 1.0.0, >=1.0.0)`);
    }

    if (!manifest.author || (typeof manifest.author !== 'string' && typeof manifest.author !== 'object')) {
        errors.push(`apps/${appName}/manifest.json must specify a required "author" field`);
    }

    if ('source' in manifest) {
        errors.push(`apps/${appName}/manifest.json must NOT contain forbidden "source" property (source origin is tracked by repository index)`);
    }

    if (appDir) {
        const appPkgPath = join(appDir, 'package.json');
        if (existsSync(appPkgPath)) {
            const appPkg = readJsonFile(appPkgPath);
            if (appPkg && appPkg.version && manifest.version && appPkg.version.trim() !== manifest.version.trim()) {
                errors.push(
                    `apps/${appName}/package.json version ("${appPkg.version}") does not match manifest.json version ("${manifest.version}")`
                );
            }
        }
    }

    if (errors.length > 0) {
        return { errors, plugin: null };
    }

    const id = manifest.id.trim();
    const name = manifest.name.trim();
    const version = manifest.version.trim();
    const minSdkVersion = (manifest.minSdkVersion || manifest.sdkVersion || '').trim();
    const description = manifest.description ? String(manifest.description).trim() : '';
    const rawAuthor = manifest.author;
    const author = typeof rawAuthor === 'object' && rawAuthor !== null ? (rawAuthor.name || '') : String(rawAuthor).trim();
    const tags = Array.isArray(manifest.tags) ? manifest.tags.map(t => String(t).trim()) : [];
    const dir = manifest.dir ? String(manifest.dir).trim() : '.';

    const plugin = {
        schemaVersion: 1,
        id,
        name,
        version,
        minSdkVersion,
        author,
        dir
    };

    if (description) plugin.description = description;
    if (tags.length > 0) plugin.tags = tags;

    return { errors: [], plugin };
}
