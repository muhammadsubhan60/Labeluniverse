import React, { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  UserPlusIcon, PencilIcon, TrashIcon, EyeIcon,
  MagnifyingGlassIcon, UserGroupIcon, XMarkIcon,
  CheckCircleIcon, ExclamationCircleIcon, ScaleIcon,
  BanknotesIcon, CurrencyDollarIcon, PhotoIcon,
  ArrowUpTrayIcon, ArrowDownTrayIcon, AdjustmentsHorizontalIcon,
  PlusIcon, ChevronDownIcon, ChevronUpIcon, ShieldCheckIcon,
  Bars3Icon, Squares2X2Icon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

const inp: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.75rem',
  background: 'var(--navy-50)', border: '1.5px solid var(--navy-200)',
  borderRadius: 8, color: 'var(--navy-900)', fontSize: '0.84rem',
  fontFamily: FONT, outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.18s, box-shadow 0.18s',
};
const lbl: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-500)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  marginBottom: 5, display: 'block', fontFamily: FONT,
};

const _API_BASE = (process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api')).replace(/\/api\/?$/, '');
const toAbsUrl = (p: string) => p.startsWith('http') ? p : `${_API_BASE}${p}`;

interface User {
  id: string; firstName: string; lastName: string; email: string;
  role: 'admin' | 'reseller' | 'user'; isActive: boolean; createdAt: string; ccAccess?: boolean;
  hasPassword?: boolean; lastLogin?: string;
  totalLabels?: number; totalRevenue?: number; profit?: number; currentBalance?: number;
  clients?: string[];
}
interface RateTier { minLbs: number; maxLbs: number | null; rate: number; }
interface VendorAccess {
  vendorId: string; vendorName: string; carrier: string;
  vendorType: 'api' | 'manifest';
  shippingService: string; baseRate: number; isAllowed: boolean; rateTiers: RateTier[];
  portal?: 'shippershub' | 'labelcrow' | 'shiplabel';
}
interface Balance {
  currentBalance: number;
  recentTransactions: Array<{ type: string; amount: number; description: string; createdAt: string }>;
}
interface Wallet {
  _id: string; name: string; description: string; isActive: boolean;
}
interface PaymentLog {
  _id: string; amount: number; date: string; note: string;
  screenshots: string[];
  loggedBy?: { firstName: string; lastName: string };
  wallet?: { _id: string; name: string } | null;
}
type ActiveTab = 'edit' | 'balance' | 'tiers';
type BalAction = '' | 'topup' | 'deduct' | 'adjust';

const CARRIERS_ORDER = ['USPS', 'UPS', 'FedEx', 'DHL'];

const CARRIER_BG: Record<string, { border: string; headerBg: string }> = {
  USPS:  { border: 'rgba(0,75,135,0.22)',  headerBg: 'rgba(0,75,135,0.07)'  },
  UPS:   { border: 'rgba(75,20,0,0.22)',   headerBg: 'rgba(75,20,0,0.08)'   },
  FedEx: { border: 'rgba(77,20,140,0.22)', headerBg: 'rgba(77,20,140,0.07)' },
  DHL:   { border: 'rgba(212,5,17,0.22)',  headerBg: 'rgba(255,204,0,0.18)' },
};

const CarrierBadge: React.FC<{ carrier: string }> = ({ carrier }) => {
  const base: React.CSSProperties = { fontWeight: 900, fontSize: '0.78rem', letterSpacing: '0.07em', padding: '3px 8px', borderRadius: 5, display: 'inline-flex', alignItems: 'center' };
  if (carrier === 'FedEx') return <span style={{ fontWeight: 900, fontSize: '0.88rem' }}><span style={{ color: '#4D148C' }}>Fed</span><span style={{ color: '#FF6600' }}>Ex</span></span>;
  const s: Record<string, React.CSSProperties> = {
    USPS: { background: '#004B87', color: '#fff' },
    UPS:  { background: '#4B1400', color: '#FFB500' },
    DHL:  { background: '#FFCC00', color: '#D40511' },
  };
  return <span style={{ ...base, ...(s[carrier] || { background: '#334155', color: '#fff' }) }}>{carrier}</span>;
};

const roleStyle: Record<string, { color: string; bg: string; border: string; avatarGrad: string }> = {
  admin:    { color: '#dc2626', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)',   avatarGrad: 'linear-gradient(135deg,#ef4444,#dc2626)' },
  reseller: { color: '#6366f1', bg: 'rgba(99,102,241,0.1)',  border: 'rgba(99,102,241,0.25)',  avatarGrad: 'linear-gradient(135deg,#6366f1,#4f46e5)' },
  user:     { color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)',  avatarGrad: 'linear-gradient(135deg,#64748b,#475569)' },
};

const RoleChip: React.FC<{ role: string }> = ({ role }) => {
  const s = roleStyle[role] ?? roleStyle.user;
  return (
    <span style={{ padding: '2px 7px', borderRadius: 99, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontFamily: FONT }}>
      {role}
    </span>
  );
};

const PendingBadge: React.FC = () => (
  <span style={{ padding: '2px 7px', borderRadius: 99, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'rgba(245,158,11,0.1)', color: '#d97706', border: '1px solid rgba(245,158,11,0.25)', fontFamily: FONT }}>
    Pending invite
  </span>
);

const txColor = (t: string) =>
  ({ topup: '#10b981', deduction: '#ef4444', adjustment: '#3b82f6' }[t] ?? 'var(--navy-600)');
const txDot = (t: string) =>
  ({ topup: '#10b981', deduction: '#ef4444', adjustment: '#3b82f6' }[t] ?? '#94a3b8');

const UserManagement: React.FC = () => {
  const { user: authUser } = useAuth();
  const navigate = useNavigate();

  const fetchingForRef = React.useRef<string | null>(null);

  const [users,        setUsers]        = useState<User[]>([]);
  const [loadingList,  setLoadingList]  = useState(true);
  const [searchTerm,   setSearchTerm]   = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter,   setRoleFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage,  setCurrentPage]  = useState(1);
  const [totalPages,   setTotalPages]   = useState(1);
  const [totalCount,   setTotalCount]   = useState(0);

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isCreating,   setIsCreating]   = useState(false);
  const [createMode,   setCreateMode]   = useState<'password' | 'invite'>('password');
  const [activeTab,    setActiveTab]    = useState<ActiveTab>('edit');
  const [viewMode,     setViewMode]     = useState<'panel' | 'list'>('panel');

  const blank: { firstName: string; lastName: string; email: string; password: string; role: 'admin' | 'reseller' | 'user'; source: string } = { firstName: '', lastName: '', email: '', password: '', role: 'user', source: '' };
  const [userForm,    setUserForm]    = useState(blank);
  const [submitting,  setSubmitting]  = useState(false);

  const [resetPwd,     setResetPwd]     = useState('');
  const [resettingPwd, setResettingPwd] = useState(false);
  const [reinviting,   setReinviting]   = useState(false);

  const [balance,      setBalance]      = useState<Balance | null>(null);
  const [loadingBal,   setLoadingBal]   = useState(false);
  const [balAction,    setBalAction]    = useState<BalAction>('');
  const [actionAmt,    setActionAmt]    = useState('');
  const [actionDesc,   setActionDesc]   = useState('');
  const [processingBal,setProcessingBal]= useState(false);
  const [showAllTx,    setShowAllTx]    = useState(false);

  const [wallets, setWallets]   = useState<Wallet[]>([]);

  const [payLogs,       setPayLogs]      = useState<PaymentLog[]>([]);
  const [totalPaid,     setTotalPaid]    = useState(0);
  const [showPayForm,   setShowPayForm]  = useState(false);
  const [editPayLog,    setEditPayLog]   = useState<PaymentLog | null>(null);
  const [payAmt,        setPayAmt]       = useState('');
  const [payDate,       setPayDate]      = useState(new Date().toISOString().slice(0, 10));
  const [payNote,       setPayNote]      = useState('');
  const [payWallet,     setPayWallet]    = useState('');
  const [payFiles,      setPayFiles]     = useState<File[]>([]);
  const [payRemove,     setPayRemove]    = useState<string[]>([]);
  const [savingPay,     setSavingPay]    = useState(false);
  const payFileRef = useRef<HTMLInputElement>(null);

  const [access,        setAccess]       = useState<VendorAccess[]>([]);
  const [loadingTiers,  setLoadingTiers] = useState(false);
  const [savingTiers,   setSavingTiers]  = useState(false);
  const [expandedCarriers, setExpandedCarriers] = useState<Record<string, boolean>>({});
  const [expandedPortals,  setExpandedPortals]  = useState<Record<string, boolean>>({});
  const [expandedV,        setExpandedV]        = useState<Record<string, boolean>>({});

  const [addingForCarrier,  setAddingForCarrier]  = useState('');
  const [newVendorName,     setNewVendorName]     = useState('');
  const [savingVendor,      setSavingVendor]      = useState(false);
  const [editingVendorId,   setEditingVendorId]   = useState('');
  const [editingVendorName, setEditingVendorName] = useState('');

  const [message, setMessage] = useState('');
  const [error,   setError]   = useState('');

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchTerm); setCurrentPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => { fetchUsers(); }, [currentPage, roleFilter, statusFilter, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchWallets(); }, []);

  useEffect(() => {
    if (!selectedUser || isCreating) return;
    if (activeTab === 'balance') {
      fetchingForRef.current = selectedUser.id;
      fetchBalance(selectedUser.id);
      fetchPayLogs(selectedUser.id);
    }
    if (activeTab === 'tiers') fetchTiers(selectedUser.id);
  }, [activeTab, selectedUser]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (message || error) {
      const t = setTimeout(() => { setMessage(''); setError(''); }, 4000);
      return () => clearTimeout(t);
    }
  }, [message, error]);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  if (authUser?.role !== 'admin') return <Navigate to="/dashboard" replace />;

  // ── API calls ────────────────────────────────────────────────
  const fetchUsers = async () => {
    setLoadingList(true);
    try {
      const p = new URLSearchParams({ page: String(currentPage), limit: '20' });
      if (roleFilter)     p.append('role', roleFilter);
      if (statusFilter)   p.append('isActive', statusFilter);
      if (debouncedSearch) p.append('search', debouncedSearch);
      const res = await axios.get(`/users?${p}`);
      setUsers(res.data.users);
      setTotalPages(res.data.totalPages);
      setTotalCount(res.data.total);
    } catch (e) { console.error(e); }
    finally { setLoadingList(false); }
  };

  const fetchWallets = async () => {
    try {
      const res = await axios.get('/wallets');
      setWallets(res.data.wallets || []);
    } catch {}
  };

  const fetchBalance = async (id: string) => {
    setLoadingBal(true);
    try {
      const res = await axios.get(`/balance/${id}`);
      if (fetchingForRef.current === id) setBalance(res.data);
    } catch {}
    finally { setLoadingBal(false); }
  };

  const fetchPayLogs = async (id: string) => {
    try {
      const res = await axios.get(`/payment-logs/${id}`);
      if (fetchingForRef.current !== id) return;
      setPayLogs(res.data.logs || []);
      setTotalPaid(res.data.totalPaid || 0);
    } catch {}
  };

  const openPayForm = (log?: PaymentLog) => {
    setEditPayLog(log ?? null);
    setPayAmt(log ? String(log.amount) : '');
    setPayDate(log ? log.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setPayNote(log?.note ?? '');
    setPayWallet(log?.wallet?._id ?? '');
    setPayFiles([]);
    setPayRemove([]);
    setShowPayForm(true);
  };

  const submitPayLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSavingPay(true);
    try {
      const fd = new FormData();
      fd.append('userId', selectedUser.id);
      fd.append('amount', payAmt);
      fd.append('date', payDate);
      fd.append('note', payNote);
      if (payWallet) fd.append('walletId', payWallet);
      payFiles.forEach(f => fd.append('screenshots', f));
      payRemove.forEach(u => fd.append('removeScreenshots', u));
      if (editPayLog) {
        await axios.put(`/payment-logs/${editPayLog._id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await axios.post('/payment-logs', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      setShowPayForm(false);
      fetchPayLogs(selectedUser.id);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Save failed');
    } finally { setSavingPay(false); }
  };

  const deletePayLog = async (id: string) => {
    if (!selectedUser || !window.confirm('Delete this payment entry?')) return;
    try {
      await axios.delete(`/payment-logs/${id}`);
      fetchPayLogs(selectedUser.id);
    } catch {}
  };

  const fetchTiers = async (id: string) => {
    setLoadingTiers(true);
    try {
      const res = await axios.get(`/access/${id}`);
      setAccess(res.data.access);
    } catch {}
    finally { setLoadingTiers(false); }
  };

  const selectUser = (u: User) => {
    fetchingForRef.current = u.id;
    setSelectedUser(u);
    setUserForm({ firstName: u.firstName, lastName: u.lastName, email: u.email, password: '', role: u.role, source: (u as any).source || '' });
    setIsCreating(false);
    setActiveTab('edit');
    setBalAction('');
    setResetPwd('');
    setShowPayForm(false);
    setBalance(null);
    setShowAllTx(false);
    setPayLogs([]);
    setTotalPaid(0);
  };

  const startCreate = () => {
    setIsCreating(true);
    setCreateMode('password');
    setSelectedUser(null);
    setUserForm(blank);
    setActiveTab('edit');
  };

  const startInvite = () => {
    setIsCreating(true);
    setCreateMode('invite');
    setSelectedUser(null);
    setUserForm(blank);
    setActiveTab('edit');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setError('');
    try {
      if (createMode === 'invite') {
        await axios.post('/users/invite', { firstName: userForm.firstName, lastName: userForm.lastName, email: userForm.email, role: userForm.role, source: userForm.source || null });
        setMessage('Invite sent');
      } else {
        await axios.post('/users', userForm);
        setMessage('User created');
      }
      setIsCreating(false); setUserForm(blank); fetchUsers();
    } catch (err: any) { setError(err.response?.data?.message || (createMode === 'invite' ? 'Failed to send invite' : 'Failed to create')); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSubmitting(true); setError('');
    try {
      await axios.put(`/users/${selectedUser.id}`, {
        firstName: userForm.firstName, lastName: userForm.lastName,
        email: userForm.email, role: userForm.role, source: userForm.source || null,
      });
      setMessage('Saved');
      setSelectedUser(prev => prev ? { ...prev, ...userForm } : null);
      fetchUsers();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to update'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (u: User) => {
    if (!window.confirm(`Delete ${u.firstName} ${u.lastName}?`)) return;
    try {
      await axios.delete(`/users/${u.id}`);
      setMessage('User deleted');
      if (selectedUser?.id === u.id) { setSelectedUser(null); setIsCreating(false); }
      fetchUsers();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed'); }
  };

  const handleToggleStatus = async (u: User) => {
    try {
      await axios.put(`/users/${u.id}`, { isActive: !u.isActive });
      setMessage(`User ${!u.isActive ? 'activated' : 'deactivated'}`);
      fetchUsers();
      if (selectedUser?.id === u.id) setSelectedUser({ ...u, isActive: !u.isActive });
    } catch (err: any) { setError(err.response?.data?.message || 'Failed'); }
  };

  const handleToggleCC = async (u: User) => {
    try {
      const r = await axios.patch(`/users/${u.id}/cc-access`);
      setMessage(`CC access ${r.data.ccAccess ? 'granted' : 'revoked'}`);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ccAccess: r.data.ccAccess } : x));
      if (selectedUser?.id === u.id) setSelectedUser({ ...u, ccAccess: r.data.ccAccess });
    } catch { setMessage('Failed to update CC access'); }
  };

  const handleReinvite = async (u: User) => {
    setReinviting(true);
    try {
      await axios.post(`/users/${u.id}/reinvite`);
      setMessage('Invite resent');
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to resend invite'); }
    finally { setReinviting(false); }
  };

  const doBalanceAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !balAction) return;
    setProcessingBal(true);
    try {
      const ep = { topup: '/balance/topup', deduct: '/balance/deduct', adjust: '/balance/adjust' }[balAction]!;
      await axios.post(ep, { userId: selectedUser.id, amount: parseFloat(actionAmt), description: actionDesc || `${balAction} by ${authUser?.firstName}` });
      setMessage('Balance updated');
      setBalAction(''); setActionAmt(''); setActionDesc('');
      fetchBalance(selectedUser.id);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed'); }
    finally { setProcessingBal(false); }
  };

  const saveTiers = async () => {
    if (!selectedUser) return;
    setSavingTiers(true);
    try {
      const records = access.map(v => ({ vendorId: v.vendorId, carrier: v.carrier, isAllowed: v.isAllowed, rateTiers: v.rateTiers }));
      await axios.put(`/access/${selectedUser.id}/bulk/save`, { records });
      setMessage('Rate tiers saved');
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save'); }
    finally { setSavingTiers(false); }
  };

  const updateTierField = (vendorId: string, ti: number, field: string, val: any) =>
    setAccess(a => a.map(v => v.vendorId !== vendorId ? v : {
      ...v, rateTiers: v.rateTiers.map((t, i) => i === ti ? { ...t, [field]: val } : t)
    }));

  const addManifestVendor = async (carrier: string) => {
    if (!newVendorName.trim()) return;
    setSavingVendor(true);
    try {
      await axios.post('/vendors', { name: newVendorName.trim(), carrier, rate: 0, vendorType: 'manifest', source: 'manual' });
      setNewVendorName(''); setAddingForCarrier('');
      if (selectedUser) fetchTiers(selectedUser.id);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to add vendor'); }
    finally { setSavingVendor(false); }
  };

  const saveManifestVendorName = async (vendorId: string) => {
    if (!editingVendorName.trim()) return;
    try {
      await axios.put(`/vendors/${vendorId}`, { name: editingVendorName.trim(), vendorType: 'manifest' });
      setEditingVendorId('');
      if (selectedUser) fetchTiers(selectedUser.id);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to update vendor'); }
  };

  const deleteManifestVendor = async (vendorId: string, vendorName: string) => {
    if (!window.confirm(`Delete vendor "${vendorName}"? This will remove all rate tiers for this vendor.`)) return;
    try {
      await axios.delete(`/vendors/${vendorId}`);
      if (selectedUser) fetchTiers(selectedUser.id);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to delete vendor'); }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !resetPwd) return;
    setResettingPwd(true);
    try {
      await axios.post(`/users/${selectedUser.id}/reset-password`, { password: resetPwd });
      setMessage('Password reset successfully');
      setResetPwd('');
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to reset password'); }
    finally { setResettingPwd(false); }
  };

  const filtered = users.filter(u =>
    `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const fmt = (v?: number) => `$${(v ?? 0).toFixed(2)}`;
  const hasActiveFilters = !!(searchTerm || roleFilter || statusFilter);
  const clearFilters = () => { setSearchTerm(''); setDebouncedSearch(''); setRoleFilter(''); setStatusFilter(''); setCurrentPage(1); };

  const focusInp = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    Object.assign(e.currentTarget.style, { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99,102,241,0.12)' });
  const blurInp = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    Object.assign(e.currentTarget.style, { borderColor: 'var(--navy-200)', boxShadow: 'none' });

  // ── Render ──────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* ── Compact page header ───────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--navy-900)', letterSpacing: '-0.5px', fontFamily: FONT, margin: 0 }}>
              User Management
            </h1>
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', padding: '2px 7px', borderRadius: 99, fontFamily: FONT }}>Admin</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
            {[
              { label: 'Total',     value: users.length,                                         color: 'var(--navy-600)', bg: 'var(--navy-50)',          border: 'var(--navy-200)' },
              { label: 'Active',    value: users.filter(u => u.isActive).length,                 color: '#059669',          bg: 'rgba(16,185,129,0.07)',   border: 'rgba(16,185,129,0.2)' },
              { label: 'Admins',    value: users.filter(u => u.role === 'admin').length,         color: '#dc2626',          bg: 'rgba(239,68,68,0.07)',    border: 'rgba(239,68,68,0.2)' },
              { label: 'Resellers', value: users.filter(u => u.role === 'reseller').length,      color: '#6366f1',          bg: 'rgba(99,102,241,0.07)',   border: 'rgba(99,102,241,0.2)' },
            ].map(({ label, value, color, bg, border }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', background: bg, border: `1px solid ${border}`, borderRadius: 99 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color, fontFamily: FONT }}>{value}</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--navy-400)', fontFamily: FONT }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 3, background: 'var(--navy-50)', border: '1px solid var(--navy-200)', borderRadius: 9 }}>
            <button
              onClick={() => setViewMode('panel')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '0.4rem 0.7rem', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: viewMode === 'panel' ? '#fff' : 'transparent',
                boxShadow: viewMode === 'panel' ? '0 1px 3px rgba(15,23,42,0.1)' : 'none',
                color: viewMode === 'panel' ? '#6366f1' : 'var(--navy-500)',
                fontSize: '0.78rem', fontWeight: 700, fontFamily: FONT,
              }}
            >
              <Squares2X2Icon style={{ width: 13, height: 13 }} /> Panel
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '0.4rem 0.7rem', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: viewMode === 'list' ? '#fff' : 'transparent',
                boxShadow: viewMode === 'list' ? '0 1px 3px rgba(15,23,42,0.1)' : 'none',
                color: viewMode === 'list' ? '#6366f1' : 'var(--navy-500)',
                fontSize: '0.78rem', fontWeight: 700, fontFamily: FONT,
              }}
            >
              <Bars3Icon style={{ width: 13, height: 13 }} /> List
            </button>
          </div>
          <button
            onClick={() => navigate('/admin/bulk-vendor-access')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: isMobile ? '0.5rem 0.75rem' : '0.55rem 1.1rem',
              flex: isMobile ? '1 1 auto' : undefined,
              background: 'rgba(99,102,241,0.08)',
              border: '1.5px solid rgba(99,102,241,0.25)', borderRadius: 9, color: '#6366f1',
              fontSize: isMobile ? '0.75rem' : '0.82rem', fontWeight: 700, cursor: 'pointer',
              fontFamily: FONT, whiteSpace: 'nowrap',
            }}
          >
            <ShieldCheckIcon style={{ width: 15, height: 15, flexShrink: 0 }} />
            Bulk Access
          </button>
          <button
            onClick={() => navigate('/command-center/dashboard')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: isMobile ? '0.5rem 0.75rem' : '0.55rem 1.1rem',
              flex: isMobile ? '1 1 auto' : undefined,
              background: 'linear-gradient(135deg,#0f172a,#1e1b4b)',
              border: 'none', borderRadius: 9, color: '#a5b4fc',
              fontSize: isMobile ? '0.75rem' : '0.82rem', fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(15,23,42,0.3)', fontFamily: FONT, whiteSpace: 'nowrap',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            Command Center
          </button>
          <button
            onClick={startInvite}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: isMobile ? '0.5rem 0.75rem' : '0.55rem 1.1rem',
              flex: isMobile ? '1 1 auto' : undefined,
              background: 'rgba(245,158,11,0.08)',
              border: '1.5px solid rgba(245,158,11,0.3)', borderRadius: 9, color: '#d97706',
              fontSize: isMobile ? '0.75rem' : '0.82rem', fontWeight: 700, cursor: 'pointer',
              fontFamily: FONT, whiteSpace: 'nowrap',
            }}
          >
            <UserPlusIcon style={{ width: 15, height: 15, flexShrink: 0 }} />
            Invite User
          </button>
          <button
            onClick={startCreate}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: isMobile ? '0.5rem 0.75rem' : '0.55rem 1.1rem',
              flex: isMobile ? '1 1 auto' : undefined,
              background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
              border: 'none', borderRadius: 9, color: '#fff',
              fontSize: isMobile ? '0.75rem' : '0.82rem', fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(99,102,241,0.3)', fontFamily: FONT, whiteSpace: 'nowrap',
            }}
          >
            <UserPlusIcon style={{ width: 15, height: 15, flexShrink: 0 }} />
            Add User
          </button>
        </div>
      </div>

      {/* ── Toast ─────────────────────────────────────────────── */}
      {(message || error) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '0.6rem 1rem', borderRadius: 10, fontFamily: FONT,
          background: message ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${message ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
          color: message ? '#10b981' : '#ef4444',
          fontSize: '0.82rem', fontWeight: 600,
        }}>
          {message
            ? <CheckCircleIcon style={{ width: 15, height: 15, flexShrink: 0 }} />
            : <ExclamationCircleIcon style={{ width: 15, height: 15, flexShrink: 0 }} />}
          {message || error}
          <button onClick={() => { setMessage(''); setError(''); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2, display: 'flex' }}>
            <XMarkIcon style={{ width: 14, height: 14 }} />
          </button>
        </div>
      )}

      {/* ── LIST VIEW ──────────────────────────────────────────── */}
      {viewMode === 'list' && (() => {
        const listGridCols = '2fr 80px 110px 85px 65px 85px 80px 70px 85px 90px 80px';
        const listRightAlignCols = ['Balance', 'Labels', 'Revenue', 'Profit', 'Clients'];
        return (
        <div className="db-card" style={{ overflow: 'hidden' }}>
          {/* Search + filter bar */}
          <div style={{ padding: '0.625rem 1rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flexGrow: 1, minWidth: isMobile ? '100%' : 200 }}>
              <MagnifyingGlassIcon style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'var(--navy-400)', pointerEvents: 'none' }} />
              <input type="text" style={{ ...inp, paddingLeft: '1.75rem', paddingRight: searchTerm ? '1.75rem' : '0.75rem', fontSize: '0.78rem' }} placeholder="Search by name or email…"
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onFocus={focusInp} onBlur={blurInp} />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} title="Clear search"
                  style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 2, display: 'flex' }}>
                  <XMarkIcon style={{ width: 13, height: 13 }} />
                </button>
              )}
            </div>
            <select style={{ ...inp, fontSize: '0.78rem', minWidth: isMobile ? 0 : 130, flex: isMobile ? '1 1 auto' : undefined, appearance: 'auto' }}
              value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setCurrentPage(1); }}>
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="reseller">Reseller</option>
              <option value="user">User</option>
            </select>
            <select style={{ ...inp, fontSize: '0.78rem', minWidth: isMobile ? 0 : 130, flex: isMobile ? '1 1 auto' : undefined, appearance: 'auto' }}
              value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}>
              <option value="">All Status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
            {hasActiveFilters && (
              <button onClick={clearFilters} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: '0.75rem', fontWeight: 700, fontFamily: FONT, whiteSpace: 'nowrap', padding: '0.3rem 0' }}>
                <XMarkIcon style={{ width: 12, height: 12 }} /> Clear filters
              </button>
            )}
            <span style={{ fontSize: '0.72rem', color: 'var(--navy-400)', whiteSpace: 'nowrap', fontFamily: FONT, marginLeft: 'auto' }}>{totalCount} user{totalCount !== 1 ? 's' : ''}</span>
          </div>

          {/* Table header — desktop grid only; mobile renders cards instead (no header needed) */}
          {!isMobile && (
            <div style={{ display: 'grid', gridTemplateColumns: listGridCols, gap: '0 0.75rem', padding: '0.5rem 1rem', background: 'var(--navy-50)', borderBottom: '1.5px solid var(--navy-100)' }}>
              {['User', 'Role', 'Status', 'Balance', 'Labels', 'Revenue', 'Profit', 'Clients', 'Joined', 'Last Login', ''].map(h => (
                <div key={h} style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--navy-400)', fontFamily: FONT, textAlign: listRightAlignCols.includes(h) ? 'right' : 'left' }}>{h}</div>
              ))}
            </div>
          )}

          {/* Rows */}
          <div style={{ overflowY: 'auto', maxHeight: isMobile ? 'calc(100vh - 320px)' : 'calc(100vh - 280px)' }}>
            {loadingList ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--navy-400)', fontSize: '0.85rem', fontFamily: FONT }}>No users found</div>
            ) : filtered.map((u, idx) => {
              const rs = roleStyle[u.role] ?? roleStyle.user;

              const avatar = (
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: u.isActive ? rs.avatarGrad : 'linear-gradient(135deg,#94a3b8,#64748b)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.68rem', fontWeight: 700, color: '#fff', fontFamily: FONT,
                }}>
                  {u.firstName[0]}{u.lastName[0]}
                </div>
              );

              const actions = (
                <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                  <button title="Edit" onClick={() => { selectUser(u); setViewMode('panel'); }}
                    style={{ width: 26, height: 26, borderRadius: 6, border: '1.5px solid var(--navy-200)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy-600)' }}>
                    <PencilIcon style={{ width: 12, height: 12 }} />
                  </button>
                  <button title={u.isActive ? 'Deactivate' : 'Activate'} onClick={() => handleToggleStatus(u)}
                    style={{ width: 26, height: 26, borderRadius: 6, border: `1.5px solid ${u.isActive ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: u.isActive ? '#ef4444' : '#10b981' }}>
                    <EyeIcon style={{ width: 12, height: 12 }} />
                  </button>
                  <button title="Delete" onClick={() => handleDelete(u)}
                    style={{ width: 26, height: 26, borderRadius: 6, border: '1.5px solid rgba(239,68,68,0.25)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                    <TrashIcon style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              );

              if (isMobile) {
                return (
                  <div
                    key={u.id}
                    style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0.75rem', borderTop: idx === 0 ? 'none' : '1px solid var(--navy-100)', cursor: 'pointer' }}
                    onClick={() => { selectUser(u); setViewMode('panel'); }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      {avatar}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--navy-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FONT }}>{u.firstName} {u.lastName}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--navy-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FONT }}>{u.email}</div>
                      </div>
                      {actions}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <RoleChip role={u.role} />
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: u.isActive ? '#10b981' : '#ef4444', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: u.isActive ? '#10b981' : '#ef4444', fontFamily: FONT }}>{u.isActive ? 'Active' : 'Inactive'}</span>
                      </span>
                      {u.hasPassword === false && <PendingBadge />}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      {[
                        { label: 'Balance', value: fmt(u.currentBalance),      color: (u.currentBalance ?? 0) > 0 ? 'var(--navy-700)' : '#ef4444' },
                        { label: 'Labels',  value: String(u.totalLabels ?? 0), color: 'var(--navy-700)' },
                        { label: 'Revenue', value: fmt(u.totalRevenue),        color: 'var(--navy-700)' },
                        { label: 'Profit',  value: fmt(u.profit),              color: (u.profit ?? 0) >= 0 ? '#10b981' : '#ef4444' },
                        ...(u.role === 'reseller' ? [{ label: 'Clients', value: String(u.clients?.length ?? 0), color: 'var(--navy-700)' }] : []),
                      ].map(stat => (
                        <div key={stat.label} style={{ minWidth: 0, background: 'var(--navy-50)', border: '1px solid var(--navy-100)', borderRadius: 8, padding: '0.4rem 0.5rem' }}>
                          <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--navy-400)', fontFamily: FONT }}>{stat.label}</div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: stat.color, fontFamily: FONT, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stat.value}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', fontFamily: FONT }}>
                      Joined {new Date(u.createdAt).toLocaleDateString()} · Last login: {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : <span style={{ fontStyle: 'italic' }}>Never</span>}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={u.id}
                  style={{ display: 'grid', gridTemplateColumns: listGridCols, gap: '0 0.75rem', alignItems: 'center', padding: '0.65rem 1rem', borderTop: idx === 0 ? 'none' : '1px solid var(--navy-100)', transition: 'background 0.1s', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => { selectUser(u); setViewMode('panel'); }}
                >
                  {/* User (name + email combined — one glance, one column) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    {avatar}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--navy-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FONT }}>{u.firstName} {u.lastName}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FONT }}>{u.email}</div>
                    </div>
                  </div>

                  {/* Role */}
                  <div><RoleChip role={u.role} /></div>

                  {/* Status — active/inactive is the most decision-relevant signal, right after identity+role */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: u.isActive ? '#10b981' : '#ef4444', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: u.isActive ? '#10b981' : '#ef4444', fontFamily: FONT }}>{u.isActive ? 'Active' : 'Inactive'}</span>
                    </div>
                    {u.hasPassword === false && <PendingBadge />}
                  </div>

                  {/* Balance — current standing, right after Status since both are "does this need attention" signals */}
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: (u.currentBalance ?? 0) > 0 ? 'var(--navy-700)' : '#ef4444', fontFamily: FONT, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(u.currentBalance)}</div>

                  {/* Labels → Revenue → Profit: reads left-to-right as volume → money in → money kept */}
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy-700)', fontFamily: FONT, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{u.totalLabels ?? 0}</div>

                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy-700)', fontFamily: FONT, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(u.totalRevenue)}</div>

                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: (u.profit ?? 0) >= 0 ? '#10b981' : '#ef4444', fontFamily: FONT, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(u.profit)}</div>

                  {/* Clients — reseller-only; dash for everyone else */}
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy-700)', fontFamily: FONT, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {u.role === 'reseller' ? (u.clients?.length ?? 0) : <span style={{ color: 'var(--navy-300)' }}>—</span>}
                  </div>

                  {/* Joined */}
                  <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                    {new Date(u.createdAt).toLocaleDateString()}
                  </div>

                  {/* Last Login */}
                  <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                    {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : <span style={{ color: 'var(--navy-300)', fontStyle: 'italic' }}>Never</span>}
                  </div>

                  {/* Actions */}
                  {actions}
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}

      {/* ── Two-column layout ──────────────────────────────────── */}
      {viewMode === 'panel' && <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '272px 1fr',
        gap: '1rem',
        alignItems: 'start',
      }}>

        {/* ── LEFT: User list ───────────────────────────────────── */}
        <div className="db-card" style={{
          display: isMobile && (selectedUser !== null || isCreating) ? 'none' : 'flex',
          flexDirection: 'column', overflow: 'hidden',
          maxHeight: isMobile ? 'none' : 'calc(100vh - 170px)',
        }}>

          {/* Search */}
          <div style={{ padding: '0.75rem 0.875rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <MagnifyingGlassIcon style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--navy-400)', pointerEvents: 'none' }} />
              <input
                type="text"
                style={{ ...inp, paddingLeft: '2rem', paddingRight: searchTerm ? '2rem' : '0.75rem', fontSize: '0.8rem' }}
                placeholder="Search by name or email…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onFocus={focusInp} onBlur={blurInp}
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} title="Clear search"
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 2, display: 'flex' }}>
                  <XMarkIcon style={{ width: 13, height: 13 }} />
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <select
                style={{ ...inp, fontSize: '0.75rem', padding: '0.4rem 0.6rem', appearance: 'auto' }}
                value={roleFilter}
                onChange={e => { setRoleFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="">All Roles</option>
                <option value="admin">Admin</option>
                <option value="reseller">Reseller</option>
                <option value="user">User</option>
              </select>
              <select
                style={{ ...inp, fontSize: '0.75rem', padding: '0.4rem 0.6rem', appearance: 'auto' }}
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="">All Status</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            {hasActiveFilters && (
              <button onClick={clearFilters} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: '0.72rem', fontWeight: 700, fontFamily: FONT, padding: '0.2rem 0' }}>
                <XMarkIcon style={{ width: 11, height: 11 }} /> Clear filters
              </button>
            )}
          </div>

          {/* User rows */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.375rem' }}>
            {loadingList ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <div className="spinner" />
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--navy-400)', fontSize: '0.8rem', fontFamily: FONT }}>
                No users found
              </div>
            ) : filtered.map(u => {
              const rs = roleStyle[u.role] ?? roleStyle.user;
              const isSelected = selectedUser?.id === u.id && !isCreating;
              return (
                <div
                  key={u.id}
                  onClick={() => selectUser(u)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '0.55rem 0.625rem', borderRadius: 9, cursor: 'pointer', marginBottom: 2,
                    background: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent',
                    border: `1.5px solid ${isSelected ? 'rgba(99,102,241,0.22)' : 'transparent'}`,
                    borderLeft: `2.5px solid ${isSelected ? '#6366f1' : 'transparent'}`,
                    transition: 'all 0.12s',
                  }}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: u.isActive ? rs.avatarGrad : 'linear-gradient(135deg,#94a3b8,#64748b)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.72rem', fontWeight: 700, color: '#fff', fontFamily: FONT,
                  }}>
                    {u.firstName[0]}{u.lastName[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--navy-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: FONT }}>
                      {u.firstName} {u.lastName}
                    </div>
                    <div style={{ fontSize: '0.69rem', color: 'var(--navy-400)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: FONT }}>
                      {u.email}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <RoleChip role={u.role} />
                    {u.hasPassword === false && <PendingBadge />}
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: u.isActive ? '#10b981' : '#ef4444' }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ borderTop: '1px solid var(--navy-100)', padding: '0.5rem 0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--navy-400)', fontFamily: FONT }}>{currentPage} / {totalPages}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  style={{ width: 26, height: 26, borderRadius: 6, border: '1.5px solid var(--navy-200)', background: 'transparent', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', color: 'var(--navy-500)', opacity: currentPage === 1 ? 0.4 : 1, fontWeight: 700 }}
                >‹</button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  style={{ width: 26, height: 26, borderRadius: 6, border: '1.5px solid var(--navy-200)', background: 'transparent', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', color: 'var(--navy-500)', opacity: currentPage === totalPages ? 0.4 : 1, fontWeight: 700 }}
                >›</button>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Detail panel ────────────────────────────────── */}
        <div className="db-card" style={{
          display: isMobile && selectedUser === null && !isCreating ? 'none' : 'flex',
          flexDirection: 'column', overflow: 'hidden',
          maxHeight: isMobile ? 'none' : 'calc(100vh - 170px)',
        }}>

          {!selectedUser && !isCreating ? (
            /* Empty state */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 2rem', gap: 12 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <UserGroupIcon style={{ width: 26, height: 26, color: '#6366f1' }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--navy-800)', fontFamily: FONT, marginBottom: 4 }}>Select a User</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--navy-400)', fontFamily: FONT, lineHeight: 1.6, maxWidth: 280 }}>
                  Click any user from the list to edit their profile, manage balance, or configure rate tiers.
                </div>
              </div>
              <button onClick={startCreate} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', border: 'none', borderRadius: 8, color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                <UserPlusIcon style={{ width: 14, height: 14 }} /> Create First User
              </button>
            </div>
          ) : (
            <>
              {/* ── Panel header ── */}
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
                {isMobile && (
                  <button
                    onClick={() => { setSelectedUser(null); setIsCreating(false); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontWeight: 700, fontSize: '0.82rem', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 4, padding: 0, marginRight: 4 }}
                  >
                    ← Users
                  </button>
                )}
                {isCreating ? (
                  <>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: createMode === 'invite' ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#6366f1,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <UserPlusIcon style={{ width: 18, height: 18, color: '#fff' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--navy-900)', fontFamily: FONT }}>{createMode === 'invite' ? 'Invite User' : 'New User'}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', fontFamily: FONT }}>{createMode === 'invite' ? 'They\'ll get an email to set their own password' : 'Fill in the details below to create an account'}</div>
                    </div>
                  </>
                ) : selectedUser && (
                  <>
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                      background: selectedUser.isActive ? (roleStyle[selectedUser.role]?.avatarGrad ?? 'linear-gradient(135deg,#64748b,#475569)') : 'linear-gradient(135deg,#94a3b8,#64748b)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.82rem', fontWeight: 700, color: '#fff', fontFamily: FONT,
                    }}>
                      {selectedUser.firstName[0]}{selectedUser.lastName[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--navy-900)', fontFamily: FONT }}>
                        {selectedUser.firstName} {selectedUser.lastName}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', fontFamily: FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedUser.email}
                      </div>
                    </div>
                    <RoleChip role={selectedUser.role} />
                    {selectedUser.hasPassword === false && <PendingBadge />}
                    <span style={{
                      padding: '2px 8px', borderRadius: 99, fontSize: '0.62rem', fontWeight: 700, fontFamily: FONT,
                      background: selectedUser.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      color: selectedUser.isActive ? '#10b981' : '#ef4444',
                      border: `1px solid ${selectedUser.isActive ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                    }}>
                      {selectedUser.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {selectedUser.hasPassword === false && (
                        <button
                          onClick={() => handleReinvite(selectedUser)}
                          disabled={reinviting}
                          title="Resend invite email"
                          style={{ width: 28, height: 28, borderRadius: 7, border: '1.5px solid rgba(245,158,11,0.3)', background: 'transparent', cursor: reinviting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', opacity: reinviting ? 0.5 : 1 }}
                        >
                          <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleStatus(selectedUser)}
                        title={selectedUser.isActive ? 'Deactivate' : 'Activate'}
                        style={{ width: 28, height: 28, borderRadius: 7, border: `1.5px solid ${selectedUser.isActive ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: selectedUser.isActive ? '#ef4444' : '#10b981' }}
                      >
                        <EyeIcon style={{ width: 14, height: 14 }} />
                      </button>
                      {selectedUser.role === 'reseller' && (
                        <button
                          onClick={() => handleToggleCC(selectedUser)}
                          title={selectedUser.ccAccess ? 'Revoke CC access' : 'Grant CC access'}
                          style={{ width: 28, height: 28, borderRadius: 7, border: `1.5px solid ${selectedUser.ccAccess ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.2)'}`, background: selectedUser.ccAccess ? 'rgba(99,102,241,0.12)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}
                        >
                          <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
                          </svg>
                        </button>
                      )}
                      {selectedUser.id !== authUser?.id && (
                        <button
                          onClick={() => handleDelete(selectedUser)}
                          title="Delete user"
                          style={{ width: 28, height: 28, borderRadius: 7, border: '1.5px solid rgba(239,68,68,0.25)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}
                        >
                          <TrashIcon style={{ width: 14, height: 14 }} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* ── Tab bar ── */}
              {!isCreating && selectedUser && (
                <div style={{ display: 'flex', gap: 4, padding: '0.625rem 1rem', borderBottom: '1px solid var(--navy-100)', flexShrink: 0, overflowX: 'auto' }}>
                  {([
                    { id: 'edit'    as ActiveTab, label: 'Profile',       icon: <PencilIcon    style={{ width: 13, height: 13 }} /> },
                    { id: 'balance' as ActiveTab, label: 'Balance & Pay', icon: <BanknotesIcon style={{ width: 13, height: 13 }} /> },
                    { id: 'tiers'   as ActiveTab, label: 'Rate Tiers',    icon: <ScaleIcon     style={{ width: 13, height: 13 }} /> },
                  ]).map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: activeTab === tab.id ? 'rgba(99,102,241,0.1)' : 'transparent',
                        color: activeTab === tab.id ? '#6366f1' : 'var(--navy-500)',
                        fontSize: '0.78rem', fontWeight: 600, fontFamily: FONT, whiteSpace: 'nowrap',
                        transition: 'all 0.15s',
                        outline: activeTab === tab.id ? '1.5px solid rgba(99,102,241,0.2)' : 'none',
                      }}
                    >
                      {tab.icon} {tab.label}
                    </button>
                  ))}
                </div>
              )}

              {/* ── Tab content ── */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>

                {/* ── PROFILE / CREATE FORM ── */}
                {(activeTab === 'edit' || isCreating) && (
                  <form onSubmit={isCreating ? handleCreate : handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 520 }}>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.875rem' }}>
                      <div>
                        <label style={lbl}>First Name</label>
                        <input type="text" required style={inp} value={userForm.firstName}
                          onChange={e => setUserForm({ ...userForm, firstName: e.target.value })}
                          onFocus={focusInp} onBlur={blurInp} />
                      </div>
                      <div>
                        <label style={lbl}>Last Name</label>
                        <input type="text" required style={inp} value={userForm.lastName}
                          onChange={e => setUserForm({ ...userForm, lastName: e.target.value })}
                          onFocus={focusInp} onBlur={blurInp} />
                      </div>
                    </div>

                    <div>
                      <label style={lbl}>Email</label>
                      <input type="email" required style={inp} value={userForm.email}
                        onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                        onFocus={focusInp} onBlur={blurInp} />
                    </div>

                    {isCreating && createMode === 'password' && (
                      <div>
                        <label style={lbl}>Password <span style={{ color: 'var(--navy-400)', fontWeight: 500, textTransform: 'none', fontSize: '0.65rem' }}>(5-digit PIN)</span></label>
                        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                          <input type="text" required minLength={5} maxLength={5} style={{ ...inp, letterSpacing: '0.3em', fontWeight: 700 }}
                            value={userForm.password}
                            onChange={e => setUserForm({ ...userForm, password: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                            onFocus={focusInp} onBlur={blurInp} />
                          <button type="button" onClick={() => setUserForm({ ...userForm, password: String(Math.floor(10000 + Math.random() * 90000)) })}
                            style={{ padding: '0.55rem 0.875rem', border: '1.5px solid var(--navy-200)', borderRadius: 8, background: 'transparent', color: 'var(--navy-700)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: FONT }}>
                            Generate
                          </button>
                          <button type="button" onClick={() => userForm.password && navigator.clipboard.writeText(userForm.password)}
                            style={{ padding: '0.55rem 0.875rem', border: '1.5px solid var(--navy-200)', borderRadius: 8, background: 'transparent', color: 'var(--navy-700)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                            Copy
                          </button>
                        </div>
                      </div>
                    )}

                    {isCreating && createMode === 'invite' && (
                      <div style={{ padding: '0.7rem 0.875rem', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', fontSize: '0.78rem', color: '#b45309', fontFamily: FONT, lineHeight: 1.5 }}>
                        No password needed — an email will be sent to this address with a link to set one. The link expires in 3 days.
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.875rem' }}>
                      <div>
                        <label style={lbl}>Role</label>
                        <select style={{ ...inp, appearance: 'auto' }} value={userForm.role}
                          onChange={e => setUserForm({ ...userForm, role: e.target.value as any })}
                          onFocus={focusInp} onBlur={blurInp}>
                          <option value="user">User</option>
                          <option value="reseller">Reseller</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Source</label>
                        <select style={{ ...inp, appearance: 'auto' }} value={userForm.source}
                          onChange={e => setUserForm({ ...userForm, source: e.target.value })}
                          onFocus={focusInp} onBlur={blurInp}>
                          <option value="">— Not specified —</option>
                          <option value="Organic">Organic</option>
                          <option value="Paid Ads">Paid Ads</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                      {isCreating && (
                        <button type="button" onClick={() => setIsCreating(false)}
                          style={{ padding: '0.6rem 1rem', border: '1.5px solid var(--navy-200)', borderRadius: 8, background: 'transparent', color: 'var(--navy-600)', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                          Cancel
                        </button>
                      )}
                      <button type="submit" disabled={submitting}
                        style={{ padding: '0.6rem 1.25rem', background: isCreating && createMode === 'invite' ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#6366f1,#4f46e5)', border: 'none', borderRadius: 8, color: '#fff', fontSize: '0.84rem', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: FONT, opacity: submitting ? 0.7 : 1, boxShadow: '0 4px 12px rgba(99,102,241,0.25)' }}>
                        {isCreating && createMode === 'invite'
                          ? (submitting ? 'Sending…' : 'Send Invite')
                          : (submitting ? (isCreating ? 'Creating…' : 'Saving…') : (isCreating ? 'Create User' : 'Save Changes'))}
                      </button>
                    </div>
                  </form>
                )}

                {/* ── Reset Password ── */}
                {activeTab === 'edit' && !isCreating && selectedUser && (
                  <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', maxWidth: 520, marginTop: '1.5rem' }}>
                    <div style={{ height: 1, background: 'var(--navy-100)' }} />
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-700)', fontFamily: FONT }}>Reset Password</div>
                    <div>
                      <label style={lbl}>New PIN <span style={{ color: 'var(--navy-400)', fontWeight: 500, textTransform: 'none', fontSize: '0.65rem' }}>(5 digits)</span></label>
                      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                        <input type="text" required minLength={5} maxLength={5}
                          style={{ ...inp, letterSpacing: '0.3em', fontWeight: 700 }}
                          value={resetPwd} placeholder="•••••"
                          onChange={e => setResetPwd(e.target.value.replace(/\D/g, '').slice(0, 5))}
                          onFocus={focusInp} onBlur={blurInp} />
                        <button type="button" onClick={() => setResetPwd(String(Math.floor(10000 + Math.random() * 90000)))}
                          style={{ padding: '0.55rem 0.875rem', border: '1.5px solid var(--navy-200)', borderRadius: 8, background: 'transparent', color: 'var(--navy-700)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: FONT }}>
                          Generate
                        </button>
                        <button type="button" onClick={() => resetPwd && navigator.clipboard.writeText(resetPwd)}
                          style={{ padding: '0.55rem 0.875rem', border: '1.5px solid var(--navy-200)', borderRadius: 8, background: 'transparent', color: 'var(--navy-700)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                          Copy
                        </button>
                      </div>
                    </div>
                    <button type="submit" disabled={resettingPwd || resetPwd.length !== 5}
                      style={{ alignSelf: 'flex-start', padding: '0.55rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: '0.82rem', fontWeight: 700, cursor: resettingPwd || resetPwd.length !== 5 ? 'not-allowed' : 'pointer', fontFamily: FONT, opacity: resettingPwd || resetPwd.length !== 5 ? 0.6 : 1 }}>
                      {resettingPwd ? 'Resetting…' : 'Reset Password'}
                    </button>
                  </form>
                )}

                {/* ── BALANCE & PAY TAB ── */}
                {activeTab === 'balance' && selectedUser && (
                  loadingBal ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                      {/* Stat cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.875rem' }}>
                        <div style={{ padding: '1.1rem 1.25rem', background: 'var(--navy-50)', border: '1.5px solid var(--navy-100)', borderRadius: 12 }}>
                          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONT }}>
                            <BanknotesIcon style={{ width: 12, height: 12 }} /> Current Balance
                          </div>
                          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--navy-900)', letterSpacing: '-0.04em', fontFamily: FONT }}>
                            {fmt(balance?.currentBalance)}
                          </div>
                        </div>
                        <div style={{ padding: '1.1rem 1.25rem', background: 'rgba(16,185,129,0.06)', border: '1.5px solid rgba(16,185,129,0.18)', borderRadius: 12 }}>
                          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONT }}>
                            <CurrencyDollarIcon style={{ width: 12, height: 12 }} /> Total Paid In
                          </div>
                          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#059669', letterSpacing: '-0.04em', fontFamily: FONT }}>
                            {fmt(totalPaid)}
                          </div>
                        </div>
                      </div>

                      {/* Balance action buttons */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {([
                          { id: 'topup'  as BalAction, label: 'Top Up', icon: <ArrowUpTrayIcon style={{ width: 13, height: 13 }} />, activeColor: '#10b981', activeBg: 'rgba(16,185,129,0.1)', activeBorder: 'rgba(16,185,129,0.3)' },
                          { id: 'deduct' as BalAction, label: 'Deduct', icon: <ArrowDownTrayIcon style={{ width: 13, height: 13 }} />, activeColor: '#ef4444', activeBg: 'rgba(239,68,68,0.1)', activeBorder: 'rgba(239,68,68,0.3)' },
                          { id: 'adjust' as BalAction, label: 'Adjust', icon: <AdjustmentsHorizontalIcon style={{ width: 13, height: 13 }} />, activeColor: '#3b82f6', activeBg: 'rgba(59,130,246,0.1)', activeBorder: 'rgba(59,130,246,0.3)' },
                        ]).map(a => {
                          const isAct = balAction === a.id;
                          return (
                            <button
                              key={a.id}
                              onClick={() => setBalAction(isAct ? '' : a.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '0.5rem 0.875rem', borderRadius: 8, cursor: 'pointer',
                                border: `1.5px solid ${isAct ? a.activeBorder : 'var(--navy-200)'}`,
                                background: isAct ? a.activeBg : 'transparent',
                                color: isAct ? a.activeColor : 'var(--navy-600)',
                                fontSize: '0.8rem', fontWeight: 600, fontFamily: FONT,
                                transition: 'all 0.15s',
                              }}
                            >
                              {a.icon} {a.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Balance action form */}
                      {balAction && (
                        <form onSubmit={doBalanceAction} style={{ background: 'var(--navy-50)', border: '1.5px solid var(--navy-100)', borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--navy-700)', textTransform: 'capitalize', fontFamily: FONT }}>
                            {balAction === 'adjust' ? 'Adjust Balance (+ or −)' : `${balAction} Balance`}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
                            <div>
                              <label style={lbl}>Amount ($)</label>
                              <input type="number" step="0.01" required style={inp}
                                min={balAction === 'adjust' ? undefined : '0.01'}
                                value={actionAmt} onChange={e => setActionAmt(e.target.value)}
                                placeholder="0.00" autoFocus
                                onFocus={focusInp} onBlur={blurInp} />
                            </div>
                            <div>
                              <label style={lbl}>Description</label>
                              <input type="text" style={inp} value={actionDesc}
                                onChange={e => setActionDesc(e.target.value)} placeholder="Optional"
                                onFocus={focusInp} onBlur={blurInp} />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 7 }}>
                            <button type="button" onClick={() => { setBalAction(''); setActionAmt(''); setActionDesc(''); }}
                              style={{ padding: '0.5rem 0.875rem', border: '1.5px solid var(--navy-200)', borderRadius: 8, background: 'transparent', color: 'var(--navy-600)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                              Cancel
                            </button>
                            <button type="submit" disabled={processingBal}
                              style={{ padding: '0.5rem 1rem', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', border: 'none', borderRadius: 8, color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: processingBal ? 'not-allowed' : 'pointer', fontFamily: FONT, opacity: processingBal ? 0.7 : 1 }}>
                              {processingBal ? 'Processing…' : 'Confirm'}
                            </button>
                          </div>
                        </form>
                      )}

                      {/* Transactions */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: FONT }}>
                            Transactions {balance?.recentTransactions?.length ? `(${balance.recentTransactions.length})` : ''}
                          </span>
                          {(balance?.recentTransactions?.length ?? 0) > 5 && (
                            <button onClick={() => setShowAllTx(v => !v)}
                              style={{ padding: '3px 9px', border: '1.5px solid var(--navy-200)', borderRadius: 6, background: 'transparent', color: 'var(--navy-500)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                              {showAllTx ? 'Show less' : `Show all ${balance!.recentTransactions.length}`}
                            </button>
                          )}
                        </div>
                        {!balance?.recentTransactions?.length ? (
                          <div style={{ fontSize: '0.8rem', color: 'var(--navy-400)', fontFamily: FONT, padding: '1rem 0' }}>No transactions yet.</div>
                        ) : (() => {
                          const txList = showAllTx ? balance.recentTransactions : balance.recentTransactions.slice(0, 5);
                          return txList.map((tx, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: i < txList.length - 1 ? '1px solid var(--navy-50)' : 'none' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                <div style={{ width: 7, height: 7, borderRadius: '50%', background: txDot(tx.type), flexShrink: 0 }} />
                                <div>
                                  <div style={{ fontSize: '0.78rem', color: 'var(--navy-800)', fontFamily: FONT }}>{tx.description}</div>
                                  <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', fontFamily: FONT }}>{new Date(tx.createdAt).toLocaleDateString()}</div>
                                </div>
                              </div>
                              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: txColor(tx.type), fontFamily: FONT }}>
                                {tx.type === 'deduction' ? '−' : '+'}{fmt(tx.amount)}
                              </span>
                            </div>
                          ));
                        })()}
                      </div>

                      {/* Payment Log */}
                      <div style={{ borderTop: '1px solid var(--navy-100)', paddingTop: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: FONT }}>Payment Received Log</span>
                          <button onClick={() => openPayForm()}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'rgba(16,185,129,0.1)', border: '1.5px solid rgba(16,185,129,0.25)', borderRadius: 7, color: '#10b981', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                            <PlusIcon style={{ width: 11, height: 11 }} /> Log Payment
                          </button>
                        </div>

                        {showPayForm && (
                          <form onSubmit={submitPayLog} style={{ background: 'var(--navy-50)', border: '1.5px solid var(--navy-100)', borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.875rem' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981', fontFamily: FONT }}>
                              {editPayLog ? 'Edit Payment Entry' : 'Log Payment Received'}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
                              <div>
                                <label style={lbl}>Amount ($)</label>
                                <input type="number" step="0.01" min="0.01" required style={inp}
                                  value={payAmt} onChange={e => setPayAmt(e.target.value)} placeholder="0.00" autoFocus
                                  onFocus={focusInp} onBlur={blurInp} />
                              </div>
                              <div>
                                <label style={lbl}>Date</label>
                                <input type="date" required style={inp}
                                  value={payDate} onChange={e => setPayDate(e.target.value)}
                                  onFocus={focusInp} onBlur={blurInp} />
                              </div>
                            </div>
                            <div>
                              <label style={lbl}>Note</label>
                              <input type="text" style={inp} value={payNote}
                                onChange={e => setPayNote(e.target.value)} placeholder="Wire, receipt #…"
                                onFocus={focusInp} onBlur={blurInp} />
                            </div>

                            {editPayLog && editPayLog.screenshots.filter(s => !payRemove.includes(s)).length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {editPayLog.screenshots.filter(s => !payRemove.includes(s)).map(url => (
                                  <div key={url} style={{ position: 'relative' }}>
                                    <img src={toAbsUrl(url)} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 7, border: '1.5px solid var(--navy-100)' }}
                                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                    <button type="button" onClick={() => setPayRemove(r => [...r, url])}
                                      style={{ position: 'absolute', top: -5, right: -5, background: '#dc2626', border: 'none', borderRadius: '50%', width: 16, height: 16, cursor: 'pointer', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {wallets.length > 0 && (
                              <div>
                                <label style={lbl}>Wallet (optional)</label>
                                <select style={{ ...inp, appearance: 'auto' }} value={payWallet}
                                  onChange={e => setPayWallet(e.target.value)}
                                  onFocus={focusInp} onBlur={blurInp}>
                                  <option value="">— None —</option>
                                  {wallets.filter(w => w.isActive).map(w => (
                                    <option key={w._id} value={w._id}>{w.name}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <input type="file" ref={payFileRef} multiple accept="image/*,.pdf" style={{ display: 'none' }}
                                onChange={e => setPayFiles(Array.from(e.target.files || []))} />
                              <button type="button" onClick={() => payFileRef.current?.click()}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', border: '1.5px solid var(--navy-200)', borderRadius: 7, background: 'transparent', color: 'var(--navy-600)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                                <PhotoIcon style={{ width: 12, height: 12 }} />
                                {payFiles.length ? `${payFiles.length} file(s)` : 'Attach Screenshots'}
                              </button>
                              {payFiles.map((f, i) => (
                                <span key={i} style={{ fontSize: '0.68rem', background: 'var(--navy-100)', padding: '2px 7px', borderRadius: 5, color: 'var(--navy-700)', fontFamily: FONT }}>
                                  {f.name}
                                  <button type="button" onClick={() => setPayFiles(fs => fs.filter((_, j) => j !== i))}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '0 0 0 4px' }}>×</button>
                                </span>
                              ))}
                            </div>

                            <div style={{ display: 'flex', gap: 7 }}>
                              <button type="button" onClick={() => setShowPayForm(false)}
                                style={{ padding: '0.5rem 0.875rem', border: '1.5px solid var(--navy-200)', borderRadius: 8, background: 'transparent', color: 'var(--navy-600)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>Cancel</button>
                              <button type="submit" disabled={savingPay}
                                style={{ padding: '0.5rem 1rem', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', border: 'none', borderRadius: 8, color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: savingPay ? 'not-allowed' : 'pointer', fontFamily: FONT, opacity: savingPay ? 0.7 : 1 }}>
                                {savingPay ? 'Saving…' : editPayLog ? 'Update' : 'Save'}
                              </button>
                            </div>
                          </form>
                        )}

                        {payLogs.length === 0 ? (
                          <div style={{ fontSize: '0.8rem', color: 'var(--navy-400)', fontFamily: FONT }}>No payments logged yet.</div>
                        ) : payLogs.map((log, i) => (
                          <div key={log._id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: '0.5rem 0', borderBottom: i < payLogs.length - 1 ? '1px solid var(--navy-50)' : 'none' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#10b981', fontFamily: FONT }}>+{fmt(log.amount)}</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--navy-400)', fontFamily: FONT }}>{new Date(log.date).toLocaleDateString()}</span>
                                {log.wallet && (
                                  <span style={{ fontSize: '0.65rem', fontWeight: 600, background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '1px 7px', borderRadius: 5, border: '1px solid rgba(99,102,241,0.2)', fontFamily: FONT }}>
                                    {log.wallet.name}
                                  </span>
                                )}
                                {log.screenshots.length > 0 && (
                                  <span style={{ fontSize: '0.68rem', color: 'var(--navy-400)', display: 'flex', alignItems: 'center', gap: 3, fontFamily: FONT }}>
                                    <PhotoIcon style={{ width: 10, height: 10 }} />{log.screenshots.length}
                                  </span>
                                )}
                              </div>
                              {log.note && <div style={{ fontSize: '0.74rem', color: 'var(--navy-600)', marginTop: 2, fontFamily: FONT }}>{log.note}</div>}
                              {log.loggedBy && <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', fontFamily: FONT }}>by {log.loggedBy.firstName} {log.loggedBy.lastName}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              <button onClick={() => openPayForm(log)}
                                style={{ width: 26, height: 26, borderRadius: 6, border: '1.5px solid var(--navy-200)', background: 'transparent', cursor: 'pointer', color: 'var(--navy-500)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <PencilIcon style={{ width: 11, height: 11 }} />
                              </button>
                              <button onClick={() => deletePayLog(log._id)}
                                style={{ width: 26, height: 26, borderRadius: 6, border: '1.5px solid rgba(239,68,68,0.25)', background: 'transparent', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <TrashIcon style={{ width: 11, height: 11 }} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}

                {/* ── RATE TIERS TAB ── */}
                {activeTab === 'tiers' && selectedUser && (
                  loadingTiers ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <p style={{ fontSize: '0.78rem', color: 'var(--navy-400)', margin: '0 0 0.25rem', fontFamily: FONT, lineHeight: 1.6 }}>
                        Expand a carrier to enable vendors and configure per-weight rate tiers. Rates here are what the user is charged.
                      </p>

                      {CARRIERS_ORDER.map(carrier => {
                        const allVendors      = access.filter(v => v.carrier === carrier);
                        const shVendors       = allVendors.filter(v => v.vendorType !== 'manifest' && (v.portal || 'shippershub') === 'shippershub');
                        const lcVendors      = allVendors.filter(v => v.vendorType !== 'manifest' && v.portal === 'labelcrow');
                        const slVendors      = allVendors.filter(v => v.vendorType !== 'manifest' && v.portal === 'shiplabel');
                        const manifestVendors = allVendors.filter(v => v.vendorType === 'manifest');
                        const enabledCount    = allVendors.filter(v => v.isAllowed).length;
                        const isCarrierOpen   = expandedCarriers[carrier] || false;
                        const cfg = CARRIER_BG[carrier] || { border: 'var(--navy-200)', headerBg: 'var(--navy-50)' };
                        const isAddingHere = addingForCarrier === carrier;

                        const renderVendorRow = (vendor: VendorAccess, _vi: number, isFirst: boolean) => (
                          <div key={vendor.vendorId} style={{ borderTop: `1px solid ${isFirst ? cfg.border : 'var(--navy-75)'}` }}>
                            <div
                              onClick={() => vendor.isAllowed && setExpandedV(e => ({ ...e, [vendor.vendorId]: !e[vendor.vendorId] }))}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.45rem 0.875rem 0.45rem 1rem', background: vendor.isAllowed ? 'rgba(16,185,129,0.04)' : 'transparent', cursor: vendor.isAllowed ? 'pointer' : 'default' }}
                            >
                              <input type="checkbox" checked={vendor.isAllowed} onClick={e => e.stopPropagation()}
                                onChange={() => setAccess(a => a.map(v => v.vendorId === vendor.vendorId ? { ...v, isAllowed: !v.isAllowed } : v))}
                                style={{ cursor: 'pointer', flexShrink: 0 }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {vendor.vendorType === 'manifest' && editingVendorId === vendor.vendorId ? (
                                  <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                                    <input autoFocus type="text" style={{ ...inp, padding: '0.2rem 0.4rem', fontSize: '0.78rem', width: 140 }}
                                      value={editingVendorName}
                                      onChange={e => setEditingVendorName(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') saveManifestVendorName(vendor.vendorId); if (e.key === 'Escape') setEditingVendorId(''); }} />
                                    <button style={{ padding: '2px 8px', background: '#6366f1', border: 'none', borderRadius: 5, color: '#fff', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }} onClick={() => saveManifestVendorName(vendor.vendorId)}>Save</button>
                                    <button style={{ padding: '2px 8px', background: 'transparent', border: '1.5px solid var(--navy-200)', borderRadius: 5, color: 'var(--navy-500)', fontSize: '0.7rem', cursor: 'pointer', fontFamily: FONT }} onClick={() => setEditingVendorId('')}>✕</button>
                                  </div>
                                ) : (
                                  <span style={{ fontWeight: 600, fontSize: '0.79rem', color: 'var(--navy-900)', fontFamily: FONT }}>{vendor.vendorName}</span>
                                )}
                                {vendor.shippingService && editingVendorId !== vendor.vendorId && (
                                  <span style={{ marginLeft: 5, fontSize: '0.68rem', color: 'var(--navy-500)', fontFamily: FONT }}>{vendor.shippingService}</span>
                                )}
                              </div>
                              <span style={{ fontSize: '0.68rem', color: 'var(--navy-500)', flexShrink: 0, fontFamily: FONT }}>base {fmt(vendor.baseRate)}</span>
                              {vendor.vendorType === 'manifest' && editingVendorId !== vendor.vendorId && (
                                <>
                                  <button title="Rename" onClick={e => { e.stopPropagation(); setEditingVendorId(vendor.vendorId); setEditingVendorName(vendor.vendorName); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 3, display: 'flex' }}>
                                    <PencilIcon style={{ width: 11, height: 11 }} />
                                  </button>
                                  <button title="Delete" onClick={e => { e.stopPropagation(); deleteManifestVendor(vendor.vendorId, vendor.vendorName); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 3, display: 'flex' }}>
                                    <TrashIcon style={{ width: 11, height: 11 }} />
                                  </button>
                                </>
                              )}
                              {vendor.isAllowed && editingVendorId !== vendor.vendorId && (
                                <>
                                  <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: 8, background: vendor.rateTiers.length > 0 ? 'rgba(99,102,241,0.1)' : 'var(--navy-100)', color: vendor.rateTiers.length > 0 ? '#6366f1' : 'var(--navy-500)', flexShrink: 0, fontFamily: FONT }}>
                                    {vendor.rateTiers.length}t
                                  </span>
                                  {expandedV[vendor.vendorId]
                                    ? <ChevronUpIcon style={{ width: 12, height: 12, color: 'var(--navy-400)', flexShrink: 0 }} />
                                    : <ChevronDownIcon style={{ width: 12, height: 12, color: 'var(--navy-400)', flexShrink: 0 }} />}
                                </>
                              )}
                            </div>

                            {expandedV[vendor.vendorId] && vendor.isAllowed && (
                              <div style={{ padding: '0.5rem 0.875rem 0.625rem 1.875rem', borderTop: '1px dashed var(--navy-100)', background: 'var(--navy-50)' }}>
                                {vendor.rateTiers.length === 0 ? (
                                  <p style={{ fontSize: '0.72rem', color: 'var(--navy-400)', fontStyle: 'italic', marginBottom: '0.375rem', fontFamily: FONT }}>
                                    No tiers — using base rate {fmt(vendor.baseRate)} for all weights.
                                  </p>
                                ) : (
                                  <div style={{ marginBottom: '0.375rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr 1fr 24px' : '76px 76px 76px 24px', gap: 3, marginBottom: 3 }}>
                                      {['Min lbs', 'Max lbs', 'Rate ($)', ''].map((h, i) => (
                                        <div key={i} style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', fontFamily: FONT }}>{h}</div>
                                      ))}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                      {vendor.rateTiers.map((tier, ti) => (
                                        <div key={ti} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr 1fr 24px' : '76px 76px 76px 24px', gap: 3, alignItems: 'center' }}>
                                          <input type="number" min="0" style={{ ...inp, padding: '0.25rem 0.35rem', fontSize: '0.76rem' }} value={tier.minLbs} onChange={e => updateTierField(vendor.vendorId, ti, 'minLbs', parseFloat(e.target.value) || 0)} />
                                          <input type="number" min="0" style={{ ...inp, padding: '0.25rem 0.35rem', fontSize: '0.76rem' }} value={tier.maxLbs ?? ''} placeholder="∞" onChange={e => updateTierField(vendor.vendorId, ti, 'maxLbs', e.target.value ? parseFloat(e.target.value) : null)} />
                                          <input type="number" step="0.01" min="0" style={{ ...inp, padding: '0.25rem 0.35rem', fontSize: '0.76rem' }} value={tier.rate} onChange={e => updateTierField(vendor.vendorId, ti, 'rate', parseFloat(e.target.value) || 0)} />
                                          <button onClick={() => setAccess(a => a.map(v => v.vendorId !== vendor.vendorId ? v : { ...v, rateTiers: v.rateTiers.filter((_, i) => i !== ti) }))}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 1, display: 'flex' }}>
                                            <XMarkIcon style={{ width: 12, height: 12 }} />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <button onClick={() => setAccess(a => a.map(v => v.vendorId !== vendor.vendorId ? v : { ...v, rateTiers: [...v.rateTiers, { minLbs: 0, maxLbs: null, rate: v.baseRate }] }))}
                                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', border: '1.5px solid var(--navy-200)', borderRadius: 6, background: 'transparent', color: 'var(--navy-500)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                                  <PlusIcon style={{ width: 10, height: 10 }} /> Add Tier
                                </button>
                              </div>
                            )}
                          </div>
                        );

                        return (
                          <div key={carrier} style={{ border: `1.5px solid ${cfg.border}`, borderRadius: 10, overflow: 'hidden' }}>
                            <div
                              onClick={() => setExpandedCarriers(e => ({ ...e, [carrier]: !e[carrier] }))}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.875rem', background: cfg.headerBg, cursor: 'pointer', userSelect: 'none' }}
                            >
                              <CarrierBadge carrier={carrier} />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--navy-900)', fontFamily: FONT }}>{carrier}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--navy-500)', fontFamily: FONT }}>
                                  {allVendors.length === 0 ? 'No vendors configured' : [
                                    shVendors.length  > 0 && `${shVendors.length} ShippersHub`,
                                    lcVendors.length > 0 && `${lcVendors.length} Label Crow`,
                                    slVendors.length > 0 && `${slVendors.length} ShipLabel`,
                                    manifestVendors.length > 0 && `${manifestVendors.length} Manifest`,
                                    `${enabledCount} enabled`,
                                  ].filter(Boolean).join(' · ')}
                                </div>
                              </div>
                              {allVendors.length > 0 && (
                                <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                  {allVendors.slice(0, 4).map(v => (
                                    <span key={v.vendorId} title={v.vendorName} style={{ width: 7, height: 7, borderRadius: '50%', background: v.isAllowed ? '#10b981' : 'var(--navy-200)', display: 'inline-block' }} />
                                  ))}
                                  {allVendors.length > 4 && <span style={{ fontSize: '0.62rem', color: 'var(--navy-400)', fontFamily: FONT }}>+{allVendors.length - 4}</span>}
                                </div>
                              )}
                              {isCarrierOpen
                                ? <ChevronUpIcon style={{ width: 14, height: 14, color: 'var(--navy-400)', flexShrink: 0 }} />
                                : <ChevronDownIcon style={{ width: 14, height: 14, color: 'var(--navy-400)', flexShrink: 0 }} />}
                            </div>

                            {isCarrierOpen && (
                              <div style={{ background: 'var(--bg-card)' }}>
                                {shVendors.length > 0 && (() => {
                                  const pKey = `${carrier}-sh`;
                                  const pOpen = expandedPortals[pKey] !== false;
                                  return (
                                    <>
                                      <div
                                        onClick={() => setExpandedPortals(p => ({ ...p, [pKey]: !pOpen }))}
                                        style={{ padding: '0.35rem 0.875rem', background: 'rgba(29,78,216,0.06)', borderTop: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                                      >
                                        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT }}>ShippersHub</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                          <span style={{ fontSize: '0.58rem', color: '#1d4ed8', fontFamily: FONT }}>{shVendors.length} vendor{shVendors.length !== 1 ? 's' : ''}</span>
                                          {pOpen ? <ChevronUpIcon style={{ width: 11, height: 11, color: '#1d4ed8' }} /> : <ChevronDownIcon style={{ width: 11, height: 11, color: '#1d4ed8' }} />}
                                        </div>
                                      </div>
                                      {pOpen && shVendors.map((v, vi) => renderVendorRow(v, vi, vi === 0))}
                                    </>
                                  );
                                })()}
                                {lcVendors.length > 0 && (() => {
                                  const pKey = `${carrier}-lc`;
                                  const pOpen = expandedPortals[pKey] !== false;
                                  return (
                                    <>
                                      <div
                                        onClick={() => setExpandedPortals(p => ({ ...p, [pKey]: !pOpen }))}
                                        style={{ padding: '0.35rem 0.875rem', background: 'rgba(124,58,237,0.06)', borderTop: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                                      >
                                        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT }}>Label Crow</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                          <span style={{ fontSize: '0.58rem', color: '#7c3aed', fontFamily: FONT }}>{lcVendors.length} vendor{lcVendors.length !== 1 ? 's' : ''}</span>
                                          {pOpen ? <ChevronUpIcon style={{ width: 11, height: 11, color: '#7c3aed' }} /> : <ChevronDownIcon style={{ width: 11, height: 11, color: '#7c3aed' }} />}
                                        </div>
                                      </div>
                                      {pOpen && lcVendors.map((v, vi) => renderVendorRow(v, vi, vi === 0))}
                                    </>
                                  );
                                })()}
                                {slVendors.length > 0 && (() => {
                                  const pKey = `${carrier}-sl`;
                                  const pOpen = expandedPortals[pKey] !== false;
                                  return (
                                    <>
                                      <div
                                        onClick={() => setExpandedPortals(p => ({ ...p, [pKey]: !pOpen }))}
                                        style={{ padding: '0.35rem 0.875rem', background: 'rgba(5,150,105,0.06)', borderTop: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                                      >
                                        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT }}>ShipLabel</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                          <span style={{ fontSize: '0.58rem', color: '#059669', fontFamily: FONT }}>{slVendors.length} vendor{slVendors.length !== 1 ? 's' : ''}</span>
                                          {pOpen ? <ChevronUpIcon style={{ width: 11, height: 11, color: '#059669' }} /> : <ChevronDownIcon style={{ width: 11, height: 11, color: '#059669' }} />}
                                        </div>
                                      </div>
                                      {pOpen && slVendors.map((v, vi) => renderVendorRow(v, vi, vi === 0))}
                                    </>
                                  );
                                })()}
                                {(() => {
                                  const pKey = `${carrier}-manifest`;
                                  const pOpen = expandedPortals[pKey] !== false;
                                  return (
                                    <>
                                      <div
                                        onClick={() => setExpandedPortals(p => ({ ...p, [pKey]: !pOpen }))}
                                        style={{ padding: '0.35rem 0.875rem', background: 'var(--navy-50)', borderTop: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT }}>Manifest Vendors</span>
                                          {manifestVendors.length > 0 && <span style={{ fontSize: '0.58rem', color: 'var(--navy-400)', fontFamily: FONT }}>{manifestVendors.length} vendor{manifestVendors.length !== 1 ? 's' : ''}</span>}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={e => e.stopPropagation()}>
                                          {!isAddingHere && (
                                            <button onClick={() => { setAddingForCarrier(carrier); setNewVendorName(''); }}
                                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', border: '1.5px solid var(--navy-200)', borderRadius: 5, background: 'transparent', color: 'var(--navy-500)', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                                              <PlusIcon style={{ width: 9, height: 9 }} /> Add
                                            </button>
                                          )}
                                          {pOpen
                                            ? <ChevronUpIcon style={{ width: 11, height: 11, color: 'var(--navy-400)' }} />
                                            : <ChevronDownIcon style={{ width: 11, height: 11, color: 'var(--navy-400)' }} />}
                                        </div>
                                      </div>
                                      {pOpen && (
                                        <>
                                          {isAddingHere && (
                                            <div style={{ padding: '0.5rem 0.875rem', borderTop: '1px dashed var(--navy-100)', background: 'rgba(99,102,241,0.04)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                              <input autoFocus type="text" style={{ ...inp, flex: 1, padding: '0.3rem 0.5rem', fontSize: '0.78rem' }}
                                                placeholder="e.g. USPS Veeqo Manifested"
                                                value={newVendorName} onChange={e => setNewVendorName(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') addManifestVendor(carrier); if (e.key === 'Escape') setAddingForCarrier(''); }} />
                                              <button onClick={() => addManifestVendor(carrier)} disabled={savingVendor || !newVendorName.trim()}
                                                style={{ padding: '0.3rem 0.75rem', background: '#6366f1', border: 'none', borderRadius: 6, color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT, opacity: !newVendorName.trim() ? 0.5 : 1 }}>
                                                {savingVendor ? '…' : 'Add'}
                                              </button>
                                              <button onClick={() => setAddingForCarrier('')}
                                                style={{ padding: '0.3rem 0.625rem', border: '1.5px solid var(--navy-200)', borderRadius: 6, background: 'transparent', color: 'var(--navy-500)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: FONT }}>Cancel</button>
                                            </div>
                                          )}
                                          {manifestVendors.length === 0 && !isAddingHere ? (
                                            <div style={{ padding: '0.6rem 1rem', fontSize: '0.72rem', color: 'var(--navy-400)', fontStyle: 'italic', fontFamily: FONT }}>
                                              No manifest vendors yet — click Add to create one.
                                            </div>
                                          ) : (
                                            manifestVendors.map((v, vi) => renderVendorRow(v, vi, vi === 0))
                                          )}
                                        </>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
                        <button onClick={saveTiers} disabled={savingTiers}
                          style={{ padding: '0.6rem 1.25rem', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', border: 'none', borderRadius: 8, color: '#fff', fontSize: '0.84rem', fontWeight: 700, cursor: savingTiers ? 'not-allowed' : 'pointer', fontFamily: FONT, opacity: savingTiers ? 0.7 : 1, boxShadow: '0 4px 12px rgba(99,102,241,0.25)' }}>
                          {savingTiers ? 'Saving…' : 'Save Rate Tiers'}
                        </button>
                      </div>
                    </div>
                  )
                )}

              </div>
            </>
          )}
        </div>
      </div>}
    </div>
  );
};

export default UserManagement;
