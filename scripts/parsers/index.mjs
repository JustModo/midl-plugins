// scripts/parsers/index.mjs
// Central Registry & Dispatcher for versioned manifest parsers

import { parseV1 } from './v1.mjs';

/** Global hardcoded target schema version enforced across the workspace */
export const SCHEMA_VERSION = 1;

const PARSERS = {
    1: parseV1
};

/**
 * Parses and validates a plugin manifest against the strict global SCHEMA_VERSION.
 * @param {object} rawManifest Raw manifest.json object
 * @param {string} appName Directory name under apps/
 * @param {string} [appDir] Absolute path to app directory
 * @returns {{ errors: string[], plugin: object|null }}
 */
export function parsePluginManifest(rawManifest, appName, appDir) {
    if (!rawManifest || typeof rawManifest !== 'object') {
        return {
            errors: [`Missing or unparseable manifest.json in apps/${appName}`],
            plugin: null
        };
    }

    if (rawManifest.schemaVersion !== undefined && Number(rawManifest.schemaVersion) !== SCHEMA_VERSION) {
        return {
            errors: [`apps/${appName}/manifest.json specifies "schemaVersion": ${rawManifest.schemaVersion}, but workspace strictly enforces SCHEMA_VERSION = ${SCHEMA_VERSION}`],
            plugin: null
        };
    }

    const parserFn = PARSERS[SCHEMA_VERSION];
    if (!parserFn) {
        return {
            errors: [`No parser registered for global SCHEMA_VERSION = ${SCHEMA_VERSION}`],
            plugin: null
        };
    }

    return parserFn(rawManifest, appName, appDir);
}
