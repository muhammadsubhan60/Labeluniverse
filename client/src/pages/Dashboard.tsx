import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  CurrencyDollarIcon, TagIcon, ClipboardDocumentListIcon,
  UserGroupIcon, ArrowUpRightIcon, ClockIcon, SparklesIcon,
  InformationCircleIcon, ArrowTrendingUpIcon, ChevronDownIcon,
  ArrowUpTrayIcon, CalendarDaysIcon, XMarkIcon,
} from '@heroicons/react/24/outline';

// ── Types ─────────────────────────────────────────────────────────────────────
interface UserStats {
  balance: { currentBalance: number; totalDeposited: number; totalSpent: number };
  labels:  { total: number; generated: number; failed: number; spent: number; byCarrier: Record<string, number> };
  manifests: { total: number; active: number; completed: number; cancelled: number };
  savings: { total: number; labelCount: number };
  recentLabels:   any[];
  activeManifests: any[];
  trackingStatus?: {
    not_scanned_yet: number; in_transit: number; out_for_delivery: number; delivered: number;
    exception_problem: number; returned_to_sender: number; pending_pickup: number; delayed: number;
  };
}

interface VendorAccessItem {
  vendorId: string; vendorName: string; carrier: string;
  vendorType: 'api' | 'manifest'; shippingService: string;
  baseRate: number; isAllowed: boolean;
  rateTiers: Array<{ minLbs: number; maxLbs: number | null; rate: number }>;
}

interface ResellerStats {
  clientCount: number; activeClients: number;
  myBalance: { currentBalance: number; totalDeposited: number; totalSpent: number };
  labels: { total: number; revenue: number; byCarrier: Record<string, number> };
  manifests: { total: number; active: number; completed: number; revenue: number };
  totalClientSpend: number; recentClients: any[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = (v: number) =>
  `$${(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CARRIER_COLORS: Record<string, string> = {
  USPS: '#1D4ED8', UPS: '#92400E', FedEx: '#5B21B6', DHL: '#B45309',
};
const CARRIER_GRADIENT: Record<string, string> = {
  USPS: 'linear-gradient(90deg, #1D4ED8, #60A5FA)',
  UPS:  'linear-gradient(90deg, #92400E, #F59E0B)',
  FedEx:'linear-gradient(90deg, #5B21B6, #A78BFA)',
  DHL:  'linear-gradient(90deg, #B45309, #FCD34D)',
};
const MANIFEST_STATUS_COLOR: Record<string, string> = {
  open: '#6366f1', assigned: '#0ea5e9', accepted: '#0ea5e9',
  uploaded: '#f59e0b', under_review: '#ef4444', completed: '#22c55e',
  cancelled: '#94a3b8', rejected: '#f97316',
};
const MANIFEST_STATUS_LABEL: Record<string, string> = {
  open: 'Open', assigned: 'Assigned', accepted: 'Accepted',
  uploaded: 'Uploaded', under_review: 'Under Review',
  completed: 'Completed', cancelled: 'Cancelled', rejected: 'Rejected',
};

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

// ── KPI Card ──────────────────────────────────────────────────────────────────
const KpiCard = ({
  label, value, sub, color, Icon, onClick, infoTooltip, onAction, ActionIcon,
}: {
  label: string; value: string | number; sub?: string; color: string;
  Icon: React.ElementType; onClick?: () => void;
  infoTooltip?: string; onAction?: () => void; ActionIcon?: React.ElementType;
}) => {
  const [tip, setTip] = useState(false);
  const [hov, setHov] = useState(false);
  return (
    <div
      className={`db-card${onClick ? ' db-card-hover' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ padding: '1.1rem 1.2rem', position: 'relative', overflow: 'hidden', fontFamily: FONT }}
    >
      {/* color accent strip */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: '16px 16px 0 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9, flexShrink: 0,
          background: `${color}18`, border: `1px solid ${color}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon style={{ width: 17, height: 17, color }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {ActionIcon && onAction && (
            <button onClick={e => { e.stopPropagation(); onAction(); }} title="Adjust"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: 'var(--navy-400)' }}>
              <ActionIcon style={{ width: 13, height: 13 }} />
            </button>
          )}
          {infoTooltip && (
            <div style={{ position: 'relative' }}
              onMouseEnter={() => setTip(true)}
              onMouseLeave={() => setTip(false)}
              onClick={e => e.stopPropagation()}
            >
              <InformationCircleIcon style={{ width: 14, height: 14, color: 'var(--navy-400)', cursor: 'help' }} />
              {tip && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 100,
                  background: 'var(--navy-800)', color: 'var(--navy-100)',
                  borderRadius: 10, padding: '9px 12px', fontSize: '0.7rem',
                  lineHeight: 1.6, width: 240, boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
                  border: '1px solid var(--navy-700)', pointerEvents: 'none',
                }}>
                  {infoTooltip}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.035em', lineHeight: 1, marginBottom: 3 }}>
        {value}
      </div>
      <div style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
        {label}
      </div>
      {sub && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--navy-100)', fontSize: '0.73rem', color: 'var(--navy-500)' }}>
          {sub}
        </div>
      )}
    </div>
  );
};

// ── Balance Feature Card (sidebar) ────────────────────────────────────────────
const BalanceCard = ({ balance, deposited, spent, onAdd }: {
  balance: string; deposited: number; spent: number; onAdd: () => void;
}) => {
  const spentPct = deposited > 0 ? Math.min(100, Math.round((spent / deposited) * 100)) : 0;
  return (
    <div style={{
      background: 'linear-gradient(155deg, #0F172A 0%, #1E293B 55%, #1e3a8a 100%)',
      borderRadius: 16, padding: '1.4rem 1.5rem',
      position: 'relative', overflow: 'hidden', color: '#fff',
      fontFamily: FONT,
    }}>
      {/* decorative dots */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.05,
        backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
        backgroundSize: '20px 20px', pointerEvents: 'none' }} />
      {/* glow */}
      <div style={{ position: 'absolute', top: '-40%', right: '-20%', width: 200, height: 200,
        background: 'radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)',
        pointerEvents: 'none' }} />

      <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.55, margin: '0 0 6px', position: 'relative' }}>
        Current Balance
      </p>
      <p style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '-0.045em', margin: '0 0 18px', lineHeight: 1, position: 'relative', color: '#22C55E' }}>
        {balance}
      </p>

      {/* Spent progress */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: '0.7rem', opacity: 0.55 }}>Budget used</span>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, opacity: 0.75 }}>{spentPct}%</span>
        </div>
        <div style={{ height: 5, background: 'rgba(255,255,255,0.12)', borderRadius: 99 }}>
          <div style={{ width: `${spentPct}%`, height: '100%', background: 'linear-gradient(90deg, #22C55E, #86EFAC)', borderRadius: 99, transition: 'width 0.6s ease' }} />
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, position: 'relative' }}>
        {[
          { label: 'Deposited', value: fmt$(deposited), color: '#86EFAC' },
          { label: 'Spent',     value: fmt$(spent),     color: '#FCA5A5' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: '0.6rem 0.8rem' }}>
            <div style={{ fontSize: '0.63rem', opacity: 0.55, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      <button
        onClick={onAdd}
        style={{
          width: '100%', padding: '0.6rem', borderRadius: 9,
          background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)',
          color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
          transition: 'background 0.15s', position: 'relative', fontFamily: FONT,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
      >
        + Add Balance
      </button>
    </div>
  );
};

// ── Section Label ─────────────────────────────────────────────────────────────
const SLabel = ({ text, accent = 'var(--accent-500)', action }: {
  text: string; accent?: string; action?: React.ReactNode;
}) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 3, height: 14, borderRadius: 3, background: accent, flexShrink: 0 }} />
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: FONT }}>
        {text}
      </span>
    </div>
    {action}
  </div>
);

// ── Ghost button ──────────────────────────────────────────────────────────────
const GhostBtn = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="btn btn-ghost btn-sm"
    style={{ fontSize: '0.7rem', fontFamily: FONT }}
  >
    {children}
  </button>
);

// ── Quick Action button ────────────────────────────────────────────────────────
const QAction = ({ label, sub, Icon, color, onClick }: {
  label: string; sub: string; Icon: React.ElementType; color: string; onClick: () => void;
}) => {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 11,
        padding: '0.7rem 0.9rem', borderRadius: 11, width: '100%',
        border: `1px solid ${hov ? color + '40' : 'var(--navy-200)'}`,
        background: hov ? `${color}08` : 'var(--bg-card)',
        cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.18s', fontFamily: FONT,
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
        background: `${color}15`, border: `1px solid ${color}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon style={{ width: 16, height: 16, color }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--navy-800)', marginBottom: 1 }}>{label}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)' }}>{sub}</div>
      </div>
      <ArrowUpRightIcon style={{
        width: 14, height: 14, flexShrink: 0,
        color: hov ? color : 'var(--navy-300)',
        transform: hov ? 'translate(1px,-1px)' : 'none',
        transition: 'all 0.18s',
      }} />
    </button>
  );
};

