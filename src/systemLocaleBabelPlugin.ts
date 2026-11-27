type BabelApi = { types: any };

const localizedAttributes = new Set(["aria-label", "aria-description", "aria-valuetext", "placeholder", "title", "alt", "label"]);

function normalizedJsxText(value: string) {
  const lines = value.split(/\r\n|\n|\r/);
  let lastNonEmptyLine = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (/[^ \t]/u.test(lines[index])) lastNonEmptyLine = index;
  }
  return lines.map((line, index) => {
    let text = line.replace(/\t/g, " ");
    if (index > 0) text = text.replace(/^ +/u, "");
    if (index < lines.length - 1) text = text.replace(/ +$/u, "");
    return text ? text + (index < lastNonEmptyLine ? " " : "") : "";
  }).join("");
}

export default function systemLocaleBabelPlugin({ types: t }: BabelApi) {
  function call(path: any, value: string, args: any[] = []) {
    path.findParent((parent: any) => parent.isProgram())?.setData("usesSystemLocaleText", true);
    const parameters = [t.stringLiteral(value), t.callExpression(t.identifier("__getSystemLanguage"), [])];
    if (args.length) parameters.push(t.arrayExpression(args));
    return t.callExpression(t.identifier("__translateSystemText"), parameters);
  }
  // Only visit the branches that produce visible copy. Never touch conditions,
  // component state, business identifiers, event callbacks or stored records.
  function visibleExpression(path: any, node: any): any {
    if (t.isStringLiteral(node) && /[А-Яа-яЁё]/u.test(node.value)) return call(path, node.value);
    if (t.isTemplateLiteral(node) && node.quasis.some((q: any) => /[А-Яа-яЁё]/u.test(q.value.cooked ?? ""))) {
      const key = node.quasis.map((q: any, i: number) => (q.value.cooked ?? "") + (i < node.expressions.length ? "{"+i+"}" : "")).join("");
      return call(path, key, node.expressions.map((value: any) => visibleExpression(path, value)));
    }
    if (t.isConditionalExpression(node)) {
      node.consequent = visibleExpression(path, node.consequent);
      node.alternate = visibleExpression(path, node.alternate);
    } else if (t.isLogicalExpression(node)) {
      node.right = visibleExpression(path, node.right);
    }
    return node;
  }
  return {
    name: "system-locale-static-jsx-text",
    visitor: {
      Program: {
        enter(path: any) { path.setData("usesSystemLocaleText", false); },
        exit(path: any) {
          if (!path.getData("usesSystemLocaleText")) return;
          path.unshiftContainer("body", [
            t.importDeclaration([
              t.importSpecifier(t.identifier("__translateSystemText"), t.identifier("translateInterfaceText")),
            ], t.stringLiteral("./systemTranslations")),
            t.importDeclaration([
              t.importSpecifier(t.identifier("__getSystemLanguage"), t.identifier("getSystemLanguage")),
            ], t.stringLiteral("./systemLanguage")),
          ]);
        },
      },
      JSXText(path: any) {
        const text = normalizedJsxText(path.node.value);
        if (!text) return;
        path.replaceWith(t.jsxExpressionContainer(call(path, text)));
      },
      JSXExpressionContainer(path: any) {
        if (path.parentPath.isJSXAttribute() && !localizedAttributes.has(path.parent.name.name)) return;
        path.node.expression = visibleExpression(path, path.node.expression);
      },
      JSXAttribute(path: any) {
        if (!t.isJSXIdentifier(path.node.name) || !localizedAttributes.has(path.node.name.name) || !t.isStringLiteral(path.node.value)) return;
        path.node.value = t.jsxExpressionContainer(call(path, path.node.value.value));
      },
    },
  };
}
