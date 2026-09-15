# Publishing to npm

Guide for publishing `@seneris/nosework` to npm.

**Currently published:** 0.3.0, on 2026-08-29. Nothing is pending — the
published tarball has been verified identical to a build from the tagged
commit.

(Earlier versions of this guide also covered `@seneris/nosework-llm`. That
package was never built and does not exist; see `ROADMAP.md` Phase 6.)

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
- [ ] Tests pass: `bun test` (35 tests, all DB-free)
- [ ] Build succeeds: `bun run build`
- [ ] Version bumped appropriately
- [ ] CHANGELOG updated (if maintaining one)
- [ ] README is up to date — it ships to npm regardless of the `files` field,
      so any inaccuracy in it is published too
- [ ] **Push the commits and the tag**: `git push origin main --follow-tags`

That last item is not ceremony. 0.3.0 sat on npm for two weeks with no public
source behind it, because `npm version` creates a tag locally and `npm publish`
does not care whether git has been pushed. The registry is the thing users see;
git is the thing that explains it. Publishing without pushing leaves the second
one missing.

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

### Confirming the registry matches the source

To check that what is on npm is actually built from the commit you think it is
— useful when you cannot remember whether a release went out before or after
the last few commits:

```bash
# Fetch and unpack the published tarball
npm pack @seneris/nosework@<version>
tar xzf seneris-nosework-<version>.tgz     # unpacks to ./package

# Build the current checkout and compare
bun run build
diff -rq package/dist dist && echo "dist identical"
diff -q package/README.md README.md && echo "README identical"
```

A clean diff means the registry and the working tree agree. A difference means
the release predates commits you still have locally.

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
