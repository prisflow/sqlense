import pg from "pg";

const dbConfig = {
  host: process.env.PG_HOST || "postgres",
  port: Number(process.env.PG_PORT) || 5432,
  user: process.env.PG_USER || "sqlense",
  password: process.env.PG_PASSWORD || "sqlense",
  database: process.env.PG_DATABASE || "sqlense",
};

console.log("[ws:db] Creating pool:", { host: dbConfig.host, port: dbConfig.port, database: dbConfig.database });

export const pool = new pg.Pool(dbConfig);
