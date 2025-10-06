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
  // operators and punctuation
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

  // literals
  Number,
  String,
  Identifier,

  // keywords
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
  protected src: string;

  constructor(protected totalSrc: string, protected start = 0, end = totalSrc.length) {
    this.src = totalSrc.slice(start, end);
  }

  public getTotalSource() {
    return this.totalSrc;
  }

  public getRestrictedSource() {
    return this.src;
  }

  protected done() {
    return this.p >= this.src.length;
  }

  protected char(): string | undefined {
    return this.src[this.p];
  }

  protected spanned<T extends Omit<Token, "start" | "end">>(
    input: T,
    start: number,
    end: number
  ): T & { start: number; end: number } {
    const output = input as T & { start: number; end: number };
    output.start = start + this.start;
    output.end = end + this.start;
    return output;
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
        switch (this.char()) {
          case "=":
            this.p += 1;
            return this.spanned({ kind: TokenKind.EqualsEquals }, start, this.p);
          case ">":
            this.p += 1;
            return this.spanned({ kind: TokenKind.Arrow }, start, this.p);
        }
        return this.spanned({ kind: TokenKind.Equals }, start, this.p);
      case ":":
        this.p += 1;
        return this.spanned({ kind: TokenKind.Colon }, start, this.p);
      case ";":
        this.p += 1;
        return this.spanned({ kind: TokenKind.Semicolon }, start, this.p);
      case ",":
        this.p += 1;
        return this.spanned({ kind: TokenKind.Comma }, start, this.p);
      case ".":
        this.p += 1;
        return this.spanned({ kind: TokenKind.Dot }, start, this.p);
      case "(":
        this.p += 1;
        return this.spanned({ kind: TokenKind.LParen }, start, this.p);
      case ")":
        this.p += 1;
        return this.spanned({ kind: TokenKind.RParen }, start, this.p);
      case "{":
        this.p += 1;
        return this.spanned({ kind: TokenKind.LBrace }, start, this.p);
      case "}":
        this.p += 1;
        return this.spanned({ kind: TokenKind.RBrace }, start, this.p);
      case "[":
        this.p += 1;
        return this.spanned({ kind: TokenKind.LBracket }, start, this.p);
      case "]":
        this.p += 1;
        return this.spanned({ kind: TokenKind.RBracket }, start, this.p);
      case "<":
        this.p += 1;
        return this.spanned({ kind: TokenKind.LAngle }, start, this.p);
      case ">":
        this.p += 1;
        return this.spanned({ kind: TokenKind.RAngle }, start, this.p);
      case "'":
      case '"': {
        const scanner = new StringScanner(this.src, this.p);
        const value = scanner.scanString();
        const end = scanner.p;
        this.p = end;
        return this.spanned({ kind: TokenKind.String, value }, start, end);
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
        return this.spanned({ kind: TokenKind.Actor }, start, end);
      case "await":
        return this.spanned({ kind: TokenKind.Await }, start, end);
      case "command":
        return this.spanned({ kind: TokenKind.Command }, start, end);
      case "const":
        return this.spanned({ kind: TokenKind.Const }, start, end);
      case "else":
        return this.spanned({ kind: TokenKind.Else }, start, end);
      case "function":
        return this.spanned({ kind: TokenKind.Function }, start, end);
      case "handle":
        return this.spanned({ kind: TokenKind.Handle }, start, end);
      case "if":
        return this.spanned({ kind: TokenKind.If }, start, end);
      case "let":
        return this.spanned({ kind: TokenKind.Let }, start, end);
      case "query":
        return this.spanned({ kind: TokenKind.Query }, start, end);
      case "read":
        return this.spanned({ kind: TokenKind.Read }, start, end);
      case "return":
        return this.spanned({ kind: TokenKind.Return }, start, end);
      case "struct":
        return this.spanned({ kind: TokenKind.Struct }, start, end);
      case "this":
        return this.spanned({ kind: TokenKind.This }, start, end);
      case "unique":
        return this.spanned({ kind: TokenKind.Unique }, start, end);
      case "NaN":
        return this.spanned({ kind: TokenKind.Number, value: NaN }, start, end);
    }
    const float = Number(content);
    if (!isNaN(float)) {
      return this.spanned({ kind: TokenKind.Number, value: float }, start, end);
    }
    return this.spanned({ kind: TokenKind.Identifier }, start, end);
  }
}

