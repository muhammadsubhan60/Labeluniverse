import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { DocumentTextIcon } from '@heroicons/react/24/outline';

interface PaymentLog {
  _id: string;
  amount: number;
  date: string;
  note?: string;
  screenshots?: string[];
  wallet?: { _id: string; name: string } | null;
  loggedBy?: { firstName?: string; lastName?: string } | null;
}

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
    <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1 className="page-title">Payment History</h1>
        <p className="page-subtitle">Recorded payments and uploaded payment proofs.</p>
      </div>

      <div className="sh-card" style={{ padding: '1rem 1.1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
        <DocumentTextIcon style={{ width: 16, height: 16, color: 'var(--accent-600)' }} />
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-700)' }}>
          Total paid: ${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
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
        ) : logs.length === 0 ? (
          <div style={{ padding: '1.2rem 1.1rem', color: 'var(--navy-500)', fontSize: '0.82rem' }}>
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
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {new Date(log.date).toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>{log.wallet?.name || '—'}</td>
                    <td style={{ maxWidth: 380 }}>{log.note || '—'}</td>
                    <td>
                      {log.screenshots?.length ? (
                        <a
                          href={log.screenshots[0]}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--accent-600)', fontWeight: 700, fontSize: '0.78rem', textDecoration: 'none' }}
                        >
                          View proof
                        </a>
                      ) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: '#059669' }}>
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
