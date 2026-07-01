import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  PlusIcon, PencilIcon, TrashIcon, MagnifyingGlassIcon,
  CheckCircleIcon, ExclamationCircleIcon, XMarkIcon,
  BanknotesIcon, EyeIcon, EyeSlashIcon,
  UserGroupIcon, ArrowPathIcon, CloudArrowDownIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';

// ── Types ──────────────────────────────────────────────────────
interface ApiVendor {
  _id: string;
  name: string;
  carrier: string;
  shippingService: string;
  rate: number;
  isActive: boolean;
  source: string;
  shippershubCarrierId:  string | null;
  shippershubVendorId:   string | null;
  labelcrowSeriesId:     number | null;
  labelcrowProviderKey:  string | null;
  labelcrowServiceClass: string | null;
  shiplabelServiceId:    string | null;
  shiplabelLabelSeries:  string | null;
  shiplabelLabelFormat:  string | null;
  shiplabelSeries:       Array<{ series: string; format: string; name: string }>;
  createdAt: string;
}

interface ManifestVendor {
  _id: string;
  name: string;
  email: string;
  notifyEmail: string;
  carriers: string[];
  vendorRate: number;
  description: string;
  isActive: boolean;
  scoreOverride: number | null;
  score: number | null;
  payableBalance: number;
  totalPaidOut: number;
  stats: {
    totalJobs: number; onTimeUploads: number; lateUploads: number;
    completedJobs: number; rejectedJobs: number; totalLabels: number;
  };
  createdAt: string;
}

interface FormData {
  name: string; email: string; password: string; notifyEmail: string;
  carriers: string[]; vendorRate: number; description: string;
  isActive: boolean; scoreOverride: string;
}

const BLANK: FormData = {
  name: '', email: '', password: '', notifyEmail: '',
  carriers: [], vendorRate: 0, description: '',
  isActive: true, scoreOverride: '',
};

const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL'] as const;

const CARRIER_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  USPS:  { bg: 'rgba(29,78,216,0.12)',  color: '#1a56db', border: 'rgba(29,78,216,0.3)' },
  UPS:   { bg: 'rgba(146,64,14,0.12)',  color: '#92400e', border: 'rgba(146,64,14,0.3)' },
  FedEx: { bg: 'rgba(91,33,182,0.12)',  color: '#5b21b6', border: 'rgba(91,33,182,0.3)' },
  DHL:   { bg: 'rgba(113,63,18,0.12)',  color: '#713f12', border: 'rgba(113,63,18,0.3)' },
};

// ── Star rating ────────────────────────────────────────────────
const StarRating = ({ score }: { score: number | null }) => {
  if (score === null || score === undefined)
    return <span style={{ fontSize: '0.72rem', color: 'var(--navy-400)' }}>No score yet</span>;
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    const filled = i <= Math.floor(score);
    const half   = !filled && i - 0.5 <= score;
    stars.push(
      <span key={i} style={{ color: '#f59e0b', fontSize: '0.9rem' }}>{filled || half ? '★' : '☆'}</span>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {stars}
      <span style={{ fontSize: '0.72rem', color: 'var(--navy-500)', marginLeft: 4 }}>{score.toFixed(1)}</span>
    </div>
  );
};

// ── Modal ──────────────────────────────────────────────────────
const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="modal-box" style={{ maxWidth: 560, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h3 className="modal-title" style={{ margin: 0 }}>{title}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 4 }}>
          <XMarkIcon style={{ width: 20, height: 20 }} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

