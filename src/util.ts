export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`internal compiler error: ${message}`);
  }
}
