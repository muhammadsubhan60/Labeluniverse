import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts';
import {
  BanknotesIcon, ChevronLeftIcon, ChevronRightIcon, UserGroupIcon,
  PencilIcon, TrashIcon, XMarkIcon, PlusIcon, WalletIcon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

// ── Types ─────────────────────────────────────────────────────────────────────
interface KPIs {
  totalRevenuePKR: number; totalRevenueUSD: number;
  totalVendorCostPKR: number;
  totalExpensesPKR: number; netProfitPKR: number;
  totalLabels: number; paidLabels: number;
}
interface EquityPartner { name: string; ownershipPercent: number; profitSharePKR: number; }
interface SourceStat { revenueUSD: number; revenuePKR: number; operatingCostPKR: number; profitPKR: number; }
interface CarrierCost { carrier: string; labelCount: number; costUSD: number; costPKR: number; sharePercent: string; }
interface VendorCostRow {
  carrier: string; vendorName: string; labelCount: number;
  costPerLabelUSD: number; totalCostUSD: number; totalCostPKR: number;
}
interface WalletRow {
  walletId: string; walletName: string;
  totalReceivedUSD: number; totalReceivedPKR: number;
  manualCreditsPKR: number; manualDebitsPKR: number; netFlowPKR: number;
}
interface ExpenseBreakdownRow { category: string; type: string; totalPKR: number; count: number; }
interface DashboardData {
  period: { month: number; year: number };
  exchangeRate: number;
  kpis: KPIs;
  equityDistribution: EquityPartner[];
  revenueBySource: { organic: SourceStat; paidAds: SourceStat };
  carrierCostDistribution: CarrierCost[];
  vendorCostDistribution: VendorCostRow[];
  walletSummary: WalletRow[];
  accountSummary: { totalCreditsPKR: number; totalDebitsPKR: number; netFlowPKR: number };
  expenseBreakdown: ExpenseBreakdownRow[];
}
interface PartnerRecord { _id: string; name: string; ownershipPercent: number; isActive: boolean; }

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const fmtPKR = (n: number) => `₨${Math.round(n).toLocaleString('en-PK')}`;
const fmt$   = (n: number) => `$${n.toFixed(2)}`;

const CARRIER_COLORS: Record<string, string> = {
  USPS: '#1D4ED8', UPS: '#B45309', FedEx: '#7C3AED', DHL: '#DC2626',
};
const PIE_COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#3b82f6','#ec4899','#14b8a6'];

// ── Sub-components ─────────────────────────────────────────────────────────────

const SLabel = ({ text, accent = 'var(--accent-500)', action }: { text: string; accent?: string; action?: React.ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <div style={{ width: 3, height: 13, borderRadius: 3, background: accent, flexShrink: 0 }} />
      <span style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: FONT }}>
        {text}
      </span>
    </div>
    {action}
  </div>
);

// Financial KPI tile — left border accent style
const KpiTile = ({ label, value, sub, accentColor }: {
  label: string; value: string; sub?: string; accentColor: string;
}) => (
  <div className="db-card" style={{ padding: '0.9rem 1.1rem', borderLeft: `3px solid ${accentColor}` }}>
    <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: FONT, marginBottom: 5 }}>{label}</div>
    <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--navy-900)', letterSpacing: '-0.03em', lineHeight: 1.1, fontFamily: FONT }}>{value}</div>
    {sub && <div style={{ fontSize: '0.67rem', color: 'var(--navy-400)', marginTop: 3, fontFamily: FONT }}>{sub}</div>}
  </div>
);

