import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  ShoppingBagIcon,
  ArrowPathIcon,
  LinkIcon,
  XCircleIcon,
  CheckCircleIcon,
  TagIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';

const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

interface ShopifyAddress {
  firstName: string; lastName: string; company: string;
  address1: string; address2: string;
  city: string; province: string; provinceCode: string;
  zip: string; country: string; phone: string;
}

interface LineItem { title: string; quantity: number; price: string; sku: string; }

interface ShopifyOrder {
  _id: string;
  shopifyOrderId: string;
  orderNumber: string;
  shop: string;
  customer: { firstName: string; lastName: string; email: string; phone: string };
  shippingAddress: ShopifyAddress;
  lineItems: LineItem[];
  totalPrice: string;
  currency: string;
  financialStatus: string;
  fulfillmentStatus: string;
  shopifyCreatedAt: string;
  labelGenerated: boolean;
}

interface ConnectionStatus {
  connected: boolean;
  shop?: string;
  connectedAt?: string;
  lastSyncAt?: string;
}

type FilterStatus = 'all' | 'unfulfilled' | 'fulfilled';

export default function Orders() {
  const { token } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [status,    setStatus]    = useState<ConnectionStatus>({ connected: false });
  const [orders,    setOrders]    = useState<ShopifyOrder[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [filter,    setFilter]    = useState<FilterStatus>('all');
  const [search,    setSearch]    = useState('');
  const [loading,   setLoading]   = useState(true);
  const [syncing,   setSyncing]   = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [shopInput, setShopInput] = useState('');
  const [shopError, setShopError] = useState('');
  const [syncMsg,   setSyncMsg]   = useState('');
  const [disconnecting, setDisconnecting] = useState(false);

  const authHeader = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  // ── Read query params set by OAuth callback ───────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('connected') === 'true') {
      setSyncMsg('Shopify store connected! Syncing orders…');
      window.history.replaceState({}, '', '/orders');
    }
    if (params.get('error')) {
      setShopError(`Connection failed: ${params.get('error')}. Please try again.`);
      window.history.replaceState({}, '', '/orders');
    }
  }, [location.search]);

  // ── Fetch connection status ───────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/shopify/status`, { headers: authHeader() });
      setStatus(res.data);
    } catch {
      setStatus({ connected: false });
    }
  }, [authHeader]);

  // ── Fetch orders ──────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async (pg = 1, f = filter) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/shopify/orders`, {
        headers: authHeader(),
        params:  { page: pg, limit: 20, status: f !== 'all' ? f : undefined },
      });
      setOrders(res.data.orders || []);
      setTotal(res.data.total || 0);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [authHeader, filter]);

  useEffect(() => {
    fetchStatus().then(() => fetchOrders());
  }, [fetchStatus, fetchOrders]);

  // ── Connect flow ──────────────────────────────────────────────────────────
  const handleConnect = async () => {
    const raw = shopInput.trim();
    if (!raw) { setShopError('Enter your Shopify store URL'); return; }
    setShopError('');
    setConnecting(true);
    try {
      const res = await axios.get(`${API_BASE}/shopify/auth-url`, {
        headers: authHeader(),
        params:  { shop: raw },
      });
      window.location.href = res.data.authUrl;
    } catch (err: any) {
      setShopError(err.response?.data?.message || 'Failed to start connection');
      setConnecting(false);
    }
  };

  // ── Manual sync ───────────────────────────────────────────────────────────
  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await axios.post(`${API_BASE}/shopify/sync`, {}, { headers: authHeader() });
      setSyncMsg(`${res.data.synced} orders synced.`);
      fetchOrders(1, filter);
      fetchStatus();
    } catch (err: any) {
      setSyncMsg(err.response?.data?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // ── Disconnect ────────────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    if (!window.confirm(`Disconnect ${status.shop}? All synced orders will be removed.`)) return;
    setDisconnecting(true);
    try {
      await axios.delete(`${API_BASE}/shopify/disconnect`, { headers: authHeader() });
      setStatus({ connected: false });
      setOrders([]);
      setTotal(0);
    } catch (err: any) {
      setSyncMsg(err.response?.data?.message || 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  // ── Generate label ────────────────────────────────────────────────────────
  const handleGenerateLabel = (order: ShopifyOrder) => {
    const addr   = order.shippingAddress;
    const state2 = addr.provinceCode || addr.province || '';
    navigate('/labels/single', {
      state: {
        prefill: {
          to_name:     `${addr.firstName} ${addr.lastName}`.trim(),
          to_company:  addr.company  || '',
          to_phone:    addr.phone    || '',
          to_address1: addr.address1 || '',
          to_address2: addr.address2 || '',
          to_city:     addr.city     || '',
          to_state:    state2.length === 2 ? state2.toUpperCase() : 'NY',
          to_zip:      addr.zip      || '',
          to_country:  'USA',
        },
      },
    });
  };

  // ── Filter + search (client-side search on cached orders) ────────────────
  const displayed = orders.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      `${o.customer.firstName} ${o.customer.lastName}`.toLowerCase().includes(q) ||
      o.shippingAddress.city.toLowerCase().includes(q)
    );
  });

  // ── Styles ────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: 'var(--bg-card)', borderRadius: 14,
    border: '1.5px solid var(--navy-100)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
  };

  const btn = (variant: 'primary' | 'ghost' | 'danger' | 'success'): React.CSSProperties => {
    const base: React.CSSProperties = {
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 16px', borderRadius: 8, border: 'none',
      cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
      whiteSpace: 'nowrap',
    };
    if (variant === 'primary') return { ...base, background: 'var(--accent-600,#4f46e5)', color: '#fff' };
    if (variant === 'success') return { ...base, background: '#059669', color: '#fff' };
    if (variant === 'danger')  return { ...base, background: '#fee2e2', color: '#dc2626', border: '1.5px solid #fca5a5' };
    return { ...base, background: 'var(--bg-card)', color: 'var(--navy-600)', border: '1.5px solid var(--navy-200)' };
  };

  const fulfillBadge = (s: string) => {
    if (s === 'fulfilled') return { bg: '#f0fdf4', color: '#059669', border: '#6ee7b7', label: 'Fulfilled' };
    if (s === 'partial')   return { bg: '#fffbeb', color: '#d97706', border: '#fde68a', label: 'Partial' };
    return { bg: '#f8fafc', color: '#475569', border: '#e2e8f0', label: 'Unfulfilled' };
  };

  // ── Not connected — show connect card ─────────────────────────────────────
  if (!status.connected) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--navy-900)', margin: 0 }}>Orders</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--navy-400)', marginTop: 4 }}>
            Connect your Shopify store to start syncing orders
          </p>
        </div>

        <div style={{ ...card, padding: '2rem' }}>
          {/* Icon */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <div style={{
              width: 60, height: 60, borderRadius: 16,
              background: 'linear-gradient(135deg,#96bf48,#5a8e00)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShoppingBagIcon style={{ width: 28, height: 28, color: '#fff' }} />
            </div>
          </div>

          <h2 style={{ textAlign: 'center', fontSize: '1.05rem', fontWeight: 800, color: 'var(--navy-900)', marginBottom: 6 }}>
            Connect Shopify Store
          </h2>
          <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--navy-400)', marginBottom: 24, lineHeight: 1.6 }}>
            Enter your store URL below. You'll be redirected to Shopify to authorize access,
            then your orders will sync automatically.
          </p>

          {/* Input */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-500)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Store URL
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={shopInput}
                onChange={e => setShopInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConnect()}
                placeholder="mystore  or  mystore.myshopify.com"
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 8, fontSize: '0.85rem',
                  border: `1.5px solid ${shopError ? '#fca5a5' : 'var(--navy-200)'}`,
                  background: 'var(--bg-card)', color: 'var(--navy-900)', outline: 'none',
                }}
              />
              <button style={btn('primary')} onClick={handleConnect} disabled={connecting}>
                <LinkIcon style={{ width: 15, height: 15 }} />
                {connecting ? 'Redirecting…' : 'Connect'}
              </button>
            </div>
            {shopError && (
              <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 }}>
                {shopError}
              </div>
            )}
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--navy-400)', textAlign: 'center', lineHeight: 1.6 }}>
            You'll be asked to approve access on Shopify. No password is stored here.
          </div>
        </div>
      </div>
    );
  }

  // ── Connected — show orders ───────────────────────────────────────────────
  const LIMIT = 20;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--navy-900)', margin: 0 }}>Orders</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#059669' }}>
              <CheckCircleIcon style={{ width: 13, height: 13, display: 'inline', marginRight: 3 }} />
              {status.shop}
            </span>
            {status.lastSyncAt && (
              <span style={{ fontSize: '0.72rem', color: 'var(--navy-400)' }}>
                · Last sync: {new Date(status.lastSyncAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btn('ghost')} onClick={handleSync} disabled={syncing}>
            <ArrowPathIcon style={{ width: 14, height: 14, animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
          <button style={btn('danger')} onClick={handleDisconnect} disabled={disconnecting}>
            <XCircleIcon style={{ width: 14, height: 14 }} />
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      </div>

      {/* Sync feedback */}
      {syncMsg && (
        <div style={{
          padding: '10px 16px', borderRadius: 9, marginBottom: 16,
          background: '#f0fdf4', border: '1.5px solid #6ee7b7', color: '#065f46',
          fontSize: '0.82rem', fontWeight: 600,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {syncMsg}
          <button onClick={() => setSyncMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46' }}>×</button>
        </div>
      )}

      {/* Stats strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Orders',   value: total, color: 'var(--navy-900)' },
          { label: 'Unfulfilled',    value: orders.filter(o => o.fulfillmentStatus === 'unfulfilled').length, color: '#d97706' },
          { label: 'Labels Created', value: orders.filter(o => o.labelGenerated).length, color: '#059669' },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: '12px 20px', flex: '1 1 140px' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy-400)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters + search */}
      <div style={{ ...card, padding: '0.8rem 1.1rem', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <MagnifyingGlassIcon style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: 'var(--navy-400)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search order #, customer, city…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '7px 10px 7px 32px', borderRadius: 8, fontSize: '0.82rem',
              border: '1.5px solid var(--navy-200)', background: 'var(--bg-card)',
              color: 'var(--navy-900)', outline: 'none',
            }}
          />
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <FunnelIcon style={{ width: 14, height: 14, color: 'var(--navy-400)' }} />
          {(['all', 'unfulfilled', 'fulfilled'] as FilterStatus[]).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); fetchOrders(1, f); }}
              style={{
                padding: '5px 12px', borderRadius: 7, fontSize: '0.75rem', fontWeight: 700,
                cursor: 'pointer', border: '1.5px solid',
                background: filter === f ? 'var(--accent-600,#4f46e5)' : 'transparent',
                color:      filter === f ? '#fff' : 'var(--navy-500)',
                borderColor: filter === f ? 'var(--accent-600,#4f46e5)' : 'var(--navy-200)',
                textTransform: 'capitalize',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Orders table */}
      <div style={card}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--navy-400)', fontSize: '0.85rem' }}>
            Loading orders…
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <ShoppingBagIcon style={{ width: 36, height: 36, color: 'var(--navy-300)', margin: '0 auto 12px' }} />
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--navy-500)' }}>No orders found</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--navy-400)', marginTop: 4 }}>
              {search ? 'Try a different search term' : 'Hit Sync Now to pull your latest orders'}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid var(--navy-100)' }}>
                  {['Order', 'Customer', 'Items', 'Total', 'Ship To', 'Status', 'Label'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: 'left',
                      fontSize: '0.7rem', fontWeight: 700, color: 'var(--navy-400)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((order, i) => {
                  const badge = fulfillBadge(order.fulfillmentStatus);
                  const itemSummary = order.lineItems.slice(0, 2).map(li => `${li.quantity}× ${li.title}`).join(', ')
                    + (order.lineItems.length > 2 ? ` +${order.lineItems.length - 2} more` : '');
                  const addr = order.shippingAddress;

                  return (
                    <tr
                      key={order._id}
                      style={{
                        borderBottom: i < displayed.length - 1 ? '1px solid var(--navy-50)' : 'none',
                        background: 'transparent',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50,#f8fafc)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Order # */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: 'var(--navy-900)' }}>#{order.orderNumber}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 1 }}>
                          {new Date(order.shopifyCreatedAt).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Customer */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--navy-800)' }}>
                          {order.customer.firstName} {order.customer.lastName}
                        </div>
                        {order.customer.email && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 1 }}>
                            {order.customer.email}
                          </div>
                        )}
                      </td>

                      {/* Items */}
                      <td style={{ padding: '12px 14px', maxWidth: 200 }}>
                        <div style={{ color: 'var(--navy-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {itemSummary || '—'}
                        </div>
                      </td>

                      {/* Total */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--navy-900)' }}>
                          ${order.totalPrice} {order.currency}
                        </span>
                      </td>

                      {/* Ship To */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ color: 'var(--navy-700)' }}>{addr.address1}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 1 }}>
                          {addr.city}{addr.provinceCode ? `, ${addr.provinceCode}` : ''} {addr.zip}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          padding: '3px 9px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700,
                          background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
                        }}>
                          {badge.label}
                        </span>
                      </td>

                      {/* Label action */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        {order.labelGenerated ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 700, color: '#059669' }}>
                            <CheckCircleIcon style={{ width: 14, height: 14 }} /> Created
                          </span>
                        ) : (
                          <button
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '5px 12px', borderRadius: 7, fontSize: '0.75rem', fontWeight: 700,
                              background: 'var(--accent-600,#4f46e5)', color: '#fff', border: 'none', cursor: 'pointer',
                            }}
                            onClick={() => handleGenerateLabel(order)}
                          >
                            <TagIcon style={{ width: 13, height: 13 }} />
                            Generate Label
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            padding: '12px 16px', borderTop: '1px solid var(--navy-100)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: '0.78rem', color: 'var(--navy-500)',
          }}>
            <span>{total} total orders</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                style={{ ...btn('ghost'), padding: '5px 12px', fontSize: '0.75rem' }}
                disabled={page <= 1}
                onClick={() => { setPage(p => p - 1); fetchOrders(page - 1, filter); }}
              >
                ← Prev
              </button>
              <span style={{ padding: '5px 10px', fontWeight: 700, color: 'var(--navy-700)' }}>
                {page} / {totalPages}
              </span>
              <button
                style={{ ...btn('ghost'), padding: '5px 12px', fontSize: '0.75rem' }}
                disabled={page >= totalPages}
                onClick={() => { setPage(p => p + 1); fetchOrders(page + 1, filter); }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
