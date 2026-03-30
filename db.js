const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        avatar_url TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS competitions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        start_date DATE NOT NULL,
        end_date DATE,
        starting_cash NUMERIC(12,2) DEFAULT 10000,
        created_by INTEGER REFERENCES users(id),
        invite_code VARCHAR(20) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS competition_members (
        id SERIAL PRIMARY KEY,
        competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(competition_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        ticker VARCHAR(20) NOT NULL,
        shares NUMERIC(12,6) NOT NULL,
        price_per_share NUMERIC(12,4) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        transaction_type VARCHAR(4) NOT NULL CHECK (transaction_type IN ('BUY', 'SELL')),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS holdings (
        id SERIAL PRIMARY KEY,
        competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        ticker VARCHAR(20) NOT NULL,
        shares NUMERIC(12,6) NOT NULL DEFAULT 0,
        avg_price NUMERIC(12,4) NOT NULL DEFAULT 0,
        UNIQUE(competition_id, user_id, ticker)
      );

      CREATE TABLE IF NOT EXISTS price_cache (
        ticker VARCHAR(20) PRIMARY KEY,
        price_usd NUMERIC(12,4) NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        id SERIAL PRIMARY KEY,
        competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        total_value_eur NUMERIC(14,2) NOT NULL,
        snapshot_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS exchange_rates (
        pair VARCHAR(10) PRIMARY KEY,
        rate NUMERIC(12,6) NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_snapshots_comp_user ON portfolio_snapshots(competition_id, user_id, snapshot_at);
      CREATE INDEX IF NOT EXISTS idx_holdings_comp_user ON holdings(competition_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_comp_user ON transactions(competition_id, user_id);
    `);
    console.log('Database tables initialized');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
