# Releasing bend-over packages

**Skill:** `releasing` — cut a versioned, cross-platform release of a bend-over
package and publish it to BendHub with a matching GitHub release.

## When to use

Use this skill when a package `VERSION` bump merges to `main`, when preparing a
release candidate locally (`bun run release:check`), or when recovering a
failed or interrupted publish. Do not improvise the release steps — follow them.

## Instructions

# Releasing Bend packages

Merge a `VERSION` bump into `main`. GitHub Actions checks macOS and Linux, builds
and tests the downloadable archives, requires identical archive checksums on both
platforms, publishes the Bend source by hash, verifies
fresh consumers, releases the companion assets, and finally attaches the Hub name.

| Package | Hub import |
|---|---|
| JavaScript evaluation | `import bend-over-js-eval@0.1.0.1/js.bend as JS` |
| Math DSL | `import bend-over-math-dsl@0.1.0.0/math.bend as Math` |
| SQLite | `import bend-over-sqlite@0.1.0.1/sqlite.bend as SQLite` |

Names and versions are immutable release coordinates. `VERSION` contains four
numbers; edit it explicitly when a published file or archive content changes.
Bend APIs, host files, package documentation, licenses, examples and generated
companion files count as release contents. Changes elsewhere in the repository
do not require a package version bump.

## Before merging

```sh
bun install --frozen-lockfile
bun run toolchain:install
# The installer prints BEND_SOURCE, BEND_CLI and PATH for local use.
# GitHub Actions receives these automatically.
bunx --no-install playwright install --with-deps chromium
bun run release:check             # all packages
bun run release:check sqlite      # one package
```

Use Bun 1.4.2. `toolchain.json` pins Bend binaries by checksum and compiler source
by commit and checksum. Locally the existing `.refs/bend` can also be used when
it matches the pin. `BEND_SOURCE` and `BEND_CLI` select explicit compiler paths.

The check command runs proofs, repository integration tests, and actual browser
OPFS tests. It compares candidate versions with BendHub and GitHub, and writes
archives, hashes and receipts under `.cache/releases/`. It performs **no public
writes**. Tests of the official publisher send uploads only to a local mock Hub.
Do not use a moving compiler installer in release automation.

## One-time publishing setup

The destination is this repository: `https://github.com/subtleGradient/bend-over`.
Log into BendHub using the account which will own `bend-over-*`, then transfer
its login file directly to that repository's encrypted Actions secret:

```sh
bend login
gh secret set BEND_BENDER_JSON --repo subtleGradient/bend-over < "$HOME/.bend/bender.json"
```

Do not paste the credential into an issue, log, or commit. Pull requests receive
no BendHub credential. Only the publishing job on `main` restores it, and the job
removes the temporary file afterward. GitHub's workflow token creates release
tags and assets; no npm account or additional publishing token is needed.

New names must be available to this account. Both configured names meet the
Hub's free-name length requirement. Quota or ownership errors stop before an
upload; rerun after resolving the reported condition. If the login is revoked,
repeat the two setup commands with a fresh login.

## What a release contains

Each package uses the standard `bend <entry> --publish` and `bend link` commands.
The compiler's actual loader determines the file set; licenses beside published
files are included. Base and external Hub dependencies are not repackaged.
`release.config.json` records exact dependency hashes and package entrypoints.

GitHub tags and releases use `<hub-name>-v<version>`. Each release records its
source commit, Hub hash, toolchain, dependencies, and asset SHA-256 hashes in a
machine-readable receipt embedded in the description. Download the archive and
`SHA256SUMS`, then run `shasum -a 256 -c SHA256SUMS` (or `sha256sum -c`). The receipt
also remains available in the workflow artifact and `.cache/releases/`.

SQLite's archive includes the official SQLite Wasm 3.53.4-build1 files, host
initializer, Bun launcher, sequential browser IO runner, proofs, source, examples,
and licenses. Extract it anywhere; it does not require the checkout or an npm
install:

```sh
bun launch.js counter.js
bun serve.js
# Open http://127.0.0.1:3001/web/
```

For another compiled Bend program, use `bun launch.js /path/to/program.js`.
JavaScript applications can import `initializeSQLite` from `bun.js` or, inside a
browser module worker, `browser.js`. These wrappers load the bundled vendor files;
the browser requires local serving over HTTPS or localhost. See `QUICKSTART.md`
in the archive and the SQLite package README for API and persistence behavior.

## Retry and recovery

Publishing is serialized across this repository. A release always compares the
current remote state with the prepared content before writing. Staged, checked
files are the upload inputs; the publisher does not reread an editable source tree.

- Identical existing Hub content and archives are verified and skipped. An
  unrelated newer repository commit does not move the original release tag.
- Changed content under an existing version fails: increment `VERSION`.
- Interrupted uploads and asset creation are reconciled by reading the remote
  state. Rerun the failed Actions job, or dispatch the workflow on `main`.
- A GitHub release can exist before the Hub name is attached. Its hash import is
  already usable. A rerun verifies its assets and finishes the naming step.
- Conflicting tags, receipts, or corrupted assets are never overwritten. A tag
  without a receipt must be resumed from its original source commit.
- Network/server failures are not treated as missing packages. Read requests use
  bounded retries. A write with an uncertain response is checked remotely before
  it is considered failed; reruns never blindly duplicate it.

For an explicit local release, use `bun run release:publish [package]` from a
clean committed checkout with BendHub and GitHub authentication. CI is the normal
release path because it gates publication on both supported native platforms.
Publication is public and permanent under
[BendHub's terms](https://bend-lang.com/bender/terms#s18).

To add a package, give it an entrypoint, `VERSION`, `LICENSE`, and meaningful
proofs and consumer tests, then add it to the release inventory and archive
builder. `browser-io` is currently distributed with SQLite rather than named
separately on BendHub.
