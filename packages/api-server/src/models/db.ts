import pg from "pg";

// 后台数据库的连接
const pool = new pg.Pool({
  host: process.env.PG_HOST || "postgres",
  port: Number(process.env.PG_PORT) || 5432,
  user: process.env.PG_USER || "sqlense",
  password: process.env.PG_PASSWORD || "sqlense",
  database: process.env.PG_DATABASE || "sqlense",
});

export { pool };
