// Supabase/PostgREST sends `.in('col', ids)` as a query-string filter, so with
// enough ids (roughly 200+ UUIDs) the request URL blows past the ~16KB header
// limit and every row silently comes back null/undefined instead of throwing
// where you'd notice — split large id lists into chunks and merge the results.
const CHUNK_SIZE = 150

export async function inChunks<T>(
  ids: string[],
  build: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const results: T[] = []
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE)
    const { data, error } = await build(chunk)
    if (error) throw error
    results.push(...(data ?? []))
  }
  return results
}