// ── FAQ ───────────────────────────────────────────────────────────────────────
const DashboardFAQ = () => {
  const faqs = [
    { q: 'How do credits work?', a: 'Credits are deducted per label based on template and weight. Your added credits are shown in the history table.' },
    { q: 'How can I add more credits?', a: 'Ask admin to add credits. It will instantly appear in "Added balance history".' },
    { q: 'What if I run out of credits during bulk upload?', a: 'Bulk generation should stop if balance is insufficient. Add credits and re-upload.' },
  ];
  return (
    <div className="db-card" style={{ padding: '1.2rem 1.4rem', fontFamily: FONT }}>
      <SLabel text="FAQs" accent="var(--navy-300)" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {faqs.map(f => (
          <details key={f.q} style={{ border: '1px solid var(--navy-200)', borderRadius: 10, overflow: 'hidden' }}>
            <summary style={{
              listStyle: 'none', cursor: 'pointer',
              padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 600,
              color: 'var(--navy-800)', background: 'var(--navy-50)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}>
              {f.q}
              <ChevronDownIcon style={{ width: 14, height: 14, color: 'var(--navy-400)', flexShrink: 0 }} />
            </summary>
            <div style={{ padding: '0.65rem 1rem 0.85rem', fontSize: '0.79rem', color: 'var(--navy-600)', lineHeight: 1.65, borderTop: '1px solid var(--navy-100)' }}>
              {f.a}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
};

// ── Hero ──────────────────────────────────────────────────────────────────────
const Hero = ({ greeting, name, date }: { greeting: string; name: string; date: string }) => (
  <div style={{
    background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 58%, #1e3a8a 100%)',
    borderRadius: 18, padding: '1.5rem 2rem',
    position: 'relative', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontFamily: FONT,
  }}>
    <div style={{ position: 'absolute', inset: 0, opacity: 0.07,
      backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
      backgroundSize: '22px 22px', pointerEvents: 'none' }} />
    <div style={{ position: 'absolute', inset: 0, background:
      'radial-gradient(ellipse 50% 90% at 8% 50%, rgba(59,130,246,0.14) 0%, transparent 70%)',
      pointerEvents: 'none' }} />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <p style={{ color: 'rgba(148,163,184,0.65)', fontSize: '0.72rem', fontWeight: 500, margin: '0 0 5px', letterSpacing: '0.03em' }}>
        {date}
      </p>
      <h1 style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 4px', lineHeight: 1.15 }}>
        {greeting}, <span style={{ color: '#60A5FA' }}>{name}</span>!
      </h1>
      <p style={{ color: '#64748B', fontSize: '0.81rem', margin: 0 }}>
        Your shipping overview is ready.
      </p>
    </div>
    <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 8 }}>
      <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '0.6rem 1.1rem' }}>
        <SparklesIcon style={{ width: 16, height: 16, color: '#22C55E', margin: '0 auto 4px' }} />
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Status</p>
        <p style={{ color: '#22C55E', fontSize: '0.8rem', fontWeight: 700, margin: 0 }}>Active</p>
      </div>
    </div>
  </div>
);

// ── AddBalanceModal ───────────────────────────────────────────────────────────
const AddBalanceModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      fontFamily: FONT,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card)', borderRadius: 20, padding: '2rem 2.25rem',
        border: '1px solid var(--navy-200)', maxWidth: 440, width: '100%',
        boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--success-50)', border: '1px solid var(--success-100)' }}>
              <CurrencyDollarIcon style={{ width: 22, height: 22, color: 'var(--success-600)' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--navy-800)' }}>Add Balance</h3>
              <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--navy-500)' }}>Account top-up</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', display: 'flex' }}>
            <XMarkIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>
        <div style={{ background: 'var(--success-50)', border: '1px solid var(--success-100)', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
          <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--success-700)', fontWeight: 700, marginBottom: 4 }}>Ready to recharge?</p>
          <p style={{ margin: 0, fontSize: '0.81rem', color: 'var(--success-700)', lineHeight: 1.6 }}>
            Contact your <strong>account manager</strong> or our <strong>sales team</strong> to top up. Funds are credited instantly.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1.5rem' }}>
          <a href="mailto:support@shipmehub.com" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem 1rem', borderRadius: 10, background: 'var(--navy-50)', border: '1px solid var(--navy-200)', color: 'var(--navy-700)', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 600 }}>
            <ArrowUpRightIcon style={{ width: 14, height: 14, flexShrink: 0 }} />
            support@shipmehub.com
          </a>
          <a href="https://wa.me/message/shipmehub" target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem 1rem', borderRadius: 10, background: 'var(--success-50)', border: '1px solid var(--success-100)', color: 'var(--success-700)', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 600 }}>
            <SparklesIcon style={{ width: 14, height: 14, flexShrink: 0 }} />
            WhatsApp Support
          </a>
        </div>
        <button onClick={onClose} style={{ width: '100%', padding: '0.65rem', borderRadius: 10, background: 'var(--navy-100)', border: '1px solid var(--navy-200)', color: 'var(--navy-600)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: FONT }}>
          Close
        </button>
      </div>
    </div>
  );
};

// ── LossAdjustDrawer ──────────────────────────────────────────────────────────
const LOSS_KEY = 'savings_loss_per_item';

const LossAdjustModal = ({ open, onClose, exceptionCount, savingsTotal, onApply }: {
  open: boolean; onClose: () => void; exceptionCount: number; savingsTotal: number; onApply: (n: number) => void;
}) => {
  const [raw, setRaw] = useState(() => localStorage.getItem(LOSS_KEY) ?? '');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) requestAnimationFrame(() => setMounted(true));
    else setMounted(false);
  }, [open]);

  if (!open && !mounted) return null;

  const perItem = parseFloat(raw) || 0;
  const totalLoss = exceptionCount * perItem;
  const adjusted = savingsTotal - totalLoss;

  const handleApply = () => { if (raw) localStorage.setItem(LOSS_KEY, raw); onApply(perItem); onClose(); };
  const handleClear = () => { setRaw(''); localStorage.removeItem(LOSS_KEY); onApply(0); onClose(); };

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: mounted ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0)',
        backdropFilter: mounted ? 'blur(3px)' : 'none',
        transition: 'background 0.25s, backdrop-filter 0.25s',
      }} />
      <div style={{
        position: 'fixed', top: '50%', right: 24, zIndex: 1001,
        transform: mounted ? 'translateX(0) translateY(-50%)' : 'translateX(calc(100% + 24px)) translateY(-50%)',
        width: 360, maxHeight: 'min(580px, 90vh)',
        background: 'var(--bg-card)', borderRadius: 16,
        border: '1px solid var(--navy-200)', boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)', fontFamily: FONT,
      }}>
        <div style={{ padding: '1.3rem 1.5rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: '#fff5ed', border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowUpTrayIcon style={{ width: 16, height: 16, color: '#f97316' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--navy-900)', lineHeight: 1.2 }}>Loss Adjustment</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--navy-500)', marginTop: 2 }}>Adjusts Total Savings &amp; ROI</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'var(--navy-100)', border: '1px solid var(--navy-200)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: 'var(--navy-500)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <XMarkIcon style={{ width: 14, height: 14 }} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.4rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1rem', borderRadius: 10, background: '#fff5f5', border: '1px solid #fecaca' }}>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#dc2626' }}>Exceptions</div>
              <div style={{ fontSize: '0.7rem', color: '#b91c1c', marginTop: 1 }}>Flagged labels</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#dc2626', letterSpacing: '-0.04em', lineHeight: 1 }}>{exceptionCount}</div>
              <div style={{ fontSize: '0.63rem', color: '#ef4444' }}>labels</div>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.77rem', fontWeight: 700, color: 'var(--navy-700)', marginBottom: 7 }}>Loss per item ($)</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.95rem', fontWeight: 700, color: 'var(--navy-400)', pointerEvents: 'none' }}>$</span>
              <input
                autoFocus type="number" min="0" step="0.01" value={raw}
                onChange={e => setRaw(e.target.value)} placeholder="0.00"
                className="form-input"
                style={{ paddingLeft: '1.75rem', fontSize: '1.05rem', fontWeight: 700 }}
                onFocus={e => (e.target.style.borderColor = '#f97316')}
                onBlur={e => (e.target.style.borderColor = '')}
              />
            </div>
          </div>

          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--navy-200)' }}>
            <div style={{ padding: '0.6rem 1rem', background: 'var(--navy-50)', borderBottom: '1px solid var(--navy-100)' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Calculation</span>
            </div>
            {[
              { label: 'Original savings', val: fmt$(savingsTotal), color: '#10b981' },
              { label: `${exceptionCount} × ${fmt$(perItem)}`, val: `−${fmt$(totalLoss)}`, color: '#dc2626' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', borderBottom: '1px solid var(--navy-50)', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--navy-600)' }}>{label}</span>
                <span style={{ fontWeight: 700, color }}>{val}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: adjusted >= 0 ? '#f0fdf4' : '#fff5f5' }}>
              <span style={{ fontSize: '0.83rem', fontWeight: 700, color: 'var(--navy-800)' }}>Adjusted Savings</span>
              <span style={{ fontSize: '0.97rem', fontWeight: 800, color: adjusted >= 0 ? '#10b981' : '#dc2626' }}>{fmt$(adjusted)}</span>
            </div>
          </div>
        </div>

        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--navy-100)', display: 'flex', gap: 8, flexShrink: 0, background: 'var(--bg-card)' }}>
          <button onClick={handleClear} style={{ flex: 1, padding: '0.65rem', borderRadius: 9, background: 'var(--navy-100)', border: '1px solid var(--navy-200)', color: 'var(--navy-600)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', fontFamily: FONT }}>
            Clear
          </button>
          <button onClick={handleApply} disabled={perItem <= 0} style={{ flex: 2, padding: '0.65rem', borderRadius: 9, background: perItem > 0 ? '#f97316' : 'var(--navy-200)', border: 'none', color: perItem > 0 ? '#fff' : 'var(--navy-400)', fontWeight: 700, fontSize: '0.82rem', cursor: perItem > 0 ? 'pointer' : 'not-allowed', opacity: perItem > 0 ? 1 : 0.6, fontFamily: FONT }}>
            Apply →
          </button>
        </div>
      </div>
    </>
  );
};

