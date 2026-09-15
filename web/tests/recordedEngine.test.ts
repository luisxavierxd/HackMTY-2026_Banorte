/**
 * El camino por defecto de la demo, contra las grabaciones REALES del repo.
 *
 * Criterio de aceptación #3: quien entra ve una sesión corriendo en un clic,
 * sin escribir nada. Si este test falla, un visitante sin API key ve una
 * pantalla en blanco — es el único fallo que no se puede permitir.
 *
 * Se leen los archivos de `public/recorded/` de verdad (no fixtures): así el
 * test también verifica que lo que escribe `scripts/record_session.py` es lo
 * que `RecordedEngine` sabe leer.
 *
 * El motor reproduce respetando los deltas grabados (hasta 1.5s por evento),
 * así que un turno tarda ~16s de reloj. Se corre con relojes falsos: se
 * arranca la reproducción, se vacían los timers y se recoge el resultado.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordedEngine } from "../src/engine/RecordedEngine";
import type { HarnessEvent } from "../src/engine/types";

const PUBLIC_DIR = join(__dirname, "..", "public");

/** Sirve `public/` desde disco, como haría el CDN. */
const diskFetch = (async (input: RequestInfo | URL) => {
  const path = join(PUBLIC_DIR, String(input).replace(/^\//, ""));
  try {
    const body = readFileSync(path, "utf-8");
    return { ok: true, status: 200, json: async () => JSON.parse(body) } as Response;
  } catch {
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  }
}) as typeof fetch;

function engine() {
  return new RecordedEngine({ fetchImpl: diskFetch });
}

/** Corre la reproducción hasta el final adelantando el reloj falso. */
async function play(stream: AsyncIterable<HarnessEvent>): Promise<HarnessEvent[]> {
  const out: HarnessEvent[] = [];
  const done = (async () => {
    for await (const event of stream) out.push(event);
  })();
  await vi.runAllTimersAsync();
  await done;
  return out;
}

const titleOf = (events: HarnessEvent[]): string => {
  const s = events.find((e) => e.type === "surface");
  return s?.type === "surface" ? s.title.toLowerCase() : "";
};

describe("RecordedEngine contra las grabaciones del repo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reproduce un turno completo que termina en surface y turn_end", async () => {
    const events = await play(engine().send("¿Qué es el CAT?"));
    const types = events.map((e) => e.type);

    expect(types).toContain("surface");
    // turn_end cierra el turno: nada después de él.
    expect(types[types.length - 1]).toBe("turn_end");
  });

  it("la surface trae componentes renderizables y sin warnings del validador", async () => {
    const events = await play(engine().send("¿Qué es el CAT y por qué es más alto?"));

    const surface = events.find((e) => e.type === "surface");
    expect(surface, "no salió ninguna surface").toBeDefined();
    if (surface?.type !== "surface") throw new Error("tipo inesperado");

    expect(surface.title.length).toBeGreaterThan(0);
    expect(surface.warnings).toEqual([]);

    const components = surface.a2ui.flatMap((env) =>
      "updateComponents" in env ? env.updateComponents.components : [],
    );
    expect(components.length).toBeGreaterThan(0);
  });

  it("elige la grabación que corresponde al tema preguntado", async () => {
    expect(titleOf(await play(engine().send("explícame el CAT del crédito")))).toContain("cat");
    expect(titleOf(await play(engine().send("cómo me pega la inflación")))).toContain("inflaci");
    expect(titleOf(await play(engine().send("quiero juntar dinero para una meta")))).toContain(
      "ahorro",
    );
  });

  it("nunca queda en blanco: con texto sin relación igual produce una surface", async () => {
    const events = await play(engine().send("xyzzy plugh qwerty"));
    expect(events.some((e) => e.type === "surface")).toBe(true);
  });

  it("está listo sin credencial", () => {
    expect(engine().status()).toBe("ready");
  });

  it("no emite nada si el turno ya venía cancelado", async () => {
    const controller = new AbortController();
    controller.abort();

    const events = await play(engine().send("¿Qué es el CAT?", { signal: controller.signal }));
    expect(events).toEqual([]);
  });

  it("deja de emitir cuando se cancela a media reproducción", async () => {
    const controller = new AbortController();
    const seen: HarnessEvent[] = [];

    const done = (async () => {
      for await (const ev of engine().send("¿Qué es el CAT?", { signal: controller.signal })) {
        seen.push(ev);
        if (seen.length === 2) controller.abort();
      }
    })();
    await vi.runAllTimersAsync();
    await done;

    // Sale pronto en vez de reproducir la grabación entera (11 eventos).
    expect(seen.length).toBeLessThan(5);
    expect(seen.some((e) => e.type === "turn_end")).toBe(false);
  });
});
