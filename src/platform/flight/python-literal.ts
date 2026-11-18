/**
 * VariFlight's MCP answers with text such as `Flight prices: {'code': 200, 'data': [...]}`: a
 * Python dict printed with repr, not JSON (probe 2026-11-18). This reads that literal, and nothing
 * more: dicts, lists, tuples, quoted strings, numbers, True, False and None. Anything else is an
 * error, never evaluated.
 */
export function parsePythonLiteral(source: string): unknown {
  let at = 0;

  const fail = (what: string): never => {
    throw new SyntaxError(`Python literal: ${what} at ${at}`);
  };
  const space = () => {
    while (at < source.length && /\s/u.test(source[at])) at += 1;
  };
  const expect = (char: string) => {
    space();
    if (source[at] !== char) fail(`expected ${char}`);
    at += 1;
  };

  function string(): string {
    const quote = source[at];
    at += 1;
    let out = "";
    while (at < source.length && source[at] !== quote) {
      const char = source[at];
      if (char !== "\\") {
        out += char;
        at += 1;
        continue;
      }
      const next = source[at + 1];
      const simple: Record<string, string> = { "\\": "\\", "'": "'", '"': '"', n: "\n", t: "\t", r: "\r", "0": "\0" };
      if (next in simple) {
        out += simple[next];
        at += 2;
      } else if (next === "x" || next === "u") {
        const length = next === "x" ? 2 : 4;
        const hex = source.slice(at + 2, at + 2 + length);
        if (!/^[0-9a-fA-F]+$/u.test(hex) || hex.length !== length) fail("bad escape");
        out += String.fromCharCode(Number.parseInt(hex, 16));
        at += 2 + length;
      } else {
        fail("unknown escape");
      }
    }
    if (source[at] !== quote) fail("unterminated string");
    at += 1;
    return out;
  }

  function sequence(close: string): unknown[] {
    const items: unknown[] = [];
    space();
    if (source[at] === close) {
      at += 1;
      return items;
    }
    for (;;) {
      items.push(value());
      space();
      if (source[at] === ",") {
        at += 1;
        space();
        if (source[at] === close) break;
        continue;
      }
      break;
    }
    expect(close);
    return items;
  }

  function dict(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    space();
    if (source[at] === "}") {
      at += 1;
      return out;
    }
    for (;;) {
      space();
      const key = value();
      if (typeof key !== "string" && typeof key !== "number") fail("dict key");
      expect(":");
      out[String(key)] = value();
      space();
      if (source[at] === ",") {
        at += 1;
        space();
        if (source[at] === "}") break;
        continue;
      }
      break;
    }
    expect("}");
    return out;
  }

  function value(): unknown {
    space();
    const char = source[at];
    if (char === "{") { at += 1; return dict(); }
    if (char === "[") { at += 1; return sequence("]"); }
    if (char === "(") { at += 1; return sequence(")"); }
    if (char === "'" || char === '"') return string();
    for (const [word, result] of [["True", true], ["False", false], ["None", null]] as const) {
      if (source.startsWith(word, at)) {
        at += word.length;
        return result;
      }
    }
    const number = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(source.slice(at));
    if (number) {
      at += number[0].length;
      return Number(number[0]);
    }
    return fail("unexpected character");
  }

  const result = value();
  space();
  if (at !== source.length) fail("trailing text");
  return result;
}

/** The literal after a label: `Flight prices: {...}` → the dict. */
export function parseLabelledLiteral(text: string): unknown {
  const start = text.search(/[{[]/u);
  if (start < 0) throw new SyntaxError("Python literal: no dict or list in the answer");
  return parsePythonLiteral(text.slice(start).trim());
}
