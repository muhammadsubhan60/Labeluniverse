import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import {
  TruckIcon, CheckCircleIcon, ExclamationCircleIcon,
  ArrowDownTrayIcon, XMarkIcon, ArrowsRightLeftIcon,
  BuildingOfficeIcon, PlusIcon, TrashIcon, ChevronDownIcon,
  SparklesIcon, TagIcon,
} from '@heroicons/react/24/outline';
import { getUspsZone1Rate } from '../utils/uspsRates';
import uspsLogo  from '../Logos/United_States_Postal_Service-Logo.wine.png';
import upsLogo   from '../Logos/United_Parcel_Service-Logo.wine.png';
import fedexLogo from '../Logos/FedEx_Express-Logo.wine.png';
import dhlLogo   from '../Logos/DHL-Logo.wine.png';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AccessItem {
  vendorId: string; vendorName: string; carrier: string;
  vendorType: 'api' | 'manifest'; shippingService: string;
  baseRate: number; isAllowed: boolean;
  portal?: 'shippershub' | 'labelcrow' | 'shiplabel';
  rateTiers: Array<{ minLbs: number; maxLbs: number | null; rate: number }>;
}
interface Warehouse {
  id: string; label: string;
  name: string; company: string; phone: string;
  address1: string; address2: string;
  city: string; state: string; zip: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const CARRIERS  = ['USPS', 'UPS', 'FedEx', 'DHL'] as const;

const PORTALS = [
  { id: 'shippershub' as const, label: 'ShippersHub', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  { id: 'labelcrow'   as const, label: 'Label Crow',  color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  { id: 'shiplabel'   as const, label: 'ShipLabel',   color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
];

const CARRIER_CFG: Record<string, { solid: string; light: string; border: string; logo: string }> = {
  USPS:  { solid: '#1D4ED8', light: '#EFF6FF', border: '#BFDBFE', logo: uspsLogo  },
  UPS:   { solid: '#92400E', light: '#FFFBEB', border: '#FDE68A', logo: upsLogo   },
  FedEx: { solid: '#6D28D9', light: '#F5F3FF', border: '#DDD6FE', logo: fedexLogo },
  DHL:   { solid: '#B45309', light: '#FEF3C7', border: '#FDE68A', logo: dhlLogo   },
};

const BLANK_FORM = {
  from_name: '', from_company: '', from_phone: '',
  from_address1: '', from_address2: '', from_city: '', from_state: 'NY', from_zip: '', from_country: 'USA',
  to_name: '', to_company: '', to_phone: '',
  to_address1: '', to_address2: '', to_city: '', to_state: 'NJ', to_zip: '', to_country: 'USA',
  weight: '', length: '', width: '', height: '', note: '',
};

const WH_KEY        = 'shipme_warehouses';
const loadWarehouses  = (): Warehouse[]   => { try { return JSON.parse(localStorage.getItem(WH_KEY) || '[]'); } catch { return []; } };
const saveWarehouses  = (wh: Warehouse[]) => localStorage.setItem(WH_KEY, JSON.stringify(wh));

// ── Field components ───────────────────────────────────────────────────────────
const fieldLabel: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700,
  color: 'var(--navy-600)', letterSpacing: '0.03em',
  marginBottom: 5, fontFamily: FONT,
};

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '0.6rem 0.75rem', fontSize: '0.84rem',
  border: '1.5px solid var(--navy-200)', borderRadius: 8,
  background: 'var(--bg-card)', color: 'var(--navy-900)',
  outline: 'none', transition: 'border-color 0.15s',
  fontFamily: FONT, lineHeight: 1.4, fontWeight: 400,
};

const F: React.FC<{
  label: string; name: string; value: string; required?: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  type?: string; step?: string; min?: string; placeholder?: string;
  style?: React.CSSProperties;
}> = ({ label, name, value, required, onChange, type = 'text', step, min, placeholder, style }) => (
  <div style={style}>
    <div style={fieldLabel}>
      {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </div>
    <input
      name={name} type={type} step={step} min={min}
      required={required} value={value} onChange={onChange} placeholder={placeholder}
      style={inputStyle}
      onFocus={e => (e.target.style.borderColor = '#6366f1')}
      onBlur={e  => (e.target.style.borderColor = 'var(--navy-200)')}
    />
  </div>
);

const StateSelect: React.FC<{
  name: string; value: string;
  onChange: React.ChangeEventHandler<HTMLSelectElement>;
  style?: React.CSSProperties;
}> = ({ name, value, onChange, style }) => (
  <div style={style}>
    <div style={fieldLabel}>State<span style={{ color: '#ef4444', marginLeft: 2 }}>*</span></div>
    <select name={name} value={value} onChange={onChange} required
      style={{ ...inputStyle, cursor: 'pointer' }}>
      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  </div>
);


// ── Main Component ─────────────────────────────────────────────────────────────
const LabelGenerator: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill  = (location.state as any)?.prefill;

  const [accessList,        setAccessList]        = useState<AccessItem[]>([]);
  const [selectedPortal,    setSelectedPortal]    = useState<'shippershub' | 'labelcrow' | 'shiplabel'>('shippershub');
  const [selectedCarrier,   setSelectedCarrier]   = useState<string>(prefill?.carrier ?? '');
  const [selectedVendorId,  setSelectedVendorId]  = useState('');
  const [showManifestModal, setShowManifestModal] = useState(false);
  const [isLoading,         setIsLoading]         = useState(false);
  const [successData,       setSuccessData]       = useState<{ tracking: string; charged: string; balance: string } | null>(null);
  const [error,             setError]             = useState('');
  const [isReturn,          setIsReturn]          = useState(!!prefill);
  const [form,              setForm]              = useState(prefill ? { ...BLANK_FORM, ...prefill } : BLANK_FORM);

  const [warehouses,   setWarehouses]   = useState<Warehouse[]>(loadWarehouses);
  const [showWhPanel,  setShowWhPanel]  = useState(false);
  const [newWhLabel,   setNewWhLabel]   = useState('');
  const whPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    axios.get('/access/me').then(res => {
      const list = res.data.access || [];
      setAccessList(list);
      if (prefill?.vendorId) {
        const match = list.find((a: AccessItem) => a.vendorId === prefill.vendorId && a.isAllowed);
        if (match) setSelectedVendorId(match.vendorId);
      }
    }).catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showWhPanel) return;
    const handler = (e: MouseEvent) => {
      if (whPanelRef.current && !whPanelRef.current.contains(e.target as Node)) setShowWhPanel(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showWhPanel]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((f: typeof BLANK_FORM) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handlePortalSelect = (portal: typeof selectedPortal) => {
    setSelectedPortal(portal);
    setSelectedCarrier('');
    setSelectedVendorId('');
    setError(''); setSuccessData(null);
  };

  const handleCarrierSelect = (carrier: string) => {
    setSelectedCarrier(carrier);
    setSelectedVendorId('');
    setError(''); setSuccessData(null);
  };

  const carrierVendors = accessList.filter(a =>
    a.carrier === selectedCarrier &&
    a.isAllowed &&
    (a.portal || 'shippershub') === selectedPortal
  );

  const handleVendorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vid = e.target.value;
    if (!vid) { setSelectedVendorId(''); return; }
    const item = accessList.find(a => a.vendorId === vid);
    if (item?.vendorType === 'manifest') { setShowManifestModal(true); return; }
    setSelectedVendorId(vid);
    setError('');
  };

  const selectedAccess = accessList.find(a => a.vendorId === selectedVendorId);
  const weight         = parseFloat(form.weight) || 0;

  const getEffectiveRate = (w: number): number => {
    if (!selectedAccess) return 0;
    if (!selectedAccess.rateTiers?.length) return selectedAccess.baseRate;
    const tier = selectedAccess.rateTiers.find(t => w >= t.minLbs && (t.maxLbs === null || w <= t.maxLbs));
    return tier?.rate ?? selectedAccess.baseRate;
  };

  const effectiveRate = getEffectiveRate(weight);
  const canSubmit     = !!selectedVendorId && !isLoading && selectedPortal !== 'labelcrow';

  const uspsSaving = useMemo(() => {
    if (selectedCarrier !== 'USPS' || weight <= 0) return null;
    const retail = getUspsZone1Rate(weight);
    if (retail === null) return null;
    const saving = retail - effectiveRate;
    return saving > 0 ? { retail, saving } : null;
  }, [selectedCarrier, weight, effectiveRate]);

  const activeCfg  = selectedCarrier ? CARRIER_CFG[selectedCarrier] : null;
  const fromFilled = !!(form.from_name.trim() && form.from_address1.trim() && form.from_city.trim());
  const toFilled   = !!(form.to_name.trim()   && form.to_address1.trim()   && form.to_city.trim());
  const canSwap    = fromFilled && toFilled;

  const handleSwap = () => {
    if (!canSwap) return;
    setForm((f: typeof BLANK_FORM) => ({
      ...f,
      from_name: f.to_name, from_company: f.to_company, from_phone: f.to_phone,
      from_address1: f.to_address1, from_address2: f.to_address2,
      from_city: f.to_city, from_state: f.to_state, from_zip: f.to_zip, from_country: f.to_country,
      to_name: f.from_name, to_company: f.from_company, to_phone: f.from_phone,
      to_address1: f.from_address1, to_address2: f.from_address2,
      to_city: f.from_city, to_state: f.from_state, to_zip: f.from_zip, to_country: f.from_country,
    }));
  };

  const loadWarehouse = (wh: Warehouse) => {
    setForm((f: typeof BLANK_FORM) => ({
      ...f,
      from_name: wh.name, from_company: wh.company, from_phone: wh.phone,
      from_address1: wh.address1, from_address2: wh.address2,
      from_city: wh.city, from_state: wh.state, from_zip: wh.zip,
    }));
    setShowWhPanel(false);
  };

  const saveWarehouse = () => {
    const label = newWhLabel.trim() || `Warehouse ${warehouses.length + 1}`;
    const wh: Warehouse = {
      id: Date.now().toString(), label,
      name: form.from_name, company: form.from_company, phone: form.from_phone,
      address1: form.from_address1, address2: form.from_address2,
      city: form.from_city, state: form.from_state, zip: form.from_zip,
    };
    const updated = [...warehouses, wh];
    setWarehouses(updated); saveWarehouses(updated); setNewWhLabel('');
  };

  const deleteWarehouse = (id: string) => {
    const updated = warehouses.filter(w => w.id !== id);
    setWarehouses(updated); saveWarehouses(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendorId) { setError('Select a carrier and vendor first.'); return; }
    setIsLoading(true); setError(''); setSuccessData(null);
    try {
      const res = await axios.post('/labels/single', { vendorId: selectedVendorId, ...form });
      const pdfUrl = res.data.label?.pdfUrl;
      if (pdfUrl) {
        const link = document.createElement('a');
        link.href = pdfUrl;
        link.download = `label-${res.data.label?.trackingId || Date.now()}.pdf`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
      }
      setSuccessData({
        tracking: res.data.label?.trackingId || 'N/A',
        charged:  (res.data.label?.price ?? 0).toFixed(2),
        balance:  (res.data.newBalance ?? 0).toFixed(2),
      });
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.errors?.length) {
        setError(data.errors.map((e: any) => e.msg).join(' · '));
      } else {
        setError(data?.message || 'Failed to generate label');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* ── Manifest vendor modal ──────────────────────────────────────────── */}
      {showManifestModal && (
        <div className="modal-overlay" onClick={() => setShowManifestModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.875rem' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--warning-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <TruckIcon style={{ width: 18, height: 18, color: 'var(--warning-600)' }} />
              </div>
              <h3 className="modal-title" style={{ margin: 0, fontFamily: FONT }}>Manifested Vendor</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--navy-600)', marginBottom: '1.25rem', lineHeight: 1.6, fontFamily: FONT }}>
              Single label generation is not available for manifested services. Use <strong>Bulk Labels</strong> to submit a manifest job.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowManifestModal(false)}>Dismiss</button>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/labels/bulk')}>Go to Bulk Labels</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', fontFamily: FONT, paddingBottom: 96 }}>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 58%, #1e3a8a 100%)',
          borderRadius: 18, padding: '1.25rem 1.8rem',
          position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
        }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '22px 22px', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '-40%', right: '6%', width: 200, height: 200, background: 'radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 1 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <TagIcon style={{ width: 22, height: 22, color: '#818CF8' }} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.1, fontFamily: FONT }}>
                Label Generator
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'rgba(148,163,184,0.65)', fontFamily: FONT }}>
                Single-label shipment · fill below and generate
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1, flexWrap: 'wrap' }}>
            {isReturn && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '0.45rem 0.875rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#FCD34D', fontFamily: FONT }}>↩ Return Label</span>
                <button
                  type="button"
                  onClick={() => { setIsReturn(false); setForm(BLANK_FORM); setSelectedCarrier(''); setSelectedVendorId(''); }}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', borderRadius: 4, display: 'flex', padding: '2px 3px' }}>
                  <XMarkIcon style={{ width: 12, height: 12 }} />
                </button>
              </div>
            )}
            {[
              { label: 'Carrier',  value: selectedCarrier  || '—', accent: activeCfg ? activeCfg.solid : 'rgba(255,255,255,0.35)' },
              { label: 'Vendor',   value: selectedAccess?.vendorName || '—', accent: 'rgba(255,255,255,0.45)' },
            ].map(({ label, value, accent }) => (
              <div key={label} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '0.42rem 0.8rem', minWidth: 80 }}>
                <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, fontFamily: FONT }}>{label}</div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: accent, fontFamily: FONT, marginTop: 2, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <form id="label-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

          {/* ── Service selection: 3 compact labeled rows ───────────────────── */}
          <div className="db-card" style={{ overflow: 'hidden' }}>

            {/* Portal row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.6rem 1rem', borderBottom: '1px solid var(--navy-100)' }}>
              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.1em', minWidth: 52, fontFamily: FONT }}>Portal</span>
              <div style={{ display: 'flex', gap: 5 }}>
                {PORTALS.map(p => {
                  const sel = selectedPortal === p.id;
                  return (
                    <button key={p.id} type="button" onClick={() => handlePortalSelect(p.id)}
                      style={{
                        padding: '4px 11px', borderRadius: 6, fontSize: '0.74rem', fontWeight: sel ? 700 : 500,
                        border: `1.5px solid ${sel ? p.color : 'var(--navy-200)'}`,
                        background: sel ? p.bg : 'transparent',
                        color: sel ? p.color : 'var(--navy-500)',
                        cursor: 'pointer', transition: 'all 0.15s', fontFamily: FONT,
                        outline: 'none',
                      }}>
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Carrier row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.6rem 1rem', borderBottom: '1px solid var(--navy-100)' }}>
              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.1em', minWidth: 52, fontFamily: FONT }}>Carrier</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {CARRIERS.map(c => {
                  const cfg = CARRIER_CFG[c];
                  const sel = selectedCarrier === c;
                  return (
                    <button key={c} type="button" onClick={() => handleCarrierSelect(c)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        height: 34, padding: '4px 12px', borderRadius: 7,
                        border: `1.5px solid ${sel ? cfg.solid : 'var(--navy-200)'}`,
                        background: sel ? cfg.light : 'var(--bg-card)',
                        cursor: 'pointer', transition: 'all 0.15s', outline: 'none',
                        boxShadow: sel ? `0 0 0 2.5px ${cfg.solid}22` : 'none',
                      }}>
                      <img src={cfg.logo} alt={c} style={{ height: 22, width: 'auto', maxWidth: 72, objectFit: 'contain' }} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Vendor row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.6rem 1rem' }}>
              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.1em', minWidth: 52, fontFamily: FONT }}>Vendor</span>

              {selectedPortal === 'labelcrow' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <ExclamationCircleIcon style={{ width: 14, height: 14, color: '#7C3AED', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.78rem', color: '#5B21B6', fontFamily: FONT }}>
                    Label Crow is bulk-only —{' '}
                    <button type="button" onClick={() => navigate('/labels/bulk')}
                      style={{ background: 'none', border: 'none', color: '#7C3AED', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 'inherit', fontFamily: FONT }}>
                      use Bulk Labels
                    </button>
                  </span>
                </div>
              ) : (
                <>
                  <select
                    value={selectedVendorId}
                    onChange={handleVendorChange}
                    disabled={!selectedCarrier}
                    style={{
                      flex: 1, height: 34, padding: '0 0.75rem',
                      border: `1.5px solid ${selectedVendorId ? (activeCfg?.solid ?? '#6366f1') : 'var(--navy-200)'}`,
                      borderRadius: 7, fontSize: '0.82rem', fontWeight: selectedVendorId ? 600 : 400,
                      color: selectedVendorId ? 'var(--navy-900)' : 'var(--navy-400)',
                      background: 'var(--bg-card)', cursor: selectedCarrier ? 'pointer' : 'not-allowed',
                      outline: 'none', fontFamily: FONT,
                      opacity: selectedCarrier ? 1 : 0.5, transition: 'border-color 0.15s',
                    }}>
                    <option value="">{selectedCarrier ? `— ${selectedCarrier} service —` : '— select a carrier first —'}</option>
                    {carrierVendors.map(v => (
                      <option key={v.vendorId} value={v.vendorId}>
                        {v.vendorName}{v.shippingService ? ` · ${v.shippingService}` : ''}{v.vendorType === 'manifest' ? ' (Manifest)' : ''}
                      </option>
                    ))}
                  </select>

                  {selectedAccess && weight > 0 && (
                    <span style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', borderRadius: 7, padding: '4px 11px', fontSize: '0.85rem', fontWeight: 800, fontFamily: FONT, whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                      ${effectiveRate.toFixed(2)}
                    </span>
                  )}

                  {uspsSaving && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#ECFDF5', color: '#065F46', border: '1px solid #6EE7B7', borderRadius: 20, padding: '3px 10px', fontSize: '0.7rem', fontWeight: 700, fontFamily: FONT, whiteSpace: 'nowrap' }}>
                      <SparklesIcon style={{ width: 10, height: 10 }} />
                      Save ${uspsSaving.saving.toFixed(2)} vs retail
                    </span>
                  )}
                </>
              )}
            </div>

          </div>

          {/* ── Address card ─────────────────────────────────────────────────── */}
          <div className="db-card" style={{ overflow: 'hidden' }}>

            {/* Card header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--navy-100)', background: 'var(--navy-50)' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: FONT }}>Shipment Route</span>
              <button
                type="button"
                onClick={handleSwap}
                disabled={!canSwap}
                title={canSwap ? 'Swap FROM ↔ TO addresses' : 'Fill both addresses to swap'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  height: 30, padding: '0 10px', borderRadius: 7,
                  border: `1.5px solid ${canSwap ? '#6366F1' : 'var(--navy-200)'}`,
                  background: canSwap ? '#EEF2FF' : 'var(--navy-50)',
                  color: canSwap ? '#4F46E5' : 'var(--navy-400)',
                  cursor: canSwap ? 'pointer' : 'not-allowed',
                  fontSize: '0.73rem', fontWeight: 600, fontFamily: FONT,
                  transition: 'all 0.15s',
                }}>
                <ArrowsRightLeftIcon style={{ width: 13, height: 13 }} />
                Swap
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>

              {/* FROM column */}
              <div style={{ padding: '1.1rem 1.25rem', borderRight: '1px solid var(--navy-100)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }} ref={whPanelRef}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366F1' }} />
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--navy-700)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT }}>From</span>
                  </div>

                  {/* Warehouse button + panel */}
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => setShowWhPanel(v => !v)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4, height: 28, padding: '0 9px',
                        background: showWhPanel ? '#EEF2FF' : 'var(--bg-card)',
                        border: `1.5px solid ${showWhPanel ? '#6366F1' : 'var(--navy-200)'}`,
                        borderRadius: 7, cursor: 'pointer', color: showWhPanel ? '#4F46E5' : 'var(--navy-500)',
                        fontSize: '0.72rem', fontWeight: 600, fontFamily: FONT, transition: 'all 0.12s',
                      }}>
                      <BuildingOfficeIcon style={{ width: 12, height: 12 }} />
                      Warehouses
                      <ChevronDownIcon style={{ width: 10, height: 10, transform: showWhPanel ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                    </button>

                    {showWhPanel && (
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
                        background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)',
                        borderRadius: 10, boxShadow: 'var(--shadow-lg)', width: 290, padding: '0.75rem',
                      }}>
                        <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontFamily: FONT }}>
                          Saved Warehouses
                        </div>
                        {warehouses.length === 0 ? (
                          <div style={{ fontSize: '0.78rem', color: 'var(--navy-400)', padding: '0.25rem 0', marginBottom: 8, fontFamily: FONT }}>No warehouses saved yet.</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, maxHeight: 190, overflowY: 'auto' }}>
                            {warehouses.map(wh => (
                              <div key={wh.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--navy-50)', border: '1px solid var(--navy-150, #e2e8f0)', borderRadius: 7, padding: '0.45rem 0.6rem' }}>
                                <BuildingOfficeIcon style={{ width: 13, height: 13, color: '#6366F1', flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: FONT }}>{wh.label}</div>
                                  <div style={{ fontSize: '0.68rem', color: 'var(--navy-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: FONT }}>{wh.address1}, {wh.city}, {wh.state}</div>
                                </div>
                                <button type="button" onClick={() => loadWarehouse(wh)} style={{ background: '#6366F1', border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: '0.65rem', fontWeight: 700, color: '#fff', cursor: 'pointer', flexShrink: 0, fontFamily: FONT }}>
                                  Load
                                </button>
                                <button type="button" onClick={() => deleteWarehouse(wh.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-300)', padding: 2, display: 'flex', alignItems: 'center' }}>
                                  <TrashIcon style={{ width: 12, height: 12 }} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ borderTop: '1px solid var(--navy-100)', paddingTop: 8 }}>
                          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5, fontFamily: FONT }}>Save current FROM</div>
                          <div style={{ display: 'flex', gap: 5 }}>
                            <input
                              type="text"
                              value={newWhLabel}
                              onChange={e => setNewWhLabel(e.target.value)}
                              placeholder="e.g. NYC Warehouse"
                              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), saveWarehouse())}
                              style={{ flex: 1, padding: '0.45rem 0.6rem', fontSize: '0.76rem', border: '1.5px solid var(--navy-200)', borderRadius: 7, outline: 'none', fontFamily: FONT, background: 'var(--bg-card)', color: 'var(--navy-800)' }}
                            />
                            <button
                              type="button"
                              onClick={saveWarehouse}
                              disabled={!form.from_name.trim() && !form.from_address1.trim()}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.45rem 0.75rem', borderRadius: 7, border: 'none', background: '#6366F1', color: '#fff', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0, fontFamily: FONT }}>
                              <PlusIcon style={{ width: 11, height: 11 }} /> Save
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* FROM fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <F label="Name"      name="from_name"     value={form.from_name}     onChange={handleChange} required />
                  <F label="Company"   name="from_company"  value={form.from_company}  onChange={handleChange} />
                  <F label="Address"   name="from_address1" value={form.from_address1} onChange={handleChange} required style={{ gridColumn: 'span 2' }} />
                  <F label="Apt / Suite" name="from_address2" value={form.from_address2} onChange={handleChange} />
                  <F label="Phone"     name="from_phone"    value={form.from_phone}    onChange={handleChange} />
                  <F label="City"      name="from_city"     value={form.from_city}     onChange={handleChange} required />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', gridColumn: 'span 1' }}>
                    <StateSelect name="from_state" value={form.from_state} onChange={handleChange as any} />
                    <F label="ZIP" name="from_zip" value={form.from_zip} onChange={handleChange} required />
                  </div>
                </div>
              </div>

              {/* TO column */}
              <div style={{ padding: '1.1rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A' }} />
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--navy-700)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT }}>To</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <F label="Name"      name="to_name"     value={form.to_name}     onChange={handleChange} required />
                  <F label="Company"   name="to_company"  value={form.to_company}  onChange={handleChange} />
                  <F label="Address"   name="to_address1" value={form.to_address1} onChange={handleChange} required style={{ gridColumn: 'span 2' }} />
                  <F label="Apt / Suite" name="to_address2" value={form.to_address2} onChange={handleChange} />
                  <F label="Phone"     name="to_phone"    value={form.to_phone}    onChange={handleChange} />
                  <F label="City"      name="to_city"     value={form.to_city}     onChange={handleChange} required />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', gridColumn: 'span 1' }}>
                    <StateSelect name="to_state" value={form.to_state} onChange={handleChange as any} />
                    <F label="ZIP" name="to_zip" value={form.to_zip} onChange={handleChange} required />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Package Details ───────────────────────────────────────────────── */}
          <div className="db-card" style={{ padding: '1.1rem 1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: '0.875rem' }}>
              <div style={{ width: 3, height: 13, borderRadius: 3, background: 'var(--accent-500)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: FONT }}>Package Details</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 2fr', gap: '0.75rem', alignItems: 'end' }}>
              <F label="Weight (lbs) *" name="weight" value={form.weight} onChange={handleChange} type="number" step="0.1" min="0" required />
              <F label="Length (in)"   name="length" value={form.length} onChange={handleChange} type="number" step="0.1" min="0" />
              <F label="Width (in)"    name="width"  value={form.width}  onChange={handleChange} type="number" step="0.1" min="0" />
              <F label="Height (in)"   name="height" value={form.height} onChange={handleChange} type="number" step="0.1" min="0" />
              <div>
                <div style={fieldLabel}>Note</div>
                <input
                  name="note" type="text" value={form.note}
                  onChange={handleChange as any} placeholder="Optional delivery note…"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = '#6366f1')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--navy-200)')}
                />
              </div>
            </div>
          </div>

          {/* ── Success / Error banner ────────────────────────────────────────── */}
          {(error || successData) && (
            <div style={{
              borderRadius: 12, overflow: 'hidden',
              border: `1.5px solid ${error ? '#FECACA' : '#BBF7D0'}`,
              background: error ? '#FFF5F5' : '#F0FDF4',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.875rem 1rem' }}>
                {error
                  ? <ExclamationCircleIcon style={{ width: 18, height: 18, color: '#DC2626', flexShrink: 0, marginTop: 1 }} />
                  : <CheckCircleIcon       style={{ width: 18, height: 18, color: '#16A34A', flexShrink: 0, marginTop: 1 }} />
                }
                <div style={{ flex: 1 }}>
                  {successData ? (
                    <>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#15803D', fontFamily: FONT, marginBottom: 4 }}>Label Generated Successfully!</div>
                      <div style={{ fontSize: '0.78rem', color: '#166534', fontFamily: FONT, lineHeight: 1.6 }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{successData.tracking}</span>
                        <span style={{ margin: '0 6px', opacity: 0.4 }}>·</span>
                        Charged: <strong>${successData.charged}</strong>
                        <span style={{ margin: '0 6px', opacity: 0.4 }}>·</span>
                        Balance: <strong>${successData.balance}</strong>
                        {(() => {
                          const retail = selectedCarrier === 'USPS' && weight > 0 ? getUspsZone1Rate(weight) : null;
                          const saving = retail ? Math.max(0, retail - parseFloat(successData.charged)) : 0;
                          return saving > 0 ? (
                            <span style={{ marginLeft: 8, background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', borderRadius: 20, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 700, fontFamily: FONT }}>
                              ✦ Saved ${saving.toFixed(2)} vs USPS retail
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: '0.82rem', color: '#DC2626', fontFamily: FONT, lineHeight: 1.5 }}>{error}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setError(''); setSuccessData(null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: error ? '#DC2626' : '#16A34A', opacity: 0.5, padding: '2px 4px', flexShrink: 0 }}>
                  <XMarkIcon style={{ width: 14, height: 14 }} />
                </button>
              </div>
            </div>
          )}

        </form>
      </div>

      {/* ── Sticky bottom bar ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, right: 0,
        left: 'var(--sidebar-w, 256px)',
        background: 'rgba(15,23,42,0.97)',
        backdropFilter: 'blur(12px)',
        borderTop: `1px solid ${canSubmit && weight > 0 ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`,
        zIndex: 200, padding: '0.75rem 1.5rem',
        display: 'flex', alignItems: 'center', gap: '1rem',
        transition: 'border-color 0.3s',
      }}>
        {/* Summary */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.875rem', flexWrap: 'wrap' }}>
          {canSubmit ? (
            <>
              {selectedCarrier && (
                <span style={{
                  background: activeCfg ? `${activeCfg.light}22` : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${activeCfg ? `${activeCfg.solid}44` : 'rgba(255,255,255,0.1)'}`,
                  color: activeCfg ? activeCfg.solid : '#94A3B8',
                  borderRadius: 6, padding: '3px 9px', fontSize: '0.72rem', fontWeight: 700, fontFamily: FONT,
                }}>
                  {selectedCarrier}
                </span>
              )}
              {selectedAccess && <span style={{ fontSize: '0.78rem', color: 'rgba(148,163,184,0.8)', fontFamily: FONT }}>{selectedAccess.vendorName}</span>}
              {weight > 0 && <span style={{ fontSize: '0.78rem', color: 'rgba(148,163,184,0.6)', fontFamily: FONT }}>{weight} lbs</span>}
              {weight > 0 && selectedVendorId && (
                <span style={{ fontSize: '1rem', fontWeight: 900, color: '#34D399', letterSpacing: '-0.02em', fontFamily: FONT }}>
                  ${effectiveRate.toFixed(2)}
                </span>
              )}
              {uspsSaving && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 20, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700, color: '#34D399', fontFamily: FONT }}>
                  <SparklesIcon style={{ width: 11, height: 11 }} />
                  Save ${uspsSaving.saving.toFixed(2)} vs retail
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: '0.8rem', color: 'rgba(148,163,184,0.45)', fontFamily: FONT }}>
              {!selectedCarrier ? '← Select portal, carrier, and vendor above' : !selectedVendorId ? '← Pick a vendor' : 'Enter weight above'}
            </span>
          )}
        </div>

        {/* Generate button */}
        <button
          type="submit"
          form="label-form"
          disabled={!canSubmit}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            height: 42, padding: '0 24px', borderRadius: 10, border: 'none',
            background: canSubmit
              ? (activeCfg ? activeCfg.solid : '#6366F1')
              : 'rgba(255,255,255,0.08)',
            color: canSubmit ? '#fff' : 'rgba(255,255,255,0.25)',
            fontSize: '0.88rem', fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontFamily: FONT, whiteSpace: 'nowrap',
            boxShadow: canSubmit ? `0 4px 16px ${activeCfg ? activeCfg.solid : '#6366F1'}50` : 'none',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { if (canSubmit) (e.currentTarget.style.filter = 'brightness(1.1)'); }}
          onMouseLeave={e => { (e.currentTarget.style.filter = 'none'); }}
        >
          {isLoading
            ? <><div className="spinner" style={{ width: 15, height: 15, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> Generating…</>
            : <><ArrowDownTrayIcon style={{ width: 16, height: 16 }} /> Generate Label{canSubmit && weight > 0 ? ` · $${effectiveRate.toFixed(2)}` : ''}</>
          }
        </button>
      </div>
    </>
  );
};

export default LabelGenerator;
