import path, { basename } from "node:path";
import fs from "node:fs";
import { IncomingMessage } from "node:http";
import { Route } from "@/types";

const paramPattern = /\[([^\]]+?)\]/g;

export function isFunction(value: any): value is Function {
  return typeof value === "function";
}

export function valueOrZero(value: any) {
  return typeof value === "undefined" ? 0 : value;
}

export function relativePath(from: string, to: string) {
  const extPattern = new RegExp(path.extname(from) + "$");
  const relativePath = path
    .relative(from, to)
    .replace(/\\/g, "/")
    .replace(extPattern, "");

  return `/${relativePath}`;
}

export async function lookupSync(
  arr: Route[],
  asyncFn: (value: any) => Promise<any>,
) {
  const promises = arr.map(asyncFn);
  const results = await Promise.all(promises);
  const index = results.findIndex((result) => result);
  return arr[index];
}

export function filterFiles(exts: string[]) {
  exts = exts.map((ext) => ext.replace(".", ""));
  return (file: string) => {
    const ext = path.extname(file);
    return exts.includes(ext.replace(".", ""));
  };
}

export function matcher(route: Route) {
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

export function lookupFn(route: any, method: string): Function {
  return (
    route[method] ||
    (isFunction(route) && route) ||
    (isFunction(route.default) && route.default)
  );
}

export function lookup(directory: string, exts: string[]): string[] {
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
