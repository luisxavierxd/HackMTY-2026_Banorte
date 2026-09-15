/** Cookies simples de primera parte — sin librería, sin backend de sesión
 *  real detrás: se usan para que la demo "parezca" tener base de datos
 *  (perfil + conversación sobreviven a cerrar el navegador) siendo en
 *  realidad almacenamiento del lado del cliente. Ver AccessGate/ProfileGate
 *  y el aviso de privacidad — por eso mismo hace falta declarar su uso. */

export function getCookie(name: string): string {
  const prefix = `${name}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
  }
  return "";
}

export function setCookie(name: string, value: string, days: number): void {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function deleteCookie(name: string): void {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
}
