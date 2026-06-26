import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  PlusIcon, PencilIcon, TrashIcon, XMarkIcon,
  TagIcon, ArrowDownTrayIcon, EyeIcon,
  ChevronLeftIcon, ChevronRightIcon, BookOpenIcon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

// ── Types ────────────────────────────────────────────────────────────────────

interface ExpenseCategory {
  _id: string; name: string; type: string; isActive: boolean;
}
interface Wallet {
  _id: string; name: string; isActive: boolean;
}
interface CashBookEntry {
  _id: string;
  entryType: 'debit' | 'credit';
  amountPKR: number;
  amountUSD?: number;
  wallet?: { _id: string; name: string } | null;
  category?: { _id: string; name: string; type: string } | null;
  description: string;
  clientName?: string | null;
  date: string;
  enteredBy?: { firstName: string; lastName: string };
  isAutoEntry?: boolean;
  source?: 'payment_log' | string;
  screenshots?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Screenshots are stored as "/api/payment-logs/screenshot/filename.jpg".
// <img src> always requests from the React dev-server (port 3000), not the API
// server (port 5001), so we must prefix with the full server origin.
const API_BASE = (process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api'))
  .replace(/\/api\/?$/, '');   // → "http://localhost:5001"

const toAbsoluteUrl = (path: string) =>
  path.startsWith('http') ? path : `${API_BASE}${path}`;

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const fmtPKR = (n: number) =>
  `₨${Math.round(n).toLocaleString('en-PK')}`;

const CAT_TYPE_COLORS: Record<string, string> = {
  expense: '#dc2626',
  advertising: '#ea580c',
  salary: '#7c3aed',
  distribution: '#0891b2',
  transfer: '#0284c7',
  other: '#64748b',
};

// ── Main Component ────────────────────────────────────────────────────────────

const CashBook: React.FC = () => {
  const { user: authUser } = useAuth();

  // ── Period ────────────────────────────────────────────────────────────────
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear());

  // ── Data ──────────────────────────────────────────────────────────────────
  const [entries,    setEntries]    = useState<CashBookEntry[]>([]);
  const [summary,    setSummary]    = useState({ totalCredits: 0, totalDebits: 0, netFlow: 0 });
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [wallets,    setWallets]    = useState<Wallet[]>([]);
  const [loading,    setLoading]    = useState(true);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [filterType,     setFilterType]     = useState('');
  const [filterWallet,   setFilterWallet]   = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // ── Entry Modal ───────────────────────────────────────────────────────────
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editEntry,      setEditEntry]      = useState<CashBookEntry | null>(null);
  const [entryForm,      setEntryForm]      = useState({
    entryType: 'debit' as 'debit' | 'credit',
    amountPKR: '',
    walletId: '',
    categoryId: '',
    description: '',
    date: now.toISOString().slice(0, 10),
  });
  const [savingEntry, setSavingEntry] = useState(false);

  // ── Category Modal ────────────────────────────────────────────────────────
  const [showCatModal,  setShowCatModal]  = useState(false);
  const [catForm,       setCatForm]       = useState({ name: '', type: 'expense' });
  const [editCatId,     setEditCatId]     = useState<string | null>(null);
  const [savingCat,     setSavingCat]     = useState(false);

  // ── Payment Log Edit Modal ────────────────────────────────────────────────
  const [showPmtModal, setShowPmtModal] = useState(false);
  const [editPmt,      setEditPmt]      = useState<CashBookEntry | null>(null);
  const [pmtForm,      setPmtForm]      = useState({ amountUSD: '', date: '', note: '', walletId: '' });
  const [savingPmt,    setSavingPmt]    = useState(false);

  // ── Screenshot lightbox ───────────────────────────────────────────────────
  const [lightboxUrls,  setLightboxUrls]  = useState<string[]>([]);
  const [lightboxIdx,   setLightboxIdx]   = useState(0);

