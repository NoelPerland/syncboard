import pg from "pg";
import { PGlite } from "@electric-sql/pglite";

export async function openStore({
  url = process.env.DATABASE_URL,
  path = process.env.SYNC_DATA || ".syncboard-data",
} = {}) {
  const db = url ? new pg.Pool({ connectionString: url }) : new PGlite(path);
  await db.query(
    "CREATE TABLE IF NOT EXISTS syncboard_updates (seq bigserial PRIMARY KEY, board text NOT NULL, payload bytea NOT NULL)",
  );
  await db.query(
    "CREATE INDEX IF NOT EXISTS syncboard_board_seq ON syncboard_updates(board,seq)",
  );
  return {
    async read(board) {
      return (
        await db.query(
          "SELECT payload FROM syncboard_updates WHERE board=$1 ORDER BY seq",
          [board],
        )
      ).rows.map((r) => new Uint8Array(r.payload));
    },
    async append(board, bytes) {
      await db.query(
        "INSERT INTO syncboard_updates(board,payload) VALUES($1,$2)",
        [board, Buffer.from(bytes)],
      );
    },
    async close() {
      if (url) await db.end();
      else await db.close();
    },
  };
}
