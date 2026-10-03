# Browser IO runner

`runner.js` interprets compiled Bend 2 IO requests in JavaScript, one effect at
a time. It calls registered handlers, awaits synchronous results or Promises,
passes each result to Bend's continuation, and resolves with the final `Emit`
value. It is an ES module with no runtime dependencies. The repository uses it
in the [browser effects demo](../../demos/js-effects/) and the SQLite browser
example; it is distributed with the SQLite companion archive, not as a separate
BendHub package.

## Run it standalone

From the repository root, save the following as `example.mjs` and run
`node example.mjs` (or `bun example.mjs`). This exercises the runner directly,
without installing or compiling Bend:

```js
import { runBrowserIO } from "./packages/browser-io/runner.js";

const effects = {
  "demo.greet": { run: async (name) => `Hello, ${name}!` },
};
const main = () => (emit) => ({
  run: effects["demo.greet"].run,
  args: ["browser"],
  kont: emit,
});

const result = await runBrowserIO(main, effects, {
  onEffect: (event) => console.log(event.phase, event.name),
});
console.log(result); // Hello, browser!
```

The trace prints `start demo.greet` and `complete demo.greet` before the result.
The `main` function above mimics the shape produced by Bend's JS compiler. To
run **actual compiled Bend** in a browser, use the repository demo instead:

```sh
bun install --frozen-lockfile
bun run dev
# Open http://127.0.0.1:3000
```

That command compiles `demos/js-effects/main.bend` with the pinned Bend 2
compiler source (see the [compiler setup instructions](../../RELEASING.md#before-merging)
if `.refs/bend` is unavailable), copies `runner.js` into `dist/`, and serves the
demo. Bend 2.0.29 and Bun 1.4.2 are the repository's documented tool versions.

## JavaScript API

```js
import { runBrowserIO } from "./packages/browser-io/runner.js";
const result = await runBrowserIO(main, effects, { onEffect });
```

- `main` is a zero-argument function returning a Bend IO computation: calling
  `main()(emit)` yields the first request, where `emit(value)` produces the final
  `{ $: "Emit", value }` request. For compiled Bend libraries the usual adapter is
  `() => run_loop($main$())` (inside the generated module).
- `effects` maps effect names to objects with a `run` function. A request's
  `run` must be the **same function object** as its registered handler; names are
  used for tracing. A request also has `args` (iterable arguments) and `kont`
  (a continuation accepting the handler's result). The compiler supplies these
  requests and the `$0eff` registry; see
  [`scripts/build.ts`](../../scripts/build.ts) for the adapter and
  [`demos/js-effects/effects.js`](../../demos/js-effects/effects.js) for handlers.
- `onEffect` is optional (defaults to a no-op). It receives `{ index, name,
  args, phase }` at `start`, plus `value` and `duration` (milliseconds) at
  `complete`, or `error` (a string) and `duration` at `error`. Indexes start at
  1 for each run. The returned Promise resolves with the emitted value or
  rejects on a handler or runner error.

Handlers must return a value, including for Unit effects (for example a Bend
Unit constructor), rather than `undefined`. Synchronous exceptions and rejected
Promises stop execution; the runner reports an `error` event and rethrows the
original error. A `Halt` request throws its message. Unregistered or malformed
requests are rejected. Native parked effects (`need`), spawn/channel scheduling,
and concurrent effect execution within one run are not supported. Separate runs
can execute concurrently with independent state.