  const openLightbox = (urls: string[], startIdx = 0) => {
    setLightboxUrls(urls);
    setLightboxIdx(startIdx);
  };
  const closeLightbox = () => setLightboxUrls([]);

  const downloadFile = async (url: string) => {
    const absUrl = toAbsoluteUrl(url);
    const filename = absUrl.split('/').pop() || 'screenshot';
    try {
      const res = await fetch(absUrl);
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(href);
    } catch {
      window.open(absUrl, '_blank');
    }
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { month: selectedMonth, year: selectedYear };
      if (filterType)     params.entryType = filterType;
      if (filterWallet)   params.wallet    = filterWallet;
      if (filterCategory) params.category  = filterCategory;
      const { data } = await axios.get('/cashbook', { params });
      setEntries(data.entries || []);
      setSummary(data.summary || { totalCredits: 0, totalDebits: 0, netFlow: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, filterType, filterWallet, filterCategory]);

  const fetchCategories = useCallback(async () => {
    try {
      const { data } = await axios.get('/expense-categories');
      setCategories(Array.isArray(data) ? data : (data.categories || []));
    } catch {}
  }, []);

  const fetchWallets = useCallback(async () => {
    try {
      const { data } = await axios.get('/wallets');
      setWallets(data.wallets || []);
    } catch {}
  }, []);

  useEffect(() => { fetchEntries(); },   [fetchEntries]);
  useEffect(() => { fetchCategories(); fetchWallets(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Month nav ─────────────────────────────────────────────────────────────

  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };

  // ── Entry CRUD ────────────────────────────────────────────────────────────

  const openEntryModal = (entry?: CashBookEntry) => {
    if (entry) {
      setEditEntry(entry);
      setEntryForm({
        entryType:   entry.entryType,
        amountPKR:   String(entry.amountPKR),
        walletId:    entry.wallet?._id ?? '',
        categoryId:  entry.category?._id ?? '',
        description: entry.description,
        date:        entry.date.slice(0, 10),
      });
    } else {
      setEditEntry(null);
      setEntryForm({
        entryType: 'debit',
        amountPKR: '',
        walletId: '',
        categoryId: '',
        description: '',
        date: new Date().toISOString().slice(0, 10),
      });
    }
    setShowEntryModal(true);
  };

  const submitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryForm.amountPKR) return;
    setSavingEntry(true);
    try {
      const payload = {
        entryType:   entryForm.entryType,
        amountPKR:   parseFloat(entryForm.amountPKR),
        walletId:    entryForm.walletId || null,
        categoryId:  entryForm.categoryId || null,
        description: entryForm.description,
        date:        entryForm.date,
      };
      if (editEntry) {
        await axios.put(`/cashbook/${editEntry._id}`, payload);
      } else {
        await axios.post('/cashbook', payload);
      }
      setShowEntryModal(false);
      fetchEntries();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save entry');
    } finally {
      setSavingEntry(false);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!window.confirm('Delete this entry?')) return;
    try {
      await axios.delete(`/cashbook/${id}`);
      fetchEntries();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Cannot delete this entry');
    }
  };

  const deletePaymentLog = async (id: string) => {
    if (!window.confirm('Delete this payment log? This cannot be undone.')) return;
    try {
      await axios.delete(`/payment-logs/${id}`);
      fetchEntries();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Cannot delete payment log');
    }
  };

  const openPmtModal = (e: CashBookEntry) => {
    setEditPmt(e);
    setPmtForm({
      amountUSD: String(e.amountUSD ?? ''),
      date:      e.date.slice(0, 10),
      note:      e.description || '',
      walletId:  e.wallet?._id ?? '',
    });
    setShowPmtModal(true);
  };

  const submitPmt = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!editPmt) return;
    setSavingPmt(true);
    try {
      const fd = new FormData();
      fd.append('amount',   pmtForm.amountUSD);
      fd.append('date',     pmtForm.date);
      fd.append('note',     pmtForm.note);
      fd.append('walletId', pmtForm.walletId);
      await axios.put(`/payment-logs/${editPmt._id}`, fd);
      setShowPmtModal(false);
      fetchEntries();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update payment log');
    } finally {
      setSavingPmt(false);
    }
  };

  // ── Category CRUD ─────────────────────────────────────────────────────────

  const submitCategory = async () => {
    if (!catForm.name.trim()) return;
    setSavingCat(true);
    try {
      if (editCatId) {
        await axios.put(`/expense-categories/${editCatId}`, catForm);
      } else {
        await axios.post('/expense-categories', catForm);
      }
      setCatForm({ name: '', type: 'expense' });
      setEditCatId(null);
      fetchCategories();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save category');
    } finally {
      setSavingCat(false);
    }
  };

  const deleteCategory = async (id: string) => {
    if (!window.confirm('Delete this category?')) return;
    try {
      await axios.delete(`/expense-categories/${id}`);
      fetchCategories();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete category');
    }
  };

  // ── Guard ─────────────────────────────────────────────────────────────────

  if (!authUser || authUser.role !== 'admin') return <Navigate to="/dashboard" replace />;

  // ── Render ────────────────────────────────────────────────────────────────

  const netIsPositive = summary.netFlow >= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontFamily: FONT }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--navy-200)', borderRadius: 14, padding: '1.25rem 1.75rem' }}>

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--navy-100)', border: '1px solid var(--navy-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BookOpenIcon style={{ width: 18, height: 18, color: 'var(--navy-500)' }} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.02em', lineHeight: 1.1, fontFamily: FONT }}>Cash Book</h1>
              <p style={{ margin: '2px 0 0', fontSize: '0.71rem', color: 'var(--navy-400)', fontFamily: FONT }}>Master ledger — debits, credits & wallet flows</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Month navigator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--navy-50)', border: '1px solid var(--navy-200)', borderRadius: 8, padding: '0.25rem 0.35rem' }}>
              <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-500)', padding: '3px 6px', borderRadius: 5, display: 'flex', alignItems: 'center' }}>
                <ChevronLeftIcon style={{ width: 14, height: 14 }} />
              </button>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--navy-800)', minWidth: 118, textAlign: 'center', fontFamily: FONT }}>
                {MONTHS[selectedMonth - 1]} {selectedYear}
              </span>
              <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-500)', padding: '3px 6px', borderRadius: 5, display: 'flex', alignItems: 'center' }}>
                <ChevronRightIcon style={{ width: 14, height: 14 }} />
              </button>
            </div>

            <button
              onClick={() => { setCatForm({ name: '', type: 'expense' }); setEditCatId(null); setShowCatModal(true); }}
              className="btn btn-ghost btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <TagIcon style={{ width: 13, height: 13 }} /> Categories
            </button>

            <button
              onClick={() => openEntryModal()}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0.4rem 0.85rem', background: 'var(--navy-800)', border: 'none', borderRadius: 8, color: '#fff', fontSize: '0.79rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}
            >
              <PlusIcon style={{ width: 13, height: 13 }} /> Add Entry
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
          {[
            { label: 'Total Credits', value: fmtPKR(summary.totalCredits), color: '#15803d' },
            { label: 'Total Debits',  value: fmtPKR(summary.totalDebits),  color: '#dc2626' },
            { label: 'Net Flow',      value: `${netIsPositive ? '+' : '−'}${fmtPKR(Math.abs(summary.netFlow))}`, color: netIsPositive ? '#15803d' : '#dc2626' },
            { label: 'Entries',       value: String(entries.length),        color: 'var(--navy-800)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ padding: '0.75rem 1rem', background: 'var(--navy-50)', border: '1px solid var(--navy-200)', borderRadius: 10 }}>
              <div style={{ fontSize: '0.61rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT, marginBottom: 5 }}>{label}</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color, letterSpacing: '-0.02em', fontFamily: FONT }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filter + Table card ─────────────────────────────────────────────── */}
      <div className="db-card" style={{ overflow: 'hidden', padding: 0 }}>

        {/* Filter strip */}
        <div style={{ padding: '0.7rem 1.25rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', background: 'var(--navy-25)' }}>

          {/* Type pill tabs */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--navy-100)', padding: '3px', borderRadius: 9, flexShrink: 0 }}>
            {[
              { value: '',       label: 'All' },
              { value: 'credit', label: 'Credits' },
              { value: 'debit',  label: 'Debits' },
            ].map(tab => (
              <button
                key={tab.value}
                onClick={() => setFilterType(tab.value)}
                style={{
                  padding: '0.28rem 0.7rem', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: FONT,
                  fontSize: '0.75rem', fontWeight: filterType === tab.value ? 700 : 500,
                  background: filterType === tab.value ? 'var(--bg-card)' : 'transparent',
                  color: filterType === tab.value ? 'var(--navy-800)' : 'var(--navy-400)',
                  boxShadow: filterType === tab.value ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.12s',
                }}
              >{tab.label}</button>
            ))}
          </div>

          <div style={{ width: 1, height: 20, background: 'var(--navy-200)', flexShrink: 0 }} />

          <select className="form-input" style={{ width: 'auto', fontSize: '0.78rem', padding: '0.28rem 0.6rem' }}
            value={filterWallet} onChange={e => setFilterWallet(e.target.value)}>
            <option value="">All Wallets</option>
            {wallets.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
          </select>

          <select className="form-input" style={{ width: 'auto', fontSize: '0.78rem', padding: '0.28rem 0.6rem' }}
            value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>

          {(filterType || filterWallet || filterCategory) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFilterType(''); setFilterWallet(''); setFilterCategory(''); }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }}>
              <XMarkIcon style={{ width: 11, height: 11 }} /> Clear
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--navy-400)', fontWeight: 600, fontFamily: FONT, flexShrink: 0 }}>
            {loading ? '…' : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
          </div>
        </div>

        {/* Table body */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
            <div className="spinner" />
          </div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--navy-50)', border: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.875rem' }}>
              <BookOpenIcon style={{ width: 24, height: 24, color: 'var(--navy-300)' }} />
            </div>
            <h3 style={{ fontWeight: 700, color: 'var(--navy-700)', margin: '0 0 5px', fontFamily: FONT, fontSize: '0.95rem' }}>No entries this period</h3>
            <p style={{ color: 'var(--navy-400)', fontSize: '0.8rem', margin: 0, fontFamily: FONT }}>
              Add a manual entry or log a client payment to get started.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--navy-100)' }}>
                  {[
                    { label: 'Date',        align: 'left'  as const },
                    { label: 'Description', align: 'left'  as const },
                    { label: 'Category',    align: 'left'  as const },
                    { label: 'Wallet',      align: 'left'  as const },
                    { label: 'Logged by',   align: 'left'  as const },
                    { label: 'Amount',      align: 'right' as const },
                    { label: '',            align: 'right' as const },
                  ].map(col => (
                    <th key={col.label} style={{
                      padding: '0.6rem 1rem', textAlign: col.align,
                      fontSize: '0.65rem', fontWeight: 700, color: 'var(--navy-400)',
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      background: 'var(--navy-25)', whiteSpace: 'nowrap',
                    }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const isCredit = e.entryType === 'credit';
                  return (
                    <tr
                      key={e._id}
                      style={{ borderBottom: i < entries.length - 1 ? '1px solid var(--navy-50)' : 'none', transition: 'background 0.1s' }}
                      onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--navy-25)')}
                      onMouseLeave={ev => (ev.currentTarget.style.background = '')}
                    >
                      {/* Date */}
                      <td style={{ padding: '0.8rem 1rem', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--navy-800)', fontFamily: FONT, lineHeight: 1.2 }}>
                          {new Date(e.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--navy-400)', fontFamily: FONT, marginTop: 2 }}>
                          {new Date(e.date).getFullYear()}
                        </div>
                      </td>

                      {/* Description */}
                      <td style={{ padding: '0.8rem 1rem', maxWidth: 240, verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--navy-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FONT }}>
                          {e.clientName || e.description || <span style={{ color: 'var(--navy-300)' }}>—</span>}
                        </div>
                        {e.clientName && e.description && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--navy-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FONT, marginTop: 2 }}>
                            {e.description}
                          </div>
                        )}
                        {e.screenshots && e.screenshots.length > 0 && (
                          <div style={{ display: 'flex', gap: 3, marginTop: 5, alignItems: 'center' }}>
                            {e.screenshots.slice(0, 3).map((url, si) => (
                              <button key={url} onClick={() => openLightbox(e.screenshots!, si)}
                                style={{ background: 'none', border: '1px solid var(--navy-200)', borderRadius: 4, padding: 1, cursor: 'pointer', lineHeight: 0, flexShrink: 0 }}>
                                <img src={toAbsoluteUrl(url)} alt="" style={{ width: 20, height: 20, objectFit: 'cover', borderRadius: 3, display: 'block' }}
                                  onError={ev => { (ev.target as HTMLImageElement).style.display = 'none'; }} />
                              </button>
                            ))}
                            {e.screenshots.length > 3 && (
                              <button onClick={() => openLightbox(e.screenshots!, 0)}
                                style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--navy-500)', background: 'var(--navy-100)', border: '1px solid var(--navy-200)', borderRadius: 4, padding: '1px 5px', cursor: 'pointer', fontFamily: FONT }}>
                                +{e.screenshots.length - 3}
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td style={{ padding: '0.8rem 1rem', verticalAlign: 'middle' }}>
                        {e.source === 'payment_log' ? (
                          <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: 'var(--navy-100)', color: 'var(--navy-600)', border: '1px solid var(--navy-200)', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                            Client Payment
                          </span>
                        ) : e.category ? (
                          <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: 'var(--navy-100)', color: 'var(--navy-600)', border: '1px solid var(--navy-200)', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                            {e.category.name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--navy-300)', fontSize: '0.75rem' }}>—</span>
                        )}
                      </td>

                      {/* Wallet */}
                      <td style={{ padding: '0.8rem 1rem', verticalAlign: 'middle' }}>
                        {e.wallet ? (
                          <span style={{ fontSize: '0.68rem', fontWeight: 600, background: 'var(--navy-100)', color: 'var(--navy-600)', padding: '2px 8px', borderRadius: 5, border: '1px solid var(--navy-200)', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                            {e.wallet.name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--navy-300)', fontSize: '0.75rem' }}>—</span>
                        )}
                      </td>

                      {/* Logged by */}
                      <td style={{ padding: '0.8rem 1rem', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        {e.enteredBy ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--navy-600)', fontFamily: FONT }}>
                            {e.enteredBy.firstName} {e.enteredBy.lastName}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--navy-300)', fontSize: '0.75rem' }}>—</span>
                        )}
                      </td>

                      {/* Amount */}
                      <td style={{ padding: '0.8rem 1rem', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '0.97rem', fontWeight: 900, color: isCredit ? '#15803d' : '#dc2626', letterSpacing: '-0.025em', fontFamily: FONT }}>
                          {isCredit ? '+' : '−'}{fmtPKR(e.amountPKR)}
                        </div>
                        {e.amountUSD != null && (
                          <div style={{ fontSize: '0.67rem', color: 'var(--navy-400)', fontFamily: FONT, marginTop: 2 }}>
                            ${e.amountUSD.toFixed(2)}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.8rem 1rem', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {e.screenshots && e.screenshots.length > 0 && (
                            <button className="btn btn-ghost btn-sm" title="View screenshots" onClick={() => openLightbox(e.screenshots!, 0)}>
                              <EyeIcon style={{ width: 12, height: 12 }} />
                            </button>
                          )}
                          {e.source === 'payment_log' ? (
                            <>
                              <button className="btn btn-ghost btn-sm" title="Edit payment log" onClick={() => openPmtModal(e)}>
                                <PencilIcon style={{ width: 12, height: 12 }} />
                              </button>
                              <button className="btn btn-ghost btn-sm" title="Delete payment log" style={{ color: '#dc2626' }} onClick={() => deletePaymentLog(e._id)}>
                                <TrashIcon style={{ width: 12, height: 12 }} />
                              </button>
                            </>
                          ) : !e.isAutoEntry && (
                            <>
                              <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => openEntryModal(e)}>
                                <PencilIcon style={{ width: 12, height: 12 }} />
                              </button>
                              <button className="btn btn-ghost btn-sm" title="Delete" style={{ color: '#dc2626' }} onClick={() => deleteEntry(e._id)}>
                                <TrashIcon style={{ width: 12, height: 12 }} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit Entry Modal ─────────────────────────────────────────── */}
      {showEntryModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowEntryModal(false); }}>
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>{editEntry ? 'Edit Entry' : 'Add Cash Book Entry'}</h2>
              <button onClick={() => setShowEntryModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', fontSize: '1.1rem' }}>✕</button>
            </div>

            <form onSubmit={submitEntry} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {/* Type toggle */}
              <div>
                <label className="form-label">Type</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['debit', 'credit'] as const).map(t => (
                    <button key={t} type="button"
                      onClick={() => setEntryForm(f => ({ ...f, entryType: t }))}
                      style={{
                        flex: 1, padding: '0.5rem', border: '2px solid', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem',
                        borderColor: entryForm.entryType === t ? (t === 'credit' ? '#15803d' : '#dc2626') : 'var(--navy-200)',
                        background: entryForm.entryType === t ? (t === 'credit' ? 'var(--success-100)' : 'var(--danger-100)') : 'var(--bg-card)',
                        color: entryForm.entryType === t ? (t === 'credit' ? '#15803d' : '#dc2626') : 'var(--navy-400)',
                      }}>
                      {t === 'credit' ? '▲ Credit (In)' : '▼ Debit (Out)'}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                <div>
                  <label className="form-label">Amount (₨) *</label>
                  <input type="number" step="1" min="0.01" required className="form-input"
                    value={entryForm.amountPKR} onChange={e => setEntryForm(f => ({ ...f, amountPKR: e.target.value }))}
                    placeholder="0" autoFocus />
                </div>
                <div>
                  <label className="form-label">Date *</label>
                  <input type="date" required className="form-input"
                    value={entryForm.date} onChange={e => setEntryForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                <div>
                  <label className="form-label">Wallet</label>
                  <select className="form-input" value={entryForm.walletId} onChange={e => setEntryForm(f => ({ ...f, walletId: e.target.value }))}>
                    <option value="">— None —</option>
                    {wallets.filter(w => w.isActive).map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Category</label>
                  <select className="form-input" value={entryForm.categoryId} onChange={e => setEntryForm(f => ({ ...f, categoryId: e.target.value }))}>
                    <option value="">— None —</option>
                    {categories.filter(c => c.isActive).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">Description</label>
                <input type="text" className="form-input"
                  value={entryForm.description} onChange={e => setEntryForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Vendor payment, Salary disbursement…" />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.25rem' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEntryModal(false)}>Cancel</button>
                <button type="submit" disabled={savingEntry} className="btn btn-primary" style={{ flex: 1 }}>
                  {savingEntry ? 'Saving…' : editEntry ? 'Update Entry' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Manage Categories Modal ────────────────────────────────────────── */}
      {showCatModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowCatModal(false); }}>
          <div className="modal-box" style={{ maxWidth: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>Expense Categories</h2>
              <button onClick={() => setShowCatModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', fontSize: '1.1rem' }}>✕</button>
            </div>

            {/* Add/Edit form */}
            <div style={{ background: 'var(--navy-25)', border: '1px solid var(--navy-100)', borderRadius: 10, padding: '0.875rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)', marginBottom: '0.625rem' }}>
                {editCatId ? 'Edit Category' : 'New Category'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div>
                  <label className="form-label">Name *</label>
                  <input type="text" className="form-input" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Server Costs" />
                </div>
                <div>
                  <label className="form-label">Type</label>
                  <select className="form-input" value={catForm.type} onChange={e => setCatForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="expense">Expense</option>
                    <option value="advertising">Advertising</option>
                    <option value="salary">Salary</option>
                    <option value="distribution">Partner Distribution</option>
                    <option value="transfer">Wallet Transfer</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {editCatId && (
                  <button className="btn btn-ghost btn-sm" onClick={() => { setEditCatId(null); setCatForm({ name: '', type: 'expense' }); }}>Cancel</button>
                )}
                <button className="btn btn-primary btn-sm" disabled={savingCat || !catForm.name.trim()} onClick={submitCategory}>
                  {savingCat ? 'Saving…' : editCatId ? 'Update' : '+ Add'}
                </button>
              </div>
            </div>

            {/* Category list */}
            {categories.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--navy-400)' }}>No categories yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {categories.map(c => (
                  <div key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', border: '1px solid var(--navy-100)', borderRadius: 8, padding: '0.5rem 0.75rem', opacity: c.isActive ? 1 : 0.55 }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--navy-800)' }}>{c.name}</span>
                      <span style={{ fontSize: '0.72rem', marginLeft: 8, color: CAT_TYPE_COLORS[c.type] || '#64748b' }}>{c.type}</span>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditCatId(c._id); setCatForm({ name: c.name, type: c.type }); }}>✎</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => deleteCategory(c._id)}>🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Payment Log Modal ────────────────────────────────────────── */}
      {showPmtModal && editPmt && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowPmtModal(false); }}>
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h2 className="modal-title" style={{ margin: 0 }}>Edit Payment Log</h2>
                {editPmt.clientName && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--navy-400)', margin: '3px 0 0' }}>
                    Client: <strong style={{ color: 'var(--navy-700)' }}>{editPmt.clientName}</strong>
                  </p>
                )}
              </div>
              <button onClick={() => setShowPmtModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', fontSize: '1.1rem' }}>✕</button>
            </div>

            <form onSubmit={submitPmt} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                <div>
                  <label className="form-label">Amount (USD) *</label>
                  <input
                    type="number" step="0.01" min="0.01" required className="form-input"
                    value={pmtForm.amountUSD}
                    onChange={e => setPmtForm(f => ({ ...f, amountUSD: e.target.value }))}
                    placeholder="0.00" autoFocus
                  />
                </div>
                <div>
                  <label className="form-label">Date *</label>
                  <input
                    type="date" required className="form-input"
                    value={pmtForm.date}
                    onChange={e => setPmtForm(f => ({ ...f, date: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Wallet</label>
                <select
                  className="form-input"
                  value={pmtForm.walletId}
                  onChange={e => setPmtForm(f => ({ ...f, walletId: e.target.value }))}
                >
                  <option value="">— None —</option>
                  {wallets.filter(w => w.isActive).map(w => (
                    <option key={w._id} value={w._id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Note</label>
                <input
                  type="text" className="form-input"
                  value={pmtForm.note}
                  onChange={e => setPmtForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="e.g. Invoice #123, partial payment…"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.25rem' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowPmtModal(false)}>Cancel</button>
                <button type="submit" disabled={savingPmt} className="btn btn-primary" style={{ flex: 1 }}>
                  {savingPmt ? 'Saving…' : 'Update Payment Log'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Screenshot Lightbox ────────────────────────────────────────────── */}
      {lightboxUrls.length > 0 && ReactDOM.createPortal(
        <div
          onClick={closeLightbox}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(4px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* Close button */}
          <button
            onClick={closeLightbox}
            style={{ position: 'absolute', top: 18, right: 22, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#fff', fontSize: '1.1rem', zIndex: 10 }}
          >
            <XMarkIcon style={{ width: 22, height: 22 }} />
          </button>

          {/* Counter */}
          <div style={{ position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem', fontWeight: 600, zIndex: 10 }}>
            {lightboxIdx + 1} / {lightboxUrls.length}
          </div>

          {/* Prev arrow */}
          {lightboxUrls.length > 1 && (
            <button
              onClick={ev => { ev.stopPropagation(); setLightboxIdx(i => (i - 1 + lightboxUrls.length) % lightboxUrls.length); }}
              style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, padding: '10px 8px', cursor: 'pointer', color: '#fff', zIndex: 10 }}
            >
              <ChevronLeftIcon style={{ width: 26, height: 26 }} />
            </button>
          )}

          {/* Image / PDF preview */}
          <div onClick={ev => ev.stopPropagation()} style={{ maxWidth: '88vw', maxHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {lightboxUrls[lightboxIdx]?.toLowerCase().endsWith('.pdf') ? (
              <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '2rem 3rem', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--navy-700)', marginBottom: '1rem' }}>PDF Document</div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <a href={toAbsoluteUrl(lightboxUrls[lightboxIdx])} target="_blank" rel="noreferrer"
                    style={{ padding: '0.5rem 1.25rem', background: 'var(--accent-600)', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem' }}>
                    Open PDF
                  </a>
                  <button onClick={() => downloadFile(lightboxUrls[lightboxIdx])}
                    style={{ padding: '0.5rem 1.25rem', background: 'var(--navy-100)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: 'var(--navy-700)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ArrowDownTrayIcon style={{ width: 15, height: 15 }} /> Download
                  </button>
                </div>
              </div>
            ) : (
              <img
                src={toAbsoluteUrl(lightboxUrls[lightboxIdx])}
                alt={`Screenshot ${lightboxIdx + 1}`}
                style={{ maxWidth: '88vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
              />
            )}
          </div>

          {/* Next arrow */}
          {lightboxUrls.length > 1 && (
            <button
              onClick={ev => { ev.stopPropagation(); setLightboxIdx(i => (i + 1) % lightboxUrls.length); }}
              style={{ position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, padding: '10px 8px', cursor: 'pointer', color: '#fff', zIndex: 10 }}
            >
              <ChevronRightIcon style={{ width: 26, height: 26 }} />
            </button>
          )}

          {/* Bottom toolbar: thumbnails strip + download all */}
          <div onClick={ev => ev.stopPropagation()} style={{ position: 'absolute', bottom: 20, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {lightboxUrls.length > 1 && lightboxUrls.map((url, si) => (
              <button key={url} onClick={() => setLightboxIdx(si)}
                style={{ border: si === lightboxIdx ? '2px solid #fff' : '2px solid transparent', borderRadius: 6, padding: 1, background: 'none', cursor: 'pointer', opacity: si === lightboxIdx ? 1 : 0.55 }}>
                <img src={toAbsoluteUrl(url)} alt="" style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 4, display: 'block' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </button>
            ))}
            <button
              onClick={() => downloadFile(lightboxUrls[lightboxIdx])}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.45rem 1rem', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer', color: '#fff', fontWeight: 600, fontSize: '0.8rem' }}
            >
              <ArrowDownTrayIcon style={{ width: 14, height: 14 }} /> Download
            </button>
            {lightboxUrls.length > 1 && (
              <button
                onClick={() => lightboxUrls.forEach(url => downloadFile(url))}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.45rem 1rem', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer', color: '#fff', fontWeight: 600, fontSize: '0.8rem' }}
              >
                <ArrowDownTrayIcon style={{ width: 14, height: 14 }} /> Download All ({lightboxUrls.length})
              </button>
            )}
          </div>
        </div>
      , document.body)}

    </div>
  );
};

export default CashBook;
