import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Se llama cuando se atrapa un error, para que el padre pueda limpiar estado. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Última línea de defensa: si un componente A2UI truena al renderizar (props
 * mal formadas que las validaciones no atraparon, un adapter con un caso no
 * previsto, etc.), esto evita que TODA la app se quede en blanco — algo que
 * ya pasó en producción. Solo envuelve la superficie generada, no el chat:
 * el input y el header siguen vivos para poder reintentar.
 *
 * React exige que los Error Boundaries sean componentes de clase.
 */
export default class SurfaceErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[a2ui] la superficie truena al renderizar, se muestra fallback:", error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="bn-error" role="alert">
          <span className="bn-error__msg">
            Esta pantalla no se pudo dibujar. Tus datos siguen a salvo, puedes seguir preguntando.
          </span>
          <button type="button" className="bn-error__retry" onClick={this.handleRetry}>
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
