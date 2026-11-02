import assert from "node:assert/strict";
import { test } from "node:test";
import { newestFirst, pageOf, parsePageParam } from "../../src/domain/catalog-page.ts";

// PERF-002: /jobs rendered all 3,527 external cards (26–35 s, 21 MB). The section is
// now paged, newest first, with a validated page parameter.

const card = (id: string, publishedAt: string | null, firstSeenAt: string) => ({ id, publishedAt, firstSeenAt });

test("newest first: by source publication date, else first seen, then id", () => {
  const sorted = newestFirst([
    card("b", "2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z"),
    card("a", null, "2026-10-05T00:00:00Z"),
    card("c", "2026-10-03T00:00:00Z", "2026-10-03T00:00:00Z"),
    card("d", "2026-10-03T00:00:00Z", "2026-09-01T00:00:00Z"),
  ]);
  assert.deepEqual(sorted.map(item => item.id), ["a", "c", "d", "b"]);
});

test("newest first does not mutate its input", () => {
  const input = [card("x", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"), card("y", "2026-02-01T00:00:00Z", "2026-02-01T00:00:00Z")];
  newestFirst(input);
  assert.deepEqual(input.map(item => item.id), ["x", "y"]);
});

test("a page holds its slice and says where it is", () => {
  const items = Array.from({ length: 50 }, (_, index) => index + 1);
  assert.deepEqual(pageOf(items, 1, 24), { items: items.slice(0, 24), page: 1, pageCount: 3, total: 50, from: 1, to: 24 });
  assert.deepEqual(pageOf(items, 3, 24), { items: [49, 50], page: 3, pageCount: 3, total: 50, from: 49, to: 50 });
});

test("a page past the end shows the last page; an empty list is one empty page", () => {
  const items = Array.from({ length: 30 }, (_, index) => index);
  assert.equal(pageOf(items, 99, 24).page, 2);
  assert.deepEqual(pageOf([], 1, 24), { items: [], page: 1, pageCount: 1, total: 0, from: 0, to: 0 });
});

test("the page parameter: absent is 1; one positive integer up to 9999; anything else is invalid", () => {
  assert.equal(parsePageParam(new URLSearchParams("")), 1);
  assert.equal(parsePageParam(new URLSearchParams("page=1")), 1);
  assert.equal(parsePageParam(new URLSearchParams("q=React&page=147")), 147);
  assert.equal(parsePageParam(new URLSearchParams("page=9999")), 9999);
  for (const raw of ["page=0", "page=-1", "page=01", "page=1.5", "page=abc", "page=10000", "page=", "page=1&page=2"]) {
    assert.throws(() => parsePageParam(new URLSearchParams(raw)), /INVALID_QUERY/u, raw);
  }
});
