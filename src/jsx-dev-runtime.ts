import { Fragment, jsxDEV as reactJsxDEV, type JSX } from "react/jsx-dev-runtime";

export { Fragment };
export type { JSX };
export const jsxDEV = (
  type: Parameters<typeof reactJsxDEV>[0],
  props: Record<string, unknown>,
  key: string | undefined,
  isStaticChildren: boolean,
  source: Parameters<typeof reactJsxDEV>[4],
  self: Parameters<typeof reactJsxDEV>[5],
) => reactJsxDEV(type, props, key, isStaticChildren, source, self);
