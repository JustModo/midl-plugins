# midl-plugins

Official plugin workspace and registry for **Midl**. First-party application plugins live here as workspace packages.

---

## Workspace Setup

### Install Dependencies
Install all workspace dependencies across all plugins.
```bash
pnpm install
```

### Build Plugins
Build all plugins across the workspace using Turborepo.
```bash
pnpm build
```

### Package Plugins
Package plugin workspace apps into zip archives.
```bash
pnpm package
```

- **Local Development**: Automatically detects local environment and packages zip files into `zips/` for testing without mutating `index.json`.
- **CI/CD Release (GitHub Actions)**: Automatically detects GitHub Actions, packages updated plugin versions, uploads assets to GitHub Releases, and updates `index.json` & `index.min.json`.

---

## Release Management

Manual releases are triggered via GitHub Actions (**Actions -> Release Plugins -> Run workflow**).

1. Bumps or changes to plugin manifest versions (`apps/<plugin>/manifest.json`) are automatically detected.
2. Only modified plugin versions generate `.zip` assets for the release.
3. Updated `index.json` and `index.min.json` are automatically committed back to the repository.
