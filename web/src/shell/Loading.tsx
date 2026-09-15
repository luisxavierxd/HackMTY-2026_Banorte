/** Estado mientras el socket todavía no abre conexión. */
export default function Loading() {
  return (
    <div className="bn-loading" role="status" aria-live="polite">
      <span className="bn-loading__dot" aria-hidden="true" />
      <span>Conectando…</span>
    </div>
  );
}
