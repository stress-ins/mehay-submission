import { Fragment, jsx as reactJsx, jsxs as reactJsxs, type JSX } from "react/jsx-runtime";

export { Fragment };
export type { JSX };
export const jsx = (type: Parameters<typeof reactJsx>[0], props: Record<string, unknown>, key?: string) =>
  reactJsx(type, props, key);
export const jsxs = (type: Parameters<typeof reactJsxs>[0], props: Record<string, unknown>, key?: string) =>
  reactJsxs(type, props, key);
