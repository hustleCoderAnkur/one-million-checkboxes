import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export async function connectDB() {
    const client = await pool.connect();

    await client.query(`
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username VARCHAR(50) UNIQUE,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash TEXT,
            oidc_provider VARCHAR(50),
            oidc_sub TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);

    client.release();
    console.log("[DB] Connected and tables ready");
}

export default pool;