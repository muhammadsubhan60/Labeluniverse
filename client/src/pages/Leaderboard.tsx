import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  TrophyIcon, PlusIcon, PencilIcon, TrashIcon,
  XMarkIcon, CheckCircleIcon, ExclamationCircleIcon,
  EyeIcon, EyeSlashIcon,
} from '@heroicons/react/24/outline';

// ── Types ──────────────────────────────────────────────────────
interface Entry {
  _id: string;
  vendorName: string;
  portal: 'shippershub' | 'labelcrow' | 'shiplabel';
  carrier: string;
  shippingService: string;
  successRate: number;
  totalLabels: number;
  isVisible: boolean;
  vendor?: string | null;
}

interface VendorOption {
  _id: string;
  name: string;
  carrier: string;
  shippingService: string;
  source: string;
}

// ── Portal config ──────────────────────────────────────────────
const PORTAL_CFG = {
  shippershub: { label: 'ShippersHub', accent: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  labelcrow:   { label: 'Label Crow',  accent: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  shiplabel:   { label: 'ShipLabel',   accent: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
};

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

const BLANK_FORM = {
  vendorId:       '',
  vendorName:     '',
  portal:         'shippershub' as Entry['portal'],
  carrier:        'USPS',
  shippingService:'',
  successRate:    '',
  totalLabels:    '',
  isVisible:      true,
};

// ── Modal ──────────────────────────────────────────────────────
const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}
    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
    <div className="sh-card" style={{ width: '100%', maxWidth: 460, padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{title}</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 4 }}>
          <XMarkIcon style={{ width: 18, height: 18 }} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

// ── Component ──────────────────────────────────────────────────
const Leaderboard: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [entries,      setEntries]      = useState<Entry[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [filterPortal, setFilterPortal] = useState<Entry['portal'] | 'all'>('all');
  const [showModal,    setShowModal]    = useState(false);
  const [editEntry,    setEditEntry]    = useState<Entry | null>(null);
  const [form,         setForm]         = useState({ ...BLANK_FORM });
  const [vendorOpts,   setVendorOpts]   = useState<VendorOption[]>([]);
  const [saving,       setSaving]       = useState(false);
  const [toast,        setToast]        = useState<{ msg: string; err?: boolean } | null>(null);

  const notify = (msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const url = isAdmin ? '/leaderboard/all' : '/leaderboard';
      const res = await axios.get(url);
      setEntries(res.data.entries || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const fetchVendorOpts = async () => {
    try {
      const res = await axios.get('/leaderboard/vendors');
      setVendorOpts(res.data.vendors || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchEntries();
    if (isAdmin) fetchVendorOpts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When admin picks a vendor from dropdown, auto-fill fields
  const handleVendorPick = (vendorId: string) => {
    const v = vendorOpts.find(x => x._id === vendorId);
    if (!v) { setForm(f => ({ ...f, vendorId: '', vendorName: '', portal: 'shippershub', carrier: 'USPS', shippingService: '' })); return; }
    const portal = (v.source === 'labelcrow' ? 'labelcrow' : v.source === 'shiplabel' ? 'shiplabel' : 'shippershub') as Entry['portal'];
    setForm(f => ({ ...f, vendorId, vendorName: v.name, portal, carrier: v.carrier, shippingService: v.shippingService || '' }));
  };

  const openAdd = () => {
    setEditEntry(null);
    setForm({ ...BLANK_FORM });
    setShowModal(true);
  };

  const openEdit = (e: Entry) => {
    setEditEntry(e);
    setForm({
      vendorId:       e.vendor || '',
      vendorName:     e.vendorName,
      portal:         e.portal,
      carrier:        e.carrier,
      shippingService:e.shippingService,
      successRate:    String(e.successRate),
      totalLabels:    String(e.totalLabels),
      isVisible:      e.isVisible,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.vendorName.trim() || !form.successRate) { notify('Vendor name and success rate are required', true); return; }
    const rate = parseFloat(form.successRate);
    if (isNaN(rate) || rate < 0 || rate > 100) { notify('Success rate must be 0–100', true); return; }
    setSaving(true);
    try {
      const payload = {
        vendorName:     form.vendorName.trim(),
        portal:         form.portal,
        carrier:        form.carrier || 'USPS',
        shippingService:form.shippingService,
        successRate:    rate,
        totalLabels:    parseInt(form.totalLabels) || 0,
        isVisible:      form.isVisible,
        vendorId:       form.vendorId || null,
      };
      if (editEntry) {
        await axios.put(`/leaderboard/${editEntry._id}`, payload);
        notify('Entry updated');
      } else {
        await axios.post('/leaderboard', payload);
        notify('Entry added');
      }
      setShowModal(false);
      fetchEntries();
    } catch (err: any) {
      notify(err.response?.data?.message || 'Save failed', true);
    } finally { setSaving(false); }
  };

  const handleDelete = async (e: Entry) => {
    if (!window.confirm(`Remove "${e.vendorName}" from the leaderboard?`)) return;
    try {
      await axios.delete(`/leaderboard/${e._id}`);
      notify('Entry removed');
      fetchEntries();
    } catch (err: any) { notify(err.response?.data?.message || 'Delete failed', true); }
  };

  const handleToggleVisibility = async (e: Entry) => {
    try {
      await axios.put(`/leaderboard/${e._id}`, { isVisible: !e.isVisible });
      fetchEntries();
    } catch { notify('Update failed', true); }
  };

  // Visible entries for display (admin sees all; users only see visible ones)
  const displayed = entries
    .filter(e => filterPortal === 'all' || e.portal === filterPortal)
    .sort((a, b) => b.successRate - a.successRate || b.totalLabels - a.totalLabels);

  // Portal summary stats
  const portalStats = (['shippershub', 'labelcrow', 'shiplabel'] as const).map(p => {
    const list = entries.filter(e => e.portal === p && e.isVisible);
    const best = list.reduce((top, x) => (!top || x.successRate > top.successRate) ? x : top, null as Entry | null);
    return { portal: p, count: list.length, best };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="animate-fadeIn">

      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrophyIcon style={{ width: 24, height: 24, color: '#F59E0B' }} />
            Vendor Leaderboard
          </h1>
          <p className="page-subtitle">Best-performing portals and vendors — updated by admin</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openAdd}>
            <PlusIcon style={{ width: 15, height: 15 }} /> Add Entry
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`alert ${toast.err ? 'alert-danger' : 'alert-success'}`} style={{ padding: '0.5rem 0.875rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          {toast.err ? <ExclamationCircleIcon style={{ width: 15, height: 15 }} /> : <CheckCircleIcon style={{ width: 15, height: 15 }} />}
          <span style={{ fontSize: '0.82rem' }}>{toast.msg}</span>
        </div>
      )}

      {/* Portal summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.875rem' }}>
        {portalStats.map(({ portal, count, best }) => {
          const cfg = PORTAL_CFG[portal];
          return (
            <div key={portal} className="sh-card" style={{ padding: '1.1rem 1.25rem', borderTop: `3px solid ${cfg.accent}`, cursor: 'pointer', transition: 'box-shadow 0.15s', boxShadow: filterPortal === portal ? `0 0 0 2px ${cfg.accent}40` : undefined }}
              onClick={() => setFilterPortal(f => f === portal ? 'all' : portal)}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: cfg.accent, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{cfg.label}</span>
                <span style={{ fontSize: '0.7rem', background: cfg.bg, color: cfg.accent, border: `1px solid ${cfg.border}`, padding: '1px 8px', borderRadius: 99, fontWeight: 700 }}>{count} vendor{count !== 1 ? 's' : ''}</span>
              </div>
              {best ? (
                <>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    🥇 {best.vendorName}
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 900, color: cfg.accent, lineHeight: 1 }}>
                    {best.successRate}%
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 2 }}>
                    {best.totalLabels > 0 ? `${best.totalLabels.toLocaleString()} labels` : 'success rate'}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '0.78rem', color: 'var(--navy-400)', marginTop: 4 }}>No entries yet</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filter</span>
        {(['all', 'shippershub', 'labelcrow', 'shiplabel'] as const).map(p => {
          const cfg = p === 'all' ? { label: 'All Portals', accent: 'var(--navy-700)', bg: 'var(--navy-50)', border: 'var(--navy-200)' } : PORTAL_CFG[p];
          const active = filterPortal === p;
          return (
            <button key={p} onClick={() => setFilterPortal(p)}
              style={{ padding: '4px 12px', borderRadius: 99, border: `1.5px solid ${active ? cfg.accent : 'var(--navy-200)'}`, background: active ? cfg.bg : '#fff', color: active ? cfg.accent : 'var(--navy-500)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.12s' }}>
              {p === 'all' ? 'All Portals' : PORTAL_CFG[p].label}
            </button>
          );
        })}
      </div>

      {/* Ranked table */}
      <div className="sh-card">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>
        ) : displayed.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem 1rem' }}>
            <TrophyIcon style={{ width: 40, height: 40, color: '#FCD34D' }} />
            <h3>No leaderboard entries yet</h3>
            {isAdmin ? <p>Click <strong>Add Entry</strong> to set up the first vendor ranking.</p> : <p>Check back soon — the admin is setting up vendor rankings.</p>}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sh-table">
              <thead>
                <tr>
                  <th style={{ width: 48 }}>Rank</th>
                  <th>Vendor</th>
                  <th>Portal</th>
                  <th>Success Rate</th>
                  <th>Labels</th>
                  {isAdmin && <th>Visible</th>}
                  {isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {displayed.map((e, idx) => {
                  const rank = idx + 1;
                  const cfg  = PORTAL_CFG[e.portal];
                  const isHidden = !e.isVisible;
                  return (
                    <tr key={e._id} style={{ opacity: isHidden ? 0.45 : 1 }}>
                      {/* Rank */}
                      <td style={{ textAlign: 'center' }}>
                        {MEDAL[rank]
                          ? <span style={{ fontSize: '1.25rem' }}>{MEDAL[rank]}</span>
                          : <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--navy-400)' }}>#{rank}</span>}
                      </td>

                      {/* Vendor name */}
                      <td>
                        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--navy-900)' }}>{e.vendorName}</div>
                        {e.shippingService && <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', marginTop: 1 }}>{e.carrier} · {e.shippingService}</div>}
                      </td>

                      {/* Portal badge */}
                      <td>
                        <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 800, background: cfg.bg, color: cfg.accent, border: `1.5px solid ${cfg.border}`, whiteSpace: 'nowrap' }}>
                          {cfg.label}
                        </span>
                      </td>

                      {/* Success rate + bar */}
                      <td style={{ minWidth: 160 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 7, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden', maxWidth: 100 }}>
                            <div style={{
                              height: '100%', borderRadius: 99,
                              width: `${e.successRate}%`,
                              background: e.successRate >= 90 ? '#10B981' : e.successRate >= 70 ? '#F59E0B' : '#EF4444',
                              transition: 'width 0.4s ease',
                            }} />
                          </div>
                          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: e.successRate >= 90 ? '#059669' : e.successRate >= 70 ? '#D97706' : '#DC2626', flexShrink: 0 }}>
                            {e.successRate}%
                          </span>
                        </div>
                      </td>

                      {/* Total labels */}
                      <td>
                        {e.totalLabels > 0
                          ? <span style={{ fontWeight: 600, color: 'var(--navy-700)', fontSize: '0.85rem' }}>{e.totalLabels.toLocaleString()}</span>
                          : <span style={{ color: 'var(--navy-300)', fontSize: '0.8rem' }}>—</span>}
                      </td>

                      {/* Admin: visibility toggle */}
                      {isAdmin && (
                        <td>
                          <button onClick={() => handleToggleVisibility(e)}
                            title={e.isVisible ? 'Visible to users — click to hide' : 'Hidden — click to show'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: e.isVisible ? '#059669' : 'var(--navy-300)', borderRadius: 4 }}>
                            {e.isVisible ? <EyeIcon style={{ width: 15, height: 15 }} /> : <EyeSlashIcon style={{ width: 15, height: 15 }} />}
                          </button>
                        </td>
                      )}

                      {/* Admin: edit / delete */}
                      {isAdmin && (
                        <td>
                          <div style={{ display: 'flex', gap: 2 }}>
                            <button onClick={() => openEdit(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-600)', padding: 5, borderRadius: 4 }}>
                              <PencilIcon style={{ width: 14, height: 14 }} />
                            </button>
                            <button onClick={() => handleDelete(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-500)', padding: 5, borderRadius: 4 }}>
                              <TrashIcon style={{ width: 14, height: 14 }} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Admin note */}
      {!isAdmin && entries.length > 0 && (
        <p style={{ fontSize: '0.75rem', color: 'var(--navy-400)', textAlign: 'center', margin: 0 }}>
          Rankings are curated by the LabelFlow team based on real-world performance data.
        </p>
      )}

      {/* Add / Edit modal */}
      {showModal && (
        <Modal title={editEntry ? 'Edit Leaderboard Entry' : 'Add Leaderboard Entry'} onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

            {/* Pick existing vendor (auto-fills fields) */}
            {vendorOpts.length > 0 && (
              <div>
                <label className="form-label">Pick from existing vendors <span style={{ color: 'var(--navy-400)', fontWeight: 400 }}>(optional — auto-fills below)</span></label>
                <select className="form-input form-select" value={form.vendorId}
                  onChange={e => handleVendorPick(e.target.value)}>
                  <option value="">— select a vendor —</option>
                  {(['shippershub', 'labelcrow', 'shiplabel'] as const).map(p => {
                    const group = vendorOpts.filter(v => (v.source === 'shippershub' && p === 'shippershub') || (v.source === p));
                    if (!group.length) return null;
                    return (
                      <optgroup key={p} label={PORTAL_CFG[p].label}>
                        {group.map(v => <option key={v._id} value={v._id}>{v.name}{v.shippingService ? ` · ${v.shippingService}` : ''}</option>)}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
            )}

            <div style={{ borderTop: '1px dashed var(--navy-100)', paddingTop: '0.875rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Display Name *</label>
                  <input className="form-input" value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} placeholder="e.g. USPS Ground Advantage (9201)" />
                </div>

                <div>
                  <label className="form-label">Portal *</label>
                  <select className="form-input form-select" value={form.portal} onChange={e => setForm(f => ({ ...f, portal: e.target.value as Entry['portal'] }))}>
                    <option value="shippershub">ShippersHub</option>
                    <option value="labelcrow">Label Crow</option>
                    <option value="shiplabel">ShipLabel</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Carrier</label>
                  <input className="form-input" value={form.carrier} onChange={e => setForm(f => ({ ...f, carrier: e.target.value }))} placeholder="USPS" />
                </div>

                <div>
                  <label className="form-label">Success Rate (%) *</label>
                  <input className="form-input" type="number" min="0" max="100" step="0.1"
                    value={form.successRate} onChange={e => setForm(f => ({ ...f, successRate: e.target.value }))}
                    placeholder="e.g. 94.5" />
                </div>

                <div>
                  <label className="form-label">Total Labels</label>
                  <input className="form-input" type="number" min="0"
                    value={form.totalLabels} onChange={e => setForm(f => ({ ...f, totalLabels: e.target.value }))}
                    placeholder="e.g. 12000" />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Shipping Service</label>
                  <input className="form-input" value={form.shippingService} onChange={e => setForm(f => ({ ...f, shippingService: e.target.value }))} placeholder="e.g. Ground Advantage" />
                </div>
              </div>

              {/* Preview bar */}
              {form.successRate && !isNaN(parseFloat(form.successRate)) && (
                <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: 'var(--navy-25)', borderRadius: 8, border: '1px solid var(--navy-100)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)', marginBottom: 6, fontWeight: 600 }}>PREVIEW</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 8, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(parseFloat(form.successRate), 100)}%`, background: parseFloat(form.successRate) >= 90 ? '#10B981' : parseFloat(form.successRate) >= 70 ? '#F59E0B' : '#EF4444' }} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: parseFloat(form.successRate) >= 90 ? '#059669' : parseFloat(form.successRate) >= 70 ? '#D97706' : '#DC2626' }}>
                      {form.successRate}%
                    </span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: '0.75rem' }}>
                <input type="checkbox" id="isVisible" checked={form.isVisible}
                  onChange={e => setForm(f => ({ ...f, isVisible: e.target.checked }))}
                  style={{ width: 15, height: 15, accentColor: 'var(--accent-600)' }} />
                <label htmlFor="isVisible" style={{ fontSize: '0.82rem', color: 'var(--navy-700)', cursor: 'pointer' }}>
                  Visible to users
                </label>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.25rem' }}>
            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editEntry ? 'Save Changes' : 'Add Entry'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Leaderboard;
