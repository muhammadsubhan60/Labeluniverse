import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  MegaphoneIcon, PlusIcon, PencilSquareIcon, TrashIcon,
  MapPinIcon, XMarkIcon, CheckIcon,
} from '@heroicons/react/24/outline';
import { MapPinIcon as MapPinSolid } from '@heroicons/react/24/solid';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Announcement {
  _id: string;
  title: string;
  content: string;
  category: 'general' | 'service' | 'pricing' | 'maintenance';
  isPinned: boolean;
  isActive: boolean;
  createdBy?: { firstName: string; lastName: string };
  createdAt: string;
}

// ── Category config ───────────────────────────────────────────────────────────
const CATEGORY: Record<string, { label: string; bg: string; color: string; border: string }> = {
  general:     { label: 'General',     bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  service:     { label: 'Service',     bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
  pricing:     { label: 'Pricing',     bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' },
  maintenance: { label: 'Maintenance', bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
};

// ── Modal ─────────────────────────────────────────────────────────────────────
interface ModalProps {
  initial?: Partial<Announcement>;
  onSave: (data: Partial<Announcement>) => Promise<void>;
  onClose: () => void;
}

const AnnouncementModal: React.FC<ModalProps> = ({ initial = {}, onSave, onClose }) => {
  const [form, setForm] = useState({
    title:    initial.title    ?? '',
    content:  initial.content  ?? '',
    category: initial.category ?? 'general',
    isPinned: initial.isPinned ?? false,
    isActive: initial.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setError('Title and content are required.');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
      padding: '1rem',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--navy-100)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--navy-900)' }}>
            {initial._id ? 'Edit Announcement' : 'New Announcement'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 4, borderRadius: 6 }}>
            <XMarkIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.4rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '0.6rem 0.9rem', fontSize: '0.8rem', color: '#DC2626' }}>
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy-700)', marginBottom: 4 }}>Title</label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Announcement title..."
              style={{
                width: '100%', padding: '0.55rem 0.8rem', borderRadius: 8,
                border: '1.5px solid var(--navy-200)', fontSize: '0.88rem',
                color: 'var(--navy-900)', outline: 'none', boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Content */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy-700)', marginBottom: 4 }}>Content</label>
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Write your announcement..."
              rows={4}
              style={{
                width: '100%', padding: '0.55rem 0.8rem', borderRadius: 8,
                border: '1.5px solid var(--navy-200)', fontSize: '0.88rem',
                color: 'var(--navy-900)', outline: 'none', resize: 'vertical',
                boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Category + Toggles */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy-700)', marginBottom: 4 }}>Category</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value as any }))}
                style={{
                  width: '100%', padding: '0.55rem 0.8rem', borderRadius: 8,
                  border: '1.5px solid var(--navy-200)', fontSize: '0.85rem',
                  color: 'var(--navy-800)', background: '#fff', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {Object.entries(CATEGORY).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 20 }}>
              {[
                { key: 'isPinned', label: 'Pin to top' },
                { key: 'isActive', label: 'Published' },
              ].map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <div
                    onClick={() => setForm(f => ({ ...f, [key]: !(f as any)[key] }))}
                    style={{
                      width: 36, height: 20, borderRadius: 99, position: 'relative', cursor: 'pointer',
                      background: (form as any)[key] ? '#3B82F6' : 'var(--navy-200)',
                      transition: 'background 0.18s',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: 2, left: (form as any)[key] ? 18 : 2,
                      width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      transition: 'left 0.18s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--navy-600)', fontWeight: 500 }}>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.4rem', borderTop: '1px solid var(--navy-100)',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1.1rem', borderRadius: 8, border: '1.5px solid var(--navy-200)',
              background: '#fff', fontSize: '0.83rem', fontWeight: 600, color: 'var(--navy-600)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none',
              background: '#2563EB', color: '#fff', fontSize: '0.83rem', fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {saving ? 'Saving…' : <><CheckIcon style={{ width: 15, height: 15 }} /> Save</>}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Announcement Card ─────────────────────────────────────────────────────────
const AnnouncementCard: React.FC<{
  item: Announcement;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}> = ({ item, isAdmin, onEdit, onDelete, onTogglePin }) => {
  const cat = CATEGORY[item.category] ?? CATEGORY.general;
  const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div style={{
      background: '#fff',
      border: `1.5px solid ${item.isPinned ? '#BFDBFE' : 'var(--navy-150, #e8edf5)'}`,
      borderRadius: 14, overflow: 'hidden',
      boxShadow: item.isPinned ? '0 0 0 3px rgba(59,130,246,0.07)' : 'none',
      opacity: item.isActive ? 1 : 0.55,
      transition: 'box-shadow 0.15s',
    }}>
      {/* Top accent stripe */}
      <div style={{
        height: 3,
        background: item.isPinned
          ? 'linear-gradient(90deg, #3B82F6, #6366f1)'
          : `${cat.color}55`,
      }} />

      <div style={{ padding: '1rem 1.25rem' }}>
        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            {/* Pin indicator */}
            {item.isPinned && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.68rem', fontWeight: 700, color: '#2563EB', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                <MapPinSolid style={{ width: 11, height: 11 }} /> Pinned
              </span>
            )}
            {/* Category badge */}
            <span style={{
              fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.05em',
              textTransform: 'uppercase', padding: '2px 9px', borderRadius: 99,
              background: cat.bg, color: cat.color, border: `1px solid ${cat.border}`,
            }}>
              {cat.label}
            </span>
            {!item.isActive && (
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94A3B8', background: '#F1F5F9', border: '1px solid #E2E8F0', padding: '2px 8px', borderRadius: 99, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Draft
              </span>
            )}
          </div>

          {/* Admin actions */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
              <button
                onClick={onTogglePin}
                title={item.isPinned ? 'Unpin' : 'Pin'}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
                  borderRadius: 7, color: item.isPinned ? '#2563EB' : 'var(--navy-400)',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-100)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <MapPinIcon style={{ width: 15, height: 15 }} />
              </button>
              <button
                onClick={onEdit}
                title="Edit"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
                  borderRadius: 7, color: 'var(--navy-400)', transition: 'background 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-100)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <PencilSquareIcon style={{ width: 15, height: 15 }} />
              </button>
              <button
                onClick={onDelete}
                title="Delete"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
                  borderRadius: 7, color: '#EF4444', transition: 'background 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <TrashIcon style={{ width: 15, height: 15 }} />
              </button>
            </div>
          )}
        </div>

        {/* Title */}
        <h3 style={{ fontSize: '0.97rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: '0.4rem', lineHeight: 1.3 }}>
          {item.title}
        </h3>

        {/* Content */}
        <p style={{ fontSize: '0.85rem', color: 'var(--navy-600)', lineHeight: 1.6, margin: 0 }}>
          {item.content}
        </p>

        {/* Footer */}
        <div style={{
          marginTop: '0.875rem', paddingTop: '0.75rem',
          borderTop: '1px solid var(--navy-100)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--navy-400)' }}>
            {item.createdBy ? `${item.createdBy.firstName} ${item.createdBy.lastName}` : 'LABEL UNIVERSE'}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--navy-400)', fontWeight: 500 }}>{date}</span>
        </div>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const API = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

const Announcements: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [items,   setItems]   = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState<{ open: boolean; item?: Announcement }>({ open: false });
  const [filter,  setFilter]  = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = isAdmin ? `${API}/announcements/all` : `${API}/announcements`;
      const token = localStorage.getItem('token');
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      setItems(res.data.announcements);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: Partial<Announcement>) => {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    if (modal.item?._id) {
      await axios.put(`${API}/announcements/${modal.item._id}`, data, { headers });
    } else {
      await axios.post(`${API}/announcements`, data, { headers });
    }
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this announcement?')) return;
    const token = localStorage.getItem('token');
    await axios.delete(`${API}/announcements/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    setItems(prev => prev.filter(a => a._id !== id));
  };

  const handleTogglePin = async (item: Announcement) => {
    const token = localStorage.getItem('token');
    const res = await axios.put(`${API}/announcements/${item._id}`, { isPinned: !item.isPinned }, { headers: { Authorization: `Bearer ${token}` } });
    setItems(prev => prev.map(a => a._id === item._id ? res.data.announcement : a));
  };

  const filtered = filter === 'all' ? items : items.filter(a => a.category === filter);
  const pinned   = filtered.filter(a => a.isPinned);
  const rest     = filtered.filter(a => !a.isPinned);
  const ordered  = [...pinned, ...rest];

  const categories = ['all', 'general', 'service', 'pricing', 'maintenance'];

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Announcements</h1>
          <p className="page-subtitle">Platform updates, service notices, and important information.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setModal({ open: true })}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0.55rem 1.1rem', borderRadius: 10,
              background: '#2563EB', color: '#fff', border: 'none',
              fontSize: '0.83rem', fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
            }}
          >
            <PlusIcon style={{ width: 16, height: 16 }} />
            New Announcement
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {categories.map(cat => {
          const cfg  = cat === 'all' ? null : CATEGORY[cat];
          const active = filter === cat;
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              style={{
                padding: '0.35rem 0.9rem', borderRadius: 99,
                border: `1.5px solid ${active ? (cfg?.border ?? '#BFDBFE') : 'var(--navy-200)'}`,
                background: active ? (cfg?.bg ?? '#EFF6FF') : '#fff',
                color: active ? (cfg?.color ?? '#1D4ED8') : 'var(--navy-500)',
                fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.12s', letterSpacing: '0.01em',
              }}
            >
              {cat === 'all' ? 'All' : CATEGORY[cat].label}
              {cat !== 'all' && (
                <span style={{ marginLeft: 5, opacity: 0.7 }}>
                  {items.filter(a => a.category === cat).length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner" />
        </div>
      ) : ordered.length === 0 ? (
        <div className="sh-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <MegaphoneIcon style={{ width: 40, height: 40, color: 'var(--navy-300)', margin: '0 auto 0.75rem' }} />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--navy-700)', marginBottom: 6 }}>
            No announcements yet
          </h3>
          <p style={{ fontSize: '0.83rem', color: 'var(--navy-400)' }}>
            {isAdmin ? 'Create the first announcement using the button above.' : 'Check back later for updates.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {ordered.map(item => (
            <AnnouncementCard
              key={item._id}
              item={item}
              isAdmin={isAdmin}
              onEdit={() => setModal({ open: true, item })}
              onDelete={() => handleDelete(item._id)}
              onTogglePin={() => handleTogglePin(item)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal.open && (
        <AnnouncementModal
          initial={modal.item}
          onSave={handleSave}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  );
};

export default Announcements;
