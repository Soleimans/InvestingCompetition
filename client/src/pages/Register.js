import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

export default function Register({ onLogin }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', { username, password, displayName: displayName || username });
      onLogin(data.user, data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>InvestComp</h1>
        <p className="subtitle">Create your account</p>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-group">
          <label>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} required autoFocus />
        </div>
        <div className="form-group">
          <label>Display Name</label>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="How your friends see you" />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <button className="btn" disabled={loading}>{loading ? 'Creating...' : 'Create Account'}</button>
        <p className="auth-link">Already have an account? <Link to="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
