import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Competition from './pages/Competition';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <Router>
      <div className="app">
        {user && (
          <nav className="navbar">
            <a href="/" className="nav-brand">InvestComp</a>
            <div className="nav-right">
              <span className="nav-user">
                {user.avatarUrl && <img src={user.avatarUrl} alt="" className="nav-avatar" />}
                {user.displayName}
              </span>
              <button onClick={handleLogout} className="btn btn-sm">Logout</button>
            </div>
          </nav>
        )}
        <main className="main-content">
          <Routes>
            <Route path="/login" element={
              user ? <Navigate to="/" /> : <Login onLogin={handleLogin} />
            } />
            <Route path="/register" element={
              user ? <Navigate to="/" /> : <Register onLogin={handleLogin} />
            } />
            <Route path="/" element={
              user ? <Dashboard user={user} /> : <Navigate to="/login" />
            } />
            <Route path="/competition/:id" element={
              user ? <Competition user={user} /> : <Navigate to="/login" />
            } />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
