/**
 * JSON Pointer (RFC 6901) mínimo — espejo de src/harness/a2ui/messages.py
 * (pointer_get / pointer_set) para que el cliente lea y escriba el mismo
 * data model que el servidor.
 */

function tokenize(pointer: string): string[] {
  return pointer
    .replace(/^\//, "")
    .split("/")
    .map((t) => t.replace(/~1/g, "/").replace(/~0/g, "~"));
}

export function pointerGet<T = unknown>(doc: unknown, pointer: string, fallback?: T): T {
  if (pointer === "" || pointer === "/") {
    return (doc as T) ?? (fallback as T);
  }
  let cur: unknown = doc;
  for (const token of tokenize(pointer)) {
    if (cur !== null && typeof cur === "object" && !Array.isArray(cur) && token in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[token];
    } else if (Array.isArray(cur) && /^\d+$/.test(token) && Number(token) < cur.length) {
      cur = cur[Number(token)];
    } else {
      return fallback as T;
    }
  }
  return cur as T;
}

/** Muta `doc` in-place, igual que la versión Python. Devuelve el mismo doc. */
export function pointerSet<T extends Record<string, unknown>>(
  doc: T,
  pointer: string,
  value: unknown
): T {
  if (pointer === "" || pointer === "/") {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const key of Object.keys(doc)) delete doc[key];
      Object.assign(doc, value as Record<string, unknown>);
    }
    return doc;
  }
  const tokens = tokenize(pointer);
  let cur: unknown = doc;
  for (const token of tokens.slice(0, -1)) {
    if (cur !== null && typeof cur === "object" && !Array.isArray(cur)) {
      const obj = cur as Record<string, unknown>;
      if (!(token in obj) || typeof obj[token] !== "object" || obj[token] === null) {
        obj[token] = {};
      }
      cur = obj[token];
    } else if (Array.isArray(cur) && /^\d+$/.test(token)) {
      cur = cur[Number(token)];
    }
  }
  const last = tokens[tokens.length - 1];
  if (Array.isArray(cur) && /^\d+$/.test(last)) {
    cur[Number(last)] = value;
  } else if (cur !== null && typeof cur === "object") {
    (cur as Record<string, unknown>)[last] = value;
  }
  return doc;
}
