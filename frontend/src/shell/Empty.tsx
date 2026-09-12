interface EmptyProps {
  onSuggestion: (text: string) => void;
}

const SUGGESTIONS = [
  "¿Cómo voy con mis ahorros este mes?",
  "Quiero pagar menos intereses en mi tarjeta",
  "Ayúdame a planear una meta de ahorro",
];

/** Estado inicial antes del primer mensaje. */
export default function Empty({ onSuggestion }: EmptyProps) {
  return (
    <div className="bn-empty">
      <h1 className="bn-empty__title">Hola, soy tu asistente financiero</h1>
      <p className="bn-empty__body">
        Pregúntame sobre tus finanzas y te muestro la información al instante.
      </p>
      <div className="bn-empty__chips">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="bn-chip" onClick={() => onSuggestion(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
