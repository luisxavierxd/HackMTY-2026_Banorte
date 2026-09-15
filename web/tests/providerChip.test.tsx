// @vitest-environment jsdom
/**
 * El chip del sidebar y su popover (§6).
 *
 * Es el único camino para cambiar de proveedor sin recargar, así que vale la
 * pena fijarlo: que abra el MISMO formulario del gate (no una copia), que
 * reporte el estado con el punto, y que se pueda salir sin quedar atrapado.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProviderChip from "../src/shell/ProviderChip";
import {
  DEFAULT_CHOICE,
  isDifferentProvider,
  labelOf,
  type ProviderChoice,
} from "../src/shell/providerChoice";
import { PROVIDERS } from "../src/provider";

vi.mock("echarts", () => ({ init: () => ({ setOption() {}, dispose() {}, resize() {} }) }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

function mount(overrides: Partial<Parameters<typeof ProviderChip>[0]> = {}) {
  const props = {
    choice: DEFAULT_CHOICE,
    label: "Sesión grabada",
    model: "",
    status: "ready" as const,
    open: false,
    onToggle: vi.fn(),
    onSubmit: vi.fn(),
    onClearKey: vi.fn(),
    ...overrides,
  };
  const view = render(<ProviderChip {...props} />);
  return { ...view, props };
}

const chipButton = () => screen.getByRole("button", { expanded: false });

describe("chip de proveedor", () => {
  it("muestra el proveedor y el modelo que reportó el turno", () => {
    mount({ label: "Anthropic", model: "claude-sonnet-4-6" });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Anthropic");
    expect(text).toContain("claude-sonnet-4-6");
  });

  it("sin turno corrido todavía, no inventa un modelo", () => {
    mount({ label: "Sesión grabada", model: "" });
    expect(document.querySelector(".bn-chip__model")).toBeNull();
  });

  it("el punto refleja el estado del motor", () => {
    for (const status of ["ready", "needs-credential", "unreachable"] as const) {
      cleanup();
      mount({ status });
      expect(document.querySelector(`.bn-chip__dot--${status}`)).not.toBeNull();
    }
  });

  it("hacer clic pide abrir el popover", () => {
    const { props } = mount({ open: false });
    fireEvent.click(chipButton());
    expect(props.onToggle).toHaveBeenCalledWith(true);
  });
});

describe("popover del chip", () => {
  it("abierto, muestra el MISMO formulario del gate", () => {
    mount({ open: true });
    expect(screen.getByRole("dialog")).toBeDefined();
    // las cuatro opciones del picker, no una copia recortada
    expect(screen.getAllByRole("radio")).toHaveLength(4);
  });

  it("ofrece borrar la key de esta sesión", () => {
    const { props } = mount({
      open: true,
      choice: { ...DEFAULT_CHOICE, kind: "anthropic" } as ProviderChoice,
    });
    const clear = screen.getByRole("button", { name: /borrar key/i });
    fireEvent.click(clear);
    expect(props.onClearKey).toHaveBeenCalled();
  });

  it("cambiar de proveedor reporta la elección nueva", () => {
    const { props } = mount({ open: true });

    const gemini = screen.getAllByRole("radio").find((o) => /Gemini/.test(o.textContent ?? ""));
    fireEvent.click(gemini!);

    const key = document.querySelector<HTMLInputElement>('input[type="password"]');
    fireEvent.change(key!, { target: { value: "AIzaFAKEKEYPARAELTEST" } });
    fireEvent.click(screen.getByRole("button", { name: /cambiar/i }));

    expect(props.onSubmit).toHaveBeenCalled();
    const [choice] = vi.mocked(props.onSubmit).mock.calls[0];
    expect(choice.kind).toBe("gemini");
  });

  it("si no deja cambiar, dice por qué", () => {
    // Bug real: a media conversación abrías el chip, elegías Anthropic y el
    // botón quedaba muerto sin explicar que faltaba la key.
    mount({ open: true });
    const anthropic = screen
      .getAllByRole("radio")
      .find((o) => /Anthropic/.test(o.textContent ?? ""));
    fireEvent.click(anthropic!);

    const submit = screen.getByRole("button", { name: /cambiar/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(document.body.textContent).toMatch(/API key de Anthropic/i);
  });

  it("con la key puesta el motivo desaparece y deja cambiar", () => {
    mount({ open: true });
    const anthropic = screen
      .getAllByRole("radio")
      .find((o) => /Anthropic/.test(o.textContent ?? ""));
    fireEvent.click(anthropic!);

    const key = document.querySelector<HTMLInputElement>('input[type="password"]')!;
    fireEvent.change(key, { target: { value: "sk-ant-FAKE-PARA-EL-TEST" } });

    const submit = screen.getByRole("button", { name: /cambiar/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    expect(document.querySelector(".bn-picker__blocked")).toBeNull();
  });

  it("distingue qué CLI corre, no solo que es local", () => {
    // "CLI local" a secas no dice si responde Claude Code o Codex, y cambiar
    // de uno a otro sí cambia quién contesta.
    const a = labelOf({ ...DEFAULT_CHOICE, kind: "remote", cli: "claude_code" }, PROVIDERS);
    const b = labelOf({ ...DEFAULT_CHOICE, kind: "remote", cli: "codex" }, PROVIDERS);

    expect(a).toContain("Claude Code");
    expect(b).toContain("Codex");
    expect(a).not.toBe(b);
  });

  it("cambiar de CLI cuenta como cambio de proveedor", () => {
    const claude = { ...DEFAULT_CHOICE, kind: "remote" as const, cli: "claude_code" as const };
    const codex = { ...claude, cli: "codex" as const };

    expect(isDifferentProvider(claude, codex)).toBe(true);
    // el mismo CLI no dispara separador aunque se reponga la misma elección
    expect(isDifferentProvider(claude, { ...claude })).toBe(false);
    // apuntar a otro harness también cuenta
    expect(isDifferentProvider(claude, { ...claude, url: "ws://127.0.0.1:9999" })).toBe(true);
  });

  it("Escape lo cierra: es un popover, no un modal", () => {
    const { props } = mount({ open: true });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onToggle).toHaveBeenCalledWith(false);
  });

  it("un clic afuera lo cierra", () => {
    const { props } = mount({ open: true });
    fireEvent.pointerDown(document.body);
    expect(props.onToggle).toHaveBeenCalledWith(false);
  });

  it("un clic adentro NO lo cierra", () => {
    const { props } = mount({ open: true });
    fireEvent.pointerDown(screen.getByRole("dialog"));
    expect(props.onToggle).not.toHaveBeenCalledWith(false);
  });

  it("el chip oculto del nav strip no cierra el popover del sidebar", () => {
    // El chip se monta DOS veces (columna del sidebar y nav strip) y el que no
    // toca ver está oculto por CSS, pero sigue en el DOM y sigue escuchando.
    // Comparando solo contra su propio wrap, el oculto leía como "clic fuera"
    // cualquier clic dentro del popover visible: elegir otro proveedor a media
    // conversación no hacía nada, solo cerraba el menú.
    const onToggle = vi.fn();
    const shared = {
      choice: DEFAULT_CHOICE,
      label: "Sesión grabada",
      model: "",
      status: "ready" as const,
      open: true,
      onToggle,
      onSubmit: vi.fn(),
      onClearKey: vi.fn(),
    };
    render(
      <>
        <ProviderChip {...shared} className="bn-chip-wrap--sidebar" />
        <ProviderChip {...shared} className="bn-chip-wrap--strip" />
      </>,
    );

    // Elegir un proveedor dentro del primer popover
    const option = screen.getAllByRole("radio").find((o) => /Gemini/.test(o.textContent ?? ""));
    fireEvent.pointerDown(option!);
    fireEvent.click(option!);

    expect(onToggle).not.toHaveBeenCalledWith(false);
    // y el formulario reaccionó: pide la key de Gemini
    expect(document.body.textContent).toMatch(/API key de Gemini/i);
  });
});
