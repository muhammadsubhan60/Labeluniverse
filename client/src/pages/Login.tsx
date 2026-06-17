import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  EyeIcon, EyeSlashIcon, TruckIcon, ShieldCheckIcon, ClockIcon,
  ExclamationCircleIcon, CheckCircleIcon,
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

const Login: React.FC = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const { login, isAuthenticated, isLoading, error } = useAuth();
  const navigate = useNavigate();
  const vw = useViewport();

  const isMobile = vw < 640;
  const isTablet = vw >= 640 && vw < 1024;

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard');
  }, [isAuthenticated, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await login(formData.email, formData.password); } catch {}
  };

  const features = [
    { icon: ShieldCheckIcon, title: 'Secure by default', desc: 'TLS-protected sessions and role-based access.' },
    { icon: ClockIcon,       title: 'Fast daily flow',   desc: 'Compare rates and print labels in minutes.' },
    { icon: TruckIcon,       title: 'Bulk-ready ops',    desc: 'Batch shipping for high-volume seller teams.' },
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
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }} />
          {/* Indigo glow */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 70% 55% at 50% 85%, rgba(99,102,241,0.28) 0%, transparent 70%)',
          }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Logo */}
            <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48, textDecoration: 'none' }}>
              <div style={{
                width: 38, height: 38, background: '#fff',
                border: '1px solid rgba(255,255,255,0.45)', borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <BrandMonogram size={20} color="#111" strokeWidth={2.3} />
              </div>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.4px', fontFamily: FONT }}>
                Label<span style={{ opacity: 0.75 }}> Universe</span>
              </span>
            </a>

            {/* Headline */}
            <h2 style={{
              fontSize: isTablet ? '1.8rem' : 'clamp(1.9rem, 3vw, 2.6rem)',
              fontWeight: 900, color: '#fff', letterSpacing: '-1.2px',
              lineHeight: 1.1, marginBottom: 16, fontFamily: FONT,
            }}>
              Keep every label<br />
              in <span style={{ color: '#818cf8' }}>one modern flow.</span>
            </h2>
            <p style={{
              fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)',
              lineHeight: 1.75, marginBottom: 36, fontWeight: 400,
              maxWidth: 340, fontFamily: FONT,
            }}>
              Sign in to compare USPS, FedEx, and UPS rates, then run single or bulk shipping from one workspace.
            </p>

            {/* Feature bullets */}
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 8,
                  background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(129,140,248,0.28)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon style={{ width: 16, height: 16, color: '#a5b4fc' }} />
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', marginBottom: 2, fontFamily: FONT }}>{title}</div>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.5, fontFamily: FONT }}>{desc}</div>
                </div>
              </div>
            ))}

            {/* Carrier row */}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '24px 0 18px' }} />
            <div style={{
              fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '2px', color: 'rgba(255,255,255,0.22)',
              marginBottom: 10, fontFamily: FONT,
            }}>
              Works with all major carriers
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              {[
                { label: 'USPS', c: '#60a5fa' },
                { label: 'FedEx', c: '#c084fc' },
                { label: 'UPS',  c: '#fbbf24' },
                { label: 'DHL',  c: '#f97316' },
              ].map(({ label: l, c }) => (
                <span key={l} style={{
                  padding: '5px 12px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  borderRadius: 100,
                  fontSize: '11px', fontWeight: 700, color: c, fontFamily: FONT,
                }}>{l}</span>
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
            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 58%, #1e3a8a 100%)',
            padding: '28px 24px 32px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 12 }}>
              <div style={{
                width: 34, height: 34, background: '#fff',
                border: '1px solid rgba(255,255,255,0.45)', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <BrandMonogram size={18} color="#111" strokeWidth={2.2} />
              </div>
              <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.4px', fontFamily: FONT }}>
                Label Universe
              </span>
            </a>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', textAlign: 'center', fontFamily: FONT }}>
              Shipping labels for US ecom sellers
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

            {error && (
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
              { icon: ShieldCheckIcon, label: 'Secure' },
              { icon: CheckCircleIcon, label: 'USPS Ready' },
              { icon: TruckIcon,       label: 'US Support' },
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
