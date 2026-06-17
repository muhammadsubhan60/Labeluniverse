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

const sectionLabel: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-400)',
  letterSpacing: '0.09em', textTransform: 'uppercase',
};

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
    <div style={{ maxWidth: 740, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
         className="animate-fadeIn">

      {/* Identity header */}
      <div className="sh-card" style={{ padding: '0.875rem 1.1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ArrowDownTrayIcon style={{ width: 17, height: 17, color: '#059669' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--navy-900)' }}>Topup History</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--navy-500)', marginTop: 2 }}>
            Wallet top-ups, deductions, and balance adjustments
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            Total topups
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#059669', marginTop: 1 }}>
            ${totalTopups.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="sh-card" style={{ overflow: 'hidden' }}>
        <div style={{
          padding: '0.65rem 1rem', borderBottom: '1px solid var(--navy-100)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={sectionLabel}>Transactions</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FunnelIcon style={{ width: 13, height: 13, color: 'var(--navy-400)' }} />
            <select
              className="form-select form-input"
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'all' | TxType)}
              style={{ padding: '0.3rem 2rem 0.3rem 0.6rem', fontSize: '0.75rem', minWidth: 150 }}
            >
              <option value="all">All transactions</option>
              <option value="topup">Top ups</option>
              <option value="deduction">Deductions</option>
              <option value="adjustment">Adjustments</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : error ? (
          <div style={{ padding: '1rem', color: 'var(--danger-600)', fontSize: '0.8rem', fontWeight: 600 }}>
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '1.2rem 1rem', color: 'var(--navy-500)', fontSize: '0.8rem' }}>
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
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                        {new Date(t.createdAt).toLocaleString('en-US', {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td>
                        <span className="badge" style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
                          {typeLabel[t.type]}
                        </span>
                      </td>
                      <td style={{ maxWidth: 320, fontSize: '0.78rem' }}>{t.description || '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '0.8rem', color: isPos ? '#059669' : '#DC2626' }}>
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
