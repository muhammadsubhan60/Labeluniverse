import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

interface AdminAccount {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  userCount: number;
  currentBalance: number;
}

interface BalancePanel {
  adminId: string;
  adminName: string;
  currentBalance: number;
}

// ── Setup page (no superadmin exists yet) ─────────────────────────
function SetupPage() {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await axios.post(`${API_BASE}/superadmin/setup`, form);
      setDone(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div style={centeredBox}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
          <h2 style={{ margin: '0 0 8px', color: '#1e293b' }}>Super admin created</h2>
          <p style={{ color: '#64748b', marginBottom: 24 }}>
            All existing data has been migrated to the default tenant.
            You can now log in with your super admin credentials.
          </p>
          <a href="/login" style={btnPrimary}>Go to Login</a>
        </div>
      </div>
    );
  }

  return (
    <div style={centeredBox}>
      <div style={card}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, color: '#1e293b' }}>Super Admin Setup</h1>
        <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 14 }}>
          One-time setup. This will migrate all existing data to the default tenant.
        </p>
        {error && <div style={errorBox}>{error}</div>}
        <form onSubmit={submit}>
          <div style={row2}>
            <div style={field}>
              <label style={lbl}>First Name</label>
              <input style={inp} name="firstName" value={form.firstName} onChange={handle} required />
            </div>
            <div style={field}>
              <label style={lbl}>Last Name</label>
              <input style={inp} name="lastName" value={form.lastName} onChange={handle} required />
            </div>
          </div>
          <div style={field}>
            <label style={lbl}>Email</label>
            <input style={inp} name="email" type="email" value={form.email} onChange={handle} required />
          </div>
          <div style={field}>
            <label style={lbl}>Password</label>
            <input style={inp} name="password" type="password" value={form.password} onChange={handle} required minLength={8} />
          </div>
          <button style={{ ...btnPrimary, width: '100%', marginTop: 8 }} type="submit" disabled={loading}>
            {loading ? 'Setting up...' : 'Create Super Admin'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────
export default function SuperAdminDashboard() {
  const { token, logout, user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [balancePanel, setBalancePanel] = useState<BalancePanel | null>(null);
  const [balanceForm, setBalanceForm] = useState({ type: 'topup', amount: '', description: '' });
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState('');

  const authH = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    axios.get(`${API_BASE}/superadmin/status`).then(r => setConfigured(r.data.configured));
  }, []);

  // Once we know setup is done and auth is resolved, redirect non-superadmin users
  useEffect(() => {
    if (configured && !authLoading) {
      if (!token) { navigate('/login'); return; }
      if (user && user.role !== 'superadmin') navigate('/dashboard');
    }
  }, [configured, authLoading, token, user, navigate]);

  const fetchAdmins = useCallback(() => {
    setLoading(true);
    axios.get(`${API_BASE}/superadmin/admins`, { headers: authH() })
      .then(r => setAdmins(r.data.admins))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authH]);

  useEffect(() => { if (configured) fetchAdmins(); }, [configured, fetchAdmins]);

  if (configured === null || (configured && authLoading)) return null;
  if (!configured) return <SetupPage />;

  const handle = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const createAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      await axios.post(`${API_BASE}/superadmin/admins`, form, { headers: authH() });
      setForm({ firstName: '', lastName: '', email: '', password: '' });
      setShowCreate(false);
      fetchAdmins();
    } catch (err: any) {
      setCreateError(err.response?.data?.message || 'Failed to create admin');
    } finally {
      setCreating(false);
    }
  };

  const revokeAdmin = async (id: string) => {
    setActionLoading(id + '-revoke');
    try {
      await axios.put(`${API_BASE}/superadmin/admins/${id}/revoke`, {}, { headers: authH() });
      fetchAdmins();
    } finally {
      setActionLoading(null);
    }
  };

  const restoreAdmin = async (id: string) => {
    setActionLoading(id + '-restore');
    try {
      await axios.put(`${API_BASE}/superadmin/admins/${id}/restore`, {}, { headers: authH() });
      fetchAdmins();
    } finally {
      setActionLoading(null);
    }
  };

  const openBalance = (admin: AdminAccount) => {
    setBalancePanel({ adminId: admin._id, adminName: `${admin.firstName} ${admin.lastName}`, currentBalance: admin.currentBalance });
    setBalanceForm({ type: 'topup', amount: '', description: '' });
    setBalanceError('');
  };

  const submitBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!balancePanel) return;
    setBalanceLoading(true);
    setBalanceError('');
    try {
      const r = await axios.post(
        `${API_BASE}/superadmin/admins/${balancePanel.adminId}/balance`,
        balanceForm,
        { headers: authH() }
      );
      setBalancePanel(p => p ? { ...p, currentBalance: r.data.currentBalance } : null);
      setBalanceForm(f => ({ ...f, amount: '', description: '' }));
      fetchAdmins();
    } catch (err: any) {
      setBalanceError(err.response?.data?.message || 'Failed to update balance');
    } finally {
      setBalanceLoading(false);
    }
  };

  const deleteAdmin = async (id: string, name: string) => {
    if (!window.confirm(`Delete admin "${name}" and ALL their tenant data? This cannot be undone.`)) return;
    setActionLoading(id + '-delete');
    try {
      await axios.delete(`${API_BASE}/superadmin/admins/${id}`, { headers: authH() });
      fetchAdmins();
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ background: '#0f172a', color: '#fff', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Super Admin</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Partner management</div>
        </div>
        <button onClick={logout} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          Sign out
        </button>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, color: '#1e293b', fontWeight: 700 }}>Partner Admins</h1>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>{admins.length} partner{admins.length !== 1 ? 's' : ''}</p>
          </div>
          <button style={btnPrimary} onClick={() => { setShowCreate(true); setCreateError(''); }}>
            + New Admin
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div style={{ ...card, marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, color: '#1e293b' }}>Create Partner Admin</h3>
            {createError && <div style={errorBox}>{createError}</div>}
            <form onSubmit={createAdmin}>
              <div style={row2}>
                <div style={field}>
                  <label style={lbl}>First Name</label>
                  <input style={inp} name="firstName" value={form.firstName} onChange={handle} required />
                </div>
                <div style={field}>
                  <label style={lbl}>Last Name</label>
                  <input style={inp} name="lastName" value={form.lastName} onChange={handle} required />
                </div>
              </div>
              <div style={row2}>
                <div style={field}>
                  <label style={lbl}>Email</label>
                  <input style={inp} name="email" type="email" value={form.email} onChange={handle} required />
                </div>
                <div style={field}>
                  <label style={lbl}>Password</label>
                  <input style={inp} name="password" type="password" value={form.password} onChange={handle} required minLength={8} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button style={btnPrimary} type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create'}</button>
                <button style={btnGhost} type="button" onClick={() => setShowCreate(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Balance panel */}
        {balancePanel && (
          <div style={{ ...card, marginBottom: 24, borderLeft: '3px solid #6366f1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 15 }}>Balance — {balancePanel.adminName}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#6366f1', marginTop: 4 }}>
                  ${balancePanel.currentBalance.toFixed(2)}
                </div>
              </div>
              <button onClick={() => setBalancePanel(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            {balanceError && <div style={errorBox}>{balanceError}</div>}
            <form onSubmit={submitBalance} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 140px' }}>
                <label style={lbl}>Type</label>
                <select
                  value={balanceForm.type}
                  onChange={e => setBalanceForm(f => ({ ...f, type: e.target.value }))}
                  style={{ ...inp, cursor: 'pointer' }}
                >
                  <option value="topup">Add Balance</option>
                  <option value="deduct">Deduct Balance</option>
                  <option value="adjust">Adjust (signed)</option>
                </select>
              </div>
              <div style={{ flex: '0 0 130px' }}>
                <label style={lbl}>Amount ($)</label>
                <input
                  style={inp}
                  type="number"
                  step="0.01"
                  placeholder={balanceForm.type === 'adjust' ? '±0.00' : '0.00'}
                  value={balanceForm.amount}
                  onChange={e => setBalanceForm(f => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={lbl}>Note (optional)</label>
                <input
                  style={inp}
                  placeholder="Reason..."
                  value={balanceForm.description}
                  onChange={e => setBalanceForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <button style={{ ...btnPrimary, marginBottom: 1 }} type="submit" disabled={balanceLoading}>
                {balanceLoading ? '...' : 'Apply'}
              </button>
            </form>
          </div>
        )}

        {/* Admin list */}
        <div style={card}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>Loading...</div>
          ) : admins.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
              <div style={{ fontWeight: 600, color: '#475569' }}>No partner admins yet</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Create the first partner to get started.</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  {['Partner', 'Email', 'Users', 'Balance', 'Status', 'Created', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {admins.map(admin => (
                  <tr key={admin._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{admin.firstName} {admin.lastName}</div>
                    </td>
                    <td style={td}>
                      <span style={{ color: '#475569', fontSize: 13 }}>{admin.email}</span>
                    </td>
                    <td style={td}>
                      <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#475569' }}>
                        {admin.userCount}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ fontWeight: 700, color: admin.currentBalance > 0 ? '#15803d' : '#94a3b8', fontSize: 13 }}>
                        ${(admin.currentBalance || 0).toFixed(2)}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 10px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                        background: admin.isActive ? '#dcfce7' : '#fee2e2',
                        color: admin.isActive ? '#15803d' : '#dc2626',
                      }}>
                        {admin.isActive ? 'Active' : 'Revoked'}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>
                        {new Date(admin.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          style={{ ...btnGhost, padding: '5px 12px', fontSize: 12 }}
                          onClick={() => openBalance(admin)}
                        >
                          Balance
                        </button>
                        {admin.isActive ? (
                          <button
                            style={btnWarning}
                            onClick={() => revokeAdmin(admin._id)}
                            disabled={actionLoading === admin._id + '-revoke'}
                          >
                            {actionLoading === admin._id + '-revoke' ? '...' : 'Revoke'}
                          </button>
                        ) : (
                          <button
                            style={btnSuccess}
                            onClick={() => restoreAdmin(admin._id)}
                            disabled={actionLoading === admin._id + '-restore'}
                          >
                            {actionLoading === admin._id + '-restore' ? '...' : 'Restore'}
                          </button>
                        )}
                        <button
                          style={btnDanger}
                          onClick={() => deleteAdmin(admin._id, `${admin.firstName} ${admin.lastName}`)}
                          disabled={!!actionLoading}
                        >
                          {actionLoading === admin._id + '-delete' ? '...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const centeredBox: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f1f5f9',
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  padding: 24,
};

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  border: '1px solid #e2e8f0',
  padding: 28,
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

const errorBox: React.CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#dc2626',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 13,
  marginBottom: 16,
};

const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 6,
};

const inp: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const field: React.CSSProperties = { flex: 1, marginBottom: 14 };
const row2: React.CSSProperties = { display: 'flex', gap: 12 };
const td: React.CSSProperties = { padding: '12px 14px', verticalAlign: 'middle' };

const btnBase: React.CSSProperties = {
  padding: '7px 16px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  border: 'none',
  display: 'inline-block',
  textDecoration: 'none',
  fontFamily: 'inherit',
};

const btnPrimary: React.CSSProperties = { ...btnBase, background: '#6366f1', color: '#fff' };
const btnGhost: React.CSSProperties = { ...btnBase, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' };
const btnWarning: React.CSSProperties = { ...btnBase, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '5px 12px' };
const btnSuccess: React.CSSProperties = { ...btnBase, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '5px 12px' };
const btnDanger: React.CSSProperties = { ...btnBase, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '5px 12px' };
