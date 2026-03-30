const express = require('express');
const { pool } = require('../db');
const { getStockPrice, getEurRate } = require('../services/stocks');

const router = express.Router();

// Add investment (buy)
router.post('/:competitionId/buy', async (req, res) => {
  const client = await pool.connect();
  try {
    const { competitionId } = req.params;
    const { ticker, shares, totalValue } = req.body;

    // Must provide either shares or totalValue (EUR amount)
    if (!ticker || (!shares && !totalValue)) {
      return res.status(400).json({ error: 'Ticker and either shares or totalValue required' });
    }

    // Check membership
    const member = await pool.query(
      'SELECT id FROM competition_members WHERE competition_id = $1 AND user_id = $2',
      [competitionId, req.userId]
    );
    if (member.rows.length === 0) return res.status(403).json({ error: 'Not a member' });

    // Get current price in USD
    const price = await getStockPrice(ticker.toUpperCase());
    if (!price) return res.status(400).json({ error: 'Could not fetch price for ticker' });

    let actualShares;
    if (shares) {
      actualShares = parseFloat(shares);
    } else {
      // totalValue is in EUR, convert to USD first
      const eurRate = await getEurRate(); // USD -> EUR rate
      const totalValueUsd = parseFloat(totalValue) / eurRate;
      actualShares = totalValueUsd / price;
    }
    const normalizedTicker = ticker.toUpperCase();

    await client.query('BEGIN');

    // Record transaction
    await client.query(
      `INSERT INTO transactions (competition_id, user_id, ticker, shares, price_per_share, transaction_type)
       VALUES ($1, $2, $3, $4, $5, 'BUY')`,
      [competitionId, req.userId, normalizedTicker, actualShares, price]
    );

    // Update holdings
    await client.query(
      `INSERT INTO holdings (competition_id, user_id, ticker, shares, avg_price)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (competition_id, user_id, ticker)
       DO UPDATE SET
         avg_price = (holdings.avg_price * holdings.shares + $5 * $4) / (holdings.shares + $4),
         shares = holdings.shares + $4`,
      [competitionId, req.userId, normalizedTicker, actualShares, price]
    );

    // Update price cache
    await client.query(
      `INSERT INTO price_cache (ticker, price_usd, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (ticker) DO UPDATE SET price_usd = $2, updated_at = NOW()`,
      [normalizedTicker, price]
    );

    await client.query('COMMIT');

    res.json({
      ticker: normalizedTicker,
      shares: actualShares,
      pricePerShare: price,
      totalCost: actualShares * price,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Buy error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Sell
router.post('/:competitionId/sell', async (req, res) => {
  const client = await pool.connect();
  try {
    const { competitionId } = req.params;
    const { ticker, shares, totalValue } = req.body;

    if (!ticker || (!shares && !totalValue)) {
      return res.status(400).json({ error: 'Ticker and either shares or totalValue required' });
    }

    const normalizedTicker = ticker.toUpperCase();
    const price = await getStockPrice(normalizedTicker);
    if (!price) return res.status(400).json({ error: 'Could not fetch price for ticker' });

    let actualShares;
    if (shares) {
      actualShares = parseFloat(shares);
    } else {
      const eurRate = await getEurRate();
      const totalValueUsd = parseFloat(totalValue) / eurRate;
      actualShares = totalValueUsd / price;
    }

    // Check current holdings
    const holding = await pool.query(
      'SELECT shares FROM holdings WHERE competition_id = $1 AND user_id = $2 AND ticker = $3',
      [competitionId, req.userId, normalizedTicker]
    );
    if (holding.rows.length === 0 || parseFloat(holding.rows[0].shares) < actualShares) {
      return res.status(400).json({ error: 'Insufficient shares' });
    }

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO transactions (competition_id, user_id, ticker, shares, price_per_share, transaction_type)
       VALUES ($1, $2, $3, $4, $5, 'SELL')`,
      [competitionId, req.userId, normalizedTicker, actualShares, price]
    );

    await client.query(
      `UPDATE holdings SET shares = shares - $4
       WHERE competition_id = $1 AND user_id = $2 AND ticker = $3`,
      [competitionId, req.userId, normalizedTicker, actualShares]
    );

    await client.query('COMMIT');

    res.json({
      ticker: normalizedTicker,
      shares: actualShares,
      pricePerShare: price,
      totalProceeds: actualShares * price,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Sell error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Get holdings for a competition
router.get('/:competitionId/holdings', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT h.ticker, h.shares, h.avg_price,
              COALESCE(pc.price_usd, h.avg_price) as current_price,
              COALESCE(er.rate, 1) as eur_rate
       FROM holdings h
       LEFT JOIN price_cache pc ON pc.ticker = h.ticker
       LEFT JOIN exchange_rates er ON er.pair = 'USD_EUR'
       WHERE h.competition_id = $1 AND h.user_id = $2 AND h.shares > 0
       ORDER BY h.ticker`,
      [req.params.competitionId, req.userId]
    );

    const holdings = result.rows.map(r => ({
      ticker: r.ticker,
      shares: parseFloat(r.shares),
      avgPrice: parseFloat(r.avg_price),
      currentPrice: parseFloat(r.current_price),
      currentValueEur: parseFloat(r.shares) * parseFloat(r.current_price) * parseFloat(r.eur_rate),
      gainLossPct: ((parseFloat(r.current_price) - parseFloat(r.avg_price)) / parseFloat(r.avg_price)) * 100,
    }));

    res.json(holdings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Edit a holding (ticker, shares, avg_price)
router.put('/:competitionId/holdings', async (req, res) => {
  const client = await pool.connect();
  try {
    const { competitionId } = req.params;
    const { originalTicker, ticker, shares, avgPrice } = req.body;

    if (!originalTicker || !ticker || shares == null || avgPrice == null) {
      return res.status(400).json({ error: 'originalTicker, ticker, shares, and avgPrice are required' });
    }

    const parsedShares = parseFloat(shares);
    if (parsedShares < 0) {
      return res.status(400).json({ error: 'Shares cannot be negative' });
    }

    const normalizedOriginal = originalTicker.toUpperCase();
    const normalizedTicker = ticker.toUpperCase();

    // Validate ticker exists by fetching its price
    const price = await getStockPrice(normalizedTicker);
    if (!price) {
      return res.status(400).json({ error: `Ticker "${normalizedTicker}" not found` });
    }

    await client.query('BEGIN');

    if (normalizedOriginal !== normalizedTicker) {
      // Ticker changed: delete old, upsert new
      await client.query(
        'DELETE FROM holdings WHERE competition_id = $1 AND user_id = $2 AND ticker = $3',
        [competitionId, req.userId, normalizedOriginal]
      );
      await client.query(
        `INSERT INTO holdings (competition_id, user_id, ticker, shares, avg_price)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (competition_id, user_id, ticker)
         DO UPDATE SET shares = $4, avg_price = $5`,
        [competitionId, req.userId, normalizedTicker, parsedShares, parseFloat(avgPrice)]
      );
    } else {
      await client.query(
        'UPDATE holdings SET shares = $4, avg_price = $5 WHERE competition_id = $1 AND user_id = $2 AND ticker = $3',
        [competitionId, req.userId, normalizedTicker, parsedShares, parseFloat(avgPrice)]
      );
    }

    // Update price cache
    await client.query(
      `INSERT INTO price_cache (ticker, price_usd, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (ticker) DO UPDATE SET price_usd = $2, updated_at = NOW()`,
      [normalizedTicker, price]
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Edit holding error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Delete a holding
router.delete('/:competitionId/holdings/:ticker', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM holdings WHERE competition_id = $1 AND user_id = $2 AND ticker = $3',
      [req.params.competitionId, req.userId, req.params.ticker.toUpperCase()]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get transactions
router.get('/:competitionId/transactions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM transactions
       WHERE competition_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 50`,
      [req.params.competitionId, req.userId]
    );
    res.json(result.rows.map(r => ({
      id: r.id,
      ticker: r.ticker,
      shares: parseFloat(r.shares),
      pricePerShare: parseFloat(r.price_per_share),
      type: r.transaction_type,
      createdAt: r.created_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
