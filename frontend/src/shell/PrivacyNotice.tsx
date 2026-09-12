/** Aviso de privacidad simplificado — LFPDPPP (Ley Federal de Protección de
 *  Datos Personales en Posesión de los Particulares) aplica porque esta
 *  demo guarda datos personales (nombre, cifras financieras declaradas,
 *  historial de conversación) en cookies del navegador para que la sesión
 *  "regrese" entre visitas. No es asesoría legal — es el mínimo razonable
 *  para una demo de hackatón que sí toca datos personales. */
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
        Estos datos se guardan únicamente en cookies dentro de tu propio
        navegador — no se envían a ningún tercero ni se almacenan en una
        base de datos permanente fuera de esta demo.
      </p>
      <h3>¿Para qué los usamos?</h3>
      <p>
        Exclusivamente para personalizar las respuestas del asistente
        durante esta demostración (por ejemplo, referirse a ti por tu
        nombre o usar tus cifras como contexto) y para que puedas continuar
        tu conversación si regresas más tarde.
      </p>
      <h3>¿Con quién se comparten?</h3>
      <p>No se comparten con nadie. Es una demostración técnica, no un producto en producción.</p>
      <h3>¿Cómo los elimino?</h3>
      <p>
        Usa el botón "Salir y crear otro" en cualquier momento: borra el
        perfil y la conversación guardados en tu navegador de inmediato.
      </p>
      <h3>Derechos ARCO</h3>
      <p>
        Como esta demo no guarda datos fuera de tu navegador, ejercer tus
        derechos de Acceso, Rectificación, Cancelación y Oposición es tan
        simple como borrar el perfil con el botón de salir, o borrar las
        cookies del sitio desde tu navegador.
      </p>
    </div>
  );
}