// ── Vendor form (manifest) ─────────────────────────────────────
const VendorForm = ({ form, setForm, isEdit }: { form: FormData; setForm: (f: FormData) => void; isEdit?: boolean }) => {
  const [showPw, setShowPw] = React.useState(false);
  const set = (key: keyof FormData, val: any) => setForm({ ...form, [key]: val });
  const toggleCarrier = (c: string) =>
    set('carriers', form.carriers.includes(c) ? form.carriers.filter(x => x !== c) : [...form.carriers, c]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label className="form-label">Vendor Name *</label>
          <input className="form-input" required value={form.name}
            onChange={e => set('name', e.target.value)} placeholder="e.g. Arslan Logistics" />
        </div>
        <div>
          <label className="form-label">Login Email *</label>
          <input className="form-input" type="email" required value={form.email}
            onChange={e => set('email', e.target.value)} placeholder="vendor@example.com" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label className="form-label">
            Portal Password {isEdit && <span style={{ color: 'var(--navy-400)', fontWeight: 400 }}>(blank = keep current)</span>}
          </label>
          <div style={{ position: 'relative' }}>
            <input className="form-input" type={showPw ? 'text' : 'password'}
              value={form.password} onChange={e => set('password', e.target.value)}
              placeholder={isEdit ? '••••••••' : 'Set a password'}
              style={{ paddingRight: '2.5rem' }} />
            <button type="button" onClick={() => setShowPw(p => !p)} style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)',
            }}>
              {showPw ? <EyeSlashIcon style={{ width: 16, height: 16 }} /> : <EyeIcon style={{ width: 16, height: 16 }} />}
            </button>
          </div>
        </div>
        <div>
          <label className="form-label">Notification Email <span style={{ color: 'var(--navy-400)', fontWeight: 400 }}>(optional)</span></label>
          <input className="form-input" type="email" value={form.notifyEmail}
            onChange={e => set('notifyEmail', e.target.value)} placeholder="Same as login if blank" />
        </div>
      </div>
      <div>
        <label className="form-label">Supported Carriers *</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CARRIERS.map(c => {
            const s = CARRIER_STYLES[c];
            const checked = form.carriers.includes(c);
            return (
              <button key={c} type="button" onClick={() => toggleCarrier(c)} style={{
                padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                border: `2px solid ${checked ? s.border : 'var(--navy-200)'}`,
                background: checked ? s.bg : 'transparent',
                color: checked ? s.color : 'var(--navy-500)',
                transition: 'all 120ms',
              }}>
                {c}
              </button>
            );
          })}
        </div>
        {form.carriers.length === 0 && (
          <p style={{ fontSize: '0.72rem', color: 'var(--danger-600)', marginTop: 4 }}>Select at least one carrier</p>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label className="form-label">Vendor Rate ($/label)</label>
          <input className="form-input" type="number" step="0.01" min="0"
            value={form.vendorRate} onChange={e => set('vendorRate', parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <label className="form-label">Score Override <span style={{ color: 'var(--navy-400)', fontWeight: 400 }}>(1–5, blank = auto)</span></label>
          <input className="form-input" type="number" step="0.5" min="1" max="5"
            value={form.scoreOverride} onChange={e => set('scoreOverride', e.target.value)} placeholder="Auto" />
        </div>
      </div>
      <div>
        <label className="form-label">Description / Notes</label>
        <input className="form-input" value={form.description}
          onChange={e => set('description', e.target.value)} placeholder="Optional internal note" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="checkbox" id="isActive" checked={form.isActive}
          onChange={e => set('isActive', e.target.checked)}
          style={{ width: 16, height: 16, accentColor: 'var(--accent-600)' }} />
        <label htmlFor="isActive" style={{ fontSize: '0.875rem', color: 'var(--navy-700)', cursor: 'pointer' }}>
          Active (vendor can log in and process jobs)
        </label>
      </div>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────
const VendorManagement: React.FC = () => {
  const { user } = useAuth();

  const [activeTab,    setActiveTab]    = useState<'api' | 'manifest'>('api');
  const [activePortal, setActivePortal] = useState<'shippershub' | 'labelcrow' | 'shiplabel'>('shippershub');

  // API vendors
  const [apiVendors,  setApiVendors]  = useState<ApiVendor[]>([]);
  const [apiLoading,  setApiLoading]  = useState(true);
  const [importing,   setImporting]   = useState(false);
  const [editApi,     setEditApi]     = useState<ApiVendor | null>(null);
  const [apiRate,     setApiRate]     = useState('');
  const [apiActive,   setApiActive]   = useState(true);
  const [apiSaving,   setApiSaving]   = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagData,    setDiagData]    = useState<any[] | null>(null);
  const [diagError,   setDiagError]   = useState('');
  const [lcVendors,   setLcVendors]   = useState<ApiVendor[]>([]);
  const [lcSyncing,   setLcSyncing]   = useState(false);
  const [slVendors,      setSlVendors]      = useState<ApiVendor[]>([]);
  const [slSyncing,      setSlSyncing]      = useState(false);
  const [slLabelSeries,  setSlLabelSeries]  = useState('');
  const [slLabelFormat,  setSlLabelFormat]  = useState('');
  const [slSeriesRows,   setSlSeriesRows]   = useState<Array<{ series: string; format: string; name: string }>>([]);

  // Bulk selection
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [bulkModal,       setBulkModal]       = useState(false);
  const [bulkRate,        setBulkRate]        = useState('');
  const [bulkRateEnabled, setBulkRateEnabled] = useState(false);
  const [bulkStatus,      setBulkStatus]      = useState<'keep' | 'activate' | 'deactivate'>('keep');
  const [bulkSaving,      setBulkSaving]      = useState(false);

  // Manifest vendors
  const [vendors,      setVendors]      = useState<ManifestVendor[]>([]);
  const [isLoading,    setIsLoading]    = useState(true);
  const [search,       setSearch]       = useState('');
  const [showCreate,   setShowCreate]   = useState(false);
  const [editVendor,   setEditVendor]   = useState<ManifestVendor | null>(null);
  const [form,         setForm]         = useState<FormData>(BLANK);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message,      setMessage]      = useState('');
  const [error,        setError]        = useState('');
  const [payoutVendor, setPayoutVendor] = useState<ManifestVendor | null>(null);
  const [payoutAmt,    setPayoutAmt]    = useState('');
  const [payoutNote,   setPayoutNote]   = useState('');
  const [payoutBusy,   setPayoutBusy]   = useState(false);

  useEffect(() => { fetchVendors(); fetchApiVendors(); }, []);

  // ── Derived (must be before early return so hooks stay unconditional) ──
  const activeVendors = activePortal === 'shippershub' ? apiVendors
    : activePortal === 'labelcrow' ? lcVendors
    : slVendors;
  const allSelected  = activeVendors.length > 0 && selectedIds.size === activeVendors.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < activeVendors.length;
  const selectAllRef = useCallback((el: HTMLInputElement | null) => {
    if (el) el.indeterminate = someSelected;
  }, [someSelected]);

  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />;

  // ── Selection handlers ───────────────────────────────────────
  const switchPortal = (id: typeof activePortal) => { setActivePortal(id); setSelectedIds(new Set()); };
  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(activeVendors.map(v => v._id)));

  // ── Bulk save ────────────────────────────────────────────────
  const handleBulkSave = async () => {
    setBulkSaving(true);
    try {
      const payload: any = { ids: Array.from(selectedIds) };
      if (bulkRateEnabled) payload.rate = parseFloat(bulkRate) || 0;
      if (bulkStatus !== 'keep') payload.isActive = bulkStatus === 'activate';
      await axios.post('/vendors/bulk-update', payload);
      notify(`${selectedIds.size} vendor${selectedIds.size !== 1 ? 's' : ''} updated`);
      setBulkModal(false);
      setSelectedIds(new Set());
      setBulkRate(''); setBulkRateEnabled(false); setBulkStatus('keep');
      fetchApiVendors();
    } catch (err: any) {
      notify(err.response?.data?.message || 'Bulk update failed', true);
    } finally { setBulkSaving(false); }
  };

  // ── API vendor handlers ──────────────────────────────────────
  const fetchApiVendors = async () => {
    setApiLoading(true);
    try {
      const res = await axios.get('/vendors');
      const all: ApiVendor[] = res.data.vendors || [];
      setApiVendors(all.filter(v => v.source === 'shippershub'));
      setLcVendors(all.filter(v => v.source === 'labelcrow'));
      setSlVendors(all.filter(v => v.source === 'shiplabel'));
    } catch { /* ignore */ }
    finally { setApiLoading(false); }
  };

  const handleImportShippersHub = async () => {
    setImporting(true);
    try {
      const res = await axios.post('/vendors/import-from-shippershub');
      notify(res.data.message || 'Sync complete'); fetchApiVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'Sync failed', true); }
    finally { setImporting(false); }
  };

  const openEditApi = (v: ApiVendor) => {
    setEditApi(v);
    setApiRate(String(v.rate));
    setApiActive(v.isActive);
    setSlLabelSeries(v.shiplabelLabelSeries || '');
    setSlLabelFormat(v.shiplabelLabelFormat || '');
    setSlSeriesRows(v.shiplabelSeries?.length ? v.shiplabelSeries : []);
  };

  const handleSaveApi = async () => {
    if (!editApi) return;
    setApiSaving(true);
    try {
      const payload: any = { rate: parseFloat(apiRate) || 0, isActive: apiActive };
      if (editApi.source === 'shiplabel') {
        payload.shiplabelSeries     = slSeriesRows;
        payload.shiplabelLabelSeries = slLabelSeries;
        payload.shiplabelLabelFormat = slLabelFormat;
      }
      await axios.put(`/vendors/${editApi._id}`, payload);
      notify('Vendor updated'); setEditApi(null); fetchApiVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'Update failed', true); }
    finally { setApiSaving(false); }
  };

  const handleDeleteApi = async (v: ApiVendor) => {
    if (!window.confirm(`Delete "${v.name}"?`)) return;
    try {
      await axios.delete(`/vendors/${v._id}`);
      notify('Vendor deleted'); fetchApiVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'Delete failed', true); }
  };

  const handleDiagnose = async () => {
    setDiagLoading(true); setDiagData(null); setDiagError('');
    try {
      const res = await axios.get('/shippershub-accounts/carriers');
      setDiagData(res.data.carriers || []);
    } catch (err: any) {
      setDiagError(err.response?.data?.message || 'Could not connect to ShippersHub');
    } finally { setDiagLoading(false); }
  };

  const handleSyncLabelCrow = async () => {
    setLcSyncing(true);
    try {
      const res = await axios.post('/vendors/import-from-labelcrow');
      notify(res.data.message || 'Label Crow sync complete'); fetchApiVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'Label Crow sync failed', true); }
    finally { setLcSyncing(false); }
  };

  const handleSyncShipLabel = async () => {
    setSlSyncing(true);
    try {
      const res = await axios.post('/vendors/import-from-shiplabel');
      notify(res.data.message || 'ShipLabel sync complete'); fetchApiVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'ShipLabel sync failed', true); }
    finally { setSlSyncing(false); }
  };

  // ── Manifest vendor handlers ─────────────────────────────────
  const fetchVendors = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get('/manifest-vendors');
      setVendors(res.data.vendors || []);
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  };

  const notify = (msg: string, isErr = false) => {
    if (isErr) { setError(msg); setMessage(''); } else { setMessage(msg); setError(''); }
    setTimeout(() => { setMessage(''); setError(''); }, 4000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.carriers.length === 0) { notify('Select at least one carrier', true); return; }
    setIsSubmitting(true);
    try {
      const payload: any = { ...form, scoreOverride: form.scoreOverride !== '' ? parseFloat(form.scoreOverride) : null };
      if (!payload.password) delete payload.password;
      await axios.post('/manifest-vendors', payload);
      notify('Vendor created'); setShowCreate(false); setForm(BLANK); fetchVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'Failed to create vendor', true); }
    finally { setIsSubmitting(false); }
  };

  const openEdit = (v: ManifestVendor) => {
    setEditVendor(v);
    setForm({
      name: v.name, email: v.email, password: '', notifyEmail: v.notifyEmail || '',
      carriers: v.carriers || [], vendorRate: v.vendorRate || 0,
      description: v.description || '', isActive: v.isActive,
      scoreOverride: v.scoreOverride !== null && v.scoreOverride !== undefined ? String(v.scoreOverride) : '',
    });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editVendor) return;
    if (form.carriers.length === 0) { notify('Select at least one carrier', true); return; }
    setIsSubmitting(true);
    try {
      const payload: any = { ...form, scoreOverride: form.scoreOverride !== '' ? parseFloat(form.scoreOverride) : null };
      if (!payload.password) delete payload.password;
      await axios.put(`/manifest-vendors/${editVendor._id}`, payload);
      notify('Vendor updated'); setEditVendor(null); setForm(BLANK); fetchVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'Failed to update vendor', true); }
    finally { setIsSubmitting(false); }
  };

  const handleDelete = async (v: ManifestVendor) => {
    if (!window.confirm(`Delete "${v.name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`/manifest-vendors/${v._id}`);
      notify('Vendor deleted'); fetchVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'Failed to delete', true); }
  };

  const handleToggle = async (v: ManifestVendor) => {
    try {
      await axios.put(`/manifest-vendors/${v._id}`, { isActive: !v.isActive });
      notify(`${v.name} ${!v.isActive ? 'activated' : 'deactivated'}`); fetchVendors();
    } catch { notify('Failed to update status', true); }
  };

  const handlePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payoutVendor) return;
    setPayoutBusy(true);
    try {
      await axios.post(`/manifest-vendors/${payoutVendor._id}/payout`, { amount: parseFloat(payoutAmt), note: payoutNote });
      notify('Payout recorded'); setPayoutVendor(null); setPayoutAmt(''); setPayoutNote(''); fetchVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'Payout failed', true); }
    finally { setPayoutBusy(false); }
  };

  const filtered  = vendors.filter(v => !search || v.name.toLowerCase().includes(search.toLowerCase()) || v.email.toLowerCase().includes(search.toLowerCase()));
  const totalOwed = vendors.reduce((s, v) => s + (v.payableBalance || 0), 0);

  // ── Portal config ────────────────────────────────────────────
  const PORTALS = [
    { id: 'shippershub' as const, label: 'ShippersHub', count: apiVendors.length, accent: '#1D4ED8', syncing: importing,  onSync: handleImportShippersHub, syncLabel: 'Sync from ShippersHub', desc: 'API vendors synced from your ShippersHub account' },
    { id: 'labelcrow'   as const, label: 'Label Crow',  count: lcVendors.length,  accent: '#7C3AED', syncing: lcSyncing,   onSync: handleSyncLabelCrow,     syncLabel: 'Sync from Label Crow',  desc: 'USPS vendors · each series × provider key combo' },
    { id: 'shiplabel'   as const, label: 'ShipLabel',   count: slVendors.length,  accent: '#059669', syncing: slSyncing,   onSync: handleSyncShipLabel,     syncLabel: 'Sync from ShipLabel',   desc: 'USPS vendors synced from shiplabel.net' },
  ];
  const portal = PORTALS.find(p => p.id === activePortal)!;

  // ── Reusable checkbox cell/header ────────────────────────────
  const cbStyle: React.CSSProperties = { width: 15, height: 15, accentColor: 'var(--accent-600)', cursor: 'pointer', flexShrink: 0 };
  const checkTh = (
    <th style={{ width: 44, paddingLeft: 12, paddingRight: 0 }}>
      <input type="checkbox" ref={selectAllRef} checked={allSelected} onChange={toggleSelectAll} style={cbStyle} title={allSelected ? 'Deselect all' : 'Select all'} />
    </th>
  );
  const checkTd = (id: string) => (
    <td style={{ width: 44, paddingLeft: 12, paddingRight: 0 }} onClick={e => e.stopPropagation()}>
      <input type="checkbox" checked={selectedIds.has(id)} onChange={() => toggleSelect(id)} style={cbStyle} />
    </td>
  );

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} className="animate-fadeIn">

      <style>{`
        .sh-table tbody tr { transition: background 120ms; }
        .sh-table tbody tr:hover { background: var(--navy-25, #f8fafc); }
        .sh-table tbody tr.row-selected { background: rgba(59,130,246,0.1); }
        .sh-table tbody tr.row-selected:hover { background: rgba(59,130,246,0.16); }
        .vnd-btn { background: none; border: none; cursor: pointer; padding: 5px; border-radius: 5px; transition: background 120ms, color 120ms; display: flex; align-items: center; }
        .vnd-btn:hover { background: var(--navy-100, #f1f5f9); }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Vendor Management</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Manage API vendors (ShippersHub, Label Crow, ShipLabel) and manifest vendors.</p>
        </div>
        {activeTab === 'manifest' && (
          <button className="btn btn-primary" onClick={() => { setForm(BLANK); setShowCreate(true); }}>
            <PlusIcon style={{ width: 16, height: 16 }} /> Add Vendor
          </button>
        )}
        {activeTab === 'api' && (
          <button className="btn btn-ghost" onClick={handleDiagnose} disabled={diagLoading} title="Check live connection to ShippersHub">
            {diagLoading
              ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Checking…</>
              : <><MagnifyingGlassIcon style={{ width: 16, height: 16 }} /> Check Connection</>
            }
          </button>
        )}
      </div>

      {/* Alerts */}
      {(message || error) && (
        <div className={`alert ${message ? 'alert-success' : 'alert-danger'}`} style={{ padding: '0.5rem 0.875rem' }}>
          {message ? <CheckCircleIcon style={{ width: 15, height: 15 }} /> : <ExclamationCircleIcon style={{ width: 15, height: 15 }} />}
          <span style={{ fontSize: '0.82rem' }}>{message || error}</span>
          <button onClick={() => { setMessage(''); setError(''); }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}>
            <XMarkIcon style={{ width: 13, height: 13 }} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid var(--navy-100)', paddingBottom: 0 }}>
        {([
          { key: 'api',      label: `API Vendors${(apiVendors.length + lcVendors.length + slVendors.length) > 0 ? ` · ${apiVendors.length + lcVendors.length + slVendors.length}` : ''}` },
          { key: 'manifest', label: `Manifest Vendors${vendors.length > 0 ? ` · ${vendors.length}` : ''}` },
        ] as { key: 'api' | 'manifest'; label: string }[]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '0.55rem 1.1rem', fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer',
            background: 'none', borderBottom: activeTab === tab.key ? '2px solid var(--accent-600)' : '2px solid transparent',
            color: activeTab === tab.key ? 'var(--accent-700)' : 'var(--navy-500)',
            marginBottom: -2, borderRadius: 0, transition: 'color 0.12s',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── API Vendors Tab ──────────────────────────────────── */}
      {activeTab === 'api' && (
        <>
          {/* Portal selector */}
          <div className="sh-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--navy-100)' }}>
              {PORTALS.map(p => {
                const active = activePortal === p.id;
                return (
                  <button key={p.id} onClick={() => switchPortal(p.id)} style={{
                    flex: 1, padding: '0.75rem 0.5rem', border: 'none', cursor: 'pointer',
                    background: active ? `${p.accent}16` : 'var(--bg-card)',
                    borderBottom: active ? `2.5px solid ${p.accent}` : '2.5px solid transparent',
                    transition: 'all 0.12s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: active ? p.accent : 'var(--navy-500)' }}>{p.label}</span>
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 700,
                      background: active ? p.accent : 'var(--navy-100)',
                      color: active ? '#fff' : 'var(--navy-500)',
                      padding: '1px 8px', borderRadius: 99, transition: 'all 0.12s',
                    }}>
                      {p.count} vendor{p.count !== 1 ? 's' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.25rem', background: `${portal.accent}16` }}>
              <span style={{ fontSize: '0.78rem', color: portal.accent, fontWeight: 600 }}>{portal.desc}</span>
              <button onClick={portal.onSync} disabled={portal.syncing} style={{
                display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                padding: '6px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                border: `1.5px solid ${portal.accent}`,
                background: portal.syncing ? `${portal.accent}16` : portal.accent,
                color: portal.syncing ? portal.accent : '#fff',
                cursor: portal.syncing ? 'not-allowed' : 'pointer',
                opacity: portal.syncing ? 0.75 : 1, transition: 'all 0.15s',
              }}>
                {portal.syncing
                  ? <><div className="spinner" style={{ width: 12, height: 12, borderWidth: 2, borderColor: `${portal.accent}40`, borderTopColor: portal.accent }} /> Syncing…</>
                  : <><ArrowPathIcon style={{ width: 13, height: 13 }} /> {portal.syncLabel}</>
                }
              </button>
            </div>
          </div>

          {/* Diagnostics (ShippersHub only) */}
          {activePortal === 'shippershub' && (diagData !== null || diagError) && (
            <div className="sh-card" style={{ padding: '1rem 1.25rem', border: diagError ? '1.5px solid #ef444450' : '1.5px solid #22c55e50', background: diagError ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: diagError ? '#b91c1c' : '#15803d' }}>
                  {diagError ? '✗ Connection failed' : `✓ ShippersHub connected — ${diagData!.length} carrier(s) found`}
                </span>
                <button onClick={() => { setDiagData(null); setDiagError(''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 2 }}>
                  <XMarkIcon style={{ width: 14, height: 14 }} />
                </button>
              </div>
              {diagError && <p style={{ fontSize: '0.82rem', color: '#b91c1c', margin: 0 }}>{diagError}</p>}
              {diagData && diagData.map((carrier: any) => (
                <div key={carrier._id || carrier.id} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-700)', marginBottom: 4 }}>
                    {carrier.name} — Carrier ID: <code style={{ background: 'rgba(14,165,233,0.14)', padding: '1px 5px', borderRadius: 3, fontSize: '0.75rem' }}>{carrier._id || carrier.id || '?'}</code>
                  </div>
                  {(carrier.vendors || []).length === 0
                    ? <div style={{ fontSize: '0.72rem', color: 'var(--navy-400)' }}>No vendors found for this carrier</div>
                    : (carrier.vendors || []).map((v: any) => (
                        <div key={v._id || v.id} style={{ fontSize: '0.72rem', color: 'var(--navy-600)', display: 'flex', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontWeight: 600 }}>{v.name}</span>
                          <span>Vendor ID: <code style={{ background: 'rgba(14,165,233,0.14)', padding: '1px 4px', borderRadius: 3 }}>{v._id || v.id || '?'}</code></span>
                          <span style={{ color: 'var(--navy-400)' }}>{v.status || ''}</span>
                        </div>
                      ))
                  }
                </div>
              ))}
              {diagData && diagData.length > 0 && (
                <p style={{ fontSize: '0.72rem', color: 'var(--navy-500)', marginTop: 8, marginBottom: 0 }}>
                  If the IDs above don't match what's stored in your vendors, click <strong>Sync from ShippersHub</strong> to re-import.
                </p>
              )}
            </div>
          )}

          {/* ── Bulk action bar ── appears when items are selected */}
          {selectedIds.size > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '0.65rem 1rem',
              background: `linear-gradient(135deg, ${portal.accent}dd, ${portal.accent})`,
              borderRadius: 10, color: '#fff',
              boxShadow: `0 4px 14px ${portal.accent}35`,
            }}>
              <input
                type="checkbox"
                ref={el => { if (el) el.indeterminate = someSelected; }}
                checked={allSelected}
                onChange={toggleSelectAll}
                style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
                title="Toggle all"
              />
              <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                {selectedIds.size} of {activeVendors.length} selected
              </span>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => { setBulkRate(''); setBulkRateEnabled(false); setBulkStatus('keep'); setBulkModal(true); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 14px', borderRadius: 7, fontSize: '0.78rem', fontWeight: 700,
                  background: '#fff', color: portal.accent, border: 'none', cursor: 'pointer',
                  transition: 'opacity 120ms',
                }}
              >
                <AdjustmentsHorizontalIcon style={{ width: 14, height: 14 }} />
                Bulk Edit
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                title="Clear selection"
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#fff', borderRadius: 6, padding: '5px 8px', display: 'flex', alignItems: 'center' }}
              >
                <XMarkIcon style={{ width: 14, height: 14 }} />
              </button>
            </div>
          )}

          {/* Vendor table card */}
          <div className="sh-card">
            {apiLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>
            ) : activePortal === 'shippershub' ? (
              apiVendors.length === 0 ? (
                <div className="empty-state">
                  <CloudArrowDownIcon style={{ width: 40, height: 40, color: '#93C5FD' }} />
                  <h3>No ShippersHub vendors yet</h3>
                  <p>Click <strong>Sync from ShippersHub</strong> above to import your carriers and vendors.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="sh-table">
                    <thead>
                      <tr>
                        {checkTh}
                        <th>Vendor Name</th><th>Carrier</th><th>Service</th><th>Rate</th><th>Status</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiVendors.map(v => (
                        <tr key={v._id} className={selectedIds.has(v._id) ? 'row-selected' : ''}>
                          {checkTd(v._id)}
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--navy-900)' }}>{v.name}</span>
                              {(!v.shippershubCarrierId || !v.shippershubVendorId) && (
                                <span title="Missing IDs — re-sync to fix" style={{ background: 'rgba(146,64,14,0.14)', color: '#92400e', border: '1px solid rgba(146,64,14,0.35)', borderRadius: 4, padding: '1px 5px', fontSize: '0.65rem', fontWeight: 700, cursor: 'help' }}>IDs missing</span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', marginTop: 1 }}>
                              C: {v.shippershubCarrierId || <span style={{ color: '#dc2626' }}>—</span>} · V: {v.shippershubVendorId || <span style={{ color: '#dc2626' }}>—</span>}
                            </div>
                          </td>
                          <td>{(() => { const s = CARRIER_STYLES[v.carrier] || { bg: 'var(--navy-100)', color: 'var(--navy-600)', border: 'var(--navy-300)' }; return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{v.carrier}</span>; })()}</td>
                          <td style={{ fontSize: '0.82rem', color: 'var(--navy-600)' }}>{v.shippingService || '—'}</td>
                          <td><span style={{ fontWeight: 700, color: 'var(--success-700)' }}>${v.rate.toFixed(2)}</span></td>
                          <td><span className={v.isActive ? 'badge badge-green' : 'badge badge-red'}>{v.isActive ? 'Active' : 'Inactive'}</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: 2 }}>
                              <button className="vnd-btn" title="Edit" onClick={() => openEditApi(v)} style={{ color: '#1D4ED8' }}><PencilIcon style={{ width: 14, height: 14 }} /></button>
                              <button className="vnd-btn" title="Delete" onClick={() => handleDeleteApi(v)} style={{ color: 'var(--danger-500)' }}><TrashIcon style={{ width: 14, height: 14 }} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : activePortal === 'labelcrow' ? (
              lcVendors.length === 0 ? (
                <div className="empty-state">
                  <CloudArrowDownIcon style={{ width: 40, height: 40, color: '#C4B5FD' }} />
                  <h3>No Label Crow vendors yet</h3>
                  <p>Click <strong>Sync from Label Crow</strong> above to import all series × provider combinations.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="sh-table">
                    <thead>
                      <tr>
                        {checkTh}
                        <th>Vendor Name</th><th>Series ID</th><th>Service</th><th>Provider Key</th><th>Rate</th><th>Status</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lcVendors.map(v => (
                        <tr key={v._id} className={selectedIds.has(v._id) ? 'row-selected' : ''}>
                          {checkTd(v._id)}
                          <td><span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--navy-900)' }}>{v.name}</span></td>
                          <td><code style={{ background: 'rgba(91,33,182,0.14)', color: '#5b21b6', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem' }}>{v.labelcrowSeriesId ?? '—'}</code></td>
                          <td>
                            <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, background: v.labelcrowServiceClass === 'priority' ? 'rgba(29,78,216,0.14)' : 'rgba(21,128,61,0.12)', color: v.labelcrowServiceClass === 'priority' ? '#1a56db' : '#15803d', border: `1px solid ${v.labelcrowServiceClass === 'priority' ? 'rgba(29,78,216,0.35)' : 'rgba(21,128,61,0.35)'}` }}>
                              {v.labelcrowServiceClass ? v.labelcrowServiceClass.charAt(0).toUpperCase() + v.labelcrowServiceClass.slice(1) : '—'}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.82rem', color: 'var(--navy-600)' }}>{v.labelcrowProviderKey || <span style={{ color: 'var(--navy-300)' }}>—</span>}</td>
                          <td><span style={{ fontWeight: 700, color: 'var(--success-700)' }}>${v.rate.toFixed(2)}</span></td>
                          <td><span className={v.isActive ? 'badge badge-green' : 'badge badge-red'}>{v.isActive ? 'Active' : 'Inactive'}</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: 2 }}>
                              <button className="vnd-btn" title="Edit" onClick={() => openEditApi(v)} style={{ color: '#7C3AED' }}><PencilIcon style={{ width: 14, height: 14 }} /></button>
                              <button className="vnd-btn" title="Delete" onClick={() => handleDeleteApi(v)} style={{ color: 'var(--danger-500)' }}><TrashIcon style={{ width: 14, height: 14 }} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              slVendors.length === 0 ? (
                <div className="empty-state">
                  <CloudArrowDownIcon style={{ width: 40, height: 40, color: '#6EE7B7' }} />
                  <h3>No ShipLabel vendors yet</h3>
                  <p>Click <strong>Sync from ShipLabel</strong> above to import all services from your account.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="sh-table">
                    <thead>
                      <tr>
                        {checkTh}
                        <th>Vendor Name</th><th>Service ID</th><th>Series Options</th><th>Rate</th><th>Status</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {slVendors.map(v => (
                        <tr key={v._id} className={selectedIds.has(v._id) ? 'row-selected' : ''}>
                          {checkTd(v._id)}
                          <td><span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--navy-900)' }}>{v.name}</span></td>
                          <td><code style={{ background: 'rgba(6,95,70,0.16)', color: '#065f46', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem' }}>{v.shiplabelServiceId ?? '—'}</code></td>
                          <td>
                            {v.shiplabelSeries?.length ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {v.shiplabelSeries.map((s, i) => (
                                  <span key={i} style={{ background: 'rgba(6,95,70,0.16)', color: '#065f46', padding: '2px 7px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    {s.name || s.series}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--navy-300)', fontSize: '0.82rem' }}>—</span>
                            )}
                          </td>
                          <td><span style={{ fontWeight: 700, color: 'var(--success-700)' }}>${v.rate.toFixed(2)}</span></td>
                          <td><span className={v.isActive ? 'badge badge-green' : 'badge badge-red'}>{v.isActive ? 'Active' : 'Inactive'}</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: 2 }}>
                              <button className="vnd-btn" title="Edit" onClick={() => openEditApi(v)} style={{ color: '#059669' }}><PencilIcon style={{ width: 14, height: 14 }} /></button>
                              <button className="vnd-btn" title="Delete" onClick={() => handleDeleteApi(v)} style={{ color: 'var(--danger-500)' }}><TrashIcon style={{ width: 14, height: 14 }} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          {/* Single edit modal */}
          {editApi && (
            <Modal title={`Edit — ${editApi.name}`} onClose={() => setEditApi(null)}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ padding: '0.75rem 1rem', background: 'var(--navy-25)', borderRadius: 8, border: '1px solid var(--navy-100)', fontSize: '0.82rem', color: 'var(--navy-600)' }}>
                  <strong>{editApi.carrier}</strong>{editApi.shippingService ? ` · ${editApi.shippingService}` : ''} &mdash;{' '}
                  {editApi.source === 'labelcrow' ? 'Label Crow vendor' : editApi.source === 'shiplabel' ? 'ShipLabel vendor' : 'ShippersHub vendor'}
                </div>
                <div>
                  <label className="form-label">Rate per Label ($)</label>
                  <input className="form-input" type="number" step="0.01" min="0"
                    value={apiRate} onChange={e => setApiRate(e.target.value)} />
                </div>
                {editApi.source === 'shiplabel' && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <label className="form-label" style={{ margin: 0 }}>Series Options</label>
                      <button type="button" className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.72rem', padding: '3px 9px', gap: 4 }}
                        onClick={() => setSlSeriesRows(r => [...r, { series: '', format: '', name: '' }])}>
                        <PlusIcon style={{ width: 11, height: 11 }} /> Add
                      </button>
                    </div>
                    {slSeriesRows.length === 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--navy-400)', padding: '0.5rem 0' }}>
                        No series added yet — click Add to create one.
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {slSeriesRows.map((row, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr 28px', gap: 6, alignItems: 'center' }}>
                          <select className="form-input"
                            style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem' }}
                            value={row.series}
                            onChange={e => setSlSeriesRows(r => r.map((x, j) => j === i ? { ...x, series: e.target.value } : x))}>
                            <option value="">— series —</option>
                            <option value="9501">9501</option>
                            <option value="9505">9505</option>
                            <option value="9559">9559</option>
                            <option value="91210">91210</option>
                            <option value="91558">91558</option>
                            <option value="92019">92019</option>
                            <option value="92020">92020</option>
                            <option value="92022">92022</option>
                            <option value="92612">92612</option>
                            <option value="93001">93001</option>
                            <option value="93020">93020</option>
                            <option value="93055">93055</option>
                            <option value="94001">94001</option>
                            <option value="94019">94019</option>
                            <option value="94888">94888</option>
                            <option value="95346">95346</option>
                            <option value="95701">95701</option>
                            <option value="90940">90940</option>
                            <option value="19033">19033</option>
                            <option value="7999">7999</option>
                            <option value="30210">30210</option>
                            <option value="949">949</option>
                          </select>
                          <select className="form-input"
                            style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem' }}
                            value={row.format}
                            onChange={e => setSlSeriesRows(r => r.map((x, j) => j === i ? { ...x, format: e.target.value } : x))}>
                            <option value="">— format —</option>
                            <option value="usps_priority_pro">Priority Pro</option>
                            <option value="usps_priority_private">Priority Private</option>
                            <option value="usps_priority_mail">Priority Mail</option>
                            <option value="usps_priority_pitneyBow">Priority PitneyBow</option>
                            <option value="usps_priority_mail_commercial_easypost">Priority EasyPost</option>
                            <option value="usps_ground_api">Ground API</option>
                            <option value="click_n_ship">Click-N-Ship</option>
                            <option value="usps_ground_pro">Ground Pro</option>
                            <option value="usps_ground_advantage">Ground Advantage</option>
                          </select>
                          <input className="form-input" placeholder="Display name"
                            style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem' }}
                            value={row.name}
                            onChange={e => setSlSeriesRows(r => r.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                          <button type="button" onClick={() => setSlSeriesRows(r => r.filter((_, j) => j !== i))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-500)', padding: 2, display: 'flex', alignItems: 'center' }}>
                            <XMarkIcon style={{ width: 14, height: 14 }} />
                          </button>
                        </div>
                      ))}
                    </div>
                    {slSeriesRows.length > 0 && (
                      <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', marginTop: 4 }}>
                        Series · Format · Display name shown to users
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="checkbox" id="apiActive" checked={apiActive}
                    onChange={e => setApiActive(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--accent-600)' }} />
                  <label htmlFor="apiActive" style={{ fontSize: '0.875rem', color: 'var(--navy-700)', cursor: 'pointer' }}>
                    Active (users can generate labels with this vendor)
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.5rem' }}>
                <button className="btn btn-ghost" onClick={() => setEditApi(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSaveApi} disabled={apiSaving}>
                  {apiSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </Modal>
          )}

          {/* Bulk edit modal */}
          {bulkModal && (
            <Modal title={`Bulk Edit — ${selectedIds.size} vendor${selectedIds.size !== 1 ? 's' : ''}`} onClose={() => setBulkModal(false)}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ padding: '0.75rem 1rem', background: 'var(--navy-25)', borderRadius: 8, border: '1px solid var(--navy-100)', fontSize: '0.82rem', color: 'var(--navy-600)' }}>
                  Changes apply to <strong>{selectedIds.size}</strong> selected vendor{selectedIds.size !== 1 ? 's' : ''}. Unchecked fields keep their current values.
                </div>

                {/* Rate */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <input type="checkbox" id="bulkRateEnable" checked={bulkRateEnabled}
                      onChange={e => setBulkRateEnabled(e.target.checked)}
                      style={{ width: 15, height: 15, accentColor: 'var(--accent-600)', cursor: 'pointer' }} />
                    <label htmlFor="bulkRateEnable" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
                      Set Rate per Label ($)
                    </label>
                  </div>
                  <input className="form-input" type="number" step="0.01" min="0"
                    disabled={!bulkRateEnabled}
                    value={bulkRate} onChange={e => setBulkRate(e.target.value)}
                    placeholder="e.g. 0.40"
                    style={{ opacity: bulkRateEnabled ? 1 : 0.4, transition: 'opacity 120ms' }} />
                </div>

                {/* Status */}
                <div>
                  <label className="form-label">Status</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {([
                      { val: 'keep'       as const, label: 'Keep current', color: 'var(--accent-600)', bg: 'rgba(37,99,235,0.12)' },
                      { val: 'activate'   as const, label: 'Activate all',  color: '#15803d',           bg: 'rgba(21,128,61,0.12)' },
                      { val: 'deactivate' as const, label: 'Deactivate all', color: '#dc2626',          bg: 'rgba(220,38,38,0.12)' },
                    ]).map(opt => (
                      <button key={opt.val} type="button" onClick={() => setBulkStatus(opt.val)} style={{
                        flex: 1, padding: '7px 0', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                        border: `1.5px solid ${bulkStatus === opt.val ? opt.color : 'var(--navy-200)'}`,
                        background: bulkStatus === opt.val ? opt.bg : 'transparent',
                        color: bulkStatus === opt.val ? opt.color : 'var(--navy-500)',
                        cursor: 'pointer', transition: 'all 120ms',
                      }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.5rem' }}>
                <button className="btn btn-ghost" onClick={() => setBulkModal(false)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={handleBulkSave}
                  disabled={bulkSaving || (!bulkRateEnabled && bulkStatus === 'keep')}
                >
                  {bulkSaving ? 'Saving…' : `Apply to ${selectedIds.size} vendor${selectedIds.size !== 1 ? 's' : ''}`}
                </button>
              </div>
            </Modal>
          )}
        </>
      )}

      {/* ── Manifest Vendors Tab ─────────────────────────────── */}
      {activeTab === 'manifest' && (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
            {[
              { label: 'Total Vendors', value: vendors.length,                                                              color: 'var(--navy-900)' },
              { label: 'Active',        value: vendors.filter(v => v.isActive).length,                                      color: 'var(--success-600)' },
              { label: 'Total Labels',  value: vendors.reduce((s, v) => s + (v.stats?.totalLabels || 0), 0).toLocaleString(), color: 'var(--accent-600)' },
              { label: 'Total Owed',    value: `$${totalOwed.toFixed(2)}`,                                                  color: totalOwed > 0 ? 'var(--warning-600)' : 'var(--navy-400)' },
            ].map(s => (
              <div key={s.label} className="sh-card" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--navy-500)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="sh-card" style={{ padding: '0.75rem 1rem' }}>
            <div style={{ position: 'relative', maxWidth: 360 }}>
              <MagnifyingGlassIcon style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: 'var(--navy-400)', pointerEvents: 'none' }} />
              <input className="form-input" style={{ paddingLeft: '2.1rem', fontSize: '0.82rem' }}
                placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          {/* Table */}
          <div className="sh-card">
            {isLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <UserGroupIcon style={{ width: 40, height: 40 }} />
                <h3>No vendors yet</h3>
                <p>Add your first manifest vendor (Arslan, Mujtaba, etc.) to get started.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="sh-table">
                  <thead>
                    <tr>
                      <th>Vendor</th><th>Carriers</th><th>Score</th><th>KPIs</th>
                      <th>Vendor Rate</th><th>Payable Balance</th><th>Status</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(v => (
                      <tr key={v._id}>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--navy-900)', fontSize: '0.875rem' }}>{v.name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--navy-400)' }}>{v.email}</div>
                          {v.description && <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 2 }}>{v.description}</div>}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {(v.carriers || []).map(c => {
                              const s = CARRIER_STYLES[c] || { bg: 'var(--navy-100)', color: 'var(--navy-600)', border: 'var(--navy-300)' };
                              return <span key={c} style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{c}</span>;
                            })}
                          </div>
                        </td>
                        <td><StarRating score={v.score} /></td>
                        <td>
                          <div style={{ fontSize: '0.72rem', color: 'var(--navy-600)', lineHeight: 1.6 }}>
                            <div>{v.stats?.completedJobs || 0} completed</div>
                            <div style={{ color: 'var(--navy-400)' }}>{v.stats?.totalLabels || 0} labels</div>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--success-700)' }}>
                            ${(v.vendorRate || 0).toFixed(2)}<span style={{ fontWeight: 400, fontSize: '0.68rem', color: 'var(--navy-400)' }}>/label</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: (v.payableBalance || 0) > 0 ? 'var(--warning-700)' : 'var(--navy-400)' }}>
                              ${(v.payableBalance || 0).toFixed(2)}
                            </div>
                            {(v.payableBalance || 0) > 0 && (
                              <button className="btn btn-sm btn-ghost" style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                                onClick={() => { setPayoutVendor(v); setPayoutAmt(v.payableBalance.toFixed(2)); setPayoutNote(''); }}>
                                <BanknotesIcon style={{ width: 11, height: 11 }} /> Pay
                              </button>
                            )}
                          </div>
                          {v.totalPaidOut > 0 && (
                            <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', marginTop: 2 }}>${(v.totalPaidOut).toFixed(2)} paid total</div>
                          )}
                        </td>
                        <td><span className={v.isActive ? 'badge badge-green' : 'badge badge-red'}>{v.isActive ? 'Active' : 'Inactive'}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 2 }}>
                            <button title="Edit" onClick={() => openEdit(v)} className="vnd-btn" style={{ color: 'var(--accent-600)' }}><PencilIcon style={{ width: 15, height: 15 }} /></button>
                            <button title={v.isActive ? 'Deactivate' : 'Activate'} onClick={() => handleToggle(v)} className="vnd-btn" style={{ color: v.isActive ? 'var(--warning-600)' : 'var(--success-600)' }}><ArrowPathIcon style={{ width: 15, height: 15 }} /></button>
                            <button title="Delete" onClick={() => handleDelete(v)} className="vnd-btn" style={{ color: 'var(--danger-500)' }}><TrashIcon style={{ width: 15, height: 15 }} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {showCreate && (
            <Modal title="Add Manifest Vendor" onClose={() => setShowCreate(false)}>
              <form onSubmit={handleCreate}>
                <VendorForm form={form} setForm={setForm} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.5rem' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="btn btn-primary">
                    {isSubmitting ? 'Creating…' : 'Create Vendor'}
                  </button>
                </div>
              </form>
            </Modal>
          )}

          {editVendor && (
            <Modal title={`Edit — ${editVendor.name}`} onClose={() => { setEditVendor(null); setForm(BLANK); }}>
              <form onSubmit={handleEdit}>
                <VendorForm form={form} setForm={setForm} isEdit />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.5rem' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => { setEditVendor(null); setForm(BLANK); }}>Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="btn btn-primary">
                    {isSubmitting ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </Modal>
          )}

          {payoutVendor && (
            <Modal title={`Pay Out — ${payoutVendor.name}`} onClose={() => setPayoutVendor(null)}>
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--navy-25)', borderRadius: 8, border: '1px solid var(--navy-100)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--navy-400)', marginBottom: 4 }}>Payable Balance</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--warning-700)' }}>${(payoutVendor.payableBalance || 0).toFixed(2)}</div>
              </div>
              <form onSubmit={handlePayout}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div>
                    <label className="form-label">Amount ($) *</label>
                    <input className="form-input" type="number" step="0.01" min="0.01"
                      max={payoutVendor.payableBalance} required
                      value={payoutAmt} onChange={e => setPayoutAmt(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Note</label>
                    <input className="form-input" value={payoutNote}
                      onChange={e => setPayoutNote(e.target.value)} placeholder="Bank transfer, etc." />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setPayoutVendor(null)}>Cancel</button>
                  <button type="submit" disabled={payoutBusy} className="btn btn-success">
                    <BanknotesIcon style={{ width: 15, height: 15 }} />
                    {payoutBusy ? 'Processing…' : 'Mark as Paid'}
                  </button>
                </div>
              </form>
            </Modal>
          )}
        </>
      )}
    </div>
  );
};

export default VendorManagement;
