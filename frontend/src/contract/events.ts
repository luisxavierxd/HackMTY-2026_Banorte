/**
 * Eventos del WebSocket (src/harness/app.py + agent/loop.py).
 * Server -> client: ServerEvent. Client -> server: ClientMessage.
 */
import type { Envelope } from "./a2ui";

export interface ReadyEvent {
  type: "ready";
  catalogId: string;
  sessionId: string;
}

export interface ToolCallEvent {
  type: "tool_call";
  name: string;
  args: Record<string, unknown>;
  step: number;
}

export interface ToolResultEvent {
  type: "tool_result";
  name: string;
  ok: boolean;
}

export interface ThinkingEvent {
  type: "thinking";
  text: string;
}

export interface SurfaceEvent {
  type: "surface";
  title: string;
  summary: string;
  a2ui: Envelope[];
  warnings: string[];
}

export interface TurnEndEvent {
  type: "turn_end";
  latency_ms: number;
  tools_used: string[];
  provider: string;
  model: string;
  usage: Record<string, unknown>;
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export interface AckEvent {
  type: "ack";
  action: string;
}

export type ServerEvent =
  | ReadyEvent
  | ToolCallEvent
  | ToolResultEvent
  | ThinkingEvent
  | SurfaceEvent
  | TurnEndEvent
  | ErrorEvent
  | AckEvent;

export interface UserMessage {
  type: "user_message";
  text: string;
}

export interface ActionMessage {
  type: "action";
  name: string;
  params: Record<string, unknown>;
  dataModel?: Record<string, unknown>;
}

export type ClientMessage = UserMessage | ActionMessage;
