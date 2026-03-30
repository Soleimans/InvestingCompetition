import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { username, password });
      onLogin(data.user, data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>InvestComp</h1>
        <p className="subtitle">Sign in to your account</p>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-group">
          <label>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} required autoFocus />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <button className="btn" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
        <p className="auth-link">Don't have an account? <Link to="/register">Register</Link></p>
      </form>
    </div>
  );
}
