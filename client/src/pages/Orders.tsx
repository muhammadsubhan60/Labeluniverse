import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import {
  ShoppingBagIcon, ArrowPathIcon, XCircleIcon,
  CheckCircleIcon, TagIcon, MagnifyingGlassIcon, FunnelIcon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '0.6rem 0.75rem', borderRadius: 8,
  border: '1.5px solid var(--navy-200)',
  background: 'var(--navy-50)', color: 'var(--navy-900)',
  fontSize: '0.84rem', fontFamily: FONT, outline: 'none',
  transition: 'border-color 0.18s, box-shadow 0.18s',
};
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
  _id: string; shopifyOrderId: string; orderNumber: string; shop: string;
  customer: { firstName: string; lastName: string; email: string; phone: string };
  shippingAddress: ShopifyAddress; lineItems: LineItem[];
  totalPrice: string; currency: string;
  financialStatus: string; fulfillmentStatus: string;
  shopifyCreatedAt: string; labelGenerated: boolean;
}
interface ConnectionStatus {
  connected: boolean; hasCredentials?: boolean; shop?: string;
  clientId?: string; connectedAt?: string; lastSyncAt?: string;
}
type FilterStatus = 'all' | 'unfulfilled' | 'fulfilled';

export default function Orders() {
  const { token }  = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();
  const { socket } = useSocket();
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const [status,    setStatus]    = useState<ConnectionStatus>({ connected: false });
  const [orders,    setOrders]    = useState<ShopifyOrder[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [filter,    setFilter]    = useState<FilterStatus>('all');
  const [search,    setSearch]    = useState('');
  const [loading,   setLoading]   = useState(true);
  const [syncing,   setSyncing]   = useState(false);
  const [syncMsg,       setSyncMsg]       = useState('');
  const [disconnecting, setDisconnecting] = useState(false);

  const authHeader = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('connected') === 'true') {
      setSyncMsg('Shopify store connected! Syncing orders…');
      window.history.replaceState({}, '', '/orders');
    }
    if (params.get('error')) {
      window.history.replaceState({}, '', '/orders');
    }
  }, [location.search]);

  useEffect(() => {
    if (!loading && !status.connected) {
      navigate('/integrations', { replace: true });
    }
  }, [loading, status.connected, navigate]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/shopify/status`, { headers: authHeader() });
      setStatus(res.data);
      return res.data;
    } catch {
      setStatus({ connected: false });
      return null;
    }
  }, [authHeader]);

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
    fetchStatus().then(() => { fetchOrders(); });
  }, [fetchStatus, fetchOrders]);

  useEffect(() => {
    if (!socket) return;
    const handleNewOrder = (order: ShopifyOrder) => {
      setOrders(prev => {
        const exists = prev.some(o => o.shopifyOrderId === order.shopifyOrderId);
        if (exists) return prev.map(o => o.shopifyOrderId === order.shopifyOrderId ? order : o);
        return [order, ...prev];
      });
      setTotal(t => t + 1);
      setSyncMsg(`New order #${order.orderNumber} received from ${order.customer.firstName} ${order.customer.lastName}`);
    };
    socket.on('shopify:new-order', handleNewOrder);
    return () => { socket.off('shopify:new-order', handleNewOrder); };
  }, [socket]);

  useEffect(() => {
    if (!status.connected) return;
    pollRef.current = setInterval(() => { fetchOrders(page, filter); }, 60_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status.connected, fetchOrders, page, filter]);

  const handleSync = async () => {
    setSyncing(true); setSyncMsg('');
    try {
      const res = await axios.post(`${API_BASE}/shopify/sync`, {}, { headers: authHeader() });
      setSyncMsg(`${res.data.synced} orders synced.`);
      fetchOrders(1, filter); fetchStatus();
    } catch (err: any) {
      setSyncMsg(err.response?.data?.message || 'Sync failed');
    } finally { setSyncing(false); }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(`Disconnect ${status.shop}? All synced orders will be removed.`)) return;
    setDisconnecting(true);
    try {
      await axios.delete(`${API_BASE}/shopify/disconnect`, { headers: authHeader() });
      setStatus({ connected: false }); setOrders([]); setTotal(0);
    } catch (err: any) {
      setSyncMsg(err.response?.data?.message || 'Failed to disconnect');
    } finally { setDisconnecting(false); }
  };

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

  const displayed = orders.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      `${o.customer.firstName} ${o.customer.lastName}`.toLowerCase().includes(q) ||
      o.shippingAddress.city.toLowerCase().includes(q)
    );
  });

  const fulfillBadge = (s: string) => {
    if (s === 'fulfilled') return { bg: 'rgba(16,185,129,0.08)', color: '#059669', border: 'rgba(16,185,129,0.2)', label: 'Fulfilled' };
    if (s === 'partial')   return { bg: 'rgba(217,119,6,0.08)',  color: '#d97706', border: 'rgba(217,119,6,0.2)',  label: 'Partial' };
    return { bg: 'rgba(100,116,139,0.08)', color: '#475569', border: 'rgba(100,116,139,0.2)', label: 'Unfulfilled' };
  };

  // Not connected → redirect to Integrations hub
  if (!status.connected) return null;

  // ── CONNECTED ─────────────────────────────────────────────────
  const LIMIT = 20;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', fontFamily: FONT, display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#96bf48,#5a8e00)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ShoppingBagIcon style={{ width: 15, height: 15, color: '#fff' }} />
            </div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--navy-900)', letterSpacing: '-0.5px', margin: 0, fontFamily: FONT }}>
              Orders
            </h1>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 99, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.22)', fontSize: '0.65rem', fontWeight: 700, color: '#059669', fontFamily: FONT }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              {status.shop}
            </span>
          </div>
          {status.lastSyncAt && (
            <p style={{ fontSize: '0.72rem', color: 'var(--navy-400)', margin: '4px 0 0 40px', fontFamily: FONT }}>
              Last sync: {new Date(status.lastSyncAt).toLocaleString()}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 7 }}>
          <button
            onClick={handleSync} disabled={syncing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', borderRadius: 8, border: '1.5px solid var(--navy-200)', background: 'transparent', color: 'var(--navy-600)', fontSize: '0.8rem', fontWeight: 700, cursor: syncing ? 'not-allowed' : 'pointer', fontFamily: FONT }}
          >
            <ArrowPathIcon style={{ width: 14, height: 14, animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
          <button
            onClick={handleDisconnect} disabled={disconnecting}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', borderRadius: 8, border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.07)', color: '#dc2626', fontSize: '0.8rem', fontWeight: 700, cursor: disconnecting ? 'not-allowed' : 'pointer', fontFamily: FONT }}
          >
            <XCircleIcon style={{ width: 14, height: 14 }} />
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      </div>

      {/* Sync message */}
      {syncMsg && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0.6rem 1rem', borderRadius: 9, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: '#065f46', fontSize: '0.82rem', fontWeight: 600, fontFamily: FONT }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <CheckCircleIcon style={{ width: 14, height: 14 }} /> {syncMsg}
          </span>
          <button onClick={() => setSyncMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46', fontSize: 16, padding: 0 }}>×</button>
        </div>
      )}

      {/* Stat chips */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Orders',   value: total,                                                      color: 'var(--navy-900)', bg: 'var(--navy-50)',          border: 'var(--navy-200)' },
          { label: 'Unfulfilled',    value: orders.filter(o => o.fulfillmentStatus !== 'fulfilled').length, color: '#d97706',          bg: 'rgba(217,119,6,0.07)',    border: 'rgba(217,119,6,0.2)' },
          { label: 'Labels Created', value: orders.filter(o => o.labelGenerated).length,               color: '#059669',          bg: 'rgba(16,185,129,0.07)',   border: 'rgba(16,185,129,0.2)' },
        ].map(s => (
          <div key={s.label} style={{ padding: '0.7rem 1rem', background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 10, minWidth: 110 }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: s.color, letterSpacing: '-0.05em', fontFamily: FONT }}>{s.value}</div>
            <div style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search + filter bar */}
      <div className="db-card" style={{ padding: '0.7rem 1rem', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <MagnifyingGlassIcon style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--navy-400)', pointerEvents: 'none' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search order #, customer, city…"
            style={{ ...inp, paddingLeft: '2rem', fontSize: '0.8rem' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <FunnelIcon style={{ width: 13, height: 13, color: 'var(--navy-400)' }} />
          {(['all', 'unfulfilled', 'fulfilled'] as FilterStatus[]).map(f => (
            <button
              key={f} onClick={() => { setFilter(f); setPage(1); fetchOrders(1, f); }}
              style={{
                padding: '4px 11px', borderRadius: 7, fontSize: '0.74rem', fontWeight: 700,
                cursor: 'pointer', border: '1.5px solid', fontFamily: FONT, textTransform: 'capitalize',
                background: filter === f ? '#6366f1' : 'transparent',
                color:      filter === f ? '#fff' : 'var(--navy-500)',
                borderColor: filter === f ? '#6366f1' : 'var(--navy-200)',
              }}
            >{f}</button>
          ))}
        </div>
      </div>

      {/* Orders table */}
      <div className="db-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <ShoppingBagIcon style={{ width: 22, height: 22, color: '#6366f1' }} />
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--navy-800)', fontFamily: FONT }}>No orders found</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--navy-400)', marginTop: 4, fontFamily: FONT }}>
              {search ? 'Try a different search term' : 'Hit Sync Now to pull your latest orders'}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', fontFamily: FONT }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid var(--navy-100)', background: 'var(--navy-50)' }}>
                  {['Order', 'Customer', 'Items', 'Total', 'Ship To', 'Status', 'Label'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((order, i) => {
                  const badge      = fulfillBadge(order.fulfillmentStatus);
                  const itemSummary = order.lineItems.slice(0, 2).map(li => `${li.quantity}× ${li.title}`).join(', ')
                    + (order.lineItems.length > 2 ? ` +${order.lineItems.length - 2}` : '');
                  const addr = order.shippingAddress;

                  return (
                    <tr
                      key={order._id}
                      style={{ borderBottom: i < displayed.length - 1 ? '1px solid var(--navy-50)' : 'none', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: 'var(--navy-900)', fontFamily: FONT }}>#{order.orderNumber}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', marginTop: 1, fontFamily: FONT }}>
                          {new Date(order.shopifyCreatedAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--navy-800)', fontFamily: FONT }}>
                          {order.customer.firstName} {order.customer.lastName}
                        </div>
                        {order.customer.email && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', marginTop: 1, fontFamily: FONT }}>{order.customer.email}</div>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px', maxWidth: 190 }}>
                        <div style={{ color: 'var(--navy-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: FONT }}>
                          {itemSummary || '—'}
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 800, color: 'var(--navy-900)', fontFamily: FONT }}>
                          ${order.totalPrice} {order.currency}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ color: 'var(--navy-700)', fontFamily: FONT }}>{addr.address1}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', marginTop: 1, fontFamily: FONT }}>
                          {addr.city}{addr.provinceCode ? `, ${addr.provinceCode}` : ''} {addr.zip}
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, fontFamily: FONT }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                        {order.labelGenerated ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700, color: '#059669', fontFamily: FONT }}>
                            <CheckCircleIcon style={{ width: 13, height: 13 }} /> Created
                          </span>
                        ) : (
                          <button
                            onClick={() => handleGenerateLabel(order)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 7, fontSize: '0.72rem', fontWeight: 700, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: FONT }}
                          >
                            <TagIcon style={{ width: 12, height: 12 }} /> Generate Label
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
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--navy-500)', fontFamily: FONT }}>
            <span>{total} total orders</span>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <button disabled={page <= 1} onClick={() => { setPage(p => p - 1); fetchOrders(page - 1, filter); }}
                style={{ padding: '4px 11px', borderRadius: 7, border: '1.5px solid var(--navy-200)', background: 'transparent', color: 'var(--navy-600)', fontSize: '0.75rem', fontWeight: 700, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1, fontFamily: FONT }}>
                ← Prev
              </button>
              <span style={{ padding: '4px 10px', fontWeight: 700, color: 'var(--navy-700)', fontFamily: FONT }}>{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => { setPage(p => p + 1); fetchOrders(page + 1, filter); }}
                style={{ padding: '4px 11px', borderRadius: 7, border: '1.5px solid var(--navy-200)', background: 'transparent', color: 'var(--navy-600)', fontSize: '0.75rem', fontWeight: 700, cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1, fontFamily: FONT }}>
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
