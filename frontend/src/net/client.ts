import type { ActionRef } from "../contract/a2ui";
import type { ClientMessage } from "../contract/events";
import { getAccessKey } from "./accessKey";

type Send = (message: ClientMessage) => boolean;

export function sendUserMessage(send: Send, text: string): boolean {
  return send({ type: "user_message", text });
}

export function sendAction(
  send: Send,
  action: ActionRef,
  dataModel: Record<string, unknown> = {}
): boolean {
  return send({
    type: "action",
    name: action.event.name,
    params: action.event.params ?? {},
    dataModel,
  });
}

/** Borra el estado del lado del harness para esta sesión (DELETE /v1/session/{id}).
 *  Nunca truena la UI: "Nueva conversación" debe funcionar aunque esto falle
 *  (la sesión igual queda huérfana del lado del servidor, sin memoria fría). */
export async function deleteSession(sessionId: string): Promise<void> {
  try {
    const key = getAccessKey();
    await fetch(`/v1/session/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      headers: key ? { "X-App-Key": key } : undefined,
    });
  } catch {
    // sin red, o el harness ya no está — no bloquea empezar una conversación nueva
  }
}
