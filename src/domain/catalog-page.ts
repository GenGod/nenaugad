// PERF-002: the external section of /jobs is paged, newest first. Rendering all 3.5k
// cards at once took 26–35 s and 21 MB; reading them takes ~0.25 s, so the paging
// happens after the read.
import { InvalidQueryError } from "./job.ts";

export const EXTERNAL_PAGE_SIZE = 24;

type Dated = Readonly<{ id: string; publishedAt: string | null; firstSeenAt: string }>;

// The source's publication date when it has one, else when we first saw the posting.
const dateOf = (item: Dated): number => Date.parse(item.publishedAt ?? item.firstSeenAt) || 0;

export function newestFirst<T extends Dated>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => dateOf(b) - dateOf(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export type Page<T> = Readonly<{
  items: readonly T[];
  page: number;
  pageCount: number;
  total: number;
  /** 1-based positions of the first and last item shown; 0 when the list is empty. */
  from: number;
  to: number;
}>;

/** A page past the end shows the last page; an empty list is one empty page. */
export function pageOf<T>(items: readonly T[], requested: number, size: number): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, requested), pageCount);
  const start = (page - 1) * size;
  return {
    items: items.slice(start, start + size),
    page, pageCount, total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + size, total),
  };
}

/** `page` is read apart from the catalog query, so /api/v1/jobs keeps its contract. */
export function parsePageParam(params: URLSearchParams): number {
  const values = params.getAll("page");
  if (values.length === 0) return 1;
  if (values.length > 1 || !/^[1-9][0-9]{0,3}$/u.test(values[0]!)) throw new InvalidQueryError();
  return Number(values[0]);
}
