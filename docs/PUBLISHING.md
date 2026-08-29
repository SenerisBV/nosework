# Publishing to npm

Guide for publishing `@seneris/nosework` and `@seneris/nosework-llm` to npm.

## Prerequisites

1. **npm account** with access to the `@seneris` scope
2. **Logged in to npm**: `npm login`
3. **Clean working directory**: Commit all changes first

## Publishing @seneris/nosework

```bash
cd /path/to/nosework

# 1. Ensure you're logged in
npm whoami

# 2. Build the package
bun run build

# 3. Check what will be published
npm pack --dry-run

# 4. Publish (first time - creates the package)
npm publish --access public

# For subsequent releases, bump version first:
npm version patch  # or minor, or major
npm publish
```

## Publishing @seneris/nosework-llm

```bash
cd /path/to/nosework-llm

# Same steps
bun run build
npm pack --dry-run
npm publish --access public
```

## Version Strategy

Follow [semver](https://semver.org/):

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Bug fixes, patches | `patch` | 0.1.0 → 0.1.1 |
| New features (backward compatible) | `minor` | 0.1.1 → 0.2.0 |
| Breaking changes | `major` | 0.2.0 → 1.0.0 |

```bash
# Bump version (updates package.json and creates git tag)
npm version patch -m "Release %s"
npm version minor -m "Release %s"
npm version major -m "Release %s"
```

## Pre-publish Checklist

- [ ] All changes committed
- [ ] Tests pass: `bun test` (34 tests, all DB-free)
- [ ] Build succeeds: `bun run build`
- [ ] Version bumped appropriately
- [ ] CHANGELOG updated (if maintaining one)
- [ ] README is up to date

## Package Contents

The `files` field in `package.json` controls what's published:

```json
{
  "files": [
    "dist"
  ]
}
```

This includes:
- `dist/` - Compiled JavaScript and TypeScript declarations

Excluded automatically:
- `node_modules/`
- `src/` (source TypeScript)
- `.env`
- Test files

## Verify Published Package

After publishing, verify it works:

```bash
# In a test directory
mkdir test-install && cd test-install
npm init -y
npm install @seneris/nosework

# Check the installed files
ls node_modules/@seneris/nosework
```

## Unpublishing (Emergency Only)

If you publish something broken within 72 hours:

```bash
npm unpublish @seneris/nosework@0.1.0
```

After 72 hours, you cannot unpublish. Instead, publish a fixed version.

## Scoped Package Notes

The `@seneris` scope means:
- Package names are `@seneris/nosework` not just `nosework`
- First publish requires `--access public` (scoped packages are private by default)
- You need npm organization or paid account for the scope

## Automation (Future)

Consider GitHub Actions for automated publishing:

```yaml
# .github/workflows/publish.yml
name: Publish to npm
on:
  release:
    types: [created]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run build
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Links

- [npm publish docs](https://docs.npmjs.com/cli/v10/commands/npm-publish)
- [Scoped packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages)
- [Semver](https://semver.org/)
