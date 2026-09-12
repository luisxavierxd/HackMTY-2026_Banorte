import type { ActionRef } from "../contract/a2ui";
import type { ClientMessage } from "../contract/events";

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