// TODO: graph search / generalized scanner?
// TODO: option to cache tokens?
// TODO: support for named parameters? e.g. struct Example { a: number, b: number } { /* ... */ }
export class IslandScanner {
  protected tokens: Generator<Token, void, unknown>;

  constructor(protected src: string) {
    const lexer = new Lexer(this.src);
    this.tokens = lexer.run();
  }

  public scan(): string[] {
    const islands: string[] = [];

    for (const token of this.tokens) {
      if (this.isIslandStart(token.kind)) {
        const start = token.start;

        try {
          this.findNextTopLevelBrace();
          const end = this.findMatchingBrace();

          islands.push(this.src.slice(start, end));
        } catch (e) {
          // malformed island - skip it
          continue;
        }
      }
    }

    return islands;
  }

  protected isIslandStart(kind: TokenKind): boolean {
    return (
      kind === TokenKind.Actor ||
      kind === TokenKind.Struct ||
      kind === TokenKind.Function ||
      kind === TokenKind.Query ||
      kind === TokenKind.Command
    );
  }

  protected findNextTopLevelBrace(): number {
    let depth = { paren: 0, angle: 0 };

    while (true) {
      const result = this.tokens.next();
      if (result.done) throw new Error("expected body brace");
      const tok = result.value;

      // track nesting depths
      if (tok.kind === TokenKind.LParen) depth.paren++;
      if (tok.kind === TokenKind.RParen) depth.paren--;
      if (tok.kind === TokenKind.LAngle) depth.angle++;
      if (tok.kind === TokenKind.RAngle) depth.angle--;

      // top-level brace (not in params/generics)
      if (tok.kind === TokenKind.LBrace && depth.paren === 0 && depth.angle === 0) {
        return tok.start;
      }
    }
  }

  protected findMatchingBrace(): number {
    let braceDepth = 1; // already consumed the opening {

    while (true) {
      const result = this.tokens.next();
      if (result.done) throw new Error("unmatched brace");
      const tok = result.value;

      if (this.isIslandStart(tok.kind)) {
        return tok.start;
      }

      if (tok.kind === TokenKind.LBrace) braceDepth++;
      if (tok.kind === TokenKind.RBrace) {
        braceDepth--;
        if (braceDepth === 0) return tok.end;
      }
    }
  }
}

// --- AST ---

export enum UnaryOp {
  Minus,
}

export enum BinaryOp {
  Plus,
  Minus,
  Multiply,
  Divide,
  Equals,
  NotEquals,
  And,
  Or,
}

export enum ASTSort {
  Decl,
  Expr,
  Stmt,
  TypeExpr,
}

export enum ASTKind {
  // expressions
  Unary,
  Binary,
  Identifier,
  Number,
  String,
  Call,

  // statements
  Let,
  Const,
  Return,
  ExprStmt,

  // types
  HandleType,

  // declarations
  FunctionDecl,

  // other
  Error,
}

type Identifier = { kind: ASTKind.Identifier; name: string; span: Span };
type ASTError = { kind: ASTKind.Error; diagnostic: Diagnostic };

function isError(node: Object): node is TypeExpr {
  return "kind" in node && node.kind === ASTKind.Error;
}

export type Expr =
  | { kind: ASTKind.Unary; op: UnaryOp; right: Expr; span: Span }
  | { kind: ASTKind.Binary; left: Expr; op: BinaryOp; right: Expr; span: Span }
  | Identifier
  | { kind: ASTKind.Number; value: number; span: Span }
  | { kind: ASTKind.Call; callee: Expr; args: Expr[]; span: Span }
  | ASTError;

function isExpr(node: { kind: ASTKind }): node is Expr {
  switch (node.kind) {
    case ASTKind.Unary:
    case ASTKind.Binary:
    case ASTKind.Identifier:
    case ASTKind.Number:
    case ASTKind.Call:
      return true;
  }
  return false;
}

export type Stmt =
  | { kind: ASTKind.Let; binding: Binding; init: Expr; span: Span }
  | { kind: ASTKind.Const; binding: Binding; init: Expr; span: Span }
  | { kind: ASTKind.Return; value?: Expr; span: Span }
  | { kind: ASTKind.ExprStmt; expr: Expr; span: Span }
  | ASTError;

