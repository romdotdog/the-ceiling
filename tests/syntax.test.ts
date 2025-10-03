import { expect, it } from "vitest";
import { Lexer, TokenKind } from "../src/syntax.js";

interface ReadableToken {
  kind: string;
  source: string;
  value?: any;
}

function lex(src: string): ReadableToken[] {
  const tokens = [];
  const lexer = new Lexer(src);
  for (const token of lexer.run()) {
    tokens.push({
      kind: TokenKind[token.kind],
      source: src.slice(token.start, token.end),
      ...("value" in token ? { value: token.value } : {}),
    });
  }
  return tokens;
}

it("let hello = 1;", () => {
  expect(lex("let hello = 1;")).toMatchSnapshot();
});

it("const foo = 42;", () => {
  expect(lex("const foo = 42;")).toMatchSnapshot();
});

it("identifiers and colons", () => {
  expect(lex("foo:bar;")).toMatchSnapshot();
});

it("floating numbers", () => {
  expect(lex("let pi = 3.14;")).toMatchSnapshot();
});

it("NaN literal", () => {
  expect(lex("let x = NaN;")).toMatchSnapshot();
});

it("string single quotes", () => {
  expect(lex("let s = 'hello';")).toMatchSnapshot();
});

it("string double quotes", () => {
  expect(lex('let s = "world";')).toMatchSnapshot();
});

it("string escapes", () => {
  expect(lex("'a\\nb'")).toMatchSnapshot();
});

it("whitespace and newlines", () => {
  expect(lex("\n\t  let   x=1\n\n")).toMatchSnapshot();
});

it("unquoted identifier with digits", () => {
  expect(lex("foo123")).toMatchSnapshot();
});

it("multiple identifiers", () => {
  expect(lex("a b c")).toMatchSnapshot();
});

it("mixed operators", () => {
  expect(lex("a=b:c;")).toMatchSnapshot();
});

it("unicode identifiers", () => {
  expect(lex("let α = 1; const π = 3.14;")).toMatchSnapshot();
  expect(lex("let язык = 'lang';")).toMatchSnapshot();
  expect(lex("let \u0301 = 'é';")).toMatchSnapshot();
  expect(lex("let ❌ = 1;")).toMatchSnapshot();
});
