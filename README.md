# the-ceiling

bespoke actor framework for javascript with borrow checking

## current status

you cannot use this. it does not work. it is vaporware. the compiler is a shell script that prints "borrow checker failed" and exits with code 1.

## what

you know how react is single-threaded and everyone pretends web workers don't exist? and you know how rust has a borrow checker and javascript has... not a particularly good gc?

we're fixing both of those problems by creating new problems.

the-ceiling is two things:

1. a language (`.ceiling` files) with actors and borrow checking that compiles to typescript
2. a runtime actor library that runs in webworkers

everything is an actor. actors send messages. the type system tracks borrows (handles) so you don't spawn a million actors and leak memory. each handle is tracked and decrements the actor's refcount when it's dropped so that the framework will know when an actor is no longer reachable and drop it.

## [`FinalizationRegistry`?](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry)

erm... no. we do not use `FinalizationRegistry` because [it is not reliable enough](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry#notes_on_cleanup_callbacks) and you'd have to wrap PIDs in wrapper classes that make them behave like pointers, which would be weird. instead, we use a local borrow checker on each worker at compile time and refcount the number of live handles. yes, this means you have to annotate lifetimes. don't worry, it's not as bad as rust: they're [place-annotated](https://smallcultfollowing.com/babysteps/blog/2024/03/04/borrow-checking-without-lifetimes/), not region-annotated

## examples

```ts
actor struct Counter {
  read i: number;
}

// queries are request-response
query Counter.increment(): number {
  this.i += 1;
  return this.i;
}

const counterHandle = await Counter { i: 0 }.start();
const nextNumber = await counterHandle.increment();
```

```ts
actor struct DataProcessor {
  private results: handle ResultsActor;
}

// commands are fire-and-forget
command DataProcessor.process(data: number[]) {
  const sum = data.reduce((a, b) => a + b, 0);
  this.results.store(sum);
}

actor struct ResultsActor {
  private totals: number[] = [];
}

command ResultsActor.store(value: number): void {
  this.totals.push(value);
}

// spawn them
const results = await ResultsActor { }.start();
const processor = await DataProcessor { results }.start();

// send work
processor.process([1, 2, 3, 4, 5]);
```

```ts
actor struct Supervisor {
  worker: unique handle RiskyWorker; // cannot be copied or sent across workers, resettable
}

command Supervisor.monitor(): void {
  try {
    await this.worker.doRiskyThing();
  } catch (e) {
    this.worker = this.worker.reset { /* constructor fields */ }; // state is reset
  }
}
```

come to the dark side we have UFCS

```ts
function square(x: number) {
    return x * x;
}

console.log(2.square().square().square().square().square());
```

lifetime examples

```ts
function longest(cond: boolean, x: handle Actor, y: handle Actor): handle<x, y> Actor { // must live shorter than *the handles in* x and y
  if (cond) {
    return x;
  } else {
    return y;
  }
}

const a = await Actor {}.start();
const b = await Actor {}.start();

const z: handle<a, b> Actor = longest(true, a, b);

// a and b must outlive z

// for example, when a's liveness ends (and all dependents), compiler inserts
drop(a) // ref count (by thread) decrements for the respective actor
```

```ts
function makeAndExtend(): handle Actor {
  const a = await Actor {}.start();

  const z: handle<a, b> Actor = longest(true, a, b);
  // *do something with z*

  // *z's liveness ends*

  return a;
  // *a's liveness ends, owned actor gets returned*
}
```

```ts
struct Return {
  a: Actor;
  b: Actor;
  z: handle<this.a, this.b> Actor;
}

function makeAndExtendDependent1(): Return {
  const a = await Actor {}.start();
  const b = await Actor {}.start();
  const z: handle<a, b> Actor = longest(true, a, b);

  return Return { a, b, z };
}

struct LongestWrapper {
  z: handle Actor; // owned or referenced is fine here, if ref it caps the place lifetime
}

function makeAndExtendDependent2(): LongestWrapper</* uh oh, this function is impossible */> {
  const a = await Actor {}.start();
  const b = await Actor {}.start();
  const z: LongestWrapper<(a, b)> = LongestWrapper { z: longest(true, a, b) };

  return z;
  // either a or b would get leaked here if allowed
}

function makeAndExtendDependent3(): Array<handle Actor> { // has its own lifetime
  return await Array(20, () => Actor {}.start());
}
```

```ts
function first(arr: Array<handle Actor>): handle<arr> Actor {
  return arr[0];
}

function pop(arr: Array<handle Actor>): handle Actor {
  /* ... */
}

function splice(arr: Array<handle Actor>, start: number, deleteCount: number): Array<handle Actor> {
  /* ... */
}
```

## will this be faster than react

probably. not necessarily because it's multithreaded, but because the control flow will be very dataflow analysis friendly. [🙏 blockdom](https://github.com/ged-odoo/blockdom) [🙏 koka](https://www.microsoft.com/en-us/research/wp-content/uploads/2020/11/perceus-tr-v1.pdf)

## contributors

[you. maybe. help.](https://discord.gg/nRutVAZ8pv)

## why is it called the-ceiling

shot through the ceiling, wanna feel right

## license

MIT. i don't care. if you're going to use this you have bigger problems than licensing.