function isStmt(node: { kind: ASTKind }): node is Stmt {
  switch (node.kind) {
    case ASTKind.Let:
    case ASTKind.Const:
    case ASTKind.Return:
    case ASTKind.ExprStmt:
      return true;
  }
  return false;
}
export type TypeExpr =
  | Identifier
  | { kind: ASTKind.HandleType; lifetimes: Identifier[]; inner: TypeExpr; span: Span }
  | ASTError;

function isTypeExpr(node: { kind: ASTKind }): node is TypeExpr {
  switch (node.kind) {
    case ASTKind.Identifier:
    case ASTKind.HandleType:
      return true;
  }
  return false;
}

export type Binding =
  | {
      name: Identifier | ASTError;
      type?: TypeExpr;
      span: Span;
    }
  | ASTError;

export type FunctionDecl = {
  kind: ASTKind.FunctionDecl;
  name: Identifier | ASTError;
  params: Binding[];
  returnType?: TypeExpr;
  body: Stmt[] | ASTError;
  span: Span;
};

export type Decl = FunctionDecl;

// -----------

class ParserBase {
  public allDiags: Diagnostic[] = [];
  protected token: Token | null = null;
  protected src: string;
  protected endOfSrc: number;

  constructor(public diag: Diagnostics, protected tokens: Generator<Token, void, unknown>) {
    this.src = diag.getSource();
    this.endOfSrc = this.src.length;
    this.next();
  }

  protected next() {
    const { value, done } = this.tokens.next();
    if (done) {
      this.token = null;
    } else {
      assert(value !== undefined, "value should not be undefined");
      this.token = value;
    }
  }

  protected eofSpan(): Span {
    return { start: this.endOfSrc, end: this.endOfSrc };
  }

  protected get span(): Span {
    if (this.token) return this.token;
    return this.eofSpan();
  }

  protected consume(kind: TokenKind): boolean {
    if (this.token?.kind === kind) {
      this.next();
      return true;
    }
    return false;
  }

  protected consumeIdentifier(kind: TokenKind): Identifier | null {
    if (this.token?.kind === kind) {
      let span = this.token;
      this.next();
      return { kind: ASTKind.Identifier, name: this.src.slice(span.start, span.end), span };
    }
    return null;
  }

  protected expect(kind: TokenKind, forMsg: string): Token | ASTError {
    if (this.token) {
      if (this.token.kind === kind) {
        let token = this.token;
        this.next();
        return token;
      }
      return this.error(this.span, `expected ${TokenKind[kind]} for ${forMsg}, got ${TokenKind[this.token.kind]}`);
    } else {
      return this.error(this.span, `expected ${TokenKind[kind]} for ${forMsg}, got <eof>`);
    }
  }

  protected expectIdentifier(): Identifier | ASTError {
    if (this.token) {
      if (this.token.kind === TokenKind.Identifier) {
        let span = this.token;
        this.next();
        return { kind: ASTKind.Identifier, name: this.src.slice(span.start, span.end), span };
      }
      return this.error(this.span, `expected identifier, got ${TokenKind[this.token.kind]}`);
    } else {
      return this.error(this.span, `expected identifier, got <eof>`);
    }
  }

  protected recoverySet: Set<TokenKind> = new Set();
  protected inRecovery = false;

  protected error(span: Span, message: string): ASTError {
    const diagnostic: Diagnostic = {
      range: this.diag.getRange(span),
      severity: Severity.Error,
      message,
      source: "the-ceiling",
    };
    this.allDiags.push(diagnostic);
    this.recover();
    return { kind: ASTKind.Error, diagnostic };
  }

  protected recover() {
    this.inRecovery = true;
    while (this.token && !this.recoverySet.has(this.token.kind)) {
      this.next();
    }
  }

  protected recovery<T extends Object>(supported: TokenKind[], f: () => T | ASTError): T | ASTError {
    const toRemove = supported.filter(k => !this.recoverySet.has(k));
    for (const k of toRemove) {
      this.recoverySet.add(k);
    }

    const out = f();

    for (const k of toRemove) {
      this.recoverySet.delete(k);
    }

    if (this.inRecoveryFor(out)) {
      if (this.token && supported.includes(this.token.kind)) {
        // can recover from here
        this.inRecovery = false;
        return out;
      } else {
        return out;
      }
    }

    return out;
  }

