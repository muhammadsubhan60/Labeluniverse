import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  EnvelopeIcon,
  PhoneIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  ClockIcon,
  TruckIcon,
} from '@heroicons/react/24/outline';
import BrandMonogram from '../components/BrandMonogram';

function useViewport() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return w;
}

const sideFeatures = [
  { icon: ShieldCheckIcon, text: 'Secure and reliable sessions' },
  { icon: ClockIcon, text: 'Fast daily shipping workflow' },
  { icon: TruckIcon, text: 'Bulk labels and manifest operations' },
];

const Signup: React.FC = () => {
  const vw = useViewport();
  const isMobile = vw < 768;
  const isTablet = vw >= 768 && vw < 1024;

  const linkStyle: React.CSSProperties = {
    color: '#6366f1',
    fontWeight: 700,
    textDecoration: 'none',
    transition: 'color 0.2s',
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      fontFamily: "'Inter', system-ui, sans-serif",
      overflow: 'hidden',
    }}>
      {!isMobile && (
        <div style={{
          width: isTablet ? '42%' : '48%',
          background: 'linear-gradient(145deg, #0a0f1f 0%, #111733 45%, #252a5a 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: isTablet ? '48px 40px' : '60px 64px',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23ffffff' fill-opacity='0.025'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 60% 50% at 20% 60%, rgba(34,211,238,0.16) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 80% 20%, rgba(99,102,241,0.20) 0%, transparent 70%), radial-gradient(ellipse 45% 35% at 70% 78%, rgba(251,113,133,0.14) 0%, transparent 75%)',
          }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
              <div style={{ width: 38, height: 38, background: '#fff', border: '1px solid rgba(255,255,255,0.45)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <BrandMonogram size={20} color="#111" strokeWidth={2.3} />
              </div>
              <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.4px' }}>
                Label<span> Universe</span>
              </span>
            </div>

            <h2 style={{
              fontSize: isTablet ? '1.8rem' : 'clamp(1.9rem, 3vw, 2.65rem)',
              fontWeight: 900, color: '#fff', letterSpacing: '-1.5px',
              lineHeight: 1.1, marginBottom: 18,
            }}>
              Portal access is<br />
              <span style={{ color: '#67e8f9' }}>by invitation only.</span>
            </h2>
            <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.48)', lineHeight: 1.75, marginBottom: 40, fontWeight: 400, maxWidth: 360 }}>
              Reach out to our sales team to get your account activated and start shipping.
            </p>

            {sideFeatures.map(({ icon: Icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 9,
                  background: 'rgba(99,102,241,0.16)', border: '1px solid rgba(103,232,249,0.38)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon style={{ width: 16, height: 16, color: '#67e8f9' }} />
                </div>
                <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: isMobile ? 'flex-start' : 'center',
        padding: isMobile ? '0' : isTablet ? '32px 24px' : '48px 40px',
        background: isMobile ? '#fff' : 'linear-gradient(180deg, #fafbff 0%, #f1f4fb 100%)',
        minHeight: isMobile ? '100vh' : undefined,
      }}>
        {isMobile && (
          <div style={{
            width: '100%',
            background: 'linear-gradient(145deg, #0a0f1f 0%, #111733 45%, #252a5a 100%)',
            padding: '28px 24px 32px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 34, height: 34, background: '#fff', border: '1px solid rgba(255,255,255,0.45)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BrandMonogram size={18} color="#111" strokeWidth={2.2} />
              </div>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.4px' }}>
                Label<span> Universe</span>
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
              Portal access by invitation only
            </p>
          </div>
        )}

        <div style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 430,
          background: '#fff',
          border: isMobile ? 'none' : '1px solid #e6eaf5',
          borderRadius: isMobile ? 0 : 20,
          padding: isMobile ? '32px 20px 40px' : '48px 40px',
          boxShadow: isMobile ? 'none' : '0 20px 52px rgba(10,15,31,0.1), 0 4px 16px rgba(10,15,31,0.06)',
        }}>
          {/* Lock icon */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 18,
              background: 'linear-gradient(135deg, #f0f4ff 0%, #e8eeff 100%)',
              border: '1.5px solid #c7d2fe',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <LockClosedIcon style={{ width: 30, height: 30, color: '#6366f1' }} />
            </div>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0a0f1f', letterSpacing: '-0.02em', marginBottom: 10 }}>
              Portal Activation Required
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: 1.65, maxWidth: 320, margin: '0 auto' }}>
              New accounts are created by our team. Contact a sales agent to get your portal access activated.
            </p>
          </div>

          {/* Contact options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
            <a
              href="mailto:sales@labelflow.com"
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px',
                background: 'linear-gradient(135deg, #f0f4ff 0%, #e8eeff 100%)',
                border: '1.5px solid #c7d2fe',
                borderRadius: 14,
                textDecoration: 'none',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#6366f1';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#c7d2fe';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: '#6366f1',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <EnvelopeIcon style={{ width: 18, height: 18, color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Email Sales</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0a0f1f' }}>sales@labelflow.com</div>
              </div>
            </a>

            <a
              href="tel:+1-800-000-0000"
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px',
                background: '#f8faff',
                border: '1.5px solid #e6eaf5',
                borderRadius: 14,
                textDecoration: 'none',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#6366f1';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e6eaf5';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: '#0f172a',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <PhoneIcon style={{ width: 18, height: 18, color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Call Sales</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0a0f1f' }}>+1 (800) 000-0000</div>
              </div>
            </a>
          </div>

          <div style={{ height: 1, background: '#e6eaf5', margin: '0 0 24px' }} />

          <p style={{ textAlign: 'center', fontSize: '0.875rem', color: '#64748b' }}>
            Already have an account?{' '}
            <Link
              to="/login"
              style={linkStyle}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#4f46e5'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#6366f1'; }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
