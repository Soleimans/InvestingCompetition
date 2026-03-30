const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');

const router = express.Router();

function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Create competition
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, description, startDate, endDate, startingCash } = req.body;
    if (!name || !startDate) {
      return res.status(400).json({ error: 'Name and start date are required' });
    }

    await client.query('BEGIN');

    const inviteCode = generateInviteCode();
    const result = await client.query(
      `INSERT INTO competitions (name, description, start_date, end_date, starting_cash, created_by, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, description || null, startDate, endDate || null, startingCash || 10000, req.userId, inviteCode]
    );

    const comp = result.rows[0];

    // Auto-join creator
    await client.query(
      'INSERT INTO competition_members (competition_id, user_id) VALUES ($1, $2)',
      [comp.id, req.userId]
    );

    await client.query('COMMIT');
    res.json(formatCompetition(comp));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create competition error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// List my competitions
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, cm.joined_at,
        (SELECT COUNT(*) FROM competition_members WHERE competition_id = c.id) as member_count
       FROM competitions c
       JOIN competition_members cm ON cm.competition_id = c.id AND cm.user_id = $1
       ORDER BY cm.joined_at DESC`,
      [req.userId]
    );
    res.json(result.rows.map(formatCompetition));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single competition
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM competition_members WHERE competition_id = c.id) as member_count
       FROM competitions c WHERE c.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    // Check membership
    const member = await pool.query(
      'SELECT id FROM competition_members WHERE competition_id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (member.rows.length === 0) return res.status(403).json({ error: 'Not a member' });

    const comp = formatCompetition(result.rows[0]);

    // Get members with their portfolio values
    const members = await pool.query(
      `SELECT u.id, u.display_name, u.avatar_url,
        COALESCE(
          (SELECT SUM(h.shares * COALESCE(pc.price_usd, h.avg_price) * COALESCE(er.rate, 1))
           FROM holdings h
           LEFT JOIN price_cache pc ON pc.ticker = h.ticker
           LEFT JOIN exchange_rates er ON er.pair = 'USD_EUR'
           WHERE h.competition_id = $1 AND h.user_id = u.id AND h.shares > 0),
          0
        ) as portfolio_value_eur
       FROM users u
       JOIN competition_members cm ON cm.user_id = u.id AND cm.competition_id = $1
       ORDER BY portfolio_value_eur DESC`,
      [req.params.id]
    );

    comp.members = members.rows.map(m => ({
      id: m.id,
      displayName: m.display_name,
      avatarUrl: m.avatar_url,
      portfolioValueEur: parseFloat(m.portfolio_value_eur),
    }));

    res.json(comp);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete competition (owner only)
router.delete('/:id', async (req, res) => {
  try {
    const comp = await pool.query('SELECT * FROM competitions WHERE id = $1', [req.params.id]);
    if (comp.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    if (comp.rows[0].created_by !== req.userId) {
      return res.status(403).json({ error: 'Only the owner can delete this competition' });
    }

    await pool.query('DELETE FROM portfolio_snapshots WHERE competition_id = $1', [req.params.id]);
    await pool.query('DELETE FROM transactions WHERE competition_id = $1', [req.params.id]);
    await pool.query('DELETE FROM holdings WHERE competition_id = $1', [req.params.id]);
    await pool.query('DELETE FROM competition_members WHERE competition_id = $1', [req.params.id]);
    await pool.query('DELETE FROM competitions WHERE id = $1', [req.params.id]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Join competition by invite code
router.post('/join', async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const comp = await pool.query('SELECT * FROM competitions WHERE invite_code = $1', [inviteCode?.toUpperCase()]);
    if (comp.rows.length === 0) return res.status(404).json({ error: 'Invalid invite code' });

    await pool.query(
      'INSERT INTO competition_members (competition_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [comp.rows[0].id, req.userId]
    );

    res.json(formatCompetition(comp.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get portfolio snapshots for chart
router.get('/:id/snapshots', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ps.user_id, u.display_name, ps.total_value_eur, ps.snapshot_at
       FROM portfolio_snapshots ps
       JOIN users u ON u.id = ps.user_id
       WHERE ps.competition_id = $1
       ORDER BY ps.snapshot_at ASC`,
      [req.params.id]
    );

    // Group by user
    const byUser = {};
    for (const row of result.rows) {
      if (!byUser[row.user_id]) {
        byUser[row.user_id] = { displayName: row.display_name, data: [] };
      }
      byUser[row.user_id].data.push({
        value: parseFloat(row.total_value_eur),
        time: row.snapshot_at,
      });
    }

    res.json(byUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

function formatCompetition(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    startingCash: parseFloat(row.starting_cash),
    createdBy: row.created_by,
    inviteCode: row.invite_code,
    memberCount: parseInt(row.member_count) || 0,
  };
}

module.exports = router;
