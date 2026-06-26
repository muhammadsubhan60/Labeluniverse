import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import BrandMonogram from '../components/BrandMonogram';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

const VerifyEmail: React.FC = () => {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setStatus('error');
      setMessage('No verification token found in the link.');
      return;
    }

    axios.post(`${API_BASE}/auth/verify-email`, { token })
      .then(res => {
        setStatus('success');
        setMessage(res.data.message || 'Email verified successfully.');
      })
      .catch(err => {
        setStatus('error');
        setMessage(err.response?.data?.message || 'Verification failed. The link may have expired.');
      });
  }, [params]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy-50)', padding: '24px 16px', fontFamily: FONT }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 34, height: 34, background: '#0F172A', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BrandMonogram size={18} color="#fff" strokeWidth={2.2} />
            </div>
            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.4px' }}>Label Flow</span>
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--navy-200)', borderRadius: 16, padding: '40px 36px', boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}>
          {status === 'loading' && (
            <>
              <div style={{ width: 48, height: 48, border: '3px solid var(--navy-200)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.75s linear infinite', margin: '0 auto 20px' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: 6 }}>Verifying your email...</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--navy-400)' }}>Just a moment.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: '#f0fdf4', border: '1.5px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircleIcon style={{ width: 28, height: 28, color: '#16a34a' }} />
                </div>
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.5px', marginBottom: 8 }}>Email verified!</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--navy-500)', lineHeight: 1.65, marginBottom: 28 }}>{message}</p>
              <Link
                to="/login"
                style={{ display: 'inline-block', padding: '12px 28px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', fontWeight: 700, fontSize: '0.875rem', borderRadius: 10, textDecoration: 'none', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}
              >
                Sign In
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: '#fff1f2', border: '1.5px solid #fecdd3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ExclamationCircleIcon style={{ width: 28, height: 28, color: '#dc2626' }} />
                </div>
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.5px', marginBottom: 8 }}>Verification failed</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--navy-500)', lineHeight: 1.65, marginBottom: 28 }}>{message}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Link to="/signup" style={{ display: 'block', padding: '12px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', fontWeight: 700, fontSize: '0.875rem', borderRadius: 10, textDecoration: 'none', textAlign: 'center' }}>
                  Register again
                </Link>
                <Link to="/login" style={{ display: 'block', padding: '11px', background: 'none', border: '1px solid var(--navy-200)', color: 'var(--navy-600)', fontWeight: 600, fontSize: '0.875rem', borderRadius: 10, textDecoration: 'none', textAlign: 'center' }}>
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
