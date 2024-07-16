import type { IncomingMessage, ServerResponse } from "node:http";

export type RequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => unknown | Promise<unknown>;

export type Route = {
  isIndex: boolean;
  priority: number;
  path: string;
  pattern: RegExp;
  match: (req: IncomingMessage) => Promise<unknown>;
};
