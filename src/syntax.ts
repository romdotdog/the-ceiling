import { assert } from "./util.js";

// prettier-ignore
class StringScanner {
  constructor(private src: string, public p: number) {}

  private char(): string | undefined {
    return this.src[this.p];
  }

  private readHexDigits(n: number): string {
    let result = "";
    for (let i = 0; i < n; i++) {
      const ch = this.char();
      if (ch === undefined || !/[0-9a-fA-F]/.test(ch)) {
        throw new Error(`invalid hex escape at ${this.p}`);
      }
      result += ch;
      this.p += 1;
    }
    return result;
  }

  private readUnicodeEscape(): string {
    this.p += 1; // skip 'u'
    if (this.char() === "{") {
      this.p += 1; // skip {
      let hex = "";
      while (true) {
        const ch = this.char();
        if (ch === undefined) throw new Error("unterminated unicode escape");
        if (ch === "}") { this.p += 1; break; }
        if (!/[0-9a-fA-F]/.test(ch)) throw new Error(`invalid unicode at ${this.p}`);
        hex += ch;
        this.p += 1;
      }
      return String.fromCodePoint(parseInt(hex, 16));
    }
    return String.fromCharCode(parseInt(this.readHexDigits(4), 16));
  }

  private readHexEscape(): string {
    this.p += 1; // skip 'x'
    return String.fromCharCode(parseInt(this.readHexDigits(2), 16));
  }

  public scanString(): string {
    const quote = this.char();
    if (quote !== '"' && quote !== "'") {
      throw new Error(`expected string literal at ${this.p}`);
    }
    this.p += 1; // skip opening quote

    let value = "";
    while (true) {
      const ch = this.char();
      if (ch === undefined) throw new Error("unterminated string literal");
      if (ch === quote) { this.p += 1; break; }
      if (ch === "\\") {
        this.p += 1;
        const esc = this.char();
        if (esc === undefined) throw new Error("bad escape at <eof>");
        switch (esc) {
          case "n": value += "\n"; this.p += 1; break;
          case "r": value += "\r"; this.p += 1; break;
          case "t": value += "\t"; this.p += 1; break;
          case "\\": value += "\\"; this.p += 1; break;
          case "\"": value += "\""; this.p += 1; break;
          case "'": value += "'"; this.p += 1; break;
          case "u": value += this.readUnicodeEscape(); break;
          case "x": value += this.readHexEscape(); break;
          default: value += esc; this.p += 1; break;
        }
      } else {
        value += ch;
        this.p += 1;
      }
    }

    return value;
  }
}

export enum TokenKind {
  Equals,
  Colon,
  Semicolon,
  Number,
  String,
  Identifier,
  Const,
  Let,
}

type Token =
  | { kind: Exclude<TokenKind, TokenKind.Number | TokenKind.String>; start: number; end: number }
  | { kind: TokenKind.Number; start: number; end: number; value: number }
  | { kind: TokenKind.String; start: number; end: number; value: string };

export class Lexer {
  private p = 0;
  constructor(private src: string) {}

  private done() {
    return this.p >= this.src.length;
  }

  private char(): string | undefined {
    return this.src[this.p];
  }

  private skipWhitespace() {
    while (true) {
      switch (this.char()) {
        case " ":
        case "\t":
        case "\r":
        case "\n":
          this.p += 1;
          break;
        default:
          return;
      }
    }
  }

  private token(): Token | null {
    const start = this.p;
    switch (this.char()) {
      case "=":
        this.p += 1;
        return { kind: TokenKind.Equals, start, end: this.p };
      case ":":
        this.p += 1;
        return { kind: TokenKind.Colon, start, end: this.p };
      case ";":
        this.p += 1;
        return { kind: TokenKind.Semicolon, start, end: this.p };
      case "'":
      case '"': {
        const scanner = new StringScanner(this.src, this.p);
        const value = scanner.scanString();
        const end = scanner.p;
        this.p = end;
        return { kind: TokenKind.String, start, end, value };
      }
    }
    return null;
  }

  public *run(): Generator<Token, void, unknown> {
    while (true) {
      this.skipWhitespace();
      const maybeToken = this.token();
      if (maybeToken) {
        yield maybeToken;
        continue;
      }
      if (this.done()) break;

      // start taking an identifier
      const start = this.p;
      ident: while (true) {
        switch (this.char()) {
          case undefined:
          case " ":
          case "\t":
          case "\r":
          case "\n":
            yield this.processIdent(start, this.p);
            break ident;
          default: {
            const maybeEnd = this.p;
            const maybeToken = this.token();
            if (maybeToken) {
              yield this.processIdent(start, maybeEnd);
              yield maybeToken;
              break ident;
            }
            this.p += 1;
          }
        }
      }
    }
  }

  private processIdent(start: number, end: number): Token {
    const content = this.src.slice(start, end);
    switch (content) {
      case "let":
        return { kind: TokenKind.Let, start, end };
      case "const":
        return { kind: TokenKind.Const, start, end };
      case "NaN":
        return { kind: TokenKind.Number, start, end, value: NaN };
    }
    const float = Number(content);
    if (!isNaN(float)) {
      return { kind: TokenKind.Number, start, end, value: float };
    }
    return { kind: TokenKind.Identifier, start, end };
  }
}

class Parser {
  private lexer: Generator<Token, void, unknown>;
  private token: Token | null = null;
  constructor(lexer: Lexer) {
    this.lexer = lexer.run();
    this.next();
  }

  private next() {
    const { value, done } = this.lexer.next();
    if (done) {
      this.token = null;
    } else {
      assert(value !== undefined, "value should not be undefined");
      this.token = value;
    }
  }
}
