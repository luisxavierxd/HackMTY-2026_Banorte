// @vitest-environment jsdom
/**
 * Que la app ARRANQUE y que el camino de un clic exista.
 *
 * tsc y `vite build` atrapan errores de compilación, no de runtime: un hook
 * mal llamado, un módulo que truena al importarse o un gate que no pinta
 * compilan perfecto y se ven como pantalla en blanco. Este test es lo más
 * cerca que se puede estar de abrir el navegador sin abrirlo.
 *
 * Verifica el criterio de aceptación #3 desde la UI: las cuatro opciones
 * están, la grabada viene preseleccionada, y entrar no pide escribir nada.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProviderGate from "../src/shell/ProviderGate";
import { DEFAULT_CHOICE } from "../src/shell/providerChoice";

// ECharts toca APIs de canvas que jsdom no trae. El gate no dibuja ninguna
// gráfica; el stub evita que el import la cargue.
vi.mock("echarts", () => ({ init: () => ({ setOption() {}, dispose() {}, resize() {} }) }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

const mount = (value = DEFAULT_CHOICE, keyOnly = false) =>
  render(<ProviderGate value={value} keyOnly={keyOnly} onSubmit={() => {}} />);

const options = () => screen.getAllByRole("radio");

describe("ProviderGate", () => {
  it("monta sin tronar y muestra las cuatro opciones", () => {
    mount();
    const texts = options().map((o) => o.textContent ?? "");
    expect(texts).toHaveLength(4);
    expect(texts.join(" | ")).toMatch(/grabada/i);
    expect(texts.join(" | ")).toMatch(/Anthropic/);
    expect(texts.join(" | ")).toMatch(/Gemini/);
    expect(texts.join(" | ")).toMatch(/CLI/i);
  });

  it("la sesión grabada va primera y preseleccionada", () => {
    mount();
    const first = options()[0];
    expect(first.textContent).toMatch(/grabada/i);
    expect(first.getAttribute("aria-checked")).toBe("true");
  });

  it("se puede entrar sin escribir nada", () => {
    mount();
    const submit = screen.getByRole("button", { name: /^entrar$/i });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    // Sin campos que llenar en el camino por defecto.
    expect(document.querySelectorAll("input")).toHaveLength(0);
  });
});

describe("ProviderGate — opción de CLI local", () => {
  /** Los detalles del CLI viven detrás de su opción: hay que elegirla. */
  const pickCli = () => {
    mount();
    const cli = options().find((o) => /CLI/i.test(o.textContent ?? ""));
    fireEvent.click(cli!);
  };

  it("el campo de URL usa la IP de loopback, no localhost", () => {
    // Chrome bloquea ws://localhost desde una página HTTPS como mixed content;
    // la IP de loopback sí pasa. Si alguien "arregla" el placeholder a
    // localhost, la opción deja de funcionar en producción (§7).
    //
    // Se mira el CAMPO, no el HTML entero: la prosa de ayuda menciona
    // `ws://localhost` a propósito, justo para decir que no se use.
    pickCli();
    const url = document.querySelector<HTMLInputElement>('input[type="url"], input[name="url"]')
      ?? Array.from(document.querySelectorAll("input")).find((i) => /ws:\/\//.test(i.placeholder + i.value));

    expect(url, "no se encontró el campo de URL").toBeDefined();
    const effective = url!.value || url!.placeholder;
    expect(effective).toContain("127.0.0.1");
    expect(effective).not.toContain("localhost");
  });

  it("dice que el navegador no puede correr el CLI y cómo levantarlo", () => {
    pickCli();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/no puede ejecutar|no corre|en tu máquina/i);
    expect(text).toContain("git clone");
  });

  it("ofrece los cuatro CLIs", () => {
    pickCli();
    const text = document.body.textContent ?? "";
    for (const label of ["Claude Code", "Codex", "Cursor", "Antigravity"]) {
      expect(text, `falta ${label}`).toContain(label);
    }
  });

  it("el bloque copiable no encima el botón sobre el comando", () => {
    pickCli();
    const block = document.querySelector(".bn-copyblock")!;
    const head = block.querySelector(".bn-copyblock__head");
    const code = block.querySelector(".bn-copyblock__code");

    // El botón vive en su propio renglón, no dentro del <pre>: encimado tapaba
    // el final del comando, que es justo lo que hay que leer antes de copiar.
    expect(head, "falta el renglón de cabecera").not.toBeNull();
    expect(head!.querySelector(".bn-copyblock__btn")).not.toBeNull();
    expect(code!.querySelector("button")).toBeNull();
    // y la cabecera va ANTES del código
    expect(head!.compareDocumentPosition(code!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("el comando cambia según el CLI elegido", () => {
    pickCli();
    expect(document.body.textContent).toContain("make demo-code");

    const codex = screen
      .getAllByRole("radio")
      .find((o) => o.textContent?.trim() === "Codex");
    fireEvent.click(codex!);

    const text = document.body.textContent ?? "";
    expect(text).toContain("make demo-codex");
    expect(text).not.toContain("make demo-code ");
    // y dice qué binario hace falta, que es el error más común
    expect(text).toContain("codex");
  });
});

describe("ProviderGate — modo solo-key", () => {
  it("al recargar con un proveedor que necesita key, no re-pregunta el proveedor", () => {
    mount({ ...DEFAULT_CHOICE, kind: "anthropic" }, true);

    // Sin selector de proveedor: solo el campo de la key.
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(document.querySelector('input[type="password"]')).not.toBeNull();
  });
});

describe("las keys no se persisten", () => {
  it("nada de lo que guarda la elección toca localStorage con una key", () => {
    mount({ ...DEFAULT_CHOICE, kind: "anthropic" });
    expect(JSON.stringify(localStorage)).not.toMatch(/sk-ant|AIza/);
  });
});
