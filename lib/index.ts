import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { RequestHandler } from "./types";

async function _onRequest(
  req: IncomingMessage,
  res: ServerResponse,
  handle: RequestHandler,
): Promise<unknown> {
  return new Promise((resolve) => {
    resolve(handle(req, res));
  })
    .then((result) => {
      res.end(JSON.stringify(result));
    })
    .catch((err) => {
      console.error(err);
      res.statusCode = 500;
      res.end(err);
    });
}

export function server(handle: RequestHandler) {
  return createServer((req: IncomingMessage, res: ServerResponse) =>
    _onRequest(req, res, handle),
  );
}
