import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ClipboardDocumentIcon, ArrowDownTrayIcon, CheckCircleIcon,
  XMarkIcon, SparklesIcon, ArrowRightIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

// ── Constants ─────────────────────────────────────────────────
const VALID_STATUSES = [
  'Not Scanned Yet', 'In Transit', 'Out for Delivery', 'Delivered',
  'Exception / Problem', 'Returned to Sender', 'Pending Pickup', 'Delayed',
];

const STATUS_NORMALIZE: Record<string, string> = {
  'not scanned yet': 'Not Scanned Yet', 'not_scanned_yet': 'Not Scanned Yet',
  'not scanned': 'Not Scanned Yet', 'not_scanned': 'Not Scanned Yet',
  'in transit': 'In Transit', 'in_transit': 'In Transit', 'intransit': 'In Transit',
  'out for delivery': 'Out for Delivery', 'out_for_delivery': 'Out for Delivery',
  'delivered': 'Delivered',
  'exception / problem': 'Exception / Problem', 'exception/problem': 'Exception / Problem',
  'exception_problem': 'Exception / Problem', 'exception problem': 'Exception / Problem',
  'exception': 'Exception / Problem',
  'returned to sender': 'Returned to Sender', 'returned_to_sender': 'Returned to Sender',
  'return to sender': 'Returned to Sender', 'return_to_sender': 'Returned to Sender',
  'pending pickup': 'Pending Pickup', 'pending_pickup': 'Pending Pickup',
  'delayed': 'Delayed',
};

const PROMPT_TEMPLATE = `You are a shipping tracking status classifier. Given USPS tracking information, classify each tracking number into exactly one of the valid statuses.

Return ONLY a CSV with two columns: tracking_number,status
No headers, no explanation, no markdown — raw CSV rows only.

Valid status values (copy exactly as written):
${VALID_STATUSES.map(s => `- ${s}`).join('\n')}

Tracking data to classify:
[PASTE YOUR TRACKING DATA BELOW — then send to ChatGPT]`;

