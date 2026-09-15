interface ErrorBannerProps {
  message: string;
  onRetry: () => void;
}

/** Banner ámbar (nunca rojo: el rojo es marca/costo, no error). La superficie
 * anterior se queda visible detrás. */
export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="bn-error" role="alert">
      <span className="bn-error__msg">{message}</span>
      <button type="button" className="bn-error__retry" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}
