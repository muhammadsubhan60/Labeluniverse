import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useVendorAuth } from '../../contexts/VendorAuthContext';
import {
  ArrowDownTrayIcon, CloudArrowUpIcon, CheckCircleIcon,
  XMarkIcon, ClockIcon, ArrowLeftIcon,
} from '@heroicons/react/24/outline';

const API = '';

const VendorJobDetail: React.FC = () => {
  const { id }      = useParams<{ id: string }>();
  const { token }   = useVendorAuth();
  const navigate    = useNavigate();
  const [job,       setJob]       = useState<any>(null);
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [file,      setFile]      = useState<File | null>(null);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');
  const [cooling,   setCooling]   = useState<number>(0); // seconds remaining

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchJob = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/vendor-portal/jobs/${id}`, { headers: authHeaders });
      setJob(data.job);
    } catch {
      setError('Job not found or access denied');
    } finally {
      setLoading(false);
    }
  }, [id, token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchJob(); }, [fetchJob]);

  // Cooling countdown
  useEffect(() => {
    if (job?.status === 'uploaded' && job?.resultFile?.coolingDeadline) {
      const tick = () => {
        const remaining = Math.max(0, Math.round((new Date(job.resultFile.coolingDeadline).getTime() - Date.now()) / 1000));
        setCooling(remaining);
        if (remaining === 0) fetchJob(); // refresh after cooling
      };
      tick();
      const iv = setInterval(tick, 1000);
      return () => clearInterval(iv);
    }
  }, [job?.status, job?.resultFile?.coolingDeadline, fetchJob]);

  const handleAccept = async () => {
    setError(''); setSuccess('');
    try {
      await axios.put(`${API}/vendor-portal/jobs/${id}/accept`, {}, { headers: authHeaders });
      setSuccess('Job accepted! Download the request file and generate labels.');
      fetchJob();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error accepting job');
    }
  };

  const handleUpload = async () => {
    if (!file) { setError('Please select a file'); return; }
    setUploading(true); setError(''); setSuccess('');
    try {
      const form = new FormData();
      form.append('file', file);
      await axios.post(`${API}/vendor-portal/jobs/${id}/upload`, form, {
        headers: { Authorization: `Bearer ${token}` },
        // Do NOT set Content-Type — axios auto-sets multipart/form-data with boundary
      });
      setSuccess('File uploaded! You have 1 minute to cancel if you find an error.');
      setFile(null);
      fetchJob();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleCancelUpload = async () => {
    setError(''); setSuccess('');
    try {
      await axios.delete(`${API}/vendor-portal/jobs/${id}/upload`, { headers: authHeaders });
      setSuccess('Upload cancelled. You can re-upload the corrected file.');
      fetchJob();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error cancelling upload');
    }
  };

  const [downloading, setDownloading] = useState(false);

  const handleDownloadRequest = async () => {
    setDownloading(true);
    setError('');
    try {
      const res = await axios.get(`${API}/vendor-portal/jobs/${id}/download-request`, {
        headers:      authHeaders,
        responseType: 'blob',
      });
      const filename = job?.requestFile?.originalName || `manifest-${id}.csv`;
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href  = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      // Error responses with responseType:'blob' are also Blobs — parse them as text first
      let message = 'Download failed';
      try {
        if (err?.response?.data instanceof Blob) {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          message = json.message || message;
        } else if (err?.response?.data?.message) {
          message = err.response.data.message;
        }
      } catch {}
      setError(message);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>;
  if (!job)    return <div style={{ padding: '2rem', color: '#dc2626' }}>{error || 'Job not found'}</div>;

  const statusConfig: Record<string, { label: string; color: string }> = {
    open:         { label: 'Open — Accept to Claim',   color: '#0891b2' },
    assigned:     { label: 'Claimed — Start Work',     color: '#d97706' },
    accepted:     { label: 'Accepted — Generate Labels', color: '#2563eb' },
    uploaded:     { label: 'Uploaded (Cooling Period)', color: '#7c3aed' },
    under_review: { label: 'Under Admin Review', color: '#6366f1' },
    completed:    { label: 'Completed', color: '#059669' },
    cancelled:    { label: 'Cancelled', color: '#dc2626' },
    rejected:     { label: 'Re-upload Required', color: '#ea580c' },
  };
  const sc = statusConfig[job.status] || { label: job.status, color: '#64748b' };

  return (
    <div style={{ padding: '2rem', maxWidth: 720 }}>
      {/* Back */}
      <button onClick={() => navigate('/vendor-portal/jobs')} className="btn btn-ghost btn-sm" style={{ marginBottom: 20 }}>
        <ArrowLeftIcon style={{ width: 15, height: 15 }} /> Back to Jobs
      </button>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Job #{job._id.slice(-8).toUpperCase()}
          </h1>
          <span style={{
            padding: '4px 12px', borderRadius: 99, fontSize: '0.78rem', fontWeight: 700,
            background: sc.color + '1a', color: sc.color,
          }}>
            {sc.label}
          </span>
        </div>
        <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 6 }}>
          Received: {new Date(job.createdAt).toLocaleString()}
        </p>
      </div>

      {/* Alerts */}
      {error   && <div className="alert alert-danger"   style={{ marginBottom: 16 }}>{error}</div>}
      {success && <div className="alert alert-success"  style={{ marginBottom: 16 }}>{success}</div>}

      {/* Details card */}
      <div className="sh-card" style={{ padding: '1.5rem', marginBottom: 20 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155', marginBottom: 14 }}>Job Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
          {[
            { label: 'Carrier',       value: job.carrier },
            { label: 'Labels',        value: job.requestFile?.labelCount ?? '—' },
            { label: 'Your Rate',     value: `$${(job.vendorEarning?.ratePerLabel ?? 0).toFixed(2)} / label` },
            { label: 'Your Earning',  value: `$${(job.vendorEarning?.totalAmount ?? 0).toFixed(2)}` },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ACTION: Open — claim job */}
      {job.status === 'open' && (
        <div className="sh-card" style={{ padding: '1.5rem', marginBottom: 20, borderLeft: '4px solid #0891b2' }}>
          <h3 style={{ fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Open Job — Be the First to Accept</h3>
          <p style={{ color: '#475569', fontSize: '0.875rem', marginBottom: 16 }}>
            This job is available for any {job.carrier} vendor. Accept it now to claim it and start generating labels.
          </p>
          <button onClick={handleAccept} className="btn btn-primary">
            <CheckCircleIcon style={{ width: 16, height: 16 }} /> Accept & Claim Job
          </button>
        </div>
      )}

      {/* ACTION: Assigned — start work */}
      {job.status === 'assigned' && (
        <div className="sh-card" style={{ padding: '1.5rem', marginBottom: 20, borderLeft: '4px solid #d97706' }}>
          <h3 style={{ fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Job Claimed — Ready to Work</h3>
          <p style={{ color: '#475569', fontSize: '0.875rem', marginBottom: 16 }}>
            You have claimed this job. Download the shipping data below, generate the labels, then upload the result.
          </p>
          <button onClick={handleDownloadRequest} disabled={downloading} className="btn btn-ghost">
            <ArrowDownTrayIcon style={{ width: 16, height: 16 }} />
            {downloading ? 'Downloading…' : `Download Request File (${job.requestFile?.labelCount} rows)`}
          </button>
        </div>
      )}

      {/* ACTION: Accepted or Rejected — download + upload */}
      {['assigned', 'accepted', 'rejected'].includes(job.status) && (
        <div className="sh-card" style={{ padding: '1.5rem', marginBottom: 20 }}>
          {job.status === 'rejected' && (
            <div className="alert alert-danger" style={{ marginBottom: 16 }}>
              <strong>Upload Rejected:</strong> {job.rejectionReason || 'Please review and re-upload'}
            </div>
          )}
          <h3 style={{ fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
            {job.status === 'rejected' ? 'Re-upload Labels' : 'Generate & Upload Labels'}
          </h3>
          <p style={{ color: '#475569', fontSize: '0.875rem', marginBottom: 16 }}>
            1. Download the request file below.<br/>
            2. Generate labels in your facility.<br/>
            3. Upload the completed labels (ZIP, PDF, or CSV).
          </p>

          {/* Download request file */}
          <button onClick={handleDownloadRequest} className="btn btn-ghost" style={{ marginBottom: 20 }}>
            <ArrowDownTrayIcon style={{ width: 16, height: 16 }} />
            Download Request File ({job.requestFile?.labelCount} rows)
          </button>

          {/* Upload result */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: 8 }}>
              Upload Generated Labels (ZIP / PDF / CSV)
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="file"
                accept=".zip,.pdf,.csv"
                onChange={e => setFile(e.target.files?.[0] || null)}
                style={{ flex: 1, minWidth: 200 }}
              />
              <button onClick={handleUpload} disabled={!file || uploading} className="btn btn-primary">
                <CloudArrowUpIcon style={{ width: 16, height: 16 }} />
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cooling period */}
      {job.status === 'uploaded' && cooling > 0 && (
        <div className="sh-card" style={{ padding: '1.5rem', marginBottom: 20, borderLeft: '4px solid #7c3aed' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <ClockIcon style={{ width: 20, height: 20, color: '#7c3aed' }} />
            <h3 style={{ fontWeight: 700, color: '#0f172a', margin: 0 }}>Cooling Period: {cooling}s remaining</h3>
          </div>
          <p style={{ color: '#475569', fontSize: '0.875rem', marginBottom: 14 }}>
            Found an error? Cancel now and re-upload the corrected file.
          </p>
          <button onClick={handleCancelUpload} className="btn btn-danger btn-sm">
            <XMarkIcon style={{ width: 15, height: 15 }} /> Cancel Upload
          </button>
        </div>
      )}

      {/* Cooling expired / under review */}
      {['under_review', 'uploaded'].includes(job.status) && cooling === 0 && (
        <div className="sh-card" style={{ padding: '1.25rem', borderLeft: '4px solid #6366f1' }}>
          <p style={{ fontSize: '0.875rem', color: '#475569', margin: 0 }}>
            Your file has been submitted and is under admin review. You will be notified of the outcome.
          </p>
        </div>
      )}

      {/* Completed */}
      {job.status === 'completed' && (
        <div className="sh-card" style={{ padding: '1.25rem', borderLeft: '4px solid #059669' }}>
          <p style={{ fontSize: '0.875rem', color: '#059669', fontWeight: 600, margin: 0 }}>
            ✓ Job completed. ${(job.vendorEarning?.totalAmount || 0).toFixed(2)} has been credited to your account.
          </p>
        </div>
      )}

      {/* Timeline */}
      {job.timeline?.length > 0 && (
        <div className="sh-card" style={{ padding: '1.5rem', marginTop: 20 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155', marginBottom: 14 }}>Timeline</h3>
          {[...job.timeline].reverse().map((t: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', marginTop: 6, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', textTransform: 'capitalize' }}>{t.status}</div>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{t.note}</div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>{new Date(t.timestamp).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VendorJobDetail;