// Horizontal bar row
const BarRow = ({ label, value, max, color, sub }: {
  label: string; value: number; max: number; color: string; sub?: string;
}) => (
  <div style={{ marginBottom: '0.6rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--navy-700)', fontFamily: FONT }}>{label}</span>
      <span style={{ fontSize: '0.76rem', fontWeight: 700, color, fontFamily: FONT }}>{fmtPKR(value)}</span>
    </div>
    <div style={{ height: 5, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${max > 0 ? Math.min((value / max) * 100, 100) : 0}%`, background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
    </div>
    {sub && <div style={{ fontSize: '0.62rem', color: 'var(--navy-400)', marginTop: 2, fontFamily: FONT }}>{sub}</div>}
  </div>
);

// Pie tooltip
const PieTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    const d = payload[0];
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--navy-200)', borderRadius: 8, padding: '0.5rem 0.75rem', boxShadow: 'var(--shadow-sm)', fontSize: '0.78rem', fontFamily: FONT }}>
        <div style={{ fontWeight: 700, color: 'var(--navy-800)' }}>{d.name}</div>
        <div style={{ color: d.payload.color }}>{d.value.toLocaleString()} labels</div>
      </div>
    );
  }
  return null;
};

// P&L composition block
const PLComposition = ({ kpis }: { kpis: KPIs }) => {
  const rev        = Math.max(kpis.totalRevenuePKR, 1);
  const profit     = kpis.netProfitPKR;
  const vendorPct  = (kpis.totalVendorCostPKR / rev) * 100;
  const expensePct = (kpis.totalExpensesPKR / rev) * 100;
  const profitPct  = (Math.abs(profit) / rev) * 100;

  return (
    <>
      <div style={{ height: 14, display: 'flex', borderRadius: 7, overflow: 'hidden', gap: 2, marginBottom: 10 }}>
        <div title={`Vendor Cost: ${fmtPKR(kpis.totalVendorCostPKR)}`} style={{ flex: Math.max(vendorPct, 0.5), background: '#EF4444', cursor: 'default' }} />
        <div title={`Expenses: ${fmtPKR(kpis.totalExpensesPKR)}`} style={{ flex: Math.max(expensePct, 0.3), background: '#F97316', cursor: 'default' }} />
        <div title={profit >= 0 ? `Profit: ${fmtPKR(profit)}` : `Loss: ${fmtPKR(-profit)}`} style={{ flex: Math.max(profitPct, 0.3), background: profit >= 0 ? '#22C55E' : '#DC2626', cursor: 'default' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {[
          { label: 'Vendor Cost',  value: kpis.totalVendorCostPKR, pct: vendorPct,  color: '#EF4444' },
          { label: 'Expenses',     value: kpis.totalExpensesPKR,    pct: expensePct, color: '#F97316' },
          { label: profit >= 0 ? 'Net Profit' : 'Net Loss', value: Math.abs(profit), pct: profitPct, color: profit >= 0 ? '#22C55E' : '#DC2626' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: '0.75rem', color: 'var(--navy-600)', fontFamily: FONT }}>{s.label}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-800)', fontFamily: FONT }}>{fmtPKR(s.value)}</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--navy-400)', fontFamily: FONT, minWidth: 38, textAlign: 'right' }}>{s.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </>
  );
};

// Skeleton shimmer card
const SkeletonCard = ({ h = 120 }: { h?: number }) => (
  <div className="db-card" style={{ height: h, background: 'linear-gradient(90deg, var(--navy-50) 25%, var(--navy-100) 50%, var(--navy-50) 75%)', backgroundSize: '200% 100%', animation: 'fd-shimmer 1.4s infinite' }} />
);

// ── Main Component ────────────────────────────────────────────────────────────
const FinancialDashboard: React.FC = () => {
  const { user: authUser } = useAuth();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear());
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [partners,         setPartners]         = useState<PartnerRecord[]>([]);
  const [partnerForm,      setPartnerForm]      = useState({ name: '', ownershipPercent: '' });
  const [editPartnerId,    setEditPartnerId]    = useState<string | null>(null);
  const [savingPartner,    setSavingPartner]    = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await axios.get('/financial-dashboard', {
        params: { month: selectedMonth, year: selectedYear }
      });
      setData(d);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [selectedMonth, selectedYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchPartners = useCallback(async () => {
    try {
      const { data: d } = await axios.get('/equity-partners');
      setPartners(Array.isArray(d) ? d : []);
    } catch {}
  }, []);

  useEffect(() => { fetchPartners(); }, [fetchPartners]);

  const handleSavePartner = async () => {
    if (!partnerForm.name.trim() || !partnerForm.ownershipPercent) return;
    setSavingPartner(true);
    try {
      const payload = { name: partnerForm.name, ownershipPercent: parseFloat(partnerForm.ownershipPercent) };
      if (editPartnerId) await axios.put(`/equity-partners/${editPartnerId}`, payload);
      else               await axios.post('/equity-partners', payload);
      setPartnerForm({ name: '', ownershipPercent: '' });
      setEditPartnerId(null);
      fetchPartners(); fetchData();
    } catch (err: any) { alert(err.response?.data?.message || 'Failed to save partner'); }
    finally { setSavingPartner(false); }
  };

  const deletePartner = async (id: string) => {
    if (!window.confirm('Delete this equity partner?')) return;
    try { await axios.delete(`/equity-partners/${id}`); fetchPartners(); fetchData(); } catch {}
  };

  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };

  if (!authUser || authUser.role !== 'admin') return <Navigate to="/dashboard" replace />;

  // Loading skeleton
  if (loading || !data) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', fontFamily: FONT }}>
      <style>{`@keyframes fd-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
      <div style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 58%, #1e3a8a 100%)', borderRadius: 18, height: 96 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} h={80} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
    </div>
  );

  const {
    kpis, equityDistribution, revenueBySource, carrierCostDistribution,
    vendorCostDistribution, walletSummary, accountSummary, expenseBreakdown,
  } = data;

  const netPositive  = kpis.netProfitPKR >= 0;
  const maxExpense   = expenseBreakdown[0]?.totalPKR || 1;
  const marginPct    = kpis.totalRevenuePKR > 0 ? ((kpis.netProfitPKR / kpis.totalRevenuePKR) * 100) : 0;

  const carrierPieData = carrierCostDistribution.map(c => ({
    name: c.carrier, value: c.labelCount, color: CARRIER_COLORS[c.carrier] || '#94a3b8',
  }));
  const equityPieData = equityDistribution.map((p, i) => ({
    name: p.name, value: p.ownershipPercent, color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  return (
    <>
      <style>{`@keyframes fd-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', fontFamily: FONT }}>

        {/* ── Hero ───────────────────────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 58%, #1e3a8a 100%)',
          borderRadius: 18, padding: '1.25rem 1.8rem',
          position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap',
        }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.05, backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '22px 22px', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '-40%', right: '5%', width: 220, height: 220, background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

          {/* Left: icon + title + month nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 1 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BanknotesIcon style={{ width: 22, height: 22, color: '#818CF8' }} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.1, fontFamily: FONT }}>
                Financial Dashboard
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: '0.7rem', color: 'rgba(148,163,184,0.65)', fontFamily: FONT }}>
                  P&L Overview · {data.exchangeRate.toFixed(1)} PKR/USD
                </span>
                <div style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.12)' }} />
                {/* Month nav inline */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button onClick={prevMonth} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: '2px 6px', borderRadius: 5, display: 'flex', alignItems: 'center', transition: 'all 0.12s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.14)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}>
                    <ChevronLeftIcon style={{ width: 11, height: 11 }} />
                  </button>
                  <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#fff', fontFamily: FONT, minWidth: 95, textAlign: 'center' }}>
                    {MONTHS[selectedMonth - 1]} {selectedYear}
                  </span>
                  <button onClick={nextMonth} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: '2px 6px', borderRadius: 5, display: 'flex', alignItems: 'center', transition: 'all 0.12s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.14)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}>
                    <ChevronRightIcon style={{ width: 11, height: 11 }} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right: stat chips + Partners button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1, flexWrap: 'wrap' }}>
            {([
              { label: 'Revenue',  value: fmtPKR(kpis.totalRevenuePKR),             accent: '#34D399' },
              { label: netPositive ? 'Net Profit' : 'Net Loss', value: fmtPKR(Math.abs(kpis.netProfitPKR)), accent: netPositive ? '#34D399' : '#F87171' },
              { label: 'Margin',   value: `${marginPct.toFixed(1)}%`,               accent: netPositive ? '#34D399' : '#F87171' },
              { label: 'Labels',   value: kpis.totalLabels.toLocaleString(),         accent: '#818CF8' },
            ] as const).map(({ label, value, accent }) => (
              <div key={label} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '0.42rem 0.8rem', minWidth: 72 }}>
                <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, fontFamily: FONT }}>{label}</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: accent, letterSpacing: '-0.02em', fontFamily: FONT, marginTop: 2 }}>{value}</div>
              </div>
            ))}
            <button
              onClick={() => { setPartnerForm({ name: '', ownershipPercent: '' }); setEditPartnerId(null); setShowPartnerModal(true); }}
              style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, color: '#fff', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap', transition: 'all 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.14)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            >
              <UserGroupIcon style={{ width: 14, height: 14 }} />
              Partners
            </button>
          </div>
        </div>

        {/* ── KPI Strip — 3 col × 2 rows ─────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          <KpiTile label="Total Revenue"   value={fmtPKR(kpis.totalRevenuePKR)}     sub={fmt$(kpis.totalRevenueUSD)}         accentColor="#16A34A" />
          <KpiTile label="Net Profit"      value={fmtPKR(kpis.netProfitPKR)}        sub={`${marginPct.toFixed(1)}% margin`}  accentColor={netPositive ? '#16A34A' : '#DC2626'} />
          <KpiTile label="Total Labels"    value={kpis.totalLabels.toLocaleString()} sub="generated this period"              accentColor="#4F46E5" />
          <KpiTile label="Vendor Cost"     value={fmtPKR(kpis.totalVendorCostPKR)}  sub={`${kpis.totalRevenuePKR > 0 ? ((kpis.totalVendorCostPKR/kpis.totalRevenuePKR)*100).toFixed(1) : 0}% of revenue`} accentColor="#DC2626" />
          <KpiTile label="Other Expenses"  value={fmtPKR(kpis.totalExpensesPKR)}    sub={`${expenseBreakdown.length} categories`} accentColor="#EA580C" />
          <KpiTile label="Paid Labels Est" value={kpis.paidLabels.toLocaleString()} sub="settled billing"                    accentColor="#7C3AED" />
        </div>

        {/* ── P&L Composition + Revenue by Source ───────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '0.875rem' }}>

          {/* P&L card */}
          <div className="db-card" style={{ padding: '1.25rem 1.4rem' }}>
            <SLabel text="P&L Composition" />

            {/* Revenue headline */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT, marginBottom: 2 }}>Total Revenue</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#16A34A', letterSpacing: '-0.04em', fontFamily: FONT, lineHeight: 1 }}>
                  {fmtPKR(kpis.totalRevenuePKR)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--navy-400)', fontFamily: FONT, marginTop: 2 }}>{fmt$(kpis.totalRevenueUSD)}</div>
              </div>
              <div style={{
                padding: '6px 14px', borderRadius: 20,
                background: netPositive ? '#F0FDF4' : '#FFF5F5',
                border: `1px solid ${netPositive ? '#BBF7D0' : '#FECACA'}`,
              }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, color: netPositive ? '#15803D' : '#DC2626', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT }}>{netPositive ? 'Profitable' : 'At a Loss'}</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: netPositive ? '#15803D' : '#DC2626', fontFamily: FONT, letterSpacing: '-0.02em' }}>{marginPct.toFixed(1)}%</div>
              </div>
            </div>

            <PLComposition kpis={kpis} />

            {/* Cash flow footer */}
            <div style={{ borderTop: '1px solid var(--navy-100)', marginTop: '1rem', paddingTop: '0.875rem' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT, marginBottom: 8 }}>Cash Flow</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                {[
                  { label: 'Cash In',  value: accountSummary.totalCreditsPKR,  color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
                  { label: 'Cash Out', value: accountSummary.totalDebitsPKR,   color: '#DC2626', bg: '#FFF5F5', border: '#FECACA' },
                  { label: 'Net Flow', value: accountSummary.netFlowPKR, color: accountSummary.netFlowPKR >= 0 ? '#16A34A' : '#DC2626', bg: 'var(--navy-50)', border: 'var(--navy-150, #e2e8f0)' },
                ].map(r => (
                  <div key={r.label} style={{ background: r.bg, border: `1px solid ${r.border}`, borderRadius: 9, padding: '0.55rem 0.75rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.58rem', fontWeight: 700, color: r.color, textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT, marginBottom: 2 }}>{r.label}</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: r.color, fontFamily: FONT, letterSpacing: '-0.02em' }}>{fmtPKR(r.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Revenue by Source */}
          <div className="db-card" style={{ padding: '1.25rem 1.4rem' }}>
            <SLabel text="Revenue by Source" accent="#4F46E5" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {([
                { key: 'organic', label: 'Organic',  color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
                { key: 'paidAds', label: 'Paid Ads', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
              ] as const).map(({ key, label, color, bg, border }) => {
                const s      = revenueBySource[key];
                const margin = s.revenuePKR > 0 ? ((s.profitPKR / s.revenuePKR) * 100) : 0;
                return (
                  <div key={key} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '0.875rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT }}>{label}</span>
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 700, fontFamily: FONT,
                        color: s.profitPKR >= 0 ? '#15803D' : '#DC2626',
                        background: s.profitPKR >= 0 ? '#DCFCE7' : '#FEE2E2',
                        padding: '2px 8px', borderRadius: 99,
                      }}>
                        {margin.toFixed(1)}% margin
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {[
                        { label: 'Revenue',     value: fmtPKR(s.revenuePKR),      color },
                        { label: '− Ad Spend',  value: fmtPKR(s.operatingCostPKR), color: '#DC2626' },
                      ].map(r => (
                        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.73rem', color: 'var(--navy-500)', fontFamily: FONT }}>{r.label}</span>
                          <span style={{ fontSize: '0.73rem', fontWeight: 700, color: r.color, fontFamily: FONT }}>{r.value}</span>
                        </div>
                      ))}
                      <div style={{ height: 4, background: `${color}22`, borderRadius: 99, overflow: 'hidden', margin: '2px 0' }}>
                        <div style={{ height: '100%', width: `${Math.min(Math.max(margin, 0), 100)}%`, background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.73rem', fontWeight: 700, color, fontFamily: FONT }}>Gross Profit</span>
                        <span style={{ fontSize: '0.8rem', fontWeight: 900, color: s.profitPKR >= 0 ? '#15803D' : '#DC2626', fontFamily: FONT }}>{fmtPKR(s.profitPKR)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Carrier Distribution + Expense Breakdown ───────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>

          {/* Carrier donut + vendor table */}
          <div className="db-card" style={{ padding: '1.25rem 1.4rem' }}>
            <SLabel text="Carrier Distribution" accent="#1D4ED8" />
            {carrierPieData.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: 'var(--navy-400)', margin: 0, fontFamily: FONT }}>No label data for this period.</p>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                <ResponsiveContainer width={130} height={130}>
                  <PieChart>
                    <Pie data={carrierPieData} cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={3} dataKey="value" strokeWidth={0}>
                      {carrierPieData.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <RTooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {carrierCostDistribution.map(c => (
                    <div key={c.carrier}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: CARRIER_COLORS[c.carrier] || '#94a3b8', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-700)', fontFamily: FONT }}>{c.carrier}</span>
                        </div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--navy-500)', fontFamily: FONT }}>{c.sharePercent}%</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 14 }}>
                        <span style={{ fontSize: '0.66rem', color: 'var(--navy-400)', fontFamily: FONT }}>{c.labelCount.toLocaleString()} labels</span>
                        <span style={{ fontSize: '0.66rem', fontWeight: 600, color: '#DC2626', fontFamily: FONT }}>{fmtPKR(c.costPKR)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {vendorCostDistribution.length > 0 && (
              <div style={{ marginTop: '1rem', borderTop: '1px solid var(--navy-100)', paddingTop: '0.875rem' }}>
                <SLabel text="Vendor Breakdown" accent="#7C3AED" />
                {vendorCostDistribution.map((v, i) => (
                  <div key={`${v.carrier}-${v.vendorName}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: i < vendorCostDistribution.length - 1 ? '1px solid var(--navy-50)' : 'none' }}>
                    <div>
                      <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--navy-700)', fontFamily: FONT }}>{v.vendorName}</div>
                      <div style={{ fontSize: '0.63rem', color: 'var(--navy-400)', fontFamily: FONT }}>{v.carrier} · {fmt$(v.costPerLabelUSD)}/label · {v.labelCount.toLocaleString()} labels</div>
                    </div>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#DC2626', fontFamily: FONT }}>{fmtPKR(v.totalCostPKR)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expense Breakdown */}
          <div className="db-card" style={{ padding: '1.25rem 1.4rem' }}>
            <SLabel text="Expense Breakdown" accent="#EA580C" />
            {expenseBreakdown.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: 'var(--navy-400)', margin: 0, fontFamily: FONT }}>No expense entries this period.</p>
            ) : (
              <>
                {expenseBreakdown.map(e => (
                  <BarRow key={e.category} label={e.category} value={e.totalPKR} max={maxExpense} color="#EA580C" sub={`${e.count} entr${e.count !== 1 ? 'ies' : 'y'}`} />
                ))}
                <div style={{ borderTop: '1px solid var(--navy-100)', marginTop: '0.5rem', paddingTop: '0.625rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--navy-700)', fontFamily: FONT }}>Total Expenses</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 900, color: '#DC2626', fontFamily: FONT, letterSpacing: '-0.02em' }}>{fmtPKR(kpis.totalExpensesPKR)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Equity Distribution + Wallet Summary ───────────────────────────── */}
        {(equityDistribution.length > 0 || walletSummary.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: equityDistribution.length > 0 && walletSummary.length > 0 ? '1fr 2fr' : '1fr', gap: '0.875rem' }}>

            {equityDistribution.length > 0 && (
              <div className="db-card" style={{ padding: '1.25rem 1.4rem' }}>
                <SLabel text="Equity Distribution" accent="#6366F1" />
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {equityPieData.length > 0 && (
                    <ResponsiveContainer width={100} height={100}>
                      <PieChart>
                        <Pie data={equityPieData} cx="50%" cy="50%" innerRadius={28} outerRadius={46} paddingAngle={3} dataKey="value" strokeWidth={0}>
                          {equityPieData.map(e => <Cell key={e.name} fill={e.color} />)}
                        </Pie>
                        <RTooltip formatter={(val: any, name: any) => [`${val}%`, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {equityDistribution.map((p, i) => (
                      <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--navy-800)', fontFamily: FONT }}>{p.name}</span>
                            <span style={{ fontSize: '0.73rem', fontWeight: 700, color: PIE_COLORS[i % PIE_COLORS.length], fontFamily: FONT }}>{p.ownershipPercent}%</span>
                          </div>
                          <div style={{ fontSize: '0.68rem', fontWeight: 600, color: p.profitSharePKR >= 0 ? '#16A34A' : '#DC2626', fontFamily: FONT }}>{fmtPKR(p.profitSharePKR)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {walletSummary.length > 0 && (
              <div className="db-card" style={{ padding: '1.25rem 1.4rem' }}>
                <SLabel text="Wallet Summary" accent="#0891B2" action={<WalletIcon style={{ width: 14, height: 14, color: 'var(--navy-400)' }} />} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.625rem' }}>
                  {walletSummary.map(w => (
                    <div key={w.walletId} style={{ background: 'var(--navy-50)', border: '1px solid var(--navy-150, #e2e8f0)', borderRadius: 10, padding: '0.8rem 0.9rem' }}>
                      <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#0891B2', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT, marginBottom: '0.5rem' }}>{w.walletName}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--navy-500)', fontFamily: FONT }}>Received</span>
                          <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#16A34A', fontFamily: FONT }}>{fmtPKR(w.totalReceivedPKR)}</span>
                        </div>
                        {w.manualCreditsPKR > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--navy-500)', fontFamily: FONT }}>+ Manual</span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#16A34A', fontFamily: FONT }}>+{fmtPKR(w.manualCreditsPKR)}</span>
                          </div>
                        )}
                        {w.manualDebitsPKR > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--navy-500)', fontFamily: FONT }}>− Debits</span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#DC2626', fontFamily: FONT }}>−{fmtPKR(w.manualDebitsPKR)}</span>
                          </div>
                        )}
                        <div style={{ borderTop: '1px solid var(--navy-200)', paddingTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-700)', fontFamily: FONT }}>Net Flow</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: w.netFlowPKR >= 0 ? '#16A34A' : '#DC2626', fontFamily: FONT }}>{fmtPKR(w.netFlowPKR)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Partner Management Modal ────────────────────────────────────────── */}
        {showPartnerModal && (
          <div
            onClick={e => e.target === e.currentTarget && setShowPartnerModal(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
          >
            <div className="db-card" style={{ width: '100%', maxWidth: 480, padding: '1.6rem', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <UserGroupIcon style={{ width: 16, height: 16, color: '#6366F1' }} />
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--navy-900)', fontFamily: FONT }}>Equity Partners</h2>
                </div>
                <button onClick={() => setShowPartnerModal(false)} style={{ background: 'var(--navy-100)', border: '1px solid var(--navy-200)', cursor: 'pointer', color: 'var(--navy-500)', padding: 5, borderRadius: 8, display: 'flex' }}>
                  <XMarkIcon style={{ width: 15, height: 15 }} />
                </button>
              </div>

              {/* Add / Edit form */}
              <div style={{ background: 'var(--navy-50)', border: '1px solid var(--navy-150, #e2e8f0)', borderRadius: 12, padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT, marginBottom: '0.75rem' }}>
                  {editPartnerId ? 'Edit Partner' : 'Add Equity Partner'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.5rem', marginBottom: '0.625rem' }}>
                  <div>
                    <label className="form-label" style={{ fontFamily: FONT }}>Name *</label>
                    <input type="text" className="form-input" value={partnerForm.name} onChange={e => setPartnerForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. AHSAN" style={{ fontFamily: FONT }} />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontFamily: FONT }}>Ownership %</label>
                    <input type="number" min="0" max="100" step="0.1" className="form-input" value={partnerForm.ownershipPercent} onChange={e => setPartnerForm(f => ({ ...f, ownershipPercent: e.target.value }))} placeholder="50" style={{ fontFamily: FONT }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {editPartnerId && (
                    <button className="btn btn-ghost" style={{ fontFamily: FONT }} onClick={() => { setEditPartnerId(null); setPartnerForm({ name: '', ownershipPercent: '' }); }}>Cancel</button>
                  )}
                  <button className="btn btn-primary" style={{ fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 5 }} disabled={savingPartner || !partnerForm.name.trim()} onClick={handleSavePartner}>
                    <PlusIcon style={{ width: 13, height: 13 }} />
                    {savingPartner ? 'Saving…' : editPartnerId ? 'Update' : 'Add Partner'}
                  </button>
                </div>
              </div>

              {/* Partner list */}
              {partners.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--navy-400)', fontFamily: FONT }}>No equity partners configured.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {partners.map((p, i) => (
                    <div key={p._id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-card)', border: '1px solid var(--navy-150, #e2e8f0)', borderRadius: 10, padding: '0.7rem 0.9rem' }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--navy-800)', fontFamily: FONT }}>{p.name}</span>
                        <span style={{ fontSize: '0.73rem', color: '#6366F1', marginLeft: 8, fontWeight: 700, fontFamily: FONT }}>{p.ownershipPercent}%</span>
                      </div>
                      <button onClick={() => { setEditPartnerId(p._id); setPartnerForm({ name: p.name, ownershipPercent: String(p.ownershipPercent) }); }}
                        style={{ background: 'var(--navy-100)', border: '1px solid var(--navy-200)', borderRadius: 7, cursor: 'pointer', padding: '4px 5px', display: 'flex', color: 'var(--navy-500)', transition: 'all 0.12s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--navy-200)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--navy-100)'; }}>
                        <PencilIcon style={{ width: 13, height: 13 }} />
                      </button>
                      <button onClick={() => deletePartner(p._id)}
                        style={{ background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: 7, cursor: 'pointer', padding: '4px 5px', display: 'flex', color: '#DC2626', transition: 'all 0.12s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEE2E2'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FFF5F5'; }}>
                        <TrashIcon style={{ width: 13, height: 13 }} />
                      </button>
                    </div>
                  ))}
                  <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: '0.25rem', fontFamily: FONT }}>
                    Total: {partners.reduce((s, p) => s + p.ownershipPercent, 0).toFixed(1)}% allocated
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </>
  );
};

export default FinancialDashboard;
