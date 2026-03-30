import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';

export default function Dashboard({ user }) {
  const [competitions, setCompetitions] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadCompetitions();
  }, []);

const loadCompetitions = async () => {
    try {
      const { data } = await api.get('/competitions');
      setCompetitions(data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <div className="dashboard-header">
        <h1>My Competitions</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn" onClick={() => setShowCreate(true)}>Create Competition</button>
          <button className="btn btn-outline" onClick={() => setShowJoin(true)}>Join Competition</button>
        </div>
      </div>

      {competitions.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>No competitions yet</h3>
          <p style={{ color: 'var(--text-muted)' }}>Create one or join with an invite code!</p>
        </div>
      )}

      <div className="competitions-grid">
        {competitions.map(comp => (
          <Link to={`/competition/${comp.id}`} key={comp.id} className="comp-card">
            <h3>{comp.name}</h3>
            {comp.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{comp.description}</p>}
            <div className="comp-meta">
              <span>{comp.memberCount} members</span>
              <span>Started {new Date(comp.startDate).toLocaleDateString()}</span>
            </div>
          </Link>
        ))}
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={(comp) => { setShowCreate(false); navigate(`/competition/${comp.id}`); }} />}
      {showJoin && <JoinModal onClose={() => setShowJoin(false)} onJoined={(comp) => { setShowJoin(false); navigate(`/competition/${comp.id}`); }} />}
    </div>
  );
}

function CreateModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/competitions', { name, description, startDate, endDate: endDate || null });
      onCreated(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Create Competition</h2>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-group">
          <label>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} required autoFocus />
        </div>
        <div className="form-group">
          <label>Description (optional)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
        </div>
        <div className="form-group">
          <label>Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>End Date (optional)</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={loading}>{loading ? 'Creating...' : 'Create'}</button>
        </div>
      </form>
    </div>
  );
}

function JoinModal({ onClose, onJoined }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/competitions/join', { inviteCode: code });
      onJoined(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Join Competition</h2>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-group">
          <label>Invite Code</label>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. A1B2C3D4" required autoFocus style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={loading}>{loading ? 'Joining...' : 'Join'}</button>
        </div>
      </form>
    </div>
  );
}
