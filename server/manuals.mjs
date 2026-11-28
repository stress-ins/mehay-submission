import { readFileSync } from "node:fs";
import path from "node:path";
import { valveTimingPassage, valveTimingTopic } from "./manual-valve-timing.mjs";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
export const knowledgeDirectory = process.env.MEHAY_KB_DIR ? path.resolve(process.env.MEHAY_KB_DIR) : null;
export const manualDirectory = knowledgeDirectory ? path.join(knowledgeDirectory, "pdf") : null;
const stopWords = new Set("а без более бы был была были быть в вам вас весь во вот все всего где да для до его ее если есть ещё же за здесь и из или им их как когда к ко который кто ли либо мне мной мой на над не него нее нет ни них но о об один она они оно от по под при про с со так такой там те то того тоже той только том ты у уже что чтобы это я двигатель двигателя двигателе".split(" "));
const normalize = (value) => String(value || "").toLocaleLowerCase("ru").replaceAll("ё", "е");
const compact = (value) => normalize(value).replaceAll("ямз", "yamz").replaceAll("змз", "zmz").replace(/[^a-zа-я0-9]+/g, "");

const engineKey = value => compact(value).replaceAll("м", "m");

function queryMatchesEngine(query, selected) {
  const mentions = String(query || "").replace(/[\p{Dash_Punctuation}−]/gu, "-")
    .matchAll(/(?:yamz|ямз|zmz|змз)[\s-]*\d{3,5}(?:[.-]\d+)*(?:-?[a-zа-я]+\d*)?/giu);
  return [...mentions].every(([name]) => engineKey(name) === selected
    || (selected === "yamz236m2" && engineKey(name) === "yamz236"));
}

export function isValveTimingQuestion(engineModel, query) {
  const selected = engineKey(engineModel);
  return selected === "yamz236m2" && queryMatchesEngine(query, selected) && valveTimingTopic(query);
}

const valveCoverTarget = /клапан.{0,80}крыш|крыш.{0,80}клапан/iu;
const valveCoverFastener = /болт|крепеж|креплен|шпил/iu;
const torqueUnit = /н\s*[·⋅.]?\s*м|кгс\s*[·⋅.]\s*м/iu;
const torqueValue = /\p{N}/u;
const frontOrRearHeadCover = /(?:(?:передн|задн)[\p{L}\s-]{0,50}(?:головк|гбц)|(?:головк|гбц)[\p{L}\s-]{0,50}(?:передн|задн))/iu;

function torqueSegments(line) {
  return line.split(/[;；|｜\t]|(?<!\d),(?!\d)|(?<=[.!?])\s+(?=[А-ЯЁA-Z])/u);
}

function focusValveCoverTorqueRow(text) {
  // Require the fastener, its component, the action and the value in a single clause.
  const match = /болт[\p{L}]*\s+(?:крепления\s+)?(?:крышки\s+клапанов|клапанной\s+крышки)\s+(?:затянуть|завернуть|подтянуть)\s+(?:с\s+)?моментом\s+(?:от\s+)?\d/iu.exec(text);
  return match ? text.slice(match.index).trim() : "";
}

