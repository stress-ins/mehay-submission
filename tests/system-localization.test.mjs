import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { transformSync, traverse } from "@babel/core";
import systemLocaleBabelPlugin from "../src/systemLocaleBabelPlugin.ts";
import { translateInterfaceText, translateNeuroReason } from "../src/systemTranslations.ts";

function compile(source) {
  return transformSync(source, {
    configFile: false,
    babelrc: false,
    generatorOpts: { jsescOption: { minimal: true } },
    parserOpts: { plugins: ["jsx", "typescript"] },
    plugins: [systemLocaleBabelPlugin],
  }).code;
}

test("only literal JSX text is marked for translation; runtime business children stay intact", () => {
  const output = compile('<div>Закупка {userName}</div>');
  assert.match(output, /__translateSystemText\("Закупка ", __getSystemLanguage\(\)\)/u);
  assert.match(output, /userName/u);
  assert.doesNotMatch(output, /__translateSystemText\(userName\)/u);
  assert.match(output, /translateSystemText/u);
});

test("neuro queue reasons localize every summary variant and preserve dynamic facts", () => {
  const languages = ["en", "hi", "tg", "uz"];
  const reasons = [
    "Последнее надёжное акустическое измерение не выявило отклонений.",
    "Надёжное измерение выявило F01 с оценкой 0.93; требуется решение механика о допуске.",
    "Последнее измерение не прошло проверку качества; требуется повторная запись.",
    "Код неисправности не соответствует двигателю. Проверьте машину и повторите замер.",
    "Последнее измерение не подтверждено по качеству, уверенности или оценке риска.",
    "Последнее измерение выявило F13; требуется осмотр механика.",
  ];
  for (const language of languages) {
    for (const reason of reasons) assert.notEqual(translateNeuroReason(reason, language), reason, `${language}: ${reason}`);
    const localized = translateNeuroReason(reasons[1], language);
    assert.match(localized, /F01/u);
    assert.match(localized, /0\.93/u);
    assert.equal(translateNeuroReason("Future diagnostic reason", language), "Future diagnostic reason");
  }
});

test("a user supplied name equal to a dictionary key remains an untranslated JSX expression", () => {
  const output = compile('const userName = "Закупка"; <div>{userName}</div>');
  assert.match(output, /const userName = "Закупка"/u);
  assert.match(output, /<div>\{userName\}<\/div>/u);
  assert.doesNotMatch(output, /__translateSystemText\(userName/u);
});

test("literal accessible attributes are translated while expression values are untouched", () => {
  const output = compile('<input placeholder="Краткое название" title={userTitle} value={userValue} />');
  assert.match(output, /placeholder=\{__translateSystemText\("Краткое название", __getSystemLanguage\(\)\)\}/u);
  assert.match(output, /title=\{userTitle\}/u);
  assert.match(output, /value=\{userValue\}/u);
});

test("textarea static child remains one string expression and user expression remains separate", () => {
  const output = compile('<textarea>Текст шаблона {userDraft}</textarea>');
  assert.match(output, /__translateSystemText\("Текст шаблона ", __getSystemLanguage\(\)\)/u);
  assert.match(output, /userDraft/u);
  assert.doesNotMatch(output, /__translateSystemText\(userDraft\)/u);
});

test("exact dictionary lookup preserves surrounding whitespace and unknown user text", () => {
  assert.equal(translateInterfaceText("  Закупка ", "en"), "  Procurement ");
  assert.equal(translateInterfaceText("Пользовательское имя", "en"), "Пользовательское имя");
});

test("conditional captions and interpolated labels translate without changing field values", () => {
  const output = compile('<button value="Закупка" onClick={() => save("Закупка")}>{busy ? "Загрузка" : `Деталь: ${partName}`}</button>');
  assert.match(output, /busy \? __translateSystemText\("Загрузка"/u);
  assert.match(output, /__translateSystemText\("Деталь: \{0\}", __getSystemLanguage\(\), \[partName\]\)/u);
  assert.match(output, /value="Закупка"/u);
  assert.match(output, /save\("Закупка"\)/u);
  assert.equal(translateInterfaceText("Деталь: {0}", "ru", ["$& {1}"]), "Деталь: $& {1}");
});

test("compiled workshop UI captions have translations and retain their dynamic values", () => {
  const src = new URL("../src/", import.meta.url);
  const fields = (text) => [...new Set(text.match(/\{\d+\}/gu))].sort().join(" ");
  const gaps = [];
  for (const file of readdirSync(src).filter((name) => name.endsWith(".tsx"))) {
    const { ast } = transformSync(readFileSync(new URL(file, src), "utf8"), {
      ast: true, code: false, configFile: false, babelrc: false,
      parserOpts: { plugins: ["jsx", "typescript"] }, plugins: [systemLocaleBabelPlugin],
    });
    const captions = new Set();
    traverse(ast, { CallExpression({ node }) {
      const key = node.arguments[0];
      if (node.callee.name === "__translateSystemText" && key?.type === "StringLiteral" && /[а-яё]/iu.test(key.value)) captions.add(key.value.trim());
    } });
    for (const key of captions) {
      for (const lang of ["en", "hi", "tg", "uz"]) {
        const translated = translateInterfaceText(key, lang);
        if (!translated || (lang === "en" && translated === key) || fields(translated) !== fields(key)) {
          gaps.push({ file, key, lang });
        }
      }
    }
  }
  assert.deepEqual(gaps, []);
});
