// Chunked multi-row INSERT helper — used by the one-time data migration (api/admin.js
// migrate-import), which needs to insert hundreds of records without hundreds of individual
// round trips (risking the serverless function's time limit).
//
// Inserts `rows` (each an array of values matching `columns`) into `table` in batches of
// `chunkSize`, optionally with an ON CONFLICT clause and RETURNING clause. Returns the
// concatenated RETURNING rows across all chunks (or [] if no RETURNING was requested).
export async function batchInsert(client, table, columns, rows, { chunkSize = 50, onConflict = '', returning = '' } = {}) {
  const results = [];
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const valueTuples = [];
    const params = [];
    chunk.forEach((row) => {
      const placeholders = row.map((_, colIdx) => `$${params.length + colIdx + 1}`);
      valueTuples.push(`(${placeholders.join(',')})`);
      params.push(...row);
    });
    const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${valueTuples.join(',')} ${onConflict} ${returning ? 'RETURNING ' + returning : ''}`;
    const { rows: returned } = await client.query(sql, params);
    if (returning) results.push(...returned);
  }
  return results;
}