export function valveCoverTorqueRows(text, engineModel, scope = { applies: true }) {
  const selected = engineModel ? engineKey(engineModel) : null;
  const lines = text.split(/\r?\n/u);
  const rows = [];
  let sectionApplies = scope.applies;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (selected && /(?:ЗМЗ|ЯМЗ|ZMZ|YaMZ)[\s-]*\d/iu.test(line)
      && !valveCoverFastener.test(line) && (line.endsWith(":") || /^(?:только\s+)?(?:для\s+)?(?:двигател[ья]\s+)?(?:ЗМЗ|ЯМЗ|ZMZ|YaMZ)[\s-]*[\d.а-яa-z-]+[.]?$/iu.test(line))) {
      sectionApplies = queryMatchesEngine(line, selected);
    }
    if (!sectionApplies) continue;
    for (const segment of torqueSegments(lines[index])) {
      const normalized = segment.replace(/\s+/gu, " ").trim();
      if (valveCoverTarget.test(normalized) && valveCoverFastener.test(normalized) && torqueValue.test(normalized) && torqueUnit.test(normalized)
        && !frontOrRearHeadCover.test(normalized) && (!selected || (queryMatchesEngine(line, selected) && queryMatchesEngine(normalized, selected)))) {
        const focused = focusValveCoverTorqueRow(normalized);
        if (focused) rows.push(focused);
      }
      else {
        const next = (lines[index + 1] || "").trim();
        const continuation = /^н\s*[·⋅.]?\s*м|^кгс\s*[·⋅.]\s*м/iu.test(next)
          && torqueValue.test(next) && torqueUnit.test(next)
          && !valveCoverFastener.test(next) && !valveCoverTarget.test(next)
          && !/[.!?;:]\s*$/u.test(normalized);
        const combined = `${normalized} ${next}`.replace(/\s+/gu, " ").trim();
        if (continuation && valveCoverTarget.test(normalized) && valveCoverFastener.test(normalized)
          && torqueValue.test(normalized) && torqueUnit.test(combined) && !frontOrRearHeadCover.test(combined)
          && (!selected || (queryMatchesEngine(line, selected) && queryMatchesEngine(normalized, selected)))) {
          const focused = focusValveCoverTorqueRow(combined);
          if (focused) rows.push(focused);
        }
      }
    }
  }
  scope.applies = sectionApplies;
  return [...new Set(rows)];
}

