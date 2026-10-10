# bend-over

Reusable Bend 2 packages for working with SQLite, JavaScript, and math, with
native, Bun, and browser examples.

## Packages

| Package | Overview | BendHub |
| --- | --- | --- |
| [SQLite](packages/sqlite/README.md) | Native SQLite and JavaScript/Wasm with prepared statements, transactions, import/export, and persistent browser storage. | [bend-over-sqlite](https://hub.bend-lang.com/n/bend-over-sqlite) |
| [JavaScript evaluation](packages/js-eval/README.md) | Evaluate JavaScript from Bend and return typed JSON results. | [bend-over-js-eval](https://hub.bend-lang.com/n/bend-over-js-eval) |
| [Math DSL](packages/math-dsl/README.md) | Initial math package scaffold with a squared-value example. | `bend-over-math-dsl` |

Each package README covers installation, API usage, examples, and platform
requirements. The supporting [browser IO runner](packages/browser-io/) runs
compiled Bend programs with asynchronous JavaScript effects and ships with the
SQLite companion archive.

## Examples and development

- [SQLite examples](packages/sqlite/examples/): native and Bun programs, plus a
  persistent browser counter.
- [JavaScript evaluation example](packages/js-eval/example.bend): evaluate an
  expression and handle its result.
- [Math DSL example](packages/math-dsl/example.bend): square a value.
- [Browser effects demo](demos/js-effects/): Bend calling browser APIs, with a
  live trace of effect arguments, results, and failures.

Use Bun 1.4.2 and Bend 2.0.29. See the [setup instructions](skills/releasing/SKILL.md#before-merging)
for the pinned compiler and source checkout.

```sh
bun install --frozen-lockfile
bun run dev                # browser effects demo on localhost:3000
bun run dev:sqlite         # SQLite browser demo on localhost:3001
```

## Checks and releases

```sh
bun test                   # repository tests
bun run release:check      # proofs, native/Wasm/browser tests, and release checks
```

Packages are versioned and published independently. Merge a package `VERSION`
bump into `main`; CI checks the package, publishes it to BendHub, and creates a
matching GitHub release. SQLite releases include a standalone JS/Wasm companion
archive. See the [releasing skill](skills/releasing/SKILL.md) for the full process and recovery steps.
