// @vitest-environment jsdom
/**
 * Compactación de gráficas cuando caen en las dos filas del bento.
 *
 * El alto del bento no se negocia: es el del dashboard y así se queda. Con
 * gráficas en UNA fila sobra espacio; el problema aparece cuando el agente
 * las reparte en las DOS y la suma se pasa, y como la celda recorta, lo de
 * abajo se pierde. La gráfica es la que cede.
 *
 * Se prueba contra las grabaciones REALES, que es donde apareció el problema:
 * el CLI arma pantallas con más gráficas que las que teníamos de la API.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyEnvelopes } from "../src/a2ui/surfaceReducer";
import { renderSurface } from "../src/a2ui/registry";
import { SurfaceRevealContext } from "../src/a2ui/surfaceRevealContext";
import type { Envelope } from "../src/contract/a2ui";

// ECharts necesita canvas; jsdom no lo trae. El alto lo fija ChartHost en el
// style del contenedor ANTES de que ECharts dibuje, así que el stub no estorba.
//
// Los `resize` se cuentan POR INSTANCIA, no en un espía global: cuando aparece
// una gráfica nueva, montarla ya llama a resize, y un espía global se daría por
// satisfecho con eso sin que la gráfica que YA estaba se haya enterado del alto
// nuevo — que es justo el bug.
const resizesByElement = new Map<Element, number>();

vi.mock("echarts/core", () => ({
  use: () => {},
  init: (el: Element) => ({
    setOption() {},
    dispose() {},
    resize: () => resizesByElement.set(el, (resizesByElement.get(el) ?? 0) + 1),
  }),
  registerTheme: () => {},
}));

/** Cuántas veces se redibujó la gráfica de este tipo. */
function resizesFor(container: HTMLElement, component: string): number {
  const canvas = container.querySelector(`[data-bn-component="${component}"] .bn-chart__canvas`);
  return canvas ? (resizesByElement.get(canvas) ?? 0) : 0;
}

// jsdom no implementa ninguna de las dos APIs de layout que usan las
// gráficas: ResizeObserver (re-dibujar al cambiar de ancho) y matchMedia
// (breakpoint del bento). Sin ellas el render lanza antes de pintar nada.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false, // escritorio: es donde el bento recorta
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
}));

const RECORDED = join(__dirname, "..", "public", "recorded");

function surfaceOf(file: string) {
  const session = JSON.parse(readFileSync(join(RECORDED, file), "utf-8"));
  const event = session.events.find((e: { event: { type: string } }) => e.event.type === "surface");
  return applyEnvelopes(null, event.event.a2ui as Envelope[]);
}

/** Alturas que ChartHost puso en el DOM, en orden. */
function chartHeights(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".bn-chart__body"))
    .map((el) => parseInt(el.style.height, 10))
    .filter((n) => Number.isFinite(n));
}

/** Altura de un tipo concreto — el renderer marca cada gráfica con
 *  `data-bn-component`, así no hay que adivinar por posición. */
function heightOfType(container: HTMLElement, component: string): number | null {
  const body = container.querySelector<HTMLElement>(
    `[data-bn-component="${component}"] .bn-chart__body`,
  );
  return body ? parseInt(body.style.height, 10) : null;
}

function mountRaw(file: string): HTMLElement {
  const surface = surfaceOf(file);
  const data = surface && typeof surface.data === "object" ? surface.data : {};
  const { container } = render(
    <>{renderSurface(surface, data, { setLocal: () => {}, runAction: () => {} })}</>,
  );
  return container;
}

function mount(file: string) {
  return chartHeights(mountRaw(file));
}

afterEach(cleanup);

describe("compactación de gráficas en el bento", () => {
  it("con gráficas en una sola fila no se toca el alto natural", () => {
    // `inflacion` son 4 tarjetas (2 MetricCard arriba, 2 LineChart abajo):
    // las gráficas caen juntas en la fila de abajo, así que no estorban.
    const heights = mount("inflacion.json");
    expect(heights).toHaveLength(2);
    expect(heights.every((h) => h === 180)).toBe(true); // alto natural de LineChart
  });

  it("con gráficas en las dos filas se aplastan", () => {
    // `cat` son 3 tarjetas: MetricCard y PieChart arriba, BarChart abajo a
    // ancho completo. Hay gráfica en las dos filas, así que ceden las dos.
    const heights = mount("cat.json");
    expect(heights).toHaveLength(2);
    // PieChart 240 al 62% = 149. BarChart 220 al 62% daría 136, pero su
    // `minHeight` lo detiene en 150: abajo lleva las etiquetas de categoría.
    expect(heights).toEqual([149, 150]);
    expect(Math.max(...heights)).toBeLessThan(240);
  });

  it("nunca deja una gráfica ilegible por aplastarla", () => {
    for (const file of ["cat.json", "inflacion.json", "meta_ahorro.json", "regla_50_30_20.json"]) {
      for (const h of mount(file)) {
        expect(h, `${file} dejó una gráfica de ${h}px`).toBeGreaterThanOrEqual(130);
      }
      cleanup();
    }
  });

  it("la de barras nunca baja de su mínimo, aunque el bento pida espacio", () => {
    // Sus etiquetas de categoría van abajo y son parte del dato, no
    // decoración: comprimida por debajo de 150 se recortaban.
    const container = mountRaw("cat.json");
    expect(heightOfType(container, "BarChart")).toBeGreaterThanOrEqual(150);
    // y el pastel, que no las lleva, sí cede por debajo de eso
    expect(heightOfType(container, "PieChart")).toBeLessThan(150);
  });

  it("redibuja cuando el alto cambia a media vida de la gráfica", () => {
    // Bug real: las tarjetas se revelan una por una, así que la segunda fila
    // aparece DESPUÉS de que la gráfica ya se dibujó. Al aparecer, el bento
    // comprime y el alto baja — pero el efecto que dibuja solo dependía del
    // ancho, así que ECharts se quedaba del tamaño viejo y `overflow: hidden`
    // recortaba justo lo de abajo: las etiquetas del eje.
    const surface = surfaceOf("cat.json");
    const data = surface && typeof surface.data === "object" ? surface.data : {};
    // `revealedCount` es el mecanismo real: la Column raíz recorta los hijos
    // visibles y de ahí calcula cuántas filas llevan gráfica.
    const tree = (revealed: number) => (
      <SurfaceRevealContext.Provider value={revealed}>
        {renderSurface(surface, data, { setLocal: () => {}, runAction: () => {} })}
      </SurfaceRevealContext.Provider>
    );

    // Con 2 tarjetas (MetricCard + PieChart) todo cabe en una fila.
    const { container, rerender } = render(tree(2));
    const before = heightOfType(container, "PieChart");
    expect(before, "el pastel debería estar a su alto natural").toBe(240);
    const resizesBefore = resizesFor(container, "PieChart");

    rerender(tree(99)); // aparece la de barras: segunda fila, el bento comprime

    const after = heightOfType(container, "PieChart");
    expect(after, "el alto tenía que bajar").toBeLessThan(before!);
    expect(
      resizesFor(container, "PieChart"),
      "el pastel ya estaba montado y no se enteró de su alto nuevo",
    ).toBeGreaterThan(resizesBefore);
  });

  it("todas las grabaciones renderizan sin tronar", () => {
    for (const file of [
      "cat.json",
      "inflacion.json",
      "interes_compuesto.json",
      "meta_ahorro.json",
      "pago_minimo_vs_fijo.json",
      "regla_50_30_20.json",
    ]) {
      expect(() => mount(file), file).not.toThrow();
      cleanup();
    }
  });
});
