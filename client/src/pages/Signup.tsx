import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ShieldCheckIcon, ClockIcon, TruckIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import BrandMonogram from '../components/BrandMonogram';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

function useViewport() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return w;
}

const sideFeatures = [
  { icon: ShieldCheckIcon, text: 'Secure, role-based access control' },
  { icon: ClockIcon,       text: 'Fast daily shipping workflow' },
  { icon: TruckIcon,       text: 'Bulk labels and manifest operations' },
];

const inp: React.CSSProperties = {
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

const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: '0.68rem',
  fontWeight: 700,
  color: 'var(--navy-500)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 5,
  fontFamily: FONT,
};

const focusI = (e: React.FocusEvent<HTMLInputElement>) =>
  Object.assign(e.currentTarget.style, { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99,102,241,0.12)', background: 'var(--bg-card)' });
const blurI = (e: React.FocusEvent<HTMLInputElement>) =>
  Object.assign(e.currentTarget.style, { borderColor: 'var(--navy-200)', boxShadow: 'none', background: 'var(--navy-50)' });

const Signup: React.FC = () => {
  const vw = useViewport();
  const isMobile = vw < 768;
  const isTablet = vw >= 768 && vw < 1024;

  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/auth/register`, form);
      (window as any).gtag?.('event', 'signup_started', { method: 'email' });
      (window as any).fbq?.('track', 'Lead');
      navigate(`/verify-otp?email=${encodeURIComponent(form.email)}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: isMobile ? 'column' : 'row', fontFamily: FONT, overflow: 'hidden' }}>

      {/* Brand panel */}
      {!isMobile && (
        <div style={{
          width: isTablet ? '42%' : '46%',
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 58%, #1e3a8a 100%)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: isTablet ? '48px 40px' : '60px 64px',
          position: 'relative', overflow: 'hidden', flexShrink: 0,
        }}>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 80% 60% at 10% 100%, rgba(99,102,241,0.32) 0%, transparent 65%)' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 44 }}>
              <div style={{ width: 36, height: 36, background: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <BrandMonogram size={19} color="#111" strokeWidth={2.3} />
              </div>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.4px' }}>
                Label<span style={{ color: 'rgba(255,255,255,0.55)' }}> Universe</span>
              </span>
            </div>
            <h2 style={{ fontSize: isTablet ? '1.75rem' : 'clamp(1.85rem, 2.8vw, 2.4rem)', fontWeight: 900, color: '#fff', letterSpacing: '-1px', lineHeight: 1.1, marginBottom: 14 }}>
              Create your<br /><span style={{ color: '#818cf8' }}>free account.</span>
            </h2>
            <p style={{ fontSize: '0.87rem', color: 'rgba(255,255,255,0.44)', lineHeight: 1.72, marginBottom: 32, fontWeight: 400, maxWidth: 320 }}>
              Get access to Label Flow and start managing your shipping operation.
            </p>
            {sideFeatures.map(({ icon: Icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(129,140,248,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon style={{ width: 14, height: 14, color: '#a5b4fc' }} />
                </div>
                <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form panel */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: isMobile ? 'flex-start' : 'center',
        padding: isMobile ? '0' : isTablet ? '32px 24px' : '48px 40px',
        background: 'var(--navy-50)', minHeight: isMobile ? '100vh' : undefined,
      }}>
        {isMobile && (
          <div style={{ width: '100%', background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #1e3a8a 100%)', padding: '26px 24px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '22px 22px', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, position: 'relative', zIndex: 1 }}>
              <div style={{ width: 32, height: 32, background: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BrandMonogram size={17} color="#111" strokeWidth={2.2} />
              </div>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.4px' }}>
                Label<span style={{ color: 'rgba(255,255,255,0.55)' }}> Universe</span>
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)', textAlign: 'center', position: 'relative', zIndex: 1 }}>Create your free account</p>
          </div>
        )}

        <div style={{
          width: '100%', maxWidth: isMobile ? '100%' : 420,
          background: 'var(--bg-card)',
          border: isMobile ? 'none' : '1px solid var(--navy-200)',
          borderRadius: isMobile ? 0 : 16,
          padding: isMobile ? '28px 20px 40px' : '40px 36px',
          boxShadow: isMobile ? 'none' : 'var(--shadow-lg)',
        }}>

          <>
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.6px', marginBottom: 4 }}>Create account</h3>
                <p style={{ fontSize: '0.83rem', color: 'var(--navy-500)', fontWeight: 400 }}>We'll send a 6-digit code to verify your email</p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={lbl}>First Name</label>
                    <input name="firstName" required style={inp} placeholder="Jane" value={form.firstName} onChange={handleChange} onFocus={focusI} onBlur={blurI} />
                  </div>
                  <div>
                    <label style={lbl}>Last Name</label>
                    <input name="lastName" required style={inp} placeholder="Smith" value={form.lastName} onChange={handleChange} onFocus={focusI} onBlur={blurI} />
                  </div>
                </div>

                <div>
                  <label style={lbl}>Email Address</label>
                  <input name="email" type="email" required style={inp} placeholder="you@example.com" value={form.email} onChange={handleChange} onFocus={focusI} onBlur={blurI} />
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
                    background: loading ? 'var(--navy-300)' : 'linear-gradient(135deg, var(--accent-500) 0%, #4f46e5 100%)',
                    border: 'none', borderRadius: 8,
                    color: '#fff', fontSize: '0.88rem', fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer', fontFamily: FONT,
                    marginTop: 4, opacity: loading ? 0.7 : 1,
                    boxShadow: loading ? 'none' : '0 4px 14px rgba(99,102,241,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  }}
                >
                  {loading ? (
                    <>
                      <div style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
                      Sending code...
                    </>
                  ) : 'Send Verification Code'}
                </button>
              </form>

              <div style={{ height: 1, background: 'var(--navy-100)', margin: '20px 0' }} />
              <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--navy-500)' }}>
                Already have an account?{' '}
                <Link to="/login" style={{ color: 'var(--accent-500)', fontWeight: 700, textDecoration: 'none' }}>Sign in</Link>
              </p>
            </>
        </div>
      </div>
    </div>
  );
};

export default Signup;
