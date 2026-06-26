import React, { useState, useEffect } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  CheckCircleIcon, ExclamationCircleIcon, ChevronDownIcon, ChevronUpIcon,
  PlusIcon, ArrowLeftIcon, XMarkIcon,
} from '@heroicons/react/24/outline';

interface RateTier { minLbs: number; maxLbs: number | null; rate: number; }
interface SlSeriesOption { series: string; format: string; name: string; }
interface VendorAccess {
  vendorId: string; vendorName: string; carrier: string;
  shippingService: string; vendorRate: number; isAllowed: boolean; rateTiers: RateTier[];
  portal?: string;
  shiplabelSeries?: SlSeriesOption[];
  allowedShiplabelSeries?: string[];
}

const CARRIERS_ORDER = ['USPS', 'UPS', 'FedEx', 'DHL'];

const CARRIER_CFG: Record<string, { border: string; headerBg: string; labelBg: string; labelColor: string; accentColor: string }> = {
  USPS:  { border: 'rgba(0,75,135,0.25)',  headerBg: 'rgba(0,75,135,0.07)',  labelBg: '#004B87', labelColor: '#fff',    accentColor: '#DA291C' },
  UPS:   { border: 'rgba(75,20,0,0.25)',   headerBg: 'rgba(75,20,0,0.08)',   labelBg: '#4B1400', labelColor: '#FFB500', accentColor: '#FFB500' },
  FedEx: { border: 'rgba(77,20,140,0.25)', headerBg: 'rgba(77,20,140,0.07)', labelBg: '',        labelColor: '',        accentColor: '#FF6600' },
  DHL:   { border: 'rgba(212,5,17,0.25)',  headerBg: 'rgba(255,204,0,0.18)', labelBg: '#FFCC00', labelColor: '#D40511', accentColor: '#D40511' },
};

const CarrierBadge: React.FC<{ carrier: string; size?: 'sm' | 'md' }> = ({ carrier, size = 'md' }) => {
  const fs  = size === 'md' ? '0.85rem' : '0.75rem';
  const pad = size === 'md' ? '4px 10px' : '3px 8px';
  const cfg = CARRIER_CFG[carrier];
  if (carrier === 'FedEx') {
    return (
      <span style={{ fontWeight: 900, fontSize: fs, letterSpacing: '-0.01em' }}>
        <span style={{ color: '#4D148C' }}>Fed</span><span style={{ color: '#FF6600' }}>Ex</span>
      </span>
    );
  }
  return (
    <span style={{ background: cfg?.labelBg || '#334155', color: cfg?.labelColor || '#fff', fontWeight: 900, fontSize: fs, letterSpacing: '0.07em', padding: pad, borderRadius: 5, display: 'inline-flex', alignItems: 'center' }}>
      {carrier}
    </span>
  );
};

