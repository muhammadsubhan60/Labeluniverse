import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  UsersIcon,
  MagnifyingGlassIcon,
  ShoppingBagIcon,
  TagIcon,
} from '@heroicons/react/24/outline';

const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

interface Customer {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string;
  city: string;
  provinceCode: string;
}

export default function ShopifyCustomers() {
  const { token } = useAuth();
  const navigate  = useNavigate();

  const [customers,  setCustomers]  = useState<Customer[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading,    setLoading]    = useState(true);
  const [connected,  setConnected]  = useState(true);

  const authHeader = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const fetchCustomers = useCallback(async (pg = 1, q = search) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/shopify/customers`, {
        headers: authHeader(),
        params: { page: pg, limit: 50, search: q || undefined },
      });
      setCustomers(res.data.customers || []);
      setTotal(res.data.total || 0);
    } catch (err: any) {
      if (err.response?.status === 404) setConnected(false);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [authHeader, search]);

  useEffect(() => { fetchCustomers(1, ''); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
    fetchCustomers(1, searchInput);
  };

  const card: React.CSSProperties = {
    background: 'var(--bg-card)', borderRadius: 14,
    border: '1.5px solid var(--navy-100)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
  };

  const LIMIT = 50;
  const totalPages = Math.ceil(total / LIMIT);

  if (!connected) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: 40 }}>
        <div style={{ ...card, padding: '2rem', textAlign: 'center' }}>
          <UsersIcon style={{ width: 40, height: 40, color: 'var(--navy-300)', margin: '0 auto 12px' }} />
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--navy-700)', marginBottom: 8 }}>
            No Shopify Store Connected
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--navy-400)', marginBottom: 16 }}>
            Connect your Shopify store on the Orders page to sync customers.
          </p>
          <button
            onClick={() => navigate('/orders')}
            style={{
              padding: '8px 20px', borderRadius: 8, background: 'var(--accent-600,#4f46e5)',
              color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.84rem',
            }}
          >
            Go to Orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--navy-900)', margin: 0 }}>Customers</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--navy-400)', marginTop: 4 }}>
            Unique customers from your Shopify orders
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            padding: '6px 14px', borderRadius: 99, fontSize: '0.78rem', fontWeight: 700,
            background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.25)',
          }}>
            {total} customer{total !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} style={{ ...card, padding: '0.75rem 1rem', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <MagnifyingGlassIcon style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: 'var(--navy-400)' }} />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by name or email…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '7px 10px 7px 32px', borderRadius: 8, fontSize: '0.82rem',
              border: '1.5px solid var(--navy-200)', background: 'var(--bg-card)',
              color: 'var(--navy-900)', outline: 'none',
            }}
          />
        </div>
        <button type="submit" style={{
          padding: '7px 16px', borderRadius: 8, background: 'var(--accent-600,#4f46e5)',
          color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem',
        }}>
          Search
        </button>
        {search && (
          <button type="button" onClick={() => { setSearchInput(''); setSearch(''); fetchCustomers(1, ''); }}
            style={{ padding: '7px 12px', borderRadius: 8, background: 'transparent', border: '1.5px solid var(--navy-200)', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--navy-500)', fontWeight: 600 }}>
            Clear
          </button>
        )}
      </form>

      {/* Table */}
      <div style={card}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--navy-400)', fontSize: '0.85rem' }}>
            Loading customers…
          </div>
        ) : customers.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <UsersIcon style={{ width: 36, height: 36, color: 'var(--navy-300)', margin: '0 auto 12px' }} />
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--navy-500)' }}>No customers found</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--navy-400)', marginTop: 4 }}>
              {search ? 'Try a different search term' : 'Sync your Shopify orders to see customers here'}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid var(--navy-100)' }}>
                  {['Customer', 'Email', 'Location', 'Orders', 'Total Spent', 'Last Order', 'Action'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: 'left',
                      fontSize: '0.7rem', fontWeight: 700, color: 'var(--navy-400)',
                      textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => (
                  <tr
                    key={c._id}
                    style={{
                      borderBottom: i < customers.length - 1 ? '1px solid var(--navy-50)' : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50,#f8fafc)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Name */}
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                          background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.72rem', fontWeight: 700, color: '#fff',
                        }}>
                          {(c.firstName?.[0] ?? '?')}{(c.lastName?.[0] ?? '')}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--navy-900)' }}>
                            {c.firstName} {c.lastName}
                          </div>
                          {c.phone && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 1 }}>{c.phone}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td style={{ padding: '12px 14px' }}>
                      <a href={`mailto:${c.email}`} style={{ color: 'var(--accent-600,#4f46e5)', fontSize: '0.8rem', textDecoration: 'none', fontWeight: 500 }}>
                        {c.email || '—'}
                      </a>
                    </td>

                    {/* Location */}
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: 'var(--navy-600)', fontSize: '0.8rem' }}>
                      {[c.city, c.provinceCode].filter(Boolean).join(', ') || '—'}
                    </td>

                    {/* Order count */}
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 10px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 700,
                        background: 'rgba(99,102,241,0.08)', color: '#4f46e5', border: '1px solid rgba(99,102,241,0.2)',
                      }}>
                        <ShoppingBagIcon style={{ width: 11, height: 11 }} />
                        {c.orderCount} order{c.orderCount !== 1 ? 's' : ''}
                      </span>
                    </td>

                    {/* Total spent */}
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 800, color: 'var(--navy-900)', fontSize: '0.88rem' }}>
                        ${c.totalSpent.toFixed(2)}
                      </span>
                    </td>

                    {/* Last order */}
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: 'var(--navy-500)', fontSize: '0.78rem' }}>
                      {c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString() : '—'}
                    </td>

                    {/* Action */}
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => navigate('/orders', { state: { searchCustomer: `${c.firstName} ${c.lastName}` } })}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '5px 12px', borderRadius: 7, fontSize: '0.75rem', fontWeight: 700,
                          background: 'transparent', color: 'var(--accent-600,#4f46e5)',
                          border: '1.5px solid rgba(99,102,241,0.3)', cursor: 'pointer',
                        }}
                      >
                        <TagIcon style={{ width: 12, height: 12 }} />
                        View Orders
                      </button>
                    </td>
                  </tr>
                ))}
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
            <span>{total} total customers</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                disabled={page <= 1}
                onClick={() => { const p = page - 1; setPage(p); fetchCustomers(p); }}
                style={{ padding: '5px 12px', borderRadius: 7, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: '1.5px solid var(--navy-200)', background: 'transparent', color: 'var(--navy-600)' }}
              >← Prev</button>
              <span style={{ padding: '5px 10px', fontWeight: 700, color: 'var(--navy-700)' }}>{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => { const p = page + 1; setPage(p); fetchCustomers(p); }}
                style={{ padding: '5px 12px', borderRadius: 7, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: '1.5px solid var(--navy-200)', background: 'transparent', color: 'var(--navy-600)' }}
              >Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
