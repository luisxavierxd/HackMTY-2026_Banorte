/** Código de acceso a la demo — gate a nivel de app, no HTTP Basic Auth.
 *
 *  Por qué: el popup nativo de Basic Auth del navegador no porta bien a un
 *  WebView de app móvil (varios ni lo muestran). En vez de eso, el propio
 *  frontend pide el código una vez con una pantalla normal y lo guarda en
 *  localStorage — funciona igual en navegador o dentro de un WebView.
 *
 *  Sin backend con APP_KEY configurada, este código nunca se pide de verdad
 *  (el harness no lo valida) — así se queda transparente en dev local.
 */
const STORAGE_KEY = "bn-access-key";

export function getAccessKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAccessKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // localStorage bloqueado (modo privado, etc.) — la sesión igual manda
    // el header/query, solo no persiste entre recargas.
  }
}

export function clearAccessKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ver arriba
  }
}