const UserVendorAccess: React.FC = () => {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const { userId } = useParams<{ userId: string }>();

  const [access,      setAccess]      = useState<VendorAccess[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [isSaving,    setIsSaving]    = useState(false);
  const [message,     setMessage]     = useState('');
  const [error,       setError]       = useState('');
  const [expCarriers, setExpCarriers] = useState<Record<string, boolean>>({});
  const [expVendors,  setExpVendors]  = useState<Record<string, boolean>>({});
  const [targetUser,  setTargetUser]  = useState<any>(null);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    Promise.all([
      axios.get(`/users/${userId}`).then(r => setTargetUser(r.data.user)).catch(() => {}),
      axios.get(`/access/${userId}`).then(r => setAccess(r.data.access)).catch((e: any) => setError(e.response?.data?.message || 'Failed to load')),
    ]).finally(() => setIsLoading(false));
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (message || error) {
      const t = setTimeout(() => { setMessage(''); setError(''); }, 4000);
      return () => clearTimeout(t);
    }
  }, [message, error]);

  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />;
  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>;

  const handleSave = async () => {
    setIsSaving(true); setError('');
    try {
      const records = access.map(v => ({ vendorId: v.vendorId, carrier: v.carrier, isAllowed: v.isAllowed, rateTiers: v.rateTiers, allowedShiplabelSeries: v.allowedShiplabelSeries || [] }));
      await axios.put(`/access/${userId}/bulk/save`, { records });
      setMessage('Configuration saved successfully');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save');
    } finally { setIsSaving(false); }
  };

  const updateTier = (vendorId: string, ti: number, field: string, val: any) =>
    setAccess(a => a.map(v => v.vendorId !== vendorId ? v : {
      ...v, rateTiers: v.rateTiers.map((t, i) => i === ti ? { ...t, [field]: val } : t)
    }));

  const fmt = (v: number) => `$${v.toFixed(2)}`;

  // Count total enabled across all carriers
  const totalEnabled = access.filter(v => v.isAllowed).length;

  return (
    <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => navigate('/admin/users')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-500)', padding: '4px', borderRadius: 6, display: 'flex', alignItems: 'center' }}>
          <ArrowLeftIcon style={{ width: 18, height: 18 }} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ margin: 0 }}>
            {targetUser ? `${targetUser.firstName} ${targetUser.lastName}` : 'User'} — Carrier Access
          </h1>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Expand a carrier · enable vendors · set weight-based rate tiers.
          </p>
        </div>
        {totalEnabled > 0 && (
          <div style={{ background: 'var(--success-50)', border: '1px solid var(--success-200)', borderRadius: 8, padding: '4px 10px', fontSize: '0.75rem', color: 'var(--success-700)', fontWeight: 600 }}>
            {totalEnabled} vendor{totalEnabled !== 1 ? 's' : ''} enabled
          </div>
        )}
      </div>

      {/* Notification */}
      {(message || error) && (
        <div className={`alert ${message ? 'alert-success' : 'alert-danger'}`} style={{ padding: '0.5rem 0.875rem' }}>
          {message ? <CheckCircleIcon style={{ width: 15, height: 15, flexShrink: 0 }} /> : <ExclamationCircleIcon style={{ width: 15, height: 15, flexShrink: 0 }} />}
          <span style={{ fontSize: '0.82rem' }}>{message || error}</span>
          <button onClick={() => { setMessage(''); setError(''); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}>
            <XMarkIcon style={{ width: 13, height: 13 }} />
          </button>
        </div>
      )}

      {/* Carrier groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {CARRIERS_ORDER.map(carrier => {
          const vendors     = access.filter(v => v.carrier === carrier);
          const enabled     = vendors.filter(v => v.isAllowed).length;
          const isOpen      = expCarriers[carrier] || false;
          const cfg         = CARRIER_CFG[carrier] || { border: 'var(--navy-200)', headerBg: 'var(--navy-50)', accentColor: '#334155' };
          const hasVendors  = vendors.length > 0;

          return (
            <div key={carrier} style={{ border: `1.5px solid ${isOpen ? cfg.border : 'var(--navy-150)'}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.15s' }}>

              {/* ── Carrier header row ── */}
              <div
                onClick={() => hasVendors && setExpCarriers(e => ({ ...e, [carrier]: !e[carrier] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '0.875rem 1.125rem',
                  background: isOpen ? cfg.headerBg : 'var(--navy-25)',
                  cursor: hasVendors ? 'pointer' : 'default',
                  userSelect: 'none', transition: 'background 0.15s',
                }}
              >
                {/* Logo badge */}
                <div style={{ flexShrink: 0, minWidth: 52, display: 'flex', justifyContent: 'center' }}>
                  <CarrierBadge carrier={carrier} />
                </div>

                {/* Carrier info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy-900)' }}>{carrier}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)', marginTop: 1 }}>
                    {!hasVendors
                      ? <span style={{ fontStyle: 'italic' }}>No vendors configured — add in Vendor Management</span>
                      : `${vendors.length} vendor${vendors.length !== 1 ? 's' : ''}`
                    }
                  </div>
                </div>

                {/* Status indicators */}
                {hasVendors && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {/* Dot indicators */}
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                      {vendors.slice(0, 5).map(v => (
                        <span key={v.vendorId} title={`${v.vendorName}: ${v.isAllowed ? 'enabled' : 'disabled'}`}
                          style={{ width: 8, height: 8, borderRadius: '50%', background: v.isAllowed ? 'var(--success-500)' : 'var(--navy-200)', display: 'inline-block', transition: 'background 0.15s' }}
                        />
                      ))}
                      {vendors.length > 5 && <span style={{ fontSize: '0.62rem', color: 'var(--navy-400)' }}>+{vendors.length - 5}</span>}
                    </div>

                    {/* Enabled count badge */}
                    {enabled > 0 && (
                      <span style={{ background: 'var(--success-100)', color: 'var(--success-700)', fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>
                        {enabled} on
                      </span>
                    )}

                    {/* Chevron */}
                    {isOpen
                      ? <ChevronUpIcon style={{ width: 16, height: 16, color: 'var(--navy-400)' }} />
                      : <ChevronDownIcon style={{ width: 16, height: 16, color: 'var(--navy-400)' }} />
                    }
                  </div>
                )}
              </div>

              {/* ── Vendor list (expanded) ── */}
              {isOpen && hasVendors && (
                <div>
                  {vendors.map((vendor, vi) => (
                    <div key={vendor.vendorId}>

                      {/* Vendor row */}
                      <div
                        onClick={() => vendor.isAllowed && setExpVendors(e => ({ ...e, [vendor.vendorId]: !e[vendor.vendorId] }))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '0.55rem 1.125rem 0.55rem 1.25rem',
                          borderTop: `1px solid ${vi === 0 ? cfg.border : 'var(--navy-100)'}`,
                          background: vendor.isAllowed ? 'var(--success-50)' : '#fff',
                          cursor: vendor.isAllowed ? 'pointer' : 'default',
                          transition: 'background 0.12s',
                        }}
                      >
                        <input
                          type="checkbox" checked={vendor.isAllowed}
                          onClick={e => e.stopPropagation()}
                          onChange={() => {
                            setAccess(a => a.map(v => v.vendorId === vendor.vendorId ? { ...v, isAllowed: !v.isAllowed } : v));
                            // Collapse tier editor when disabling
                            if (vendor.isAllowed) setExpVendors(e => ({ ...e, [vendor.vendorId]: false }));
                          }}
                          style={{ cursor: 'pointer', flexShrink: 0, accentColor: cfg.accentColor }}
                        />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem', color: vendor.isAllowed ? 'var(--navy-900)' : 'var(--navy-400)' }}>
                            {vendor.vendorName}
                          </div>
                          {vendor.shippingService && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)' }}>{vendor.shippingService}</div>
                          )}
                        </div>

                        <span style={{ fontSize: '0.7rem', color: 'var(--navy-500)', flexShrink: 0 }}>
                          base {fmt(vendor.vendorRate)}/lb
                        </span>

                        {vendor.isAllowed && (
                          <>
                            <span style={{
                              fontSize: '0.65rem', padding: '1px 6px', borderRadius: 10, flexShrink: 0,
                              background: vendor.rateTiers.length > 0 ? 'var(--accent-100)' : 'var(--navy-100)',
                              color:      vendor.rateTiers.length > 0 ? 'var(--accent-700)' : 'var(--navy-500)',
                            }}>
                              {vendor.rateTiers.length === 0 ? 'base rate' : `${vendor.rateTiers.length} tier${vendor.rateTiers.length !== 1 ? 's' : ''}`}
                            </span>
                            {expVendors[vendor.vendorId]
                              ? <ChevronUpIcon style={{ width: 14, height: 14, color: 'var(--navy-400)', flexShrink: 0 }} />
                              : <ChevronDownIcon style={{ width: 14, height: 14, color: 'var(--navy-400)', flexShrink: 0 }} />
                            }
                          </>
                        )}
                      </div>

                      {/* ── Tier editor ── */}
                      {expVendors[vendor.vendorId] && vendor.isAllowed && (
                        <div style={{ padding: '0.75rem 1.125rem 0.875rem 2.625rem', borderTop: '1px dashed var(--navy-100)', background: 'var(--navy-25)' }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--navy-600)', marginBottom: '0.5rem' }}>
                            Weight-Based Rate Tiers
                            <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--navy-400)' }}>
                              — leave empty to use base rate {fmt(vendor.vendorRate)}/lb
                            </span>
                          </div>

                          {vendor.rateTiers.length > 0 && (
                            <div style={{ marginBottom: '0.5rem' }}>
                              {/* Column headers */}
                              <div style={{ display: 'grid', gridTemplateColumns: '100px 100px 100px 28px', gap: '0.375rem', marginBottom: '0.375rem', padding: '0 2px' }}>
                                {['Min (lbs)', 'Max (lbs)', 'Rate ($)', ''].map((h, i) => (
                                  <div key={i} style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
                                ))}
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                {vendor.rateTiers.map((tier, ti) => (
                                  <div key={ti} style={{ display: 'grid', gridTemplateColumns: '100px 100px 100px 28px', gap: '0.375rem', alignItems: 'center' }}>
                                    <input type="number" min="0" className="form-input"
                                      style={{ padding: '0.3rem 0.4rem', fontSize: '0.78rem' }}
                                      value={tier.minLbs}
                                      onChange={e => updateTier(vendor.vendorId, ti, 'minLbs', parseFloat(e.target.value) || 0)} />
                                    <input type="number" min="0" className="form-input"
                                      style={{ padding: '0.3rem 0.4rem', fontSize: '0.78rem' }}
                                      value={tier.maxLbs ?? ''} placeholder="∞"
                                      onChange={e => updateTier(vendor.vendorId, ti, 'maxLbs', e.target.value ? parseFloat(e.target.value) : null)} />
                                    <input type="number" step="0.01" min="0" className="form-input"
                                      style={{ padding: '0.3rem 0.4rem', fontSize: '0.78rem' }}
                                      value={tier.rate}
                                      onChange={e => updateTier(vendor.vendorId, ti, 'rate', parseFloat(e.target.value) || 0)} />
                                    <button
                                      onClick={() => setAccess(a => a.map(v => v.vendorId !== vendor.vendorId ? v : { ...v, rateTiers: v.rateTiers.filter((_, i) => i !== ti) }))}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-500)', padding: 2, display: 'flex', alignItems: 'center' }}>
                                      <XMarkIcon style={{ width: 14, height: 14 }} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <button
                            onClick={() => setAccess(a => a.map(v => v.vendorId !== vendor.vendorId ? v : { ...v, rateTiers: [...v.rateTiers, { minLbs: 0, maxLbs: null, rate: v.vendorRate }] }))}
                            className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem', padding: '3px 9px', gap: 4 }}>
                            <PlusIcon style={{ width: 11, height: 11 }} /> Add Tier
                          </button>

                          {/* ShipLabel series permissions */}
                          {vendor.portal === 'shiplabel' && vendor.shiplabelSeries && vendor.shiplabelSeries.length > 0 && (
                            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--navy-100)' }}>
                              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--navy-600)', marginBottom: '0.5rem' }}>
                                Allowed Series
                                <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--navy-400)' }}>— unchecked series are hidden from this user</span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                {vendor.shiplabelSeries.map(opt => {
                                  const allowed = vendor.allowedShiplabelSeries || [];
                                  const checked = allowed.length === 0 || allowed.includes(opt.series);
                                  return (
                                    <label key={opt.series} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.78rem', color: 'var(--navy-700)' }}>
                                      <input type="checkbox" checked={checked}
                                        style={{ accentColor: cfg.accentColor, cursor: 'pointer' }}
                                        onChange={() => {
                                          setAccess(a => a.map(v => {
                                            if (v.vendorId !== vendor.vendorId) return v;
                                            const cur = v.allowedShiplabelSeries?.length
                                              ? v.allowedShiplabelSeries
                                              : (v.shiplabelSeries || []).map(s => s.series);
                                            const next = cur.includes(opt.series)
                                              ? cur.filter(s => s !== opt.series)
                                              : [...cur, opt.series];
                                            return { ...v, allowedShiplabelSeries: next };
                                          }));
                                        }}
                                      />
                                      <span style={{ fontWeight: 600 }}>{opt.series}</span>
                                      {opt.name && <span style={{ color: 'var(--navy-400)' }}>— {opt.name}</span>}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/users')}>
          ← Back to Users
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
};

export default UserVendorAccess;
