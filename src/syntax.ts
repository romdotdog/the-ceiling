import { Diagnostic, Diagnostics, Severity, Span } from "./diagnostics.js";
import { assert } from "./util.js";

// prettier-ignore
class StringScanner {
  constructor(protected src: string, public p: number) {}

  protected char(): string | undefined {
    return this.src[this.p];
  }

  protected readHexDigits(n: number): string {
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

  protected readUnicodeEscape(): string {
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

  protected readHexEscape(): string {
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
  // Operators & Punctuation
  Equals,
  EqualsEquals,
  Colon,
  Semicolon,
  Comma,
  Dot,
  LParen,
  RParen,
  LBrace,
  RBrace,
  LBracket,
  RBracket,
  LAngle,
  RAngle,
  Arrow,

  // Literals
  Number,
  String,
  Identifier,

  // Keywords
  Actor,
  Await,
  Command,
  Const,
  Function,
  Handle,
  If,
  Else,
  Let,
  Query,
  Read,
  Return,
  Struct,
  This,
  Unique,
}

type Token =
  | { kind: Exclude<TokenKind, TokenKind.Number | TokenKind.String>; start: number; end: number }
  | { kind: TokenKind.Number; start: number; end: number; value: number }
  | { kind: TokenKind.String; start: number; end: number; value: string };

export class Lexer {
  protected p = 0;
  constructor(protected src: string) {}

  public getSource() {
    return this.src;
  }

  protected done() {
    return this.p >= this.src.length;
  }

  protected char(): string | undefined {
    return this.src[this.p];
  }

  protected skipWhitespace() {
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

  protected token(): Token | null {
    const start = this.p;
    switch (this.char()) {
      case "=":
        this.p += 1;
        if (this.char() === "=") {
          this.p += 1;
          return { kind: TokenKind.EqualsEquals, start, end: this.p };
        }
        if (this.char() === ">") {
          this.p += 1;
          return { kind: TokenKind.Arrow, start, end: this.p };
        }
        return { kind: TokenKind.Equals, start, end: this.p };
      case ":":
        this.p += 1;
        return { kind: TokenKind.Colon, start, end: this.p };
      case ";":
        this.p += 1;
        return { kind: TokenKind.Semicolon, start, end: this.p };
      case ",":
        this.p += 1;
        return { kind: TokenKind.Comma, start, end: this.p };
      case ".":
        this.p += 1;
        return { kind: TokenKind.Dot, start, end: this.p };
      case "(":
        this.p += 1;
        return { kind: TokenKind.LParen, start, end: this.p };
      case ")":
        this.p += 1;
        return { kind: TokenKind.RParen, start, end: this.p };
      case "{":
        this.p += 1;
        return { kind: TokenKind.LBrace, start, end: this.p };
      case "}":
        this.p += 1;
        return { kind: TokenKind.RBrace, start, end: this.p };
      case "[":
        this.p += 1;
        return { kind: TokenKind.LBracket, start, end: this.p };
      case "]":
        this.p += 1;
        return { kind: TokenKind.RBracket, start, end: this.p };
      case "<":
        this.p += 1;
        return { kind: TokenKind.LAngle, start, end: this.p };
      case ">":
        this.p += 1;
        return { kind: TokenKind.RAngle, start, end: this.p };
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

  protected processIdent(start: number, end: number): Token {
    const content = this.src.slice(start, end);
    switch (content) {
      case "actor":
        return { kind: TokenKind.Actor, start, end };
      case "await":
        return { kind: TokenKind.Await, start, end };
      case "command":
        return { kind: TokenKind.Command, start, end };
      case "const":
        return { kind: TokenKind.Const, start, end };
      case "else":
        return { kind: TokenKind.Else, start, end };
      case "function":
        return { kind: TokenKind.Function, start, end };
      case "handle":
        return { kind: TokenKind.Handle, start, end };
      case "if":
        return { kind: TokenKind.If, start, end };
      case "let":
        return { kind: TokenKind.Let, start, end };
      case "query":
        return { kind: TokenKind.Query, start, end };
      case "read":
        return { kind: TokenKind.Read, start, end };
      case "return":
        return { kind: TokenKind.Return, start, end };
      case "struct":
        return { kind: TokenKind.Struct, start, end };
      case "this":
        return { kind: TokenKind.This, start, end };
      case "unique":
        return { kind: TokenKind.Unique, start, end };
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

class ParserBase {
  public diagutil: Diagnostics;
  public diag: Diagnostic[] = [];
  protected lexer: Generator<Token, void, unknown>;
  protected token: Token | null = null;

  constructor(protected uri: string, lexer: Lexer) {
    this.diagutil = new Diagnostics(uri, lexer.getSource());
    this.lexer = lexer.run();
    this.next();
  }

  protected expect(kind: TokenKind): Token {
    const tok = this.token;
    if (tok === null || tok.kind !== kind) {
      throw new Error(`expected ${TokenKind[kind]}, got ${tok ? TokenKind[tok.kind] : "<eof>"}`);
    }
    this.next();
    return tok;
  }

  protected consume(kind: TokenKind): boolean {
    if (this.token?.kind === kind) {
      this.next();
      return true;
    }
    return false;
  }

  protected error(message: string, span: Span): void {
    this.diag.push({
      range: this.diagutil.getRange(span),
      severity: Severity.Error,
      message,
      source: "the-ceiling",
    });
  }

  protected next() {
    const { value, done } = this.lexer.next();
    if (done) {
      this.token = null;
    } else {
      assert(value !== undefined, "value should not be undefined");
      this.token = value;
    }
  }
}

class Parser extends ParserBase {}
