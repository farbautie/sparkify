import { IncomingMessage, ServerResponse } from "node:http";
import {
  relativePath,
  lookup,
  matcher,
  lookupFn,
  valueOrZero,
  lookupSync,
} from "@/utils";
import { RequestHandler } from "./types";

const allowedExtensions = [".js", ".ts"];

function loadRoutes(directory: string, exts: string[]) {
  const routes = lookup(directory, exts)
    .map((file) => {
      const route = require(file);
      if (!route.path) {
        route.path = relativePath(directory, file);
      }
      return route;
    })
    .map(matcher)
    .map((route) => {
      if (!route.priority && route.isIndex) {
        route.priority = -1;
      }
      return route;
    })
    .sort((a, b) =>
      valueOrZero(a.priority) < valueOrZero(b.priority) ? 1 : -1,
    );

  return async (req: IncomingMessage) => {
    const method = req.method!.toLowerCase();
    const route = await lookupSync(routes, async (route: any) => {
      const match = await route.match(req);
      const isValid = lookupFn(route, method);
      if (match && isValid) {
        Object.assign(req, match);
        return true;
      }
      return false;
    });

    if (!route) {
      return false;
    }
    return lookupFn(route, method);
  };
}

export function router(rootDir: string): RequestHandler {
  const route = loadRoutes(rootDir, allowedExtensions);
  return async function (req: IncomingMessage, res: ServerResponse) {
    const handle = await route(req);
    if (!handle) {
      res.statusCode = 404;
      res.end(JSON.stringify({ message: "Not found", status: 404 }));
      return;
    }
    return handle(req, res);
  };
}
