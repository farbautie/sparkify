import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import path, { basename } from "node:path";
import fs from "node:fs";

// Types
type RequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => unknown | Promise<unknown>;

type Route = {
  isIndex: boolean;
  priority: number;
  path: string;
  pattern: RegExp;
  match: (req: IncomingMessage) => Promise<unknown>;
};

const allowedExtensions = [".js", ".ts"];
const paramPattern = /\[([^\]]+?)\]/g;
// Utils
function isFunction(value: any): value is Function {
  return typeof value === "function";
}

function valueOrZero(value: any) {
  return typeof value === "undefined" ? 0 : value;
}

function relativePath(from: string, to: string) {
  const extPattern = new RegExp(path.extname(from) + "$");
  const relativePath = path
    .relative(from, to)
    .replace(/\\/g, "/")
    .replace(extPattern, "");

  return `/${relativePath}`;
}

async function lookupSync(arr: Route[], asyncFn: (value: any) => Promise<any>) {
  const promises = arr.map(asyncFn);
  const results = await Promise.all(promises);
  const index = results.findIndex((result) => result);
  return arr[index];
}

function filterFiles(exts: string[]) {
  exts = exts.map((ext) => ext.replace(".", ""));
  return (file: string) => {
    const ext = path.extname(file);
    return exts.includes(ext.replace(".", ""));
  };
}

function matcher(route: Route) {
  let path = route.path.split(".")[0];
  const paramNames: string[] = [];
  path = path.replace(paramPattern, (_, paramName) => {
    paramNames.push(paramName);
    return "([^?/]+)";
  });

  if (basename(path) === "index") {
    route.isIndex = true;
    path = path.replace(/\/index$/, "/?([:%]?index)?");
  }

  route.pattern = new RegExp(`^${path}(\\?(.*)|$)`, "i");
  route.match = async (req: IncomingMessage) => {
    const url = req.url || "/";
    const match = url.match(route.pattern);
    if (!match) return false;
    return {
      params: "",
      query: "",
    };
  };
  return route;
}

function lookupFn(route: any, method: string) {
  return (
    route[method] ||
    (isFunction(route) && route) ||
    (isFunction(route.default) && route.default)
  );
}

function lookup(directory: string, exts: string[]): string[] {
  const files = fs.readdirSync(path.resolve(directory));
  const routes = files
    .filter(filterFiles(exts))
    .map((files: string) => path.join(directory, files));

  const dirs = files
    .filter((file) => fs.statSync(path.join(directory, file)).isDirectory())
    .map((file: string) => path.join(directory, file));

  const directories = dirs.map((dir) => lookup(dir, exts));
  return [...routes, ...directories.flat()];
}

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

function router(rootDir: string): RequestHandler {
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

function server(handle: RequestHandler) {
  return createServer((req: IncomingMessage, res: ServerResponse) =>
    _onRequest(req, res, handle),
  );
}
const handle = router(path.resolve(__dirname, "../../routes"));
const serv = server(handle);

serv.listen(3000, () => {
  console.log("server is listening on port 3000");
});
