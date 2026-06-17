import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Shell from './components/Shell.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Agenda from './pages/Agenda.jsx';
import BotConfig from './pages/BotConfig.jsx';
import Conversations from './pages/Conversations.jsx';
import WhatsAppSetup from './pages/WhatsAppSetup.jsx';
import Simulator from './pages/Simulator.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  const refreshTenant = useCallback(async () => {
    const data = await api('/tenant');
    setTenant(data.tenant);
    return data.tenant;
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then((data) => {
        setUser(data.user);
        setTenant(data.tenant);
      })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = (data) => {
    setToken(data.token);
    setUser(data.user);
    return api('/auth/me').then((me) => setTenant(me.tenant));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setTenant(null);
  };

  if (loading) return <div className="spinner" />;

  const authed = !!user;

  return (
    <AuthContext.Provider value={{ user, tenant, setTenant, refreshTenant, login, logout }}>
      <Routes>
        <Route path="/" element={authed ? <Navigate to="/app" /> : <Landing />} />
        <Route path="/login" element={authed ? <Navigate to="/app" /> : <Login />} />
        <Route path="/registro" element={authed ? <Navigate to="/app" /> : <Register />} />
        <Route path="/app" element={authed ? <Shell /> : <Navigate to="/login" />}>
          <Route index element={<Dashboard />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="bot" element={<BotConfig />} />
          <Route path="conversaciones" element={<Conversations />} />
          <Route path="whatsapp" element={<WhatsAppSetup />} />
          <Route path="simulador" element={<Simulator />} />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </AuthContext.Provider>
  );
}
