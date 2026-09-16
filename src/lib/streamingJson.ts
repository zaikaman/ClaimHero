/**
 * Best-effort reader for a JSON string field that is still arriving.
 *
 * Drafting actions stream the model's structured JSON output token by token, so
 * the Studio can render the readable prose sections live without waiting for the
 * document to be parsed. This reads the escaped string value that follows
 * `"field":` and returns whatever prefix has arrived so far.
 *
 * Returns an empty string when the field has not started arriving yet. Callers
 * must treat the result as a preview only: the authoritative value always comes
 * from the persisted, server-parsed document.
 */
export function readStreamingStringField(raw: string, field: string): string {
  if (!raw) return "";

  const keyIndex = raw.indexOf(`"${field}"`);
  if (keyIndex === -1) return "";

  const colonIndex = raw.indexOf(":", keyIndex + field.length + 2);
  if (colonIndex === -1) return "";

  let index = colonIndex + 1;
  while (index < raw.length && /\s/.test(raw[index])) index += 1;
  if (raw[index] !== '"') return "";
  index += 1;

  let value = "";

  while (index < raw.length) {
    const character = raw[index];

    if (character === '"') break;

    if (character !== "\\") {
      value += character;
      index += 1;
      continue;
    }

    const escaped = raw[index + 1];
    // A trailing backslash means the escape sequence is still in flight.
    if (escaped === undefined) break;

    switch (escaped) {
      case "n":
        value += "\n";
        index += 2;
        break;
      case "t":
        value += "\t";
        index += 2;
        break;
      case "r":
        value += "\r";
        index += 2;
        break;
      case "b":
        value += "\b";
        index += 2;
        break;
      case "f":
        value += "\f";
        index += 2;
        break;
      case '"':
      case "\\":
      case "/":
        value += escaped;
        index += 2;
        break;
      case "u": {
        const hex = raw.slice(index + 2, index + 6);
        if (hex.length < 4) return value;
        const codePoint = Number.parseInt(hex, 16);
        if (Number.isNaN(codePoint)) {
          index += 2;
          break;
        }
        value += String.fromCharCode(codePoint);
        index += 6;
        break;
      }
      default:
        value += escaped;
        index += 2;
        break;
    }
  }

  return value;
}
