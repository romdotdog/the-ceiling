export enum Severity {
  Error = 1,
  Warning,
  Information,
  Hint,
}

export interface Span {
  start: number;
  end: number;
}

export interface Range {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

export interface Diagnostic {
  range: Range;
  severity: Severity;
  message: string;
  source: "the-ceiling";
}

// color codes
const red = "\x1b[31m";
const blue = "\x1b[34m";
const bold = "\x1b[1m";
const reset = "\x1b[0m";

export class LineCol {
  protected lineStarts = [0];
  constructor(protected src: string) {
    for (let i = 0; i < src.length; i++) {
      if (src[i] === "\n") {
        this.lineStarts.push(i + 1);
      }
    }
  }

  public lookup(offset: number) {
    let left = 0;
    let right = this.lineStarts.length - 1;

    while (left < right) {
      const mid = Math.floor((left + right + 1) / 2);
      if (this.lineStarts[mid] <= offset) {
        left = mid;
      } else {
        right = mid - 1;
      }
    }

    return { line: left, character: offset - this.lineStarts[left] };
  }

  public getLine(i: number) {
    const nextLineStart = i >= this.lineStarts.length ? this.src.length : this.lineStarts[i + 1];
    return this.src.slice(this.lineStarts[i], nextLineStart);
  }
}

export class Diagnostics extends LineCol {
  constructor(private uri: string, protected src: string) {
    super(src);
  }

  public getRange(span: Span): Range {
    return {
      start: this.lookup(span.start),
      end: this.lookup(span.end),
    };
  }

  public formatDiagnostic(diag: Diagnostic): string {
    const { line, character: col } = diag.range.start;
    const errorLine = this.getLine(line);

    // figure out how many digits we need for line numbers
    const lineNumWidth = (line + 2).toString().length;
    const pad = " ".repeat(lineNumWidth);

    let output = "";

    // error header with location
    output += `${bold}${red}error${reset}${bold}: ${diag.message}${reset}\n`;
    output += `${blue}${pad}--> ${this.uri}:${line + 1}:${col + 1}${reset}\n`;
    output += `${blue}${pad} |${reset}\n`;

    // show previous line for context if available
    if (line > 0) {
      output += `${blue}${line.toString().padStart(lineNumWidth)} |${reset} ${this.getLine(line - 1)}\n`;
    }

    // show error line
    output += `${blue}${(line + 1).toString().padStart(lineNumWidth)} |${reset} ${errorLine}\n`;

    // show squiggly underline
    const indent = col;
    const underlineLength =
      diag.range.start.line === diag.range.end.line
        ? Math.max(1, diag.range.end.character - diag.range.start.character)
        : errorLine.length - col; // for multi-line errors, underline to end of first line
    output += `${blue}${pad} |${reset} ${" ".repeat(indent)}${red}${"^".repeat(underlineLength)}${reset}\n`;

    // show next line for context if available
    if (line + 1 < this.lineStarts.length) {
      output += `${blue}${(line + 2).toString().padStart(lineNumWidth)} |${reset} ${this.getLine(line + 1)}\n`;
    }

    output += `${blue}${pad} |${reset}\n`;

    return output;
  }
}
