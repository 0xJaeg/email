// Escape PostgREST .or() filter metacharacters so user input can't break out of
// an ilike pattern or inject extra filter clauses. Shared by the paginated list
// fetchers (users, activity, approvals).
export function sanitizeSearch(query: string): string {
  return query.replace(/[%,()\\"]/g, " ").trim()
}
