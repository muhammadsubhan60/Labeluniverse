import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Squares2X2Icon, TagIcon, DocumentDuplicateIcon,
  SparklesIcon, ChartBarIcon, UserGroupIcon,
  ArrowLeftOnRectangleIcon, Bars3Icon, XMarkIcon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

const NAV = [
  { to: '/command-center/dashboard',   icon: Squares2X2Icon,        label: 'Dashboard'          },
  { to: '/command-center/labels',      icon: TagIcon,               label: 'All Labels'          },
  { to: '/command-center/bulk-labels', icon: DocumentDuplicateIcon, label: 'Bulk Batches'        },
  { to: '/command-center/ai-status',   icon: SparklesIcon,          label: 'AI Status Update'    },
  { to: '/command-center/vendor-perf', icon: ChartBarIcon,          label: 'Vendor Performance'  },
];

export default function CCLayout() {
  const navigate    = useNavigate();
  const [col, setCol] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9', fontFamily: FONT }}>
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside style={{
        width: col ? 60 : 220,
        background: 'linear-gradient(180deg,#0f172a 0%,#1e1b4b 100%)',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.22s ease',
        flexShrink: 0, position: 'sticky', top: 0,
        height: '100vh', overflowY: 'auto', overflowX: 'hidden',
      }}>

        {/* Brand */}
        <div style={{
          padding: col ? '18px 0' : '18px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center',
          justifyContent: col ? 'center' : 'space-between', gap: 8, minWidth: 0,
        }}>
          {!col && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.57rem', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>
                Tracking
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                Command Center
              </div>
            </div>
          )}
          <button
            onClick={() => setCol(c => !c)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4, display: 'flex', flexShrink: 0 }}
          >
            {col
              ? <Bars3Icon style={{ width: 17, height: 17 }} />
              : <XMarkIcon style={{ width: 17, height: 17 }} />}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              title={col ? label : undefined}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 9,
                padding: col ? '10px 0' : '8px 11px',
                borderRadius: 8, textDecoration: 'none',
                justifyContent: col ? 'center' : 'flex-start',
                background: isActive ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: isActive ? '#a5b4fc' : '#64748b',
                fontWeight: isActive ? 600 : 400, fontSize: '0.82rem',
                transition: 'background 0.14s, color 0.14s',
                whiteSpace: 'nowrap', overflow: 'hidden',
              })}
            >
              <Icon style={{ width: 17, height: 17, flexShrink: 0 }} />
              {!col && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Live pulse */}
        {!col && (
          <div style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 2px rgba(34,197,94,0.25)', flexShrink: 0, display: 'inline-block' }} />
            <span style={{ fontSize: '0.68rem', color: '#475569', fontWeight: 500 }}>Live · All Users</span>
          </div>
        )}

        {/* Exit */}
        <div style={{ padding: '10px 8px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={() => navigate('/admin/users')}
            title="Exit Command Center"
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              width: '100%', padding: col ? '9px 0' : '8px 11px',
              borderRadius: 8, background: 'none', border: 'none',
              color: '#475569', fontSize: '0.82rem', cursor: 'pointer',
              justifyContent: col ? 'center' : 'flex-start',
            }}
          >
            <ArrowLeftOnRectangleIcon style={{ width: 17, height: 17, flexShrink: 0 }} />
            {!col && <span>Exit Command Center</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: 'auto', minHeight: '100vh', minWidth: 0 }}>
        <Outlet />
      </main>
    </div>
  );
}
