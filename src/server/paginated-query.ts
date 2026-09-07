type PageResult<T> = { data: T[] | null; error: { message: string; code?: string } | null };

/** Fresh, deterministically ordered query per page. Never return a partial report. */
export async function fetchAllRows<T>(
  query: () => { range(from: number, to: number): PromiseLike<PageResult<T>> },
  maximumRows = 100_000,
): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (;;) {
    const result = await query().range(rows.length, rows.length + 249);
    if (result.error) return { data: null, error: result.error };
    const page = result.data ?? [];
    if (!page.length) return { data: rows, error: null };
    rows.push(...page);
    if (rows.length > maximumRows) return { data: null, error: { code: "REPORT_TOO_LARGE", message: "Слишком много данных для одного отчёта. Выберите меньший период; неполный отчёт не сформирован." } };
    // Do not stop on a short page: the project's Data API cap may be <250.
  }
}

export async function fetchRowsByIds<T>(
  ids: string[],
  query: (batch: string[]) => { range(from: number, to: number): PromiseLike<PageResult<T>> },
): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (let offset = 0; offset < ids.length; offset += 80) {
    const result = await fetchAllRows(() => query(ids.slice(offset, offset + 80)));
    if (result.error) return { data: null, error: result.error };
    rows.push(...result.data ?? []);
  }
  return { data: rows, error: null };
}
