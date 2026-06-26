import React, { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ExclamationCircleIcon } from '@heroicons/react/24/outline';
import BrandMonogram from '../components/BrandMonogram';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

const VerifyOTP: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const email = params.get('email') || '';

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    setError('');
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (next.every(d => d) && value) {
      submitOtp(next.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = [...otp];
    text.split('').forEach((ch, i) => { if (i < 6) next[i] = ch; });
    setOtp(next);
    const focusIdx = Math.min(text.length, 5);
    inputRefs.current[focusIdx]?.focus();
    if (text.length === 6) submitOtp(text);
  };

  const submitOtp = async (code: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API_BASE}/auth/verify-otp`, { email, otp: code });
      sessionStorage.setItem('setupToken', res.data.setupToken);
      navigate('/set-password');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid code. Please try again.');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setResendMsg('');
    try {
      await axios.post(`${API_BASE}/auth/resend-otp`, { email });
      setResendMsg('New code sent. Check your inbox.');
      setCountdown(60);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch {
      setResendMsg('Failed to resend. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const boxStyle = (filled: boolean): React.CSSProperties => ({
    width: 48, height: 56, borderRadius: 10,
    border: `2px solid ${filled ? '#6366f1' : 'var(--navy-200)'}`,
    background: filled ? 'linear-gradient(135deg, #f0f4ff, #e8eeff)' : 'var(--navy-50)',
    fontSize: '1.5rem', fontWeight: 800, textAlign: 'center',
    color: 'var(--navy-900)', fontFamily: 'monospace',
    outline: 'none', cursor: 'text',
    transition: 'border-color 0.15s, background 0.15s',
    caretColor: '#6366f1',
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy-50)', padding: '24px 16px', fontFamily: FONT }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 34, height: 34, background: '#0F172A', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BrandMonogram size={18} color="#fff" strokeWidth={2.2} />
            </div>
            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.4px' }}>Label Universe</span>
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--navy-200)', borderRadius: 16, padding: '36px 32px', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #f0f4ff, #e8eeff)', border: '1.5px solid #c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <span style={{ fontSize: '1.4rem' }}>✉️</span>
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.5px', marginBottom: 6 }}>Check your email</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--navy-500)', lineHeight: 1.6 }}>
              We sent a 6-digit code to<br />
              <strong style={{ color: 'var(--navy-700)' }}>{email}</strong>
            </p>
          </div>

          {/* OTP boxes */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }} onPaste={handlePaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                type="text" inputMode="numeric" maxLength={1}
                value={digit}
                onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                onFocus={e => Object.assign(e.currentTarget.style, { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99,102,241,0.15)' })}
                onBlur={e => Object.assign(e.currentTarget.style, { borderColor: digit ? '#6366f1' : 'var(--navy-200)', boxShadow: 'none' })}
                style={boxStyle(!!digit)}
                disabled={loading}
              />
            ))}
          </div>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16, color: 'var(--navy-500)', fontSize: '0.83rem' }}>
              <div style={{ width: 14, height: 14, border: '2px solid var(--navy-200)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
              Verifying...
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, fontSize: '0.8rem', color: '#dc2626', fontWeight: 500, marginBottom: 16 }}>
              <ExclamationCircleIcon style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <p style={{ fontSize: '0.78rem', color: 'var(--navy-400)', textAlign: 'center', marginBottom: 16 }}>Code expires in 10 minutes</p>

          {resendMsg && (
            <p style={{ fontSize: '0.8rem', color: resendMsg.includes('sent') ? '#16a34a' : '#dc2626', textAlign: 'center', marginBottom: 12, fontWeight: 500 }}>{resendMsg}</p>
          )}

          <div style={{ textAlign: 'center' }}>
            {countdown > 0 ? (
              <span style={{ fontSize: '0.82rem', color: 'var(--navy-400)' }}>Resend in {countdown}s</span>
            ) : (
              <button onClick={handleResend} disabled={resending} style={{ background: 'none', border: 'none', color: '#6366f1', fontWeight: 700, fontSize: '0.82rem', cursor: resending ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
                {resending ? 'Sending...' : "Didn't get a code? Resend"}
              </button>
            )}
          </div>

          <div style={{ height: 1, background: 'var(--navy-100)', margin: '20px 0' }} />
          <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--navy-500)' }}>
            Wrong email?{' '}
            <Link to="/signup" style={{ color: '#6366f1', fontWeight: 700, textDecoration: 'none' }}>Go back</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default VerifyOTP;
