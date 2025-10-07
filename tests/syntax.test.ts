import { expect, it, describe } from "vitest";
import { Lexer, TokenKind, Parser, ASTKind } from "../src/syntax.js";
import { Diagnostics } from "../src/diagnostics.js";

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
describe("lexer", () => {
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
});

// Parser tests
function parse(src: string) {
  const diagnostics = new Diagnostics("test.ceiling", src);
  const lexer = new Lexer(src);
  const parser = new Parser(diagnostics, lexer.run());
  const decl = parser.parseDeclaration();

  // messy reflection helper
  function cleanAST(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(cleanAST);

    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "span" || key === "start" || key === "end") continue; // removing spans
      if (key === "kind" && typeof value === "number") {
        cleaned[key] = ASTKind[value];
      } else {
        cleaned[key] = cleanAST(value);
      }
    }
    return cleaned;
  }

  return {
    ast: cleanAST(decl),
    diagnostics: parser.allDiags.map(d => d.message),
  };
}

describe("parser", () => {
  it("simple function with no params", () => {
    expect(parse("function foo() { return 42; }")).toMatchSnapshot();
  });

  it("function with parameters", () => {
    expect(parse("function add(x: number, y: number) { return x + y; }")).toMatchSnapshot();
  });

  it("function with return type", () => {
    expect(parse("function getValue(): number { return 1; }")).toMatchSnapshot();
  });

  it("function with let binding", () => {
    expect(parse("function test() { let x = 10; return x; }")).toMatchSnapshot();
  });

  it("function with const binding", () => {
    expect(parse("function test() { const x = 10; return x; }")).toMatchSnapshot();
  });

  it("binary expressions", () => {
    expect(parse("function test() { return 1 + 2 * 3; }")).toMatchSnapshot();
  });

  it("unary minus", () => {
    expect(parse("function test() { return -5; }")).toMatchSnapshot();
  });

  it("function call", () => {
    expect(parse("function test() { return foo(1, 2); }")).toMatchSnapshot();
  });

  it("ufcs method call", () => {
    expect(parse("function test() { return 2.square(); }")).toMatchSnapshot();
  });

  it("chained ufcs calls", () => {
    expect(parse("function test() { return 2.square().square(); }")).toMatchSnapshot();
  });

  it("handle type", () => {
    expect(parse("function test(h: handle Actor) { return h; }")).toMatchSnapshot();
  });

  it("handle type with lifetimes", () => {
    expect(parse("function test(h: handle<a, b> Actor) { return h; }")).toMatchSnapshot();
  });

  it("unique handle type", () => {
    expect(parse("function test(h: unique handle Worker) { return h; }")).toMatchSnapshot();
  });

  it("comparison operators", () => {
    expect(parse("function test() { return x == y; }")).toMatchSnapshot();
  });

  it("logical operators", () => {
    expect(parse("function test() { return a && b || c; }")).toMatchSnapshot();
  });

  it("string literals", () => {
    expect(parse('function test() { return "hello"; }')).toMatchSnapshot();
  });

  it("parenthesized expressions", () => {
    expect(parse("function test() { return (1 + 2) * 3; }")).toMatchSnapshot();
  });
});