// ── User Dashboard ─────────────────────────────────────────────────────────────
const UserDashboard: React.FC<{ firstName: string }> = ({ firstName }) => {
  const navigate = useNavigate();
  const [stats, setStats]             = useState<UserStats | null>(null);
  const [vendorAccess, setVendorAccess] = useState<VendorAccessItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showAddBalance, setShowAddBalance] = useState(false);
  const [showLossModal, setShowLossModal]   = useState(false);
  const [lossPerItem, setLossPerItem] = useState<number>(() => parseFloat(localStorage.getItem(LOSS_KEY) ?? '0') || 0);

  const currentMonthStr = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; })();
  const [tsMonth,  setTsMonth]  = useState(currentMonthStr);
  const [tsCounts, setTsCounts] = useState<UserStats['trackingStatus'] | null>(null);
  const [tsLoad,   setTsLoad]   = useState(false);

  const tsMonthOpts = (() => {
    const opts: { value: string; label: string }[] = [];
    const n = new Date();
    for (let i = 0; i < 13; i++) {
      const d = new Date(n.getFullYear(), n.getMonth() - i, 1);
      opts.push({ value: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) });
    }
    return opts;
  })();

  useEffect(() => {
    setTsLoad(true);
    axios.get(tsMonth ? `/stats/tracking-status?month=${tsMonth}` : '/stats/tracking-status')
      .then(r => setTsCounts(r.data)).catch(() => {}).finally(() => setTsLoad(false));
  }, [tsMonth]);

  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([axios.get('/stats'), axios.get('/access/me').catch(() => ({ data: { access: [] } }))]);
      setStats(s.data);
      setVendorAccess((a.data?.access || []).filter((v: VendorAccessItem) => v.isAllowed));
    } catch { } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>;
  if (!stats) return null;

  const { balance, labels, manifests, savings, recentLabels, activeManifests } = stats;
  const totalLabels     = labels.total || 1;
  const exceptionCount  = stats.trackingStatus?.exception_problem ?? 0;
  const rawSavings      = savings?.total ?? 0;
  const adjustedSavings = rawSavings - exceptionCount * lossPerItem;
  const roi = balance.totalDeposited > 0 ? (adjustedSavings / balance.totalDeposited) * 100 : 0;
  const SAVINGS_TIP = 'Compares your label cost against standard USPS retail rates. An estimated benchmark — not a guaranteed saving.';
  const now = new Date();
  const greeting  = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const accessByCarrier = vendorAccess.reduce((acc, item) => {
    if (!acc[item.carrier]) acc[item.carrier] = [];
    acc[item.carrier].push(item); return acc;
  }, {} as Record<string, VendorAccessItem[]>);
  const carrierOrder = ['USPS', 'UPS', 'FedEx', 'DHL'];
  const sortedCarriers = Object.keys(accessByCarrier).sort((a, b) => {
    const ai = carrierOrder.indexOf(a), bi = carrierOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1; if (bi === -1) return -1; return ai - bi;
  });

  const trackTiles = [
    { key: 'not_scanned_yet',    label: 'Not Scanned',   color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
    { key: 'in_transit',         label: 'In Transit',     color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
    { key: 'out_for_delivery',   label: 'Out for Delivery', color: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE' },
    { key: 'delivered',          label: 'Delivered',      color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0' },
    { key: 'exception_problem',  label: 'Exception',      color: '#DC2626', bg: '#FFF5F5', border: '#FECACA' },
    { key: 'returned_to_sender', label: 'Returned',       color: '#BE123C', bg: '#FFF1F2', border: '#FECDD3' },
    { key: 'pending_pickup',     label: 'Pending',        color: '#C2410C', bg: '#FFF7ED', border: '#FED7AA' },
    { key: 'delayed',            label: 'Delayed',        color: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
  ] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontFamily: FONT }}>

      {/* Hero */}
      <Hero greeting={greeting} name={firstName} date={dateLabel} />

      {/* ── 2-column layout ── */}
      <div className="dashboard-layout">

        {/* ══ LEFT MAIN CONTENT ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* KPI strip — 3 cards */}
          <div className="dashboard-kpi-3col">
            <KpiCard label="Labels Generated" value={labels.generated} sub={`${labels.failed} failed`}      color="#0ea5e9" Icon={TagIcon}                    onClick={() => navigate('/labels/history')} />
            <KpiCard label="Active Manifests"  value={manifests.active} sub={`${manifests.completed} done`} color="#f59e0b" Icon={ClipboardDocumentListIcon} />
            <KpiCard label="Total Spent"       value={fmt$(balance.totalSpent)} sub="Labels + manifests"    color="#6366f1" Icon={CurrencyDollarIcon} />
          </div>

          {/* Savings + ROI */}
          <div className="dashboard-kpi-2col">
            <KpiCard
              label="Total Savings" value={fmt$(adjustedSavings)} color="#10b981" Icon={SparklesIcon}
              sub={lossPerItem > 0 ? `Adjusted · ${exceptionCount} exceptions × ${fmt$(lossPerItem)}` : savings?.labelCount ? `vs USPS retail · ${savings.labelCount} labels` : 'vs USPS retail'}
              infoTooltip={SAVINGS_TIP}
              ActionIcon={ArrowUpTrayIcon} onAction={() => setShowLossModal(true)}
            />
            <KpiCard label="ROI" value={`${roi.toFixed(1)}%`} sub={`${fmt$(adjustedSavings)} saved`} color="#8b5cf6" Icon={ArrowTrendingUpIcon} />
          </div>

          {/* Tracking Status */}
          <div className="db-card" style={{ padding: '1.2rem 1.4rem' }}>
            <SLabel
              text="Label Tracking Status"
              accent="#1D4ED8"
              action={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <CalendarDaysIcon style={{ position: 'absolute', left: 8, width: 12, height: 12, color: tsMonth ? '#1D4ED8' : 'var(--navy-400)', pointerEvents: 'none' }} />
                    <select
                      value={tsMonth} onChange={e => setTsMonth(e.target.value)}
                      style={{ height: 29, paddingLeft: 25, paddingRight: tsMonth ? 26 : 8, border: `1px solid ${tsMonth ? '#BFDBFE' : 'var(--navy-200)'}`, borderRadius: 7, background: tsMonth ? '#EFF6FF' : 'var(--bg-card)', color: tsMonth ? '#1D4ED8' : 'var(--navy-600)', fontSize: '0.7rem', fontWeight: 600, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', outline: 'none', fontFamily: FONT }}
                    >
                      <option value="">All Time</option>
                      {tsMonthOpts.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    {tsMonth && (
                      <button onClick={() => setTsMonth('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 1, cursor: 'pointer', color: '#1D4ED8', display: 'flex' }}>
                        <XMarkIcon style={{ width: 10, height: 10 }} />
                      </button>
                    )}
                  </div>
                  <GhostBtn onClick={() => navigate('/labels/history')}>View Labels →</GhostBtn>
                </div>
              }
            />
            {tsLoad ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem 0' }}><div className="spinner" /></div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.6rem' }}>
                {trackTiles.map(({ key, label, color, bg, border }) => {
                  const count = tsCounts?.[key] ?? 0;
                  return (
                    <div key={key} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '0.75rem 0.9rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                      </div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 800, color, letterSpacing: '-0.04em', lineHeight: 1 }}>{count}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Labels */}
          <div className="db-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.4rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <SLabel text="Recent Labels" accent="#0ea5e9" />
              <GhostBtn onClick={() => navigate('/labels/history')}>View all →</GhostBtn>
            </div>
            {recentLabels.length === 0 ? (
              <div className="empty-state"><TagIcon style={{ width: 32, height: 32 }} /><h3>No labels yet</h3><p>Generate your first label.</p></div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="sh-table">
                  <thead><tr><th>Carrier</th><th>Tracking</th><th>Type</th><th>Cost</th><th>Date</th><th>Status</th></tr></thead>
                  <tbody>
                    {recentLabels.map((lbl: any) => (
                      <tr key={lbl._id}>
                        <td><span className={`carrier-badge ${lbl.carrier?.toLowerCase()}`}>{lbl.carrier || '—'}</span></td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.73rem', color: 'var(--navy-600)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lbl.trackingId || '—'}</td>
                        <td><span style={{ fontSize: '0.7rem', color: 'var(--navy-500)' }}>{lbl.isBulk ? 'Bulk' : 'Single'}</span></td>
                        <td style={{ fontWeight: 600, color: lbl.price > 0 ? '#dc2626' : 'var(--navy-400)' }}>{lbl.price > 0 ? fmt$(lbl.price) : '—'}</td>
                        <td style={{ fontSize: '0.76rem', color: 'var(--navy-500)', whiteSpace: 'nowrap' }}>{new Date(lbl.createdAt).toLocaleDateString()}</td>
                        <td>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: lbl.status === 'generated' ? 'var(--success-50)' : 'var(--danger-50)', color: lbl.status === 'generated' ? 'var(--success-700)' : 'var(--danger-600)' }}>
                            {lbl.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>{/* end left */}

        {/* ══ RIGHT SIDEBAR ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Balance featured card */}
          <BalanceCard
            balance={fmt$(balance.currentBalance)}
            deposited={balance.totalDeposited}
            spent={balance.totalSpent}
            onAdd={() => setShowAddBalance(true)}
          />

          {/* Labels by Carrier */}
          <div className="db-card" style={{ padding: '1.2rem 1.4rem' }}>
            <SLabel text="Labels by Carrier" accent="#1D4ED8" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {['USPS', 'UPS', 'FedEx', 'DHL'].map(c => {
                const count = labels.byCarrier[c] || 0;
                const pct = Math.round((count / totalLabels) * 100);
                return (
                  <div key={c}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: '0.77rem', fontWeight: 700, color: 'var(--navy-700)' }}>{c}</span>
                      <span style={{ fontSize: '0.73rem', color: 'var(--navy-500)' }}>{count} · {pct}%</span>
                    </div>
                    <div style={{ height: 7, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: CARRIER_GRADIENT[c] || CARRIER_COLORS[c], borderRadius: 99, transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: '0.875rem', paddingTop: '0.75rem', borderTop: '1px solid var(--navy-100)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--navy-500)' }}>Total</span>
              <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--navy-800)' }}>{labels.total.toLocaleString()}</span>
            </div>
          </div>

          {/* Active Manifests */}
          <div className="db-card" style={{ padding: '1.2rem 1.4rem' }}>
            <SLabel
              text="Active Manifests"
              accent="#f59e0b"
              action={<GhostBtn onClick={() => navigate('/labels/bulk')}>Submit →</GhostBtn>}
            />
            {activeManifests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.25rem 0', color: 'var(--navy-500)', fontSize: '0.82rem' }}>
                No active jobs.{' '}
                <button onClick={() => navigate('/labels/bulk')} style={{ background: 'none', border: 'none', color: 'var(--accent-600)', cursor: 'pointer', fontWeight: 600, fontFamily: FONT }}>Submit one →</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {activeManifests.map((job: any) => {
                  const sc = MANIFEST_STATUS_COLOR[job.status] || '#94a3b8';
                  return (
                    <div key={job._id} onClick={() => navigate('/labels/bulk')}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.55rem 0.7rem', background: 'var(--navy-50)', borderRadius: 9, cursor: 'pointer', border: '1px solid transparent', transition: 'border-color 0.15s' }}
                      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = 'var(--navy-200)'; el.style.background = 'var(--navy-100)'; }}
                      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = 'transparent'; el.style.background = 'var(--navy-50)'; }}
                    >
                      <span className={`carrier-badge ${job.carrier?.toLowerCase()}`} style={{ flexShrink: 0 }}>{job.carrier}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--navy-800)' }}>{job.userBilling?.labelCount ?? '?'} labels</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--navy-500)' }}>{job.assignedVendor?.name ?? 'Unassigned'}</div>
                      </div>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: `${sc}18`, color: sc }}>
                        {MANIFEST_STATUS_LABEL[job.status] || job.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="db-card" style={{ padding: '1.2rem 1.4rem' }}>
            <SLabel text="Quick Actions" accent="var(--accent-500)" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <QAction label="Single Label"  sub="Generate one now"         Icon={TagIcon}                   color="#0ea5e9" onClick={() => navigate('/labels/single')} />
              <QAction label="Bulk Labels"   sub="Upload CSV for many"      Icon={ClipboardDocumentListIcon} color="#6366f1" onClick={() => navigate('/labels/bulk')} />
              <QAction label="Label History" sub="Browse all generated"     Icon={ClockIcon}                 color="#f59e0b" onClick={() => navigate('/labels/history')} />
            </div>
          </div>

        </div>{/* end right sidebar */}
      </div>{/* end 2-col layout */}

      {/* ── Full-width bottom sections ── */}

      {/* Available Vendors */}
      <div className="db-card" style={{ padding: '1.2rem 1.4rem' }}>
        <SLabel
          text="Available Label Vendors"
          accent="#0ea5e9"
          action={<GhostBtn onClick={() => navigate('/labels/single')}>Create Label →</GhostBtn>}
        />
        {vendorAccess.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '1.25rem 0', color: 'var(--navy-500)', fontSize: '0.83rem' }}>No vendors are currently enabled for your account.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
            {sortedCarriers.map(carrier => (
              <div key={carrier} style={{ border: '1px solid var(--navy-200)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '0.5rem 0.85rem', borderBottom: '1px solid var(--navy-100)', background: 'var(--navy-50)' }}>
                  <span className={`carrier-badge ${carrier.toLowerCase()}`}>{carrier}</span>
                </div>
                {accessByCarrier[carrier].map((vendor, idx) => (
                  <div key={vendor.vendorId} style={{ padding: '0.7rem 0.85rem', borderTop: idx === 0 ? 'none' : '1px solid var(--navy-50)', display: 'grid', gap: '0.5rem', alignItems: 'start' }} className="vendor-rate-grid">
                    <div>
                      <div style={{ fontSize: '0.79rem', fontWeight: 700, color: 'var(--navy-800)' }}>
                        {vendor.vendorName}
                        {vendor.vendorType === 'manifest' && (
                          <span style={{ marginLeft: 6, fontSize: '0.67rem', color: 'var(--warning-600)', background: 'var(--warning-50)', border: '1px solid var(--warning-100)', borderRadius: 999, padding: '1px 6px' }}>Manifest</span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--navy-600)', marginTop: 2 }}>{vendor.shippingService || 'Standard'}</div>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--navy-700)', lineHeight: 1.55 }}>
                      {vendor.rateTiers?.length ? (
                        vendor.rateTiers.slice().sort((a, b) => a.minLbs - b.minLbs).map((t, i) => (
                          <div key={i}>{t.minLbs}-{t.maxLbs === null ? '∞' : t.maxLbs} lbs: <strong>${t.rate.toFixed(2)}</strong></div>
                        ))
                      ) : (
                        <div>All weights: <strong>${vendor.baseRate.toFixed(2)}</strong></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <DashboardFAQ />

      <AddBalanceModal open={showAddBalance} onClose={() => setShowAddBalance(false)} />
      <LossAdjustModal open={showLossModal} onClose={() => setShowLossModal(false)} exceptionCount={exceptionCount} savingsTotal={rawSavings} onApply={setLossPerItem} />
    </div>
  );
};

// ── Reseller Dashboard ────────────────────────────────────────────────────────
const ResellerDashboard: React.FC<{ firstName: string }> = ({ firstName }) => {
  const navigate = useNavigate();
  const [stats, setStats]             = useState<ResellerStats | null>(null);
  const [vendorAccess, setVendorAccess] = useState<VendorAccessItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showAddBalance, setShowAddBalance] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([axios.get('/stats'), axios.get('/access/me').catch(() => ({ data: { access: [] } }))]);
      setStats(s.data);
      setVendorAccess((a.data?.access || []).filter((v: VendorAccessItem) => v.isAllowed));
    } catch { } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>;
  if (!stats) return null;

  const { myBalance, labels, manifests, recentClients, clientCount, activeClients, totalClientSpend } = stats;
  const totalLabels = labels.total || 1;
  const now = new Date();
  const greeting  = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const accessByCarrier = vendorAccess.reduce((acc, item) => {
    if (!acc[item.carrier]) acc[item.carrier] = [];
    acc[item.carrier].push(item); return acc;
  }, {} as Record<string, VendorAccessItem[]>);
  const carrierOrder = ['USPS', 'UPS', 'FedEx', 'DHL'];
  const sortedCarriers = Object.keys(accessByCarrier).sort((a, b) => {
    const ai = carrierOrder.indexOf(a), bi = carrierOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1; if (bi === -1) return -1; return ai - bi;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontFamily: FONT }}>

      <Hero greeting={greeting} name={firstName} date={dateLabel} />

      <div className="dashboard-layout">

        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          <div className="dashboard-kpi-3col">
            <KpiCard label="Total Clients" value={clientCount}          sub={`${activeClients} active`}     color="#8b5cf6" Icon={UserGroupIcon}              onClick={() => navigate('/reseller/clients')} />
            <KpiCard label="Client Labels" value={labels.total}         sub="Generated by clients"          color="#0ea5e9" Icon={TagIcon} />
            <KpiCard label="Client Spend"  value={fmt$(totalClientSpend)} sub="Labels + manifest jobs"    color="#f59e0b" Icon={CurrencyDollarIcon} />
          </div>

          <div className="dashboard-kpi-2col">
            <KpiCard label="Active Jobs"     value={manifests.active}    sub={`${manifests.completed} completed`} color="#f59e0b" Icon={ClipboardDocumentListIcon} />
            <KpiCard label="Manifest Revenue" value={fmt$(manifests.revenue)} sub="Total revenue"              color="#22c55e" Icon={ArrowTrendingUpIcon} />
          </div>

          {/* Client carrier activity */}
          <div className="db-card" style={{ padding: '1.2rem 1.4rem' }}>
            <SLabel text="Client Activity by Carrier" accent="#8b5cf6" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {['USPS', 'UPS', 'FedEx', 'DHL'].map(c => {
                const count = labels.byCarrier?.[c] || 0;
                const pct = Math.round((count / totalLabels) * 100);
                return (
                  <div key={c}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: '0.77rem', fontWeight: 700, color: 'var(--navy-700)' }}>{c}</span>
                      <span style={{ fontSize: '0.73rem', color: 'var(--navy-500)' }}>{count} · {pct}%</span>
                    </div>
                    <div style={{ height: 7, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: CARRIER_GRADIENT[c] || CARRIER_COLORS[c], borderRadius: 99 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* My Clients table */}
          <div className="db-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.4rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <SLabel text="My Clients" accent="#8b5cf6" />
              <GhostBtn onClick={() => navigate('/reseller/clients')}>Manage →</GhostBtn>
            </div>
            {recentClients.length === 0 ? (
              <div className="empty-state"><UserGroupIcon style={{ width: 32, height: 32 }} /><h3>No clients yet</h3><p>Add your first client.</p></div>
            ) : (
              <div>
                {recentClients.map((c: any) => (
                  <div key={c._id}
                    style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0.75rem 1.4rem', borderBottom: '1px solid var(--navy-50)', transition: 'background 0.12s', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--navy-50)'}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                  >
                    <div className="avatar avatar-sm avatar-indigo" style={{ fontSize: '0.63rem', flexShrink: 0 }}>{c.firstName?.charAt(0)}{c.lastName?.charAt(0)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--navy-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.firstName} {c.lastName}</div>
                      <div style={{ fontSize: '0.73rem', color: 'var(--navy-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</div>
                    </div>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.isActive ? '#22c55e' : '#94a3b8', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.73rem', color: 'var(--navy-500)', whiteSpace: 'nowrap' }}>{new Date(c.createdAt).toLocaleDateString()}</span>
                    <button onClick={() => navigate('/reseller/clients')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-500)', padding: 4, display: 'flex' }}>
                      <ArrowUpRightIcon style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Right Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          <BalanceCard
            balance={fmt$(myBalance.currentBalance)}
            deposited={myBalance.totalDeposited}
            spent={myBalance.totalSpent}
            onAdd={() => setShowAddBalance(true)}
          />

          {/* Available Vendors (sidebar version) */}
          <div className="db-card" style={{ padding: '1.2rem 1.4rem' }}>
            <SLabel text="Label Vendors" accent="#0ea5e9"
              action={<GhostBtn onClick={() => navigate('/labels/single')}>Create →</GhostBtn>}
            />
            {vendorAccess.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--navy-500)', textAlign: 'center', padding: '0.75rem 0' }}>No vendors enabled.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sortedCarriers.map(carrier => (
                  <div key={carrier} style={{ border: '1px solid var(--navy-200)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ padding: '0.45rem 0.8rem', borderBottom: '1px solid var(--navy-100)', background: 'var(--navy-50)' }}>
                      <span className={`carrier-badge ${carrier.toLowerCase()}`}>{carrier}</span>
                    </div>
                    {accessByCarrier[carrier].map((vendor, idx) => (
                      <div key={vendor.vendorId} style={{ padding: '0.6rem 0.8rem', borderTop: idx === 0 ? 'none' : '1px solid var(--navy-50)' }}>
                        <div style={{ fontSize: '0.77rem', fontWeight: 700, color: 'var(--navy-800)' }}>{vendor.vendorName}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)' }}>{vendor.shippingService || 'Standard'}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="db-card" style={{ padding: '1.2rem 1.4rem' }}>
            <SLabel text="Quick Actions" accent="var(--accent-500)" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <QAction label="Manage Clients" sub="Add or edit clients"      Icon={UserGroupIcon}              color="#8b5cf6" onClick={() => navigate('/reseller/clients')} />
              <QAction label="Single Label"   sub="Generate for a client"    Icon={TagIcon}                   color="#0ea5e9" onClick={() => navigate('/labels/single')} />
              <QAction label="Bulk Labels"    sub="CSV upload for many"      Icon={ClipboardDocumentListIcon} color="#f59e0b" onClick={() => navigate('/labels/bulk')} />
            </div>
          </div>

        </div>
      </div>

      <DashboardFAQ />
      <AddBalanceModal open={showAddBalance} onClose={() => setShowAddBalance(false)} />
    </div>
  );
};

// ── Dashboard (role router) ────────────────────────────────────────────────────
const Dashboard: React.FC = () => {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.role === 'reseller') return <ResellerDashboard firstName={user.firstName ?? ''} />;
  return <UserDashboard firstName={user.firstName ?? ''} />;
};

export default Dashboard;
