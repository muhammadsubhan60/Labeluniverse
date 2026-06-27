import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { EyeIcon, EyeSlashIcon, ExclamationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import BrandMonogram from '../components/BrandMonogram';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

const inp: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.75rem',
  background: 'var(--navy-50)', border: '1.5px solid var(--navy-200)',
  borderRadius: 8, color: 'var(--navy-900)', fontSize: '0.84rem',
  fontFamily: FONT, outline: 'none',
  transition: 'border-color 0.18s, box-shadow 0.18s',
  boxSizing: 'border-box',
};

const lbl: React.CSSProperties = {
  display: 'block', fontSize: '0.68rem', fontWeight: 700,
  color: 'var(--navy-500)', textTransform: 'uppercase',
  letterSpacing: '0.08em', marginBottom: 5,
};

function checkRules(pw: string) {
  return {
    length:  pw.length >= 5,
    special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(pw),
  };
}

const SetPassword: React.FC = () => {
  const navigate = useNavigate();
  const { authenticateWithToken } = useAuth();

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [showCf, setShowCf]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const rules = checkRules(password);
  const setupToken = sessionStorage.getItem('setupToken');

  useEffect(() => {
    if (!setupToken) navigate('/signup');
  }, [setupToken, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rules.length || !rules.special) {
      setError('Password must be at least 5 characters and contain at least one special character.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/auth/set-password`, { setupToken, password });
      sessionStorage.removeItem('setupToken');
      authenticateWithToken(res.data.token, res.data.user);
      (window as any).gtag?.('event', 'sign_up', { method: 'email' });
      (window as any).fbq?.('track', 'CompleteRegistration');
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to set password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy-50)', padding: '24px 16px', fontFamily: FONT }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 34, height: 34, background: '#0F172A', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BrandMonogram size={18} color="#fff" strokeWidth={2.2} />
            </div>
            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.4px' }}>Label Flow</span>
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--navy-200)', borderRadius: 16, padding: '36px 32px', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.5px', marginBottom: 4 }}>Set your password</h3>
            <p style={{ fontSize: '0.83rem', color: 'var(--navy-500)' }}>Choose a password to access your account.</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={lbl}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'} required
                  value={password} onChange={e => setPassword(e.target.value)}
                  style={{ ...inp, paddingRight: '2.4rem' }} placeholder="Min. 5 chars + special char"
                  onFocus={e => Object.assign(e.currentTarget.style, { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99,102,241,0.12)' })}
                  onBlur={e => Object.assign(e.currentTarget.style, { borderColor: 'var(--navy-200)', boxShadow: 'none' })}
                />
                <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 0, display: 'flex' }}>
                  {showPw ? <EyeSlashIcon style={{ width: 16, height: 16 }} /> : <EyeIcon style={{ width: 16, height: 16 }} />}
                </button>
              </div>

              {/* Live rules */}
              {password && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[
                    { ok: rules.length,  label: 'At least 5 characters' },
                    { ok: rules.special, label: 'Contains a special character (!@#$% etc.)' },
                  ].map(({ ok, label }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: ok ? '#16a34a' : 'var(--navy-400)' }}>
                      <CheckCircleIcon style={{ width: 13, height: 13, flexShrink: 0, color: ok ? '#16a34a' : 'var(--navy-300)' }} />
                      {label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label style={lbl}>Confirm Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showCf ? 'text' : 'password'} required
                  value={confirm} onChange={e => setConfirm(e.target.value)}
                  style={{ ...inp, paddingRight: '2.4rem' }} placeholder="Re-enter password"
                  onFocus={e => Object.assign(e.currentTarget.style, { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99,102,241,0.12)' })}
                  onBlur={e => Object.assign(e.currentTarget.style, { borderColor: 'var(--navy-200)', boxShadow: 'none' })}
                />
                <button type="button" onClick={() => setShowCf(!showCf)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 0, display: 'flex' }}>
                  {showCf ? <EyeSlashIcon style={{ width: 16, height: 16 }} /> : <EyeIcon style={{ width: 16, height: 16 }} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, fontSize: '0.8rem', color: '#dc2626', fontWeight: 500 }}>
                <ExclamationCircleIcon style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', padding: '0.65rem',
                background: loading ? 'var(--navy-300)' : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                border: 'none', borderRadius: 8, color: '#fff', fontSize: '0.88rem', fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer', fontFamily: FONT,
                opacity: loading ? 0.7 : 1,
                boxShadow: loading ? 'none' : '0 4px 14px rgba(99,102,241,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 4,
              }}
            >
              {loading ? (
                <>
                  <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
                  Setting up...
                </>
              ) : 'Set Password & Enter Portal'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SetPassword;
