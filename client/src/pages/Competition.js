import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler
} from 'chart.js';
import api from '../api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const COLORS = ['#6366f1', '#22c55e', '#eab308', '#ef4444', '#ec4899', '#06b6d4', '#f97316', '#8b5cf6'];

export default function Competition({ user }) {
  const { id } = useParams();
  const [comp, setComp] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [snapshots, setSnapshots] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [tab, setTab] = useState('chart');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [compRes, holdingsRes, snapshotsRes, txRes] = await Promise.all([
        api.get(`/competitions/${id}`),
        api.get(`/investments/${id}/holdings`),
        api.get(`/competitions/${id}/snapshots`),
        api.get(`/investments/${id}/transactions`),
      ]);
      setComp(compRes.data);
      setHoldings(holdingsRes.data);
      setSnapshots(snapshotsRes.data);
      setTransactions(txRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [loadData]);

  const copyInviteCode = () => {
    if (comp?.inviteCode) {
      navigator.clipboard.writeText(comp.inviteCode);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!comp) return <div className="card">Competition not found</div>;

  const totalValue = holdings.reduce((sum, h) => sum + h.currentValueEur, 0);

  return (
    <div>
      <div className="comp-header">
        <div>
          <Link to="/" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textDecoration: 'none' }}>{'\u2190'} All Competitions</Link>
          <h1>{comp.name}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Invite:</span>
          <span className="invite-code" onClick={copyInviteCode} title="Click to copy">{comp.inviteCode}</span>
          {comp.createdBy === user.id && <DeleteButton competitionId={id} />}
        </div>
      </div>

      {/* Portfolio value */}
      <div className="card" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Your Portfolio Value</div>
        <div style={{ fontSize: '2rem', fontWeight: '700', fontFamily: 'monospace' }}>
          {formatEur(totalValue)}
        </div>
      </div>

      {/* Chart */}
      <div className="chart-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <div className="section-title" style={{ margin: 0 }}>Portfolio History</div>
          <RefreshButton onRefreshed={loadData} />
        </div>
        <PortfolioChart snapshots={snapshots} />
      </div>

      {/* Leaderboard */}
      <div className="card">
        <div className="section-title">Leaderboard</div>
        {comp.members?.sort((a, b) => b.portfolioValueEur - a.portfolioValueEur).map((m, i) => (
          <div key={m.id} className="leaderboard-row">
            <span className="leaderboard-rank">{i + 1}</span>
            <div className="leaderboard-avatar">
              {m.avatarUrl ? <img src={m.avatarUrl} alt="" /> : m.displayName[0].toUpperCase()}
            </div>
            <span className="leaderboard-name">{m.displayName}</span>
            <span className="leaderboard-value">{formatEur(m.portfolioValueEur)}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'chart' ? 'active' : ''}`} onClick={() => setTab('chart')}>Trade</button>
        <button className={`tab ${tab === 'holdings' ? 'active' : ''}`} onClick={() => setTab('holdings')}>Holdings</button>
        <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
      </div>

      {tab === 'chart' && <TradeForm competitionId={id} onTraded={loadData} />}
      {tab === 'holdings' && <HoldingsTable holdings={holdings} />}
      {tab === 'history' && <TransactionHistory transactions={transactions} />}
    </div>
  );
}

function DeleteButton({ competitionId }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async () => {
    try {
      await api.delete(`/competitions/${competitionId}`);
      navigate('/');
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--red)' }}>Sure?</span>
        <button className="btn btn-sm btn-danger" onClick={handleDelete}>Yes, delete</button>
        <button className="btn btn-sm btn-outline" onClick={() => setConfirming(false)}>Cancel</button>
      </div>
    );
  }

  return <button className="btn btn-sm btn-danger" onClick={() => setConfirming(true)}>Delete</button>;
}

function RefreshButton({ onRefreshed }) {
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await api.post('/refresh-prices');
      await onRefreshed();
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button className="btn btn-sm btn-outline" onClick={handleRefresh} disabled={loading}>
      {loading ? 'Updating...' : 'Refresh Prices'}
    </button>
  );
}

function PortfolioChart({ snapshots }) {
  const userIds = Object.keys(snapshots);
  if (userIds.length === 0) {
    return <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No data yet. Portfolio chart will appear after price updates.</div>;
  }

  // Build unified time labels
  const allTimes = new Set();
  userIds.forEach(uid => snapshots[uid].data.forEach(d => allTimes.add(d.time)));
  const sortedTimes = Array.from(allTimes).sort();
  const labels = sortedTimes.map(t => {
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  });

  const datasets = userIds.map((uid, i) => {
    const userData = snapshots[uid];
    const dataMap = {};
    userData.data.forEach(d => { dataMap[d.time] = d.value; });

    return {
      label: userData.displayName,
      data: sortedTimes.map(t => dataMap[t] ?? null),
      borderColor: COLORS[i % COLORS.length],
      backgroundColor: COLORS[i % COLORS.length] + '20',
      tension: 0.3,
      pointRadius: 2,
      fill: false,
      spanGaps: true,
    };
  });

  return (
    <Line
      data={{ labels, datasets }}
      options={{
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { color: '#8b8fa3' } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${formatEur(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: { ticks: { color: '#8b8fa3', maxTicksLimit: 10 }, grid: { color: '#2e3345' } },
          y: {
            ticks: {
              color: '#8b8fa3',
              callback: (v) => formatEur(v),
            },
            grid: { color: '#2e3345' },
          },
        },
      }}
    />
  );
}

function TradeForm({ competitionId, onTraded }) {
  const [ticker, setTicker] = useState('');
  const [mode, setMode] = useState('shares'); // 'shares' or 'value'
  const [amount, setAmount] = useState('');
  const [action, setAction] = useState('BUY');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const endpoint = action === 'BUY' ? 'buy' : 'sell';
      const body = { ticker };
      if (mode === 'shares') body.shares = parseFloat(amount);
      else body.totalValue = parseFloat(amount);

      const { data } = await api.post(`/investments/${competitionId}/${endpoint}`, body);
      setMessage(`${action === 'BUY' ? 'Bought' : 'Sold'} ${data.shares.toFixed(4)} shares of ${data.ticker} at $${data.pricePerShare.toFixed(2)}`);
      setTicker('');
      setAmount('');
      onTraded();
    } catch (err) {
      setError(err.response?.data?.error || 'Trade failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="section-title">Place a Trade</div>
      {error && <div className="error-msg">{error}</div>}
      {message && <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid var(--green)', color: 'var(--green)', padding: '0.5rem 0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>{message}</div>}
      <form onSubmit={handleSubmit}>
        <div className="trade-form">
          <div className="form-group">
            <label>Ticker</label>
            <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="AAPL" required />
          </div>
          <div className="form-group">
            <label>Input Type</label>
            <select value={mode} onChange={e => setMode(e.target.value)}>
              <option value="shares">Number of Shares</option>
              <option value="value">Euro Amount (&euro;)</option>
            </select>
          </div>
          <div className="form-group">
            <label>{mode === 'shares' ? 'Shares' : 'Amount (\u20AC)'}</label>
            <input type="number" step="any" min="0.0001" value={amount} onChange={e => setAmount(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Action</label>
            <select value={action} onChange={e => setAction(e.target.value)}>
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </div>
          <button className={`btn ${action === 'BUY' ? 'btn-success' : 'btn-danger'}`} disabled={loading} style={{ height: '38px' }}>
            {loading ? '...' : action}
          </button>
        </div>
      </form>
    </div>
  );
}

function HoldingsTable({ holdings }) {
  if (holdings.length === 0) {
    return <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No holdings yet. Buy some stocks!</div>;
  }

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <table className="holdings-table">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Shares</th>
            <th>Avg Price</th>
            <th>Current Price</th>
            <th>Value (EUR)</th>
            <th>P/L %</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map(h => (
            <tr key={h.ticker}>
              <td style={{ fontWeight: 600 }}>{h.ticker}</td>
              <td>{h.shares.toFixed(4)}</td>
              <td>${h.avgPrice.toFixed(2)}</td>
              <td>${h.currentPrice.toFixed(2)}</td>
              <td style={{ fontFamily: 'monospace' }}>{formatEur(h.currentValueEur)}</td>
              <td className={h.gainLossPct >= 0 ? 'positive' : 'negative'}>
                {h.gainLossPct >= 0 ? '+' : ''}{h.gainLossPct.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionHistory({ transactions }) {
  if (transactions.length === 0) {
    return <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No transactions yet.</div>;
  }

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <table className="holdings-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Ticker</th>
            <th>Shares</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map(tx => (
            <tr key={tx.id}>
              <td>{new Date(tx.createdAt).toLocaleString()}</td>
              <td className={tx.type === 'BUY' ? 'positive' : 'negative'}>{tx.type}</td>
              <td style={{ fontWeight: 600 }}>{tx.ticker}</td>
              <td>{tx.shares.toFixed(4)}</td>
              <td>${tx.pricePerShare.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatEur(value) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value || 0);
}