// ── Status colours for preview breakdown ──────────────────────
const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  'Not Scanned Yet':    { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
  'In Transit':         { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  'Out for Delivery':   { bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE' },
  'Delivered':          { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
  'Exception / Problem':{ bg: '#FFF5F5', color: '#DC2626', border: '#FECACA' },
  'Returned to Sender': { bg: '#FFF1F2', color: '#BE123C', border: '#FECDD3' },
  'Pending Pickup':     { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  'Delayed':            { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
};

// ── CSV helpers ───────────────────────────────────────────────
interface ParsedRow { trackingId: string; rawStatus: string; normalizedStatus: string | null; valid: boolean }

function parseCsv(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const lines = text.trim().split(/\r?\n/);
  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length < 2) continue;
    const trackingId   = parts[0].trim().replace(/^["']|["']$/g, '');
    const rawStatus    = parts.slice(1).join(',').trim().replace(/^["']|["']$/g, '');
    const key          = rawStatus.toLowerCase().replace(/\s+/g, ' ').trim();
    const normalizedStatus = STATUS_NORMALIZE[key] ?? null;
    if (trackingId) rows.push({ trackingId, rawStatus, normalizedStatus, valid: !!normalizedStatus && !!trackingId });
  }
  return rows;
}

function downloadCsv(rows: string[], filename: string) {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ── Step indicator ────────────────────────────────────────────
const StepDot: React.FC<{ n: number; label: string; active: boolean; done: boolean }> = ({ n, label, active, done }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      background: done ? '#22C55E' : active ? '#6366f1' : 'var(--navy-100)',
      color: done || active ? '#fff' : 'var(--navy-400)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: '0.85rem',
      boxShadow: active ? '0 0 0 4px #6366f120' : 'none',
      transition: 'all 0.25s',
    }}>
      {done ? <CheckCircleIcon style={{ width: 18, height: 18 }} /> : n}
    </div>
    <span style={{ fontSize: '0.65rem', fontWeight: active ? 700 : 500, color: active ? '#4F46E5' : 'var(--navy-400)', whiteSpace: 'nowrap' }}>{label}</span>
  </div>
);

// ── Main component ────────────────────────────────────────────
const BulkTrackingUpdate: React.FC = () => {
  const navigate = useNavigate();
  const [step,       setStep]       = useState<1 | 2 | 3>(1);
  const [csvText,    setCsvText]    = useState('');
  const [rows,       setRows]       = useState<ParsedRow[]>([]);
  const [copied,     setCopied]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result,     setResult]     = useState<{ updated: number; alreadySame: number; notFound: string[]; invalid: string[] } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const copyPrompt = () => {
    navigator.clipboard.writeText(PROMPT_TEMPLATE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleParseCsv = () => {
    const parsed = parseCsv(csvText);
    if (parsed.length === 0) return;
    setRows(parsed);
    setStep(3);
  };

  const validRows   = rows.filter(r => r.valid);
  const invalidRows = rows.filter(r => !r.valid);

  const handleConfirm = async () => {
    if (validRows.length === 0) return;
    setSubmitting(true);
    try {
      const updates = validRows.map(r => ({ trackingId: r.trackingId, status: r.normalizedStatus! }));
      const res = await axios.post('/labels/bulk-status-by-tracking', { updates });
      setResult(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep(1); setCsvText(''); setRows([]); setResult(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 860, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(99,102,241,0.3)', flexShrink: 0 }}>
            <SparklesIcon style={{ width: 22, height: 22, color: '#fff' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--navy-900)', margin: 0, letterSpacing: '-0.02em' }}>AI Bulk Tracking Update</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--navy-500)', margin: '2px 0 0' }}>
              Use ChatGPT to classify tracking data, then apply statuses in bulk
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/labels/history')}
          style={{ height: 34, display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', border: '1.5px solid var(--navy-200)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--navy-600)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
          ← Back to Labels
        </button>
      </div>

      {/* Step indicator */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1.5px solid var(--navy-200)', padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
          <StepDot n={1} label="Copy Prompt"  active={step === 1} done={step > 1} />
          <div style={{ flex: 1, height: 2, background: step > 1 ? '#22C55E' : 'var(--navy-100)', marginTop: 17, transition: 'background 0.3s' }} />
          <StepDot n={2} label="Paste CSV"    active={step === 2} done={step > 2} />
          <div style={{ flex: 1, height: 2, background: step > 2 ? '#22C55E' : 'var(--navy-100)', marginTop: 17, transition: 'background 0.3s' }} />
          <StepDot n={3} label="Preview & Apply" active={step === 3} done={!!result} />
        </div>
      </div>

      {/* ── Step 1: Prompt ── */}
      {step === 1 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1.5px solid var(--navy-200)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)' }}>Step 1 — Copy the prompt</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)', marginTop: 2 }}>
                Copy this prompt, then open ChatGPT, paste it, add your tracking data at the bottom, and send.
              </div>
            </div>
            <button
              onClick={copyPrompt}
              style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', border: `1.5px solid ${copied ? '#BBF7D0' : '#6366f1'}`, borderRadius: 8, background: copied ? '#F0FDF4' : '#6366f1', color: copied ? '#15803D' : '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
              {copied ? <CheckCircleIcon style={{ width: 14, height: 14 }} /> : <ClipboardDocumentIcon style={{ width: 14, height: 14 }} />}
              {copied ? 'Copied!' : 'Copy Prompt'}
            </button>
          </div>
          <pre style={{ margin: 0, padding: '1rem 1.25rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--navy-700)', background: 'var(--navy-50)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.7, maxHeight: 340, overflowY: 'auto' }}>
            {PROMPT_TEMPLATE}
          </pre>
          <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--navy-100)', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setStep(2)}
              style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6, padding: '0 18px', border: 'none', borderRadius: 8, background: '#6366f1', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
              Next: Paste CSV <ArrowRightIcon style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Paste CSV ── */}
      {step === 2 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1.5px solid var(--navy-200)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--navy-100)' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)' }}>Step 2 — Paste ChatGPT's CSV output</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)', marginTop: 2 }}>
              ChatGPT will return a CSV like: <code style={{ background: 'var(--navy-100)', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace' }}>9400111202555842890900,In Transit</code>
            </div>
          </div>
          <div style={{ padding: '1rem 1.25rem' }}>
            <textarea
              ref={textareaRef}
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder={'9400111202555842890900,In Transit\n9400111202555842890901,Delivered\n9400111202555842890902,Exception / Problem'}
              rows={10}
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '10px 12px', border: '1.5px solid var(--navy-200)', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--navy-800)', outline: 'none', background: 'var(--navy-50)', lineHeight: 1.6 }}
              onFocus={e => (e.target.style.borderColor = '#6366f1')}
              onBlur={e => (e.target.style.borderColor = 'var(--navy-200)')}
            />
            <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 4 }}>
              {csvText.trim() ? `${csvText.trim().split('\n').filter(l => l.trim()).length} rows detected` : 'Paste the raw CSV from ChatGPT above'}
            </div>
          </div>
          <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--navy-100)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setStep(1)} style={{ height: 36, padding: '0 14px', border: '1.5px solid var(--navy-200)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--navy-600)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>← Back</button>
            <button
              onClick={handleParseCsv}
              disabled={!csvText.trim()}
              style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6, padding: '0 18px', border: 'none', borderRadius: 8, background: csvText.trim() ? '#6366f1' : '#94A3B8', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: csvText.trim() ? 'pointer' : 'not-allowed' }}>
              Parse & Preview <ArrowRightIcon style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Preview ── */}
      {step === 3 && !result && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1.5px solid var(--navy-200)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)' }}>Step 3 — Preview & Apply</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)', marginTop: 2 }}>
                Review the parsed rows. Valid rows will be applied; invalid rows are skipped.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8 }}>
                <CheckCircleIcon style={{ width: 13, height: 13, color: '#15803D' }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#15803D' }}>{validRows.length} valid</span>
              </div>
              {invalidRows.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: 8 }}>
                  <ExclamationTriangleIcon style={{ width: 13, height: 13, color: '#DC2626' }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#DC2626' }}>{invalidRows.length} invalid</span>
                </div>
              )}
            </div>
          </div>

          {/* Status count breakdown */}
          {(() => {
            const counts: Record<string, number> = {};
            for (const r of validRows) {
              const s = r.normalizedStatus!;
              counts[s] = (counts[s] || 0) + 1;
            }
            const entries = VALID_STATUSES.filter(s => counts[s] > 0);
            if (entries.length === 0) return null;
            return (
              <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {entries.map(s => {
                  const st = STATUS_STYLE[s] ?? STATUS_STYLE['Not Scanned Yet'];
                  return (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: st.bg, border: `1.5px solid ${st.border}`, borderRadius: 20 }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: st.color }}>{s}</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: st.color, background: st.border, borderRadius: 99, padding: '1px 6px', lineHeight: 1.4 }}>{counts[s]}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Preview table */}
          <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                <tr style={{ background: 'var(--navy-50)' }}>
                  {['#', 'Tracking Number', 'Raw Status from GPT', 'Normalized Status', 'Valid?'].map(h => (
                    <th key={h} style={{ padding: '0.5rem 0.875rem', textAlign: 'left', fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1.5px solid var(--navy-200)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--navy-100)', background: row.valid ? 'transparent' : '#FFF5F5' }}>
                    <td style={{ padding: '0.5rem 0.875rem', color: '#CBD5E1', fontSize: '0.7rem', fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ padding: '0.5rem 0.875rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--navy-700)' }}>{row.trackingId}</td>
                    <td style={{ padding: '0.5rem 0.875rem', color: 'var(--navy-600)' }}>{row.rawStatus}</td>
                    <td style={{ padding: '0.5rem 0.875rem' }}>
                      {row.normalizedStatus
                        ? <span style={{ background: '#EEF2FF', color: '#4F46E5', borderRadius: 20, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700 }}>{row.normalizedStatus}</span>
                        : <span style={{ color: '#DC2626', fontSize: '0.7rem' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.5rem 0.875rem' }}>
                      {row.valid
                        ? <CheckCircleIcon style={{ width: 15, height: 15, color: '#22C55E' }} />
                        : <XMarkIcon style={{ width: 15, height: 15, color: '#EF4444' }} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '0.875rem 1.25rem', borderTop: '1px solid var(--navy-100)', display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setStep(2)} style={{ height: 36, padding: '0 14px', border: '1.5px solid var(--navy-200)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--navy-600)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>← Edit CSV</button>
            <button
              onClick={handleConfirm}
              disabled={validRows.length === 0 || submitting}
              style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6, padding: '0 20px', border: 'none', borderRadius: 8, background: validRows.length === 0 || submitting ? '#94A3B8' : '#059669', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: validRows.length === 0 || submitting ? 'not-allowed' : 'pointer' }}>
              {submitting ? 'Applying…' : `Apply ${validRows.length} Updates`}
              {!submitting && <CheckCircleIcon style={{ width: 14, height: 14 }} />}
            </button>
          </div>
        </div>
      )}

      {/* ── Result ── */}
      {result && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1.5px solid #BBF7D0', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircleIcon style={{ width: 22, height: 22, color: '#22C55E', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#15803D' }}>Bulk update complete</div>
              <div style={{ fontSize: '0.72rem', color: '#16A34A', marginTop: 1 }}>Statuses have been updated and recorded in history.</div>
            </div>
          </div>
          <div style={{ padding: '1.25rem 1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
            {[
              { label: 'Updated',       value: result.updated,      bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
              { label: 'Already Same',  value: result.alreadySame,  bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
              { label: 'Not Found',     value: result.notFound.length, bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
              { label: 'Invalid Status',value: result.invalid.length,  bg: '#FFF5F5', color: '#DC2626', border: '#FECACA' },
            ].map(c => (
              <div key={c.label} style={{ background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 10, padding: '0.875rem 1rem' }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.value}</div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: c.color, opacity: 0.75, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</div>
              </div>
            ))}
          </div>

          {result.notFound.length > 0 && (
            <div style={{ padding: '0 1.5rem 1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400E', marginBottom: 4 }}>
                {result.notFound.length} tracking number{result.notFound.length > 1 ? 's' : ''} not found in system:
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#78350F', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 10px', maxHeight: 100, overflowY: 'auto' }}>
                {result.notFound.join('\n')}
              </div>
              <button
                onClick={() => downloadCsv(result.notFound, 'not_found_tracking.csv')}
                style={{ marginTop: 6, height: 30, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 12px', border: '1.5px solid #FDE68A', borderRadius: 7, background: '#FFFBEB', color: '#92400E', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
                <ArrowDownTrayIcon style={{ width: 12, height: 12 }} /> Download Not-Found CSV
              </button>
            </div>
          )}

          <div style={{ padding: '0.875rem 1.5rem', borderTop: '1px solid var(--navy-100)', display: 'flex', gap: 8 }}>
            <button onClick={reset} style={{ height: 34, padding: '0 16px', border: '1.5px solid var(--navy-200)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--navy-600)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
              Run Another Batch
            </button>
            <button onClick={() => navigate('/labels/history')} style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: '#6366f1', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
              View Label History →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkTrackingUpdate;
