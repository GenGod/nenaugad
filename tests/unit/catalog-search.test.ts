import assert from "node:assert/strict";
import { test } from "node:test";
import { searchCards, searchTerms } from "../../src/domain/catalog-search.ts";

// B60: the /jobs search box filters the external cards too. Owner decisions 2026-11-02:
// the card's own text (title, company, excerpt); every query word at the start of a word.

const card = (id: string, title: string, company = "Acme", excerpt = "") => ({ id, title, company, excerpt });
const ids = (cards: readonly { id: string }[]) => cards.map(item => item.id);

const CARDS = [
  card("designer", "Senior Product Designer", "Northwind", "Own the design system."),
  card("cargo", "Cargo Coordinator", "Harbor Logistics", "Ship things on time."),
  card("go", "Backend Engineer (Go)", "Cobalt", "Services in Go and PostgreSQL."),
  card("fullstack", "Full-Stack Developer", "Acme", "React, Node.js and C# on .NET."),
  card("aspnet", "Platform Engineer", "Acme", "ASP.NET services, C++ tooling."),
];

test("an empty query changes nothing", () => {
  assert.equal(searchCards(CARDS, ""), CARDS);
  assert.equal(searchCards(CARDS, "   "), CARDS);
});

test("title, company and excerpt are searched, case-insensitively", () => {
  assert.deepEqual(ids(searchCards(CARDS, "designer")), ["designer"]);
  assert.deepEqual(ids(searchCards(CARDS, "HARBOR")), ["cargo"]);
  assert.deepEqual(ids(searchCards(CARDS, "postgresql")), ["go"]);
});

test("every query word must match, in any field", () => {
  assert.deepEqual(ids(searchCards(CARDS, "backend postgresql cobalt")), ["go"]);
  assert.deepEqual(ids(searchCards(CARDS, "designer postgresql")), []);
});

test("a word matches at the start of a word, not inside one", () => {
  assert.deepEqual(ids(searchCards(CARDS, "design")), ["designer"]);
  assert.deepEqual(ids(searchCards(CARDS, "go")), ["go"]);
  assert.deepEqual(ids(searchCards(CARDS, "esigner")), []);
  assert.deepEqual(ids(searchCards(CARDS, "stack")), ["fullstack"]);
});

test("compound technical words stay whole", () => {
  assert.deepEqual(ids(searchCards(CARDS, "full-stack")), ["fullstack"]);
  assert.deepEqual(ids(searchCards(CARDS, "c#")), ["fullstack"]);
  assert.deepEqual(ids(searchCards(CARDS, "c++")), ["aspnet"]);
  assert.deepEqual(ids(searchCards(CARDS, "node.js")), ["fullstack"]);
  assert.deepEqual(ids(searchCards(CARDS, "node")), ["fullstack"]);
});

test("a word that starts with a sign matches anywhere", () => {
  assert.deepEqual(ids(searchCards(CARDS, ".net")), ["fullstack", "aspnet"]);
});

test("a word cannot span two fields", () => {
  const cards = [card("x", "Senior Engineer", "Rocket", "")];
  assert.deepEqual(ids(searchCards(cards, "engineerrocket")), []);
  assert.deepEqual(ids(searchCards(cards, "engineer rocket")), ["x"]);
});

test("compatibility forms are folded: full-width letters find plain ones", () => {
  const cards = [card("jp", "ＡＷＳ エンジニア", "株式会社テスト", "")];
  assert.deepEqual(ids(searchCards(cards, "aws")), ["jp"]);
  assert.deepEqual(ids(searchCards([card("en", "AWS Engineer")], "ＡＷＳ")), ["en"]);
});

test("a word in a script written without spaces matches anywhere", () => {
  const cards = [card("jp", "シニアエンジニア", "株式会社テスト", "プロダクトマネージャーを募集します"), card("en", "Engineer")];
  assert.deepEqual(ids(searchCards(cards, "エンジニア")), ["jp"]);
  assert.deepEqual(ids(searchCards(cards, "マネージャー")), ["jp"]);
  assert.deepEqual(ids(searchCards(cards, "テスト")), ["jp"]);
});

test("Cyrillic is searched like any other script", () => {
  const cards = [card("ru", "Ведущий разработчик", "Ромашка", "Удалённая работа")];
  assert.deepEqual(ids(searchCards(cards, "РАЗРАБОТ")), ["ru"]);
  assert.deepEqual(ids(searchCards(cards, "работчик")), []);
});

test("quotes and punctuation around a query word are dropped", () => {
  assert.deepEqual(searchTerms("«React», \"Node.js\". (C#) c++! .NET"), ["react", "node.js", "c#", "c++", ".net"]);
  assert.deepEqual(ids(searchCards(CARDS, "\"React,\"")), ["fullstack"]);
});

test("a query with nothing searchable left matches no card", () => {
  assert.deepEqual(searchTerms("!!! -- «» + #"), []);
  assert.deepEqual(searchCards(CARDS, "!!!"), []);
});

test("the search keeps the input order and does not mutate it", () => {
  const input = [...CARDS];
  assert.deepEqual(ids(searchCards(input, "acme")), ["fullstack", "aspnet"]);
  assert.deepEqual(ids(input), ids(CARDS));
});