  protected get startOfSpan(): number {
    return this.token ? this.token.start : this.endOfSrc;
  }

  protected getSpanSince(start: number): Span {
    return { start, end: this.startOfSpan };
  }

  protected inRecoveryFor(node: Object): node is ASTError {
    if (!this.inRecovery) return false;
    assert(isError(node), "inRecoveryFor must be called with error");
    return true;
  }
}

class Parser extends ParserBase {
  protected parseBinding(): Binding {
    const start = this.startOfSpan;

    let name = this.recovery([TokenKind.Colon], () => this.expectIdentifier());
    if (this.inRecoveryFor(name)) return name; // not recovering from colon

    if (this.consume(TokenKind.Colon)) {
      const type = this.parseTypeExpr();
      return { name, type, span: this.getSpanSince(start) };
    }

    return { name, span: this.getSpanSince(start) };
  }

  protected parseLocal(isConst: boolean): Stmt {
    const start = this.startOfSpan;
    this.next(); // skip let or const

    const binding = this.recovery([TokenKind.Equals], () => this.parseBinding());
    if (this.inRecoveryFor(binding)) return binding;

    const equals = this.expect(TokenKind.Equals, "let/const binding");
    if (isError(equals)) return equals;

    const init = this.parseExpr();
    return { kind: isConst ? ASTKind.Const : ASTKind.Let, binding, init, span: this.getSpanSince(start) };
  }

  protected parseReturn(): Stmt {
    const start = this.startOfSpan;
    this.next(); // skip return

    const value = this.parseExpr();
    return { kind: ASTKind.Return, value, span: this.getSpanSince(start) };
  }

  protected parseTypeExpr(): TypeExpr {}

  protected parseExpr(): Expr {}

  protected parseStmt(): Stmt {}

  protected parseBlock(): Stmt[] | ASTError {
    const start = this.startOfSpan;
    this.next(); // skip left brace

    const result: Stmt[] = [];
    do {
      const stmt = this.recovery([TokenKind.Comma, TokenKind.RBrace], () => this.parseStmt());
      if (this.inRecoveryFor(stmt)) return stmt;
      result.push(stmt);
    } while (this.consume(TokenKind.Comma));

    this.expect(TokenKind.RBrace, "to terminate block"); // example of error not located in AST
    return result;
  }

  protected parseFunction() {
    const start = this.startOfSpan;
    this.next(); // skip function

    let name = this.recovery([TokenKind.LParen, TokenKind.Colon, TokenKind.LBrace], () => this.expectIdentifier());
    if (this.inRecoveryFor(name)) return name; // not recovering

    let lparen = this.recovery([TokenKind.Colon, TokenKind.LBrace], () =>
      this.expect(TokenKind.LParen, "function parameters")
    );
    if (this.inRecoveryFor(lparen)) return lparen;

    const params: Binding[] = [];
    if (!this.consume(TokenKind.RParen)) {
      do {
        let binding = this.recovery([TokenKind.Comma, TokenKind.RParen, TokenKind.Colon, TokenKind.LBrace], () =>
          this.parseBinding()
        );
        if (this.inRecoveryFor(binding)) return binding;
        params.push(binding);
      } while (this.consume(TokenKind.Comma));

      const rparen = this.recovery([TokenKind.Colon, TokenKind.LBrace], () =>
        this.expect(TokenKind.RParen, "closing function parameters")
      );
      if (this.inRecoveryFor(rparen)) return rparen;
    }

    let returnType = undefined;
    if (this.consume(TokenKind.Colon)) {
      returnType = this.recovery([TokenKind.LBrace], () => this.parseTypeExpr());
      if (this.inRecoveryFor(returnType)) return returnType;
    }

    const body = this.parseBlock();
    return { kind: ASTKind.FunctionDecl, name, params, returnType, body, span: this.getSpanSince(start) };
  }

  protected parseNode(): Expr | Stmt | TypeExpr {
    let isConst = false;
    switch (this.token?.kind) {
      case TokenKind.Const:
        isConst = true;
      case TokenKind.Let:
        return this.parseLocal(isConst);
      case TokenKind.Return:
        return this.parseReturn();
      case TokenKind.Function:
    }
  }
}
