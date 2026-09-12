/** Aviso de privacidad simplificado — LFPDPPP (Ley Federal de Protección de
 *  Datos Personales en Posesión de los Particulares) aplica porque esta
 *  demo guarda datos personales (nombre, cifras financieras declaradas,
 *  historial de conversación) en cookies del navegador para que la sesión
 *  "regrese" entre visitas, Y porque ese mismo contenido se manda al
 *  proveedor de IA (Anthropic/claude_code u otro, según el perfil activo
 *  en config.py) para generar las respuestas — eso es una transferencia a
 *  un tercero y hay que declararla, no solo lo que vive en el navegador.
 *  No es asesoría legal — es el mínimo razonable para una demo de
 *  hackatón que sí toca datos personales. */
export default function PrivacyNotice() {
  return (
    <div className="bn-privacy">
      <h2>Aviso de Privacidad</h2>
      <p>
        En cumplimiento de la Ley Federal de Protección de Datos Personales en
        Posesión de los Particulares (LFPDPPP), te informamos lo siguiente
        antes de continuar.
      </p>
      <h3>¿Qué datos recabamos?</h3>
      <p>
        El nombre, ingreso mensual, ahorro e inversión que capturas a
        continuación, y el historial de tu conversación con el asistente.
        Estos datos se guardan en cookies dentro de tu propio navegador para
        que la conversación pueda continuar si regresas más tarde.
      </p>
      <h3>¿Para qué los usamos?</h3>
      <p>
        Exclusivamente para personalizar las respuestas del asistente
        durante esta demostración (por ejemplo, referirse a ti por tu
        nombre o usar tus cifras como contexto) y para que puedas continuar
        tu conversación si regresas más tarde.
      </p>
      <h3>¿Con quién se comparten?</h3>
      <p>
        Lo que escribes (y el perfil que capturas aquí) se envía al
        proveedor de inteligencia artificial que genera las respuestas de
        esta demo, porque así es como el asistente entiende tu mensaje y
        arma la pantalla. Ese proveedor procesa esa información en sus
        propios servidores y puede conservarla según su propia política de
        privacidad (por ejemplo, por seguridad o prevención de abuso),
        independientemente de lo que borres aquí. No compartimos tus datos
        con nadie más — es una demostración técnica, no un producto en
        producción.
      </p>
      <h3>¿Cómo los elimino?</h3>
      <p>
        Usa el botón "Salir y crear otro" en cualquier momento: borra el
        perfil y la conversación guardados en tu navegador de inmediato.
        Esto no puede borrar lo que el proveedor de IA haya conservado de
        turnos ya enviados — solo controla lo que queda en este navegador.
      </p>
      <h3>Derechos ARCO</h3>
      <p>
        Sobre lo que se guarda en tu navegador, ejercer tus derechos de
        Acceso, Rectificación, Cancelación y Oposición es tan simple como
        borrar el perfil con el botón de salir, o borrar las cookies del
        sitio desde tu navegador. Sobre lo que procesa el proveedor de IA,
        aplican los términos y la política de privacidad de ese proveedor.
      </p>
    </div>
  );
}
