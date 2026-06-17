import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { CreditCardIcon } from '@heroicons/react/24/outline';

interface PaymentLog {
  _id: string;
  amount: number;
  date: string;
  note?: string;
  screenshots?: string[];
  wallet?: { _id: string; name: string } | null;
  loggedBy?: { firstName?: string; lastName?: string } | null;
}

const sectionLabel: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-400)',
  letterSpacing: '0.09em', textTransform: 'uppercase',
};

const PaymentHistory: React.FC = () => {
  const [logs, setLogs] = useState<PaymentLog[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axios.get('/payment-logs/me');
        setLogs(res.data?.logs || []);
        setTotalPaid(Number(res.data?.totalPaid || 0));
      } catch (e: any) {
        setError(e?.response?.data?.message || 'Failed to load payment history');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div style={{ maxWidth: 740, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
         className="animate-fadeIn">

      {/* Identity header */}
      <div className="sh-card" style={{ padding: '0.875rem 1.1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CreditCardIcon style={{ width: 17, height: 17, color: '#2563EB' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--navy-900)' }}>Payment History</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--navy-500)', marginTop: 2 }}>
            Recorded payments and uploaded payment proofs
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            Total paid
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#2563EB', marginTop: 1 }}>
            ${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="sh-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '0.65rem 1rem', borderBottom: '1px solid var(--navy-100)' }}>
          <span style={sectionLabel}>Records</span>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : error ? (
          <div style={{ padding: '1rem', color: 'var(--danger-600)', fontSize: '0.8rem', fontWeight: 600 }}>
            {error}
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '1.2rem 1rem', color: 'var(--navy-500)', fontSize: '0.8rem' }}>
            No payment records found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sh-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Wallet</th>
                  <th>Note</th>
                  <th>Proof</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                      {new Date(log.date).toLocaleString('en-US', {
                        year: 'numeric', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>{log.wallet?.name || '—'}</td>
                    <td style={{ maxWidth: 280, fontSize: '0.78rem' }}>{log.note || '—'}</td>
                    <td>
                      {log.screenshots?.length ? (
                        <a
                          href={log.screenshots[0]}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--accent-600)', fontWeight: 700, fontSize: '0.75rem', textDecoration: 'none' }}
                        >
                          View proof
                        </a>
                      ) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '0.8rem', color: '#059669' }}>
                      ${Number(log.amount || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentHistory;
