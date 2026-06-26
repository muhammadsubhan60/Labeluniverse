import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  EyeIcon, EyeSlashIcon, ShieldCheckIcon,
  ExclamationCircleIcon, CheckCircleIcon,
  BoltIcon, CubeTransparentIcon, ChartBarIcon,
} from '@heroicons/react/24/outline';
import BrandMonogram from '../components/BrandMonogram';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

function useViewport() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return w;
}

const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

const Login: React.FC = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const { login, isAuthenticated, isLoading, error, user } = useAuth();
  const navigate = useNavigate();
  const vw = useViewport();

  const isMobile = vw < 640;
  const isTablet = vw >= 640 && vw < 1024;

  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === 'superadmin') navigate('/superadmin');
      else navigate('/dashboard');
    }
  }, [isAuthenticated, user, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNeedsVerification(false);
    setResendMsg('');
    try {
      await login(formData.email, formData.password);
    } catch (err: any) {
      if (err.response?.data?.needsVerification) {
        setNeedsVerification(true);
      }
    }
  };

  const handleResendVerification = async () => {
    setResendLoading(true);
    setResendMsg('');
    try {
      const axios = (await import('axios')).default;
      await axios.post(`${API_BASE}/auth/resend-verification`, { email: formData.email });
      setResendMsg('Verification email sent. Check your inbox.');
    } catch {
      setResendMsg('Failed to resend. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const features = [
    { icon: CubeTransparentIcon, title: 'Fully centralized',   desc: 'Orders, labels, balances, and team access — all under one roof.' },
    { icon: BoltIcon,            title: 'Deep integrations',    desc: 'Connected to every service your operation depends on, out of the box.' },
    { icon: ChartBarIcon,        title: 'Real-time visibility', desc: 'Live activity feeds, leaderboards, and instant balance updates.' },
    { icon: ShieldCheckIcon,     title: 'Role-based security',  desc: 'Admin, reseller, and user tiers with fine-grained access control.' },
  ];

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.6rem 0.75rem',
    background: 'var(--navy-50)',
    border: '1.5px solid var(--navy-200)',
    borderRadius: 8,
    color: 'var(--navy-900)',
    fontSize: '0.84rem',
    fontFamily: FONT,
    outline: 'none',
    transition: 'border-color 0.18s, box-shadow 0.18s, background 0.18s',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.68rem',
    fontWeight: 700,
    color: 'var(--navy-500)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 5,
    fontFamily: FONT,
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      fontFamily: FONT,
      overflow: 'hidden',
    }}>

      {/* ── Brand panel ── */}
      {!isMobile && (
        <div style={{
          width: isTablet ? '42%' : '46%',
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 58%, #1e3a8a 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: isTablet ? '48px 40px' : '60px 64px',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {/* Dot pattern */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }} />
          {/* Indigo glow — bottom-left origin */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 80% 60% at 10% 100%, rgba(99,102,241,0.32) 0%, transparent 65%)',
          }} />
          {/* Subtle top-right warmth */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 50% 40% at 100% 0%, rgba(30,58,138,0.4) 0%, transparent 60%)',
          }} />

          <div style={{ position: 'relative', zIndex: 1 }}>

            {/* Logo */}
            <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 44, textDecoration: 'none' }}>
              <div style={{
                width: 36, height: 36, background: '#fff',
                border: '1px solid rgba(255,255,255,0.4)', borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
              }}>
                <BrandMonogram size={19} color="#111" strokeWidth={2.3} />
              </div>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.4px', fontFamily: FONT }}>
                Label<span style={{ color: 'rgba(255,255,255,0.55)' }}> Universe</span>
              </span>
            </a>

            {/* Eyebrow */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 3, height: 16, background: '#818cf8', borderRadius: 99 }} />
              <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.13em', fontFamily: FONT }}>
                Operations Hub
              </span>
            </div>

            {/* Headline */}
            <h2 style={{
              fontSize: isTablet ? '1.75rem' : 'clamp(1.85rem, 2.8vw, 2.4rem)',
              fontWeight: 900, color: '#fff', letterSpacing: '-1px',
              lineHeight: 1.1, marginBottom: 14, fontFamily: FONT,
            }}>
              One hub.<br />
              <span style={{ color: '#818cf8' }}>Everything connected.</span>
            </h2>
            <p style={{
              fontSize: '0.87rem', color: 'rgba(255,255,255,0.44)',
              lineHeight: 1.72, marginBottom: 26, fontWeight: 400,
              maxWidth: 320, fontFamily: FONT,
            }}>
              A centralized workspace that integrates your entire shipping operation — labels, balances, team roles, and live activity in one place.
            </p>

            {/* Stat chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 28 }}>
              {[
                { n: '100%',   label: 'Centralized'  },
                { n: 'Live',   label: 'Activity Feed' },
                { n: 'Multi',  label: 'Integrations'  },
                { n: 'Tiered', label: 'Access Control' },
              ].map(({ n, label }) => (
                <div key={label} style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fff', fontFamily: FONT }}>{n}</span>
                  <span style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.34)', fontFamily: FONT }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Feature list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {features.map(({ icon: Icon, title, desc }) => (
                <div key={title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(129,140,248,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <Icon style={{ width: 13, height: 13, color: '#a5b4fc' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.88)', marginBottom: 2, fontFamily: FONT }}>{title}</div>
                    <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.34)', lineHeight: 1.55, fontFamily: FONT }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* ── Form panel ── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: isMobile ? 'flex-start' : 'center',
        padding: isMobile ? '0' : isTablet ? '32px 24px' : '48px 40px',
        background: 'var(--navy-50)',
        minHeight: isMobile ? '100vh' : undefined,
      }}>

        {/* Mobile top bar */}
        {isMobile && (
          <div style={{
            width: '100%',
            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #1e3a8a 100%)',
            padding: '26px 24px 30px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '22px 22px', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 10% 100%, rgba(99,102,241,0.25) 0%, transparent 65%)', pointerEvents: 'none' }} />
            <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', position: 'relative', zIndex: 1 }}>
              <div style={{
                width: 32, height: 32, background: '#fff',
                border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}>
                <BrandMonogram size={17} color="#111" strokeWidth={2.2} />
              </div>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.4px', fontFamily: FONT }}>
                Label<span style={{ color: 'rgba(255,255,255,0.55)' }}> Universe</span>
              </span>
            </a>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)', textAlign: 'center', fontFamily: FONT, position: 'relative', zIndex: 1 }}>
              One hub. Everything connected.
            </p>
          </div>
        )}

        {/* Form card */}
        <div style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 400,
          background: 'var(--bg-card)',
          border: isMobile ? 'none' : '1px solid var(--navy-200)',
          borderRadius: isMobile ? 0 : 16,
          padding: isMobile ? '28px 20px 40px' : '40px 36px',
          boxShadow: isMobile ? 'none' : 'var(--shadow-lg)',
        }}>
          <div style={{ marginBottom: 24 }}>
            <h3 style={{
              fontSize: '1.4rem', fontWeight: 800,
              color: 'var(--navy-900)', letterSpacing: '-0.6px',
              marginBottom: 4, fontFamily: FONT,
            }}>
              Welcome back
            </h3>
            <p style={{ fontSize: '0.83rem', color: 'var(--navy-500)', fontWeight: 400, fontFamily: FONT }}>
              Sign in to your Label Universe account
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label htmlFor="email" style={labelStyle}>Email Address</label>
              <input
                id="email" name="email" type="email" autoComplete="email" required
                style={inputStyle}
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                onFocus={e => Object.assign(e.currentTarget.style, {
                  borderColor: 'var(--accent-500)',
                  boxShadow: '0 0 0 3px rgba(99,102,241,0.13)',
                  background: 'var(--bg-card)',
                })}
                onBlur={e => Object.assign(e.currentTarget.style, {
                  borderColor: 'var(--navy-200)',
                  boxShadow: 'none',
                  background: 'var(--navy-50)',
                })}
              />
            </div>

            <div>
              <label htmlFor="password" style={labelStyle}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password" name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password" required
                  style={{ ...inputStyle, paddingRight: '2.4rem' }}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  onFocus={e => Object.assign(e.currentTarget.style, {
                    borderColor: 'var(--accent-500)',
                    boxShadow: '0 0 0 3px rgba(99,102,241,0.13)',
                    background: 'var(--bg-card)',
                  })}
                  onBlur={e => Object.assign(e.currentTarget.style, {
                    borderColor: 'var(--navy-200)',
                    boxShadow: 'none',
                    background: 'var(--navy-50)',
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: 10, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--navy-400)', padding: 0, display: 'flex',
                  }}
                >
                  {showPassword
                    ? <EyeSlashIcon style={{ width: 16, height: 16 }} />
                    : <EyeIcon      style={{ width: 16, height: 16 }} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4 }}>
              <Link to="/forgot-password" style={{ fontSize: '0.78rem', color: 'var(--accent-500)', fontWeight: 600, textDecoration: 'none', fontFamily: FONT }}>
                Forgot password?
              </Link>
            </div>

            {error && !needsVerification && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '10px 12px',
                background: '#fff1f2',
                border: '1px solid #fecdd3',
                borderRadius: 8,
                fontSize: '0.8rem', color: '#dc2626', fontWeight: 500, fontFamily: FONT,
              }}>
                <ExclamationCircleIcon style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            {needsVerification && (
              <div style={{ padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: '0.82rem', color: '#92400e', fontFamily: FONT }}>
                <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Email not verified</p>
                <p style={{ margin: '0 0 8px', fontWeight: 400 }}>Please verify your email before signing in.</p>
                {resendMsg
                  ? <p style={{ margin: 0, fontWeight: 600, color: resendMsg.includes('sent') ? '#15803d' : '#dc2626' }}>{resendMsg}</p>
                  : <button onClick={handleResendVerification} disabled={resendLoading} style={{ background: 'none', border: 'none', padding: 0, color: '#6366f1', fontWeight: 700, cursor: resendLoading ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontFamily: FONT }}>{resendLoading ? 'Sending...' : 'Resend verification email'}</button>
                }
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '0.65rem',
                background: isLoading
                  ? 'var(--navy-300)'
                  : 'linear-gradient(135deg, var(--accent-500) 0%, #4f46e5 100%)',
                border: 'none', borderRadius: 8,
                color: '#fff', fontSize: '0.88rem', fontWeight: 700,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontFamily: FONT,
                letterSpacing: '-0.1px',
                marginTop: 4,
                boxShadow: isLoading ? 'none' : '0 4px 14px rgba(99,102,241,0.3)',
                transition: 'opacity 0.18s, box-shadow 0.18s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              {isLoading ? (
                <>
                  <div style={{
                    width: 15, height: 15,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff', borderRadius: '50%',
                    animation: 'spin 0.75s linear infinite', flexShrink: 0,
                  }} />
                  Signing in...
                </>
              ) : 'Sign In'}
            </button>
          </form>

          <div style={{ height: 1, background: 'var(--navy-100)', margin: '20px 0' }} />

          {/* Trust chips */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
            {[
              { icon: ShieldCheckIcon, label: 'Secure'       },
              { icon: CheckCircleIcon, label: 'Centralized'  },
              { icon: BoltIcon,        label: 'Integrated'   },
            ].map(({ icon: Icon, label: l }) => (
              <span key={l} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px',
                background: 'var(--navy-50)',
                border: '1px solid var(--navy-200)',
                borderRadius: 100,
                fontSize: '10.5px', fontWeight: 700,
                color: 'var(--navy-500)', letterSpacing: '0.03em', fontFamily: FONT,
              }}>
                <Icon style={{ width: 11, height: 11 }} />
                {l}
              </span>
            ))}
          </div>

          <p style={{ textAlign: 'center', marginTop: 18, fontSize: '0.82rem', color: 'var(--navy-500)', fontFamily: FONT }}>
            Don't have an account?{' '}
            <Link
              to="/signup"
              style={{ color: 'var(--accent-500)', fontWeight: 700, textDecoration: 'none', fontFamily: FONT }}
            >
              Create free account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
