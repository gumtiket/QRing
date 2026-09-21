import "dotenv/config";
import path from "path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client";

// 여러 인스턴스가 동시에 부팅해도 마이그레이션은 하나씩만 돌게 한다.
// 세션 단위 락이라 락과 해제를 같은 커넥션에서 해야 해서, 풀에서 하나를 따로 잡아 쥔다.
const LOCK_ID = 472197324;

async function main() {
  const client = await pool.connect();
  await client.query("select pg_advisory_lock($1)", [LOCK_ID]);

  try {
    await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
    console.log("마이그레이션 완료");
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_ID]);
    client.release();
  }
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("마이그레이션 실패:", err);
    await pool.end();
    process.exit(1);
  });