function readIndex(directory) {
  try { return JSON.parse(readFileSync(path.join(directory, "index.json"), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return { version: 1, manuals: [] }; throw error; }
}

function stem(word) {
  if (!/[а-я]/.test(word) || word.length < 5) return word;
  for (const suffix of ["иями", "ями", "ами", "ого", "его", "ому", "ему", "ыми", "ими", "ией", "иях", "ией", "иям", "ов", "ев", "ей", "ой", "ый", "ий", "ая", "яя", "ое", "ее", "ые", "ие", "ую", "юю", "ам", "ям", "ах", "ях", "ем", "ом", "ы", "и", "а", "я", "о", "е", "у", "ю"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) return word.slice(0, -suffix.length);
  }
  return word;
}

function tokenize(value) {
  const words = [];
  for (const match of normalize(value).matchAll(/[a-zа-я]+|\d+/g)) {
    const word = match[0];
    if (word.length > 1 && !stopWords.has(word)) words.push({ term: stem(word), start: match.index, end: match.index + word.length });
  }
  return words;
}

function pageAppliesTo(manual, page, engineModel) {
  const selected = compact(engineModel).replaceAll("м", "m");
  if (selected.startsWith("yamz")) {
    const models = page.text.matchAll(/(?:ЯМЗ|YaMZ)[-‐‑– \t]*(23[68][А-Яа-яA-Za-z]{0,4}\d*|53[046]\d{0,2})(?!\d)/gi);
    return [...models].every(([, variant]) => compact("ЯМЗ" + variant).replaceAll("м", "m") === selected);
  }
  if (manual.id !== "zmz-40904-40905") return true;
  const text = page.text.replace(/(?:ЗМЗ[- ]*)?40904\.10\s+и\s+(?:ЗМЗ[- ]*)?40905\.10/gi, "");
  return !(selected === "zmz4090410" ? /40905/ : /40904/).test(text);
}

function snippet(page, queryTerms, maxChars = 2400) {
  const wanted = new Set(queryTerms), hits = page.tokens.filter(({ term }) => wanted.has(term));
  if (!hits.length || page.text.length <= maxChars) return page.text.slice(0, maxChars);
  let right = 0, best = null;
  const frequencies = new Map();
  for (let left = 0; left < hits.length; left++) {
    while (right < hits.length && hits[right].start < hits[left].start + maxChars - 500) {
      const term = hits[right++].term; frequencies.set(term, (frequencies.get(term) || 0) + 1);
    }
    const distinct = frequencies.size, count = [...frequencies.values()].reduce((sum, value) => sum + value, 0);
    if (!best || distinct > best.distinct || (distinct === best.distinct && count > best.count)) best = { at: hits[left].start, distinct, count };
    const term = hits[left].term, next = frequencies.get(term) - 1;
    if (next) frequencies.set(term, next); else frequencies.delete(term);
  }
  let start = Math.max(0, best.at - 700);
  if (start > 0) { const lineStart = page.text.lastIndexOf("\n", start); if (lineStart >= start - 300) start = lineStart + 1; }
  let end = Math.min(page.text.length, start + maxChars);
  if (end < page.text.length) { const lineEnd = page.text.indexOf("\n", end); if (lineEnd >= 0 && lineEnd - end <= 300) end = lineEnd; }
  return `${start ? "…" : ""}${page.text.slice(start, end).trim()}${end < page.text.length ? "…" : ""}`;
}

function indexPassage(page) {
  const tokens = tokenize(page.text), counts = new Map();
  for (const { term } of tokens) counts.set(term, (counts.get(term) || 0) + 1);
  return { ...page, tokens, counts, length: tokens.length };
}

// On shared operation-manual pages a preceding variant-specific section can end
// at the explicit valve-mechanism heading. Never include the preceding procedure.
function searchPassages(manual, page) {
  if (manual.id !== "yamz-236-operation") return [page];
  const heading = /^[^\S\n]*РЕГУЛИРОВКА КЛАПАННОГО МЕХАНИЗМА[^\S\n]*$/mu.exec(page.text);
  if (!heading) return [page];
  const prefix = page.text.slice(0, heading.index);
  const section = page.text.slice(heading.index);
  return [prefix, section].filter(text => text.trim()).map(text => indexPassage({ pdfPage: page.pdfPage, text }));
}

export function createManualRepository(indexData) {
  const source = indexData && Array.isArray(indexData.manuals) ? indexData.manuals : [];
  const seen = new Set();
  const manuals = source.map((manual) => {
    if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(manual.id) || seen.has(manual.id) || typeof manual.title !== "string" || typeof manual.filename !== "string" || path.basename(manual.filename) !== manual.filename || !Array.isArray(manual.engineKeys) || !Array.isArray(manual.pages) || (manual.procedures != null && !Array.isArray(manual.procedures))) throw new Error("invalid_manual_index");
    seen.add(manual.id);
    return { ...manual, pages: manual.pages.map((page) => {
      if (!Number.isSafeInteger(page.pdfPage) || page.pdfPage < 1 || typeof page.text !== "string") throw new Error("invalid_manual_page");
      return indexPassage(page);
    }) };
  });
  const passages = new Map(manuals.map(manual => [manual.id, manual.pages.flatMap(page => searchPassages(manual, page))]));
  const index = { version: 1, manuals };
  const engineManuals = (engineModel) => {
    const key = compact(engineModel);
    return key ? manuals.filter((manual) => manual.engineKeys.some((alias) => compact(alias) === key)) : [];
  };
  function manualById(id) {
    const { id: manualId, title, filename, engineKeys, pageCount, sha256, revision, procedures } = index.manuals.find((manual) => manual.id === id) || {};
    return manualId ? { id: manualId, title, filename, engineKeys, pageCount, ...(sha256 ? { sha256 } : {}), ...(revision ? { revision } : {}), ...(procedures ? { procedures } : {}) } : null;
  }
  function manualPageText(id, pdfPage) { return manuals.find((manual) => manual.id === id)?.pages.find((page) => page.pdfPage === pdfPage)?.text ?? null; }
  async function searchManuals({ engineModel, query, limit = 5 } = {}) {
    const queryTerms = [...new Set(tokenize(query).map(({ term }) => term))];
    const selected = engineKey(engineModel);
    if (!queryTerms.length || !queryMatchesEngine(query, selected)) return [];
    const eligible = engineManuals(engineModel).flatMap(manual => passages.get(manual.id)
      .filter(page => pageAppliesTo(manual, page, engineModel)).map(page => ({ manual, page })));
    if (isValveTimingQuestion(engineModel, query)) {
      return eligible.flatMap(({ manual, page }) => {
        if (manual.id !== "yamz-236-operation" && manual.id !== "yamz-236-repair") return [];
        const passage = valveTimingPassage(page.text, page.pdfPage);
        if (!passage) return [];
        const { text, ...valveTiming } = passage;
        return [{ manual: { id: manual.id, title: manual.title }, pdfPage: page.pdfPage, text, valveTiming }];
      });
    }
    if (!eligible.length) return [];
    const documentFrequency = new Map(queryTerms.map((term) => [term, 0]));
    for (const { page } of eligible) for (const term of queryTerms) if (page.counts.has(term)) documentFrequency.set(term, documentFrequency.get(term) + 1);
    const scored = eligible.map(({ manual, page }) => {
      let score = 0, matched = 0;
      for (const term of queryTerms) {
        const frequency = page.counts.get(term) || 0;
        if (!frequency) continue;
        matched++;
        const df = documentFrequency.get(term) || 0;
        const idf = Math.log(1 + (eligible.length - df + 0.5) / (df + 0.5));
        score += idf * (frequency * 2.2) / (frequency + 1.2 * (0.25 + 0.75 * page.length / 500));
      }
      return { manual, page, matched, score: Number(score.toFixed(3)) };
    }).filter(({ matched, score }) => matched >= Math.min(2, queryTerms.length) && score >= 0.15);
    scored.sort((a, b) => b.score - a.score || a.manual.id.localeCompare(b.manual.id) || a.page.pdfPage - b.page.pdfPage);
    const count = Number.isSafeInteger(limit) ? Math.max(1, Math.min(limit, 10)) : 5;
    return scored.slice(0, count).map(({ manual, page, score }) => ({ manual: { id: manual.id, title: manual.title, filename: manual.filename, engine: manual.engineKeys[0] }, pdfPage: page.pdfPage, text: snippet(page, queryTerms), score }));
  }
  function searchValveCoverTorquePages({ engineModel, query = "" } = {}) {
    const selected = engineKey(engineModel);
    if (!selected || !queryMatchesEngine(query, selected)) return [];
    return engineManuals(engineModel).flatMap(manual => {
      const scope = { applies: true };
      return manual.pages
      .flatMap(page => valveCoverTorqueRows(page.text, engineModel, scope)
        // Shared manuals can mention multiple engine variants on one page. Apply
        // variant gating to the matched row, not unrelated text elsewhere on it.
        .filter(text => queryMatchesEngine(text, selected))
        .map(text => {
        const references = [...text.matchAll(/рис(?:унок)?\.?\s*№?\s*(\d+)/giu)].map(([, number]) => number);
        const illustration = references.map(number => {
          const captionPage = manual.pages.find(candidate => new RegExp(`(?:рис(?:унок)?\\.?\\s*№?\\s*${number}(?!\\d)\\s*\\.?\\s*)[^\\n]{0,180}(?:последовательност|схем).{0,80}(?:болт|крепеж|креплен).{0,80}(?:клапан.{0,40}крыш|крыш.{0,40}клапан)`, "iu").test(candidate.text));
          if (!captionPage) return null;
          const caption = captionPage.text.split(/\r?\n/u).map(line => line.trim()).find(line => new RegExp(`(?:рис(?:унок)?\\.?\\s*№?\\s*${number}(?!\\d)\\s*\\.?\\s*)[^\\n]{0,180}(?:последовательност|схем).{0,80}(?:болт|крепеж|креплен).{0,80}(?:клапан.{0,40}крыш|крыш.{0,40}клапан)`, "iu").test(line));
          return caption ? { illustrationPage: captionPage.pdfPage, figureNumber: number, illustrationCaption: caption } : null;
        }).find(Boolean);
        return { manual: { id: manual.id, title: manual.title, engine: engineModel }, pdfPage: page.pdfPage, text,
          ...(illustration ? illustration : {}) };
      }));
    });
  }
  return { getManuals: () => manuals.map(({ id, title, filename, engineKeys, pageCount, sha256, revision, procedures }) => ({ id, title, filename, engineKeys, pageCount, ...(sha256 ? { sha256 } : {}), ...(revision ? { revision } : {}), ...(procedures ? { procedures } : {}) })), manualById, manualPageText, searchManuals, searchValveCoverTorquePages };
}

const repository = createManualRepository(knowledgeDirectory ? readIndex(knowledgeDirectory) : null);
export const searchManuals = repository.searchManuals;
export const getManuals = repository.getManuals;
export const manualById = repository.manualById;
export const manualPageText = repository.manualPageText;
export const searchValveCoverTorquePages = repository.searchValveCoverTorquePages;
