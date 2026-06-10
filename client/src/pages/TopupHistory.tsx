import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowDownTrayIcon, FunnelIcon } from '@heroicons/react/24/outline';

type TxType = 'topup' | 'deduction' | 'adjustment';

interface Txn {
  _id?: string;
  type: TxType;
  amount: number;
  description?: string;
  createdAt: string;
}

const TopupHistory: React.FC = () => {
  const [transactions, setTransactions] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | TxType>('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axios.get('/balance/transactions?limit=100');
        setTransactions(res.data?.transactions || []);
      } catch (e: any) {
        setError(e?.response?.data?.message || 'Failed to load top-up history');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = transactions.filter((t) => filter === 'all' || t.type === filter);
  const totalTopups = transactions
    .filter((t) => t.type === 'topup')
    .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);

  const typeLabel: Record<TxType, string> = {
    topup: 'Top Up',
    deduction: 'Deduction',
    adjustment: 'Adjustment',
  };

  const typeColor: Record<TxType, string> = {
    topup: '#059669',
    deduction: '#DC2626',
    adjustment: '#2563EB',
  };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1 className="page-title">Topup History</h1>
        <p className="page-subtitle">Your wallet top-ups, deductions, and balance adjustments.</p>
      </div>

      <div className="sh-card" style={{ padding: '1rem 1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ArrowDownTrayIcon style={{ width: 16, height: 16, color: 'var(--accent-600)' }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-700)' }}>
            Total topups: ${totalTopups.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FunnelIcon style={{ width: 14, height: 14, color: 'var(--navy-500)' }} />
          <select
            className="form-select form-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'all' | TxType)}
            style={{ minWidth: 170, padding: '0.45rem 2.2rem 0.45rem 0.7rem', fontSize: '0.8rem' }}
          >
            <option value="all">All transactions</option>
            <option value="topup">Top ups</option>
            <option value="deduction">Deductions</option>
            <option value="adjustment">Adjustments</option>
          </select>
        </div>
      </div>

      <div className="sh-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : error ? (
          <div style={{ padding: '1rem 1.1rem', color: 'var(--danger-600)', fontSize: '0.82rem', fontWeight: 600 }}>
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '1.2rem 1.1rem', color: 'var(--navy-500)', fontSize: '0.82rem' }}>
            No transactions found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sh-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, idx) => {
                  const amt = Number(t.amount || 0);
                  const isPos = amt >= 0;
                  const color = typeColor[t.type];
                  return (
                    <tr key={t._id || `${t.createdAt}-${idx}`}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(t.createdAt).toLocaleString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
                        >
                          {typeLabel[t.type]}
                        </span>
                      </td>
                      <td style={{ maxWidth: 460 }}>{t.description || '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: isPos ? '#059669' : '#DC2626' }}>
                        {isPos ? '+' : '-'}${Math.abs(amt).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopupHistory;
