import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { ArrowPathIcon, BuildingStorefrontIcon, CubeIcon, UserGroupIcon } from '@heroicons/react/24/outline';

interface WarehouseUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface WarehouseRow {
  warehouseKey: string;
  warehouseName: string;
  parcelCount: number;
  userCount: number;
  totalRevenue: number;
  from_address1: string;
  from_city: string;
  from_state: string;
  from_zip: string;
  from_country: string;
  users: WarehouseUser[];
  lastShipmentAt: string;
  firstShipmentAt: string;
}

interface WarehouseStatsResponse {
  summary: {
    totalWarehouses: number;
    totalParcels: number;
    sharedWarehouses: number;
    maxUsersOnSingleWarehouse: number;
  };
  warehouses: WarehouseRow[];
}

const fmtN = (n: number) => n.toLocaleString('en-US');
const fmt$ = (n: number) =>
  `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const AdminWarehouses: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<WarehouseStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showSharedOnly, setShowSharedOnly] = useState(false);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await axios.get<WarehouseStatsResponse>('/stats/admin-warehouses');
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to fetch warehouse stats');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = data?.warehouses || [];

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((w) => {
      if (showSharedOnly && w.userCount <= 1) return false;
      if (!q) return true;
      const fullAddress = `${w.from_address1} ${w.from_city} ${w.from_state} ${w.from_zip} ${w.from_country}`.toLowerCase();
      const names = (w.users || []).map((u) => `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase()).join(' ');
      return (
        (w.warehouseName || '').toLowerCase().includes(q) ||
        fullAddress.includes(q) ||
        names.includes(q)
      );
    });
  }, [rows, search, showSharedOnly]);

  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320 }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Warehouse Tracker</h1>
          <p className="page-subtitle">Admin-only visibility into warehouse volume and shared usage across users.</p>
        </div>
        <button
          onClick={() => load(true)}
          className="btn btn-ghost btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          disabled={refreshing}
        >
          <ArrowPathIcon style={{ width: 14, height: 14, animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        {[
          { label: 'Warehouses', value: data?.summary.totalWarehouses || 0, icon: BuildingStorefrontIcon, color: '#0ea5e9' },
          { label: 'Parcels', value: data?.summary.totalParcels || 0, icon: CubeIcon, color: '#22c55e' },
          { label: 'Shared Warehouses', value: data?.summary.sharedWarehouses || 0, icon: UserGroupIcon, color: '#f59e0b' },
          { label: 'Max Users On One', value: data?.summary.maxUsersOnSingleWarehouse || 0, icon: UserGroupIcon, color: '#8b5cf6' },
        ].map((kpi) => (
          <div key={kpi.label} className="sh-card" style={{ padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--navy-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{kpi.label}</span>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${kpi.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <kpi.icon style={{ width: 15, height: 15, color: kpi.color }} />
              </div>
            </div>
            <span style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--navy-900)', lineHeight: 1 }}>{fmtN(kpi.value)}</span>
          </div>
        ))}
      </div>

      <div className="sh-card" style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search warehouse, address, user, email..."
            style={{
              flex: 1,
              minWidth: 280,
              border: '1.5px solid var(--navy-200)',
              borderRadius: 10,
              padding: '0.55rem 0.8rem',
              fontSize: '0.82rem',
              color: 'var(--navy-800)',
            }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--navy-600)', userSelect: 'none' }}>
            <input type="checkbox" checked={showSharedOnly} onChange={(e) => setShowSharedOnly(e.target.checked)} />
            Show shared only
          </label>
        </div>
      </div>

      <div className="sh-card" style={{ overflowX: 'auto' }}>
        <table className="sh-table">
          <thead>
            <tr>
              <th>Warehouse</th>
              <th>From Address</th>
              <th>Parcels</th>
              <th>Users</th>
              <th>Revenue</th>
              <th>Last Shipment</th>
              <th>User List</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '1.1rem', color: 'var(--navy-400)' }}>
                  No warehouses matched your filters.
                </td>
              </tr>
            ) : (
              filteredRows.map((w) => {
                const shared = w.userCount > 1;
                return (
                  <tr key={w.warehouseKey}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--navy-800)' }}>{w.warehouseName || 'Unnamed Warehouse'}</span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--navy-400)', fontFamily: 'monospace' }}>{w.warehouseKey}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--navy-600)' }}>
                      {w.from_address1}, {w.from_city}, {w.from_state} {w.from_zip}, {w.from_country}
                    </td>
                    <td style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--navy-800)' }}>{fmtN(w.parcelCount)}</td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 99,
                        background: shared ? '#fff7ed' : '#f1f5f9',
                        color: shared ? '#c2410c' : '#475569',
                      }}>
                        {w.userCount} {w.userCount === 1 ? 'user' : 'users'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', fontWeight: 700, color: '#16a34a' }}>{fmt$(w.totalRevenue || 0)}</td>
                    <td style={{ fontSize: '0.76rem', color: 'var(--navy-500)', whiteSpace: 'nowrap' }}>
                      {w.lastShipmentAt ? new Date(w.lastShipmentAt).toLocaleString() : '—'}
                    </td>
                    <td style={{ maxWidth: 280 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {(w.users || []).slice(0, 4).map((u) => (
                          <span key={u._id} style={{ fontSize: '0.72rem', color: 'var(--navy-600)' }}>
                            {u.firstName} {u.lastName} ({u.email})
                          </span>
                        ))}
                        {w.users && w.users.length > 4 && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--navy-400)' }}>
                            +{w.users.length - 4} more
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminWarehouses;
