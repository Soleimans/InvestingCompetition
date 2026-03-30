const yahooFinance = require('yahoo-finance2').default;
const { pool } = require('../db');

async function getStockPrice(ticker) {
  try {
    const result = await yahooFinance.quote(ticker);
    return result.regularMarketPrice || null;
  } catch (err) {
    console.error(`Failed to fetch price for ${ticker}:`, err.message);
    return null;
  }
}

async function getEurRate() {
  try {
    const result = await yahooFinance.quote('EURUSD=X');
    // This gives EUR per 1 USD (inverted: quote is USD per EUR)
    // We want USD->EUR, so 1/rate
    const usdPerEur = result.regularMarketPrice;
    return 1 / usdPerEur; // USD to EUR conversion
  } catch (err) {
    console.error('Failed to fetch EUR rate:', err.message);
    // Fallback: try cached
    const cached = await pool.query("SELECT rate FROM exchange_rates WHERE pair = 'USD_EUR'");
    return cached.rows.length > 0 ? parseFloat(cached.rows[0].rate) : 0.92; // rough fallback
  }
}

async function updateAllPrices() {
  console.log('Updating stock prices...');
  try {
    // Get all unique tickers from holdings
    const tickers = await pool.query('SELECT DISTINCT ticker FROM holdings WHERE shares > 0');
    if (tickers.rows.length === 0) return;

    for (const row of tickers.rows) {
      try {
        const price = await getStockPrice(row.ticker);
        if (price) {
          await pool.query(
            `INSERT INTO price_cache (ticker, price_usd, updated_at) VALUES ($1, $2, NOW())
             ON CONFLICT (ticker) DO UPDATE SET price_usd = $2, updated_at = NOW()`,
            [row.ticker, price]
          );
        }
      } catch (err) {
        console.error(`Price update failed for ${row.ticker}:`, err.message);
      }
    }

    // Update EUR rate
    const eurRate = await getEurRate();
    await pool.query(
      `INSERT INTO exchange_rates (pair, rate, updated_at) VALUES ('USD_EUR', $1, NOW())
       ON CONFLICT (pair) DO UPDATE SET rate = $1, updated_at = NOW()`,
      [eurRate]
    );

    // Take portfolio snapshots
    await takeSnapshots();

    console.log('Price update complete');
  } catch (err) {
    console.error('updateAllPrices error:', err);
  }
}

async function takeSnapshots() {
  try {
    const result = await pool.query(
      `SELECT cm.competition_id, cm.user_id,
        COALESCE(
          SUM(h.shares * COALESCE(pc.price_usd, h.avg_price) * COALESCE(er.rate, 0.92)),
          0
        ) as total_value_eur
       FROM competition_members cm
       LEFT JOIN holdings h ON h.competition_id = cm.competition_id AND h.user_id = cm.user_id AND h.shares > 0
       LEFT JOIN price_cache pc ON pc.ticker = h.ticker
       LEFT JOIN exchange_rates er ON er.pair = 'USD_EUR'
       GROUP BY cm.competition_id, cm.user_id`
    );

    for (const row of result.rows) {
      await pool.query(
        'INSERT INTO portfolio_snapshots (competition_id, user_id, total_value_eur) VALUES ($1, $2, $3)',
        [row.competition_id, row.user_id, row.total_value_eur]
      );
    }
  } catch (err) {
    console.error('Snapshot error:', err);
  }
}

module.exports = { getStockPrice, getEurRate, updateAllPrices };
