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
  NotEquals,
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
  Plus,
  Minus,
  Star,
  Slash,
  AmpAmp,
  PipePipe,
  Exclaim,

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
      case "!":
        this.p += 1;
        if (this.char() === "=") {
          this.p += 1;
          return this.spanned({ kind: TokenKind.NotEquals }, start, this.p);
        }
        return this.spanned({ kind: TokenKind.Exclaim }, start, this.p);
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
      case "+":
        this.p += 1;
        return this.spanned({ kind: TokenKind.Plus }, start, this.p);
      case "-":
        this.p += 1;
        return this.spanned({ kind: TokenKind.Minus }, start, this.p);
      case "*":
        this.p += 1;
        return this.spanned({ kind: TokenKind.Star }, start, this.p);
      case "/":
        this.p += 1;
        return this.spanned({ kind: TokenKind.Slash }, start, this.p);
      case "&": // FIXME
        this.p += 1;
        if (this.char() === "&") {
          this.p += 1;
          return this.spanned({ kind: TokenKind.AmpAmp }, start, this.p);
        }
        return null;
      case "|":
        this.p += 1;
        if (this.char() === "|") {
          this.p += 1;
          return this.spanned({ kind: TokenKind.PipePipe }, start, this.p);
        }
        return null;
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
      let isNumberSoFar = true;
      const start = this.p;
      ident: while (true) {
        const c = this.char();
        switch (c) {
          case undefined:
          case " ":
          case "\t":
          case "\r":
          case "\n":
            yield this.processIdent(start, this.p);
            break ident;
          case ".":
            if (isNumberSoFar) {
              // check if the next character is a digit, e.g. 3.1
              const nextChar = this.src[this.p + 1];
              if (nextChar && isNumber(nextChar)) {
                // continue, just a decimal point
                this.p += 1;
                break;
              }
              // not a decimal point, treat as separator, e.g. 2.square()
              // fall through to yield the dot separately
            }

            // terminate and yield a dot
            yield this.processIdent(start, this.p);
            yield this.spanned({ kind: TokenKind.Dot }, this.p, ++this.p);
            break ident;
          default: {
            if (!isNumber(c)) {
              isNumberSoFar = false;
            }
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

    function isNumber(c: string) {
      return c >= "0" && c <= "9";
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
  NumberLiteral,
  StringLiteral,
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
type ASTError = { kind: ASTKind.Error; diagnostic: Diagnostic; span: Span };

function isError(node: Object): node is ASTError {
  return "kind" in node && node.kind === ASTKind.Error;
}

export type Expr =
  | { kind: ASTKind.Unary; op: UnaryOp; right: Expr; span: Span }
  | { kind: ASTKind.Binary; left: Expr; op: BinaryOp; right: Expr; span: Span }
  | Identifier
  | { kind: ASTKind.NumberLiteral; value: number; span: Span }
  | { kind: ASTKind.StringLiteral; value: string; span: Span }
  | { kind: ASTKind.Call; callee: Expr; args: Expr[]; span: Span }
  | ASTError;

function isExpr(node: { kind: ASTKind }): node is Expr {
  switch (node.kind) {
    case ASTKind.Unary:
    case ASTKind.Binary:
    case ASTKind.Identifier:
    case ASTKind.NumberLiteral:
    case ASTKind.StringLiteral:
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
  | { kind: ASTKind.HandleType; unique: boolean; lifetimes: Identifier[]; inner: TypeExpr; span: Span }
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

export type Decl = FunctionDecl | ASTError;

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
      return this.error(this.span, `expected ${TokenKind[kind]} ${forMsg}, got ${TokenKind[this.token.kind]}`);
    } else {
      return this.error(this.span, `expected ${TokenKind[kind]} ${forMsg}, got <eof>`);
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
    const fullRecoverySpan = this.recover();
    return { kind: ASTKind.Error, diagnostic, span: fullRecoverySpan };
  }

  protected recover(): Span {
    let start = this.startOfSpan;
    this.inRecovery = true;
    let end = this.endOfSpan;
    while (this.token && !this.recoverySet.has(this.token.kind)) {
      end = this.endOfSpan;
      this.next();
    }
    return { start, end };
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

  protected get endOfSpan(): number {
    return this.token ? this.token.end : this.endOfSrc;
  }

  protected backwardExtendSpan(start: number, span: Span): Span {
    return { start, end: span.end };
  }

  protected backwardExtendNodeSpan(start: number, toNode: { span: Span }): Span {
    return this.backwardExtendSpan(start, toNode.span);
  }

  protected inRecoveryFor(node: Object): node is ASTError {
    if (!this.inRecovery) return false;
    assert(isError(node), "inRecoveryFor must be called with error");
    return true;
  }
}

export class Parser extends ParserBase {
  protected parseBinding(): Binding {
    const start = this.startOfSpan;

    let name = this.recovery([TokenKind.Colon], () => this.expectIdentifier());
    if (this.inRecoveryFor(name)) return name; // not recovering from colon

    if (this.consume(TokenKind.Colon)) {
      const type = this.parseTypeExpr();
      return { name, type, span: this.backwardExtendNodeSpan(start, type) };
    }

    return { name, span: this.backwardExtendNodeSpan(start, name) };
  }

  protected parseLocal(isConst: boolean): Stmt {
    const start = this.startOfSpan;
    this.next(); // skip let or const

    const binding = this.recovery([TokenKind.Equals], () => this.parseBinding());
    if (this.inRecoveryFor(binding)) return binding;

    const equals = this.expect(TokenKind.Equals, "for let/const binding");
    if (isError(equals)) return equals;

    const init = this.parseExpr();
    return {
      kind: isConst ? ASTKind.Const : ASTKind.Let,
      binding,
      init,
      span: this.backwardExtendNodeSpan(start, init),
    };
  }

  protected parseReturn(): Stmt {
    const start = this.startOfSpan;
    this.next(); // skip return

    const value = this.parseExpr();
    return { kind: ASTKind.Return, value, span: this.backwardExtendNodeSpan(start, value) };
  }

  protected parseBlock(): { stmts: Stmt[]; span: Span } | ASTError {
    const start = this.startOfSpan;
    this.next(); // skip left brace

    const stmts: Stmt[] = [];
    do {
      const stmt = this.recovery([TokenKind.Semicolon, TokenKind.RBrace], () => this.parseStmt());
      if (this.inRecoveryFor(stmt)) return stmt;
      stmts.push(stmt);

      this.expect(TokenKind.Semicolon, "to close the statement");
      this.inRecovery = false; // no need to recover from semicolon
    } while (this.token && this.token.kind !== TokenKind.RBrace);

    const end = this.endOfSpan;
    this.expect(TokenKind.RBrace, "to terminate block");
    this.inRecovery = false;
    return { stmts, span: { start, end } };
  }

  protected parseFunction(): FunctionDecl | ASTError {
    const start = this.startOfSpan;
    this.next(); // skip function

    let name = this.recovery([TokenKind.LParen, TokenKind.Colon, TokenKind.LBrace], () => this.expectIdentifier());
    if (this.inRecoveryFor(name)) return name; // not recovering

    let lparen = this.recovery([TokenKind.Colon, TokenKind.LBrace], () =>
      this.expect(TokenKind.LParen, "for function parameters")
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
        this.expect(TokenKind.RParen, "to close function parameters")
      );
      if (this.inRecoveryFor(rparen)) return rparen;
    }

    let returnType = undefined;
    if (this.consume(TokenKind.Colon)) {
      returnType = this.recovery([TokenKind.LBrace], () => this.parseTypeExpr());
      if (this.inRecoveryFor(returnType)) return returnType;
    }

    const block = this.parseBlock();
    if (isError(block)) return block;

    return {
      kind: ASTKind.FunctionDecl,
      name,
      params,
      returnType,
      body: block.stmts,
      span: this.backwardExtendNodeSpan(start, block),
    };
  }

  protected parseTypeExpr(): TypeExpr {
    const start = this.startOfSpan;

    if (!this.token) {
      return this.error(this.span, "expected type expression, got <eof>");
    }

    let unique = false;
    switch (this.token.kind) {
      case TokenKind.Unique:
        unique = true;
      case TokenKind.Handle: {
        this.next(); // consume `unique` or `handle`
        if (unique) {
          this.expect(TokenKind.Handle, "after unique"); // consume `handle`
          this.inRecovery = false; // we're probably okay if we insert synthetic here
        }

        const lifetimes: Identifier[] = [];

        // parse lifetime list <a, b, c>
        if (this.consume(TokenKind.LAngle)) {
          do {
            const lifetime = this.expectIdentifier();
            if (isError(lifetime)) return lifetime;
            lifetimes.push(lifetime);
          } while (this.consume(TokenKind.Comma));

          const rangle = this.expect(TokenKind.RAngle, "to close lifetime list");
          if (isError(rangle)) return rangle;
        }

        const inner = this.parseTypeExpr();
        return { kind: ASTKind.HandleType, unique, lifetimes, inner, span: this.backwardExtendNodeSpan(start, inner) };
      }

      case TokenKind.Identifier:
        return this.expectIdentifier();

      default:
        return this.error(this.span, `expected type expression, got ${TokenKind[this.token.kind]}`);
    }
  }

  protected parseExpr(minPrecedence = 0): Expr {
    const start = this.startOfSpan;
    let left = this.parsePrimaryExpr();

    // prec climber
    while (this.token) {
      const op = this.getBinaryOp(this.token.kind);
      if (op === null) break;

      const precedence = this.getBinaryPrecedence(op);
      if (precedence < minPrecedence) break;

      this.next(); // consume operator
      const right = this.parseExpr(precedence + 1);
      left = { kind: ASTKind.Binary, left, op, right, span: this.backwardExtendNodeSpan(start, right) };
    }

    return left;
  }

  protected parsePrimaryExpr(): Expr {
    const start = this.startOfSpan;

    if (this.token === null) {
      return this.error(this.span, `expected expression, got <eof>`);
    }
    switch (this.token.kind) {
      case TokenKind.Minus: {
        this.next();
        const right = this.parsePrimaryExpr();
        return { kind: ASTKind.Unary, op: UnaryOp.Minus, right, span: this.backwardExtendNodeSpan(start, right) };
      }
      case TokenKind.Number: {
        const value = this.token.value;
        const span = this.token;
        this.next();
        return { kind: ASTKind.NumberLiteral, value, span };
      }
      case TokenKind.String: {
        const value = this.token.value;
        const span = this.token;
        this.next();
        return { kind: ASTKind.StringLiteral, value, span };
      }
      case TokenKind.LParen: {
        this.next();
        const expr = this.parseExpr();
        this.expect(TokenKind.RParen, "to close parenthesized expression");
        return expr;
      }
      case TokenKind.Identifier: {
        const name = this.src.slice(this.token.start, this.token.end);
        const identSpan = this.token;
        this.next();
        return this.parsePostfixExpr({ kind: ASTKind.Identifier, name, span: identSpan }, start);
      }
      case TokenKind.This: {
        const span = this.token;
        this.next();
        return { kind: ASTKind.Identifier, name: "this", span };
      }
    }

    return this.error(this.span, `expected expression, got ${TokenKind[this.token.kind]}`);
  }

  protected parsePostfixExpr(expr: Expr, start: number): Expr {
    while (this.token) {
      if (this.token.kind === TokenKind.LParen) {
        this.next();
        const args: Expr[] = [];

        let end = this.endOfSpan;
        if (!this.consume(TokenKind.RParen)) {
          do {
            args.push(this.parseExpr());
          } while (this.consume(TokenKind.Comma));

          end = this.endOfSpan;
          this.expect(TokenKind.RParen, "to close function call");
        }

        expr = { kind: ASTKind.Call, callee: expr, args, span: { start, end } };
      } else if (this.token.kind === TokenKind.Dot) {
        this.next();
        const memberIdent = this.expectIdentifier();
        if (isError(memberIdent)) return memberIdent;

        // method call sugar, ufcs, whatever
        const currentToken = this.token;
        if (currentToken && currentToken.kind === TokenKind.LParen) {
          this.next();
          const args: Expr[] = [];

          let end = this.endOfSpan;
          if (!this.consume(TokenKind.RParen)) {
            do {
              args.push(this.parseExpr());
            } while (this.consume(TokenKind.Comma));

            end = this.endOfSpan;
            this.expect(TokenKind.RParen, "to close method call");
          }

          expr = {
            kind: ASTKind.Call,
            callee: memberIdent,
            args: [expr, ...args],
            span: { start, end },
          };
        } else {
          // member access
          return this.error(this.span, "member access not yet implemented");
        }
      } else {
        break;
      }
    }

    return expr;
  }

  protected getBinaryOp(kind: TokenKind): BinaryOp | null {
    switch (kind) {
      case TokenKind.Plus:
        return BinaryOp.Plus;
      case TokenKind.Minus:
        return BinaryOp.Minus;
      case TokenKind.Star:
        return BinaryOp.Multiply;
      case TokenKind.Slash:
        return BinaryOp.Divide;
      case TokenKind.EqualsEquals:
        return BinaryOp.Equals;
      case TokenKind.NotEquals:
        return BinaryOp.NotEquals;
      case TokenKind.AmpAmp:
        return BinaryOp.And;
      case TokenKind.PipePipe:
        return BinaryOp.Or;
    }
    return null;
  }

  protected getBinaryPrecedence(op: BinaryOp): number {
    switch (op) {
      case BinaryOp.Or:
        return 1;
      case BinaryOp.And:
        return 2;
      case BinaryOp.Equals:
      case BinaryOp.NotEquals:
        return 3;
      case BinaryOp.Plus:
      case BinaryOp.Minus:
        return 4;
      case BinaryOp.Multiply:
      case BinaryOp.Divide:
        return 5;
    }
  }

  protected parseStmt(): Stmt {
    if (this.token === null) {
      return this.error(this.span, `expected statement, got <eof>`);
    }
    let isConst = false;
    switch (this.token.kind) {
      case TokenKind.Const:
        isConst = true;
      case TokenKind.Let:
        return this.parseLocal(isConst);
      case TokenKind.Return:
        return this.parseReturn();
    }

    const start = this.startOfSpan;
    const expr = this.parseExpr();
    return { kind: ASTKind.ExprStmt, expr, span: this.backwardExtendNodeSpan(start, expr) };
  }

  public parseDeclaration(): Decl {
    if (this.token === null) {
      return this.error(this.span, `expected declaration, got <eof>`);
    }
    switch (this.token.kind) {
      case TokenKind.Function:
        return this.parseFunction();
    }
    return this.error(this.span, `expected declaration, got ${TokenKind[this.token.kind]}`);
  }
}
