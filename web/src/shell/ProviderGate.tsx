/**
 * Primera pantalla. Sustituye a `AccessGate`: ya no se pide un código de
 * acceso compartido, se pregunta con qué motor correr la demo (§5, ADR 0006).
 *
 * `AccessGate.tsx` se queda en disco pero ya no se importa — el target
 * hospedado de `legacy/` sí sigue pidiendo código.
 */
import type { ReactNode } from "react";
import ProviderPicker from "./ProviderPicker";
import type { ProviderChoice } from "./providerChoice";

export default function ProviderGate({
  value,
  onSubmit,
  keyOnly = false,
  mascot,
}: {
  value: ProviderChoice;
  onSubmit: (choice: ProviderChoice, apiKey: string) => void;
  /** Al recargar con un proveedor recordado que necesita key: se pide solo eso. */
  keyOnly?: boolean;
  mascot?: ReactNode;
}) {
  return (
    <div className="bn-access-screen">
      {mascot && <div className="bn-access-screen__mascot">{mascot}</div>}
      <div className="bn-access-card bn-access-card--wide">
        <h1 className="bn-access-card__title">
          {keyOnly ? "Vuelve a pegar tu API key" : "¿Con qué quieres correr la demo?"}
        </h1>
        <p className="bn-access-card__desc">
          {keyOnly
            ? "Por seguridad las keys no se guardan entre recargas. Tu proveedor sí se recordó."
            : "Esta demo corre entera en tu navegador. Empieza con la sesión grabada o pon tu propia key."}
        </p>
        <ProviderPicker value={value} onSubmit={onSubmit} keyOnly={keyOnly} submitLabel="Entrar" />
      </div>
    </div>
  );
}
