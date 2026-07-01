import React, { useEffect, useState, useCallback, useRef } from 'react';
import { siShopify, siEbay, siEtsy } from 'simple-icons';
import ReactDOM from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  LinkIcon, XMarkIcon, CheckCircleIcon, ArrowPathIcon,
  XCircleIcon, ChevronDownIcon, ChevronUpIcon, ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '0.6rem 0.75rem', borderRadius: 8,
  border: '1.5px solid var(--navy-200)',
  background: 'var(--navy-50)', color: 'var(--navy-900)',
  fontSize: '0.84rem', fontFamily: FONT, outline: 'none',
  transition: 'border-color 0.18s, box-shadow 0.18s',
};
const lbl: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-500)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  marginBottom: 5, display: 'block', fontFamily: FONT,
};

const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

interface ShopifyStatus {
  connected: boolean; shop?: string; clientId?: string;
  connectedAt?: string; lastSyncAt?: string;
}
interface EtsyStatus {
  connected: boolean; hasCredentials?: boolean;
  keystring?: string; shopId?: string; shopName?: string;
  lastSyncAt?: string;
}

// ── Brand logos — simple-icons for Shopify/eBay/Etsy, custom for the rest ─────
const PlatformLogo: React.FC<{ id: string; size?: number }> = ({ id, size = 44 }) => {
  const r  = Math.round(size * 0.27);
  const is = Math.round(size * 0.56); // inner icon size

  const Box = ({ bg, shadow, children }: { bg: string; shadow?: string; children: React.ReactNode }) => (
    <div style={{ width: size, height: size, borderRadius: r, background: bg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: shadow }}>
      {children}
    </div>
  );

  const SimpleIcon = ({ icon, shadow }: { icon: { path: string; hex: string }; shadow?: string }) => (
    <Box bg={`#${icon.hex}`} shadow={shadow}>
      <svg width={is} height={is} viewBox="0 0 24 24" fill="white" aria-hidden>
        <path d={icon.path} />
      </svg>
    </Box>
  );

  switch (id) {
    case 'shopify':
      return <SimpleIcon icon={siShopify} shadow={`0 4px 12px #${siShopify.hex}55`} />;
    case 'ebay':
      return <SimpleIcon icon={siEbay} shadow={`0 4px 12px #${siEbay.hex}44`} />;
    case 'etsy':
      return <SimpleIcon icon={siEtsy} shadow={`0 4px 12px #${siEtsy.hex}44`} />;
    case 'walmart':
      return (
        <Box bg="#0071CE">
          <svg width={is} height={is} viewBox="0 0 32 32" fill="none" aria-hidden>
            {[0, 60, 120, 180, 240, 300].map(a => (
              <rect key={a} x="14.5" y="1" width="3" height="10" rx="1.5" fill="#FFC220" transform={`rotate(${a} 16 16)`} />
            ))}
            <circle cx="16" cy="16" r="4" fill="#FFC220" />
          </svg>
        </Box>
      );
    case 'amazon':
      return (
        <Box bg="#232F3E">
          <svg width={is} height={is} viewBox="0 0 24 24" fill="none" aria-hidden>
            <text x="3" y="16" fontSize="13" fontWeight="900" fontFamily="Arial,sans-serif" fill="white">a</text>
            <path d="M3 19 C9 22.5, 15 22.5, 21 19" stroke="#FF9900" strokeWidth="2" strokeLinecap="round" fill="none"/>
            <path d="M19 17.5 L21.5 19 L19 20.5" fill="none" stroke="#FF9900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Box>
      );
    case 'dhl':
      return (
        <Box bg="#FFCC00">
          <svg width={is} height={is} viewBox="0 0 32 12" aria-hidden>
            <text x="1" y="10" fontSize="11" fontWeight="900" fontFamily="Arial,sans-serif" fill="#D40511">DHL</text>
          </svg>
        </Box>
      );
    case 'fedex':
      return (
        <Box bg="#4D148C">
          <svg width={is} height={is} viewBox="0 0 40 14" aria-hidden>
            <text x="1" y="11" fontSize="11" fontWeight="900" fontFamily="Arial,sans-serif" fill="white">Fed</text>
            <text x="21" y="11" fontSize="11" fontWeight="900" fontFamily="Arial,sans-serif" fill="#FF6600">Ex</text>
          </svg>
        </Box>
      );
    case 'ups':
      return (
        <Box bg="#351C15">
          <svg width={is} height={is} viewBox="0 0 32 14" aria-hidden>
            <text x="2" y="11" fontSize="11" fontWeight="900" fontFamily="Arial,sans-serif" fill="#FFB500">UPS</text>
          </svg>
        </Box>
      );
    default:
      return <div style={{ width: size, height: size, borderRadius: r, background: 'var(--navy-100)', flexShrink: 0 }} />;
  }
};

// ── Platform catalogue ────────────────────────────────────────────────────────
interface Platform {
  id: string;
  name: string;
  tagline: string;
  description: string;
  status: 'live' | 'coming';
  accentColor: string;
  bgColor: string;
  chipColor: string;
  features: string[];
  docsUrl?: string;
}

const PLATFORMS: Platform[] = [
  {
    id: 'shopify',
    name: 'Shopify',
    tagline: 'E-commerce platform',
    description: 'Sync orders and customers from your Shopify store in real time. Generate labels directly from any order with one click.',
    status: 'live',
    accentColor: '#96bf48',
    bgColor: 'rgba(150,191,72,0.1)',
    chipColor: '#5a8e00',
    features: ['Real-time order sync', 'Customer import', 'One-click label generation', 'Webhook support'],
    docsUrl: 'https://shopify.dev/docs/api',
  },
  {
    id: 'ebay',
    name: 'eBay',
    tagline: 'Marketplace',
    description: 'Pull orders from your eBay seller account, sync buyer addresses, and generate shipping labels from a single dashboard.',
    status: 'coming',
    accentColor: '#E53238',
    bgColor: 'rgba(229,50,56,0.08)',
    chipColor: '#b91c1c',
    features: ['Order import', 'Buyer sync', 'Bulk label generation', 'Tracking upload'],
  },
  {
    id: 'etsy',
    name: 'Etsy',
    tagline: 'Creative marketplace',
    description: 'Import Etsy shop orders, sync shipping addresses, and create discounted labels without leaving the portal.',
    status: 'live',
    accentColor: '#F56400',
    bgColor: 'rgba(245,100,0,0.08)',
    chipColor: '#c44e00',
    features: ['Shop order sync', 'Address auto-fill', 'Webhook support', 'PKCE OAuth'],
    docsUrl: 'https://developers.etsy.com/documentation/',
  },
  {
    id: 'walmart',
    name: 'Walmart',
    tagline: 'Retail marketplace',
    description: 'Connect your Walmart Marketplace seller account to sync orders and fulfill shipments at scale from one hub.',
    status: 'coming',
    accentColor: '#0071CE',
    bgColor: 'rgba(0,113,206,0.08)',
    chipColor: '#0071CE',
    features: ['Marketplace order sync', 'Fulfillment tracking', 'Return labels', 'Performance dashboard'],
  },
  {
    id: 'amazon',
    name: 'Amazon',
    tagline: 'Global marketplace',
    description: 'Integrate with Amazon Seller Central to import FBA and FBM orders and manage shipments end-to-end.',
    status: 'coming',
    accentColor: '#FF9900',
    bgColor: 'rgba(255,153,0,0.08)',
    chipColor: '#c45000',
    features: ['FBA & FBM orders', 'Multi-region support', 'ASIN tracking', 'Return management'],
  },
  {
    id: 'dhl',
    name: 'DHL',
    tagline: 'Global shipping carrier',
    description: 'Print DHL Express and eCommerce labels directly from the portal with real-time rate shopping and tracking.',
    status: 'coming',
    accentColor: '#D40511',
    bgColor: 'rgba(212,5,17,0.07)',
    chipColor: '#b91c1c',
    features: ['Express & eCommerce labels', 'Real-time rates', 'Live tracking', 'International shipments'],
  },
  {
    id: 'fedex',
    name: 'FedEx',
    tagline: 'Express & ground shipping',
    description: 'Generate FedEx Ground, Home Delivery, and Express labels with discounted rates negotiated through the platform.',
    status: 'coming',
    accentColor: '#4D148C',
    bgColor: 'rgba(77,20,140,0.07)',
    chipColor: '#4D148C',
    features: ['Ground & Express labels', 'Discounted rates', 'Pickup scheduling', 'Proof of delivery'],
  },
  {
    id: 'ups',
    name: 'UPS',
    tagline: 'Reliable parcel delivery',
    description: 'Access UPS Ground, 2nd Day Air, and Next Day Air at platform rates. Generate labels and schedule pickups in one click.',
    status: 'coming',
    accentColor: '#FFB500',
    bgColor: 'rgba(255,181,0,0.08)',
    chipColor: '#92400e',
    features: ['Ground & Air labels', 'Platform rate access', 'Pickup scheduling', 'Returns management'],
  },
];

const GUIDE_STEPS = [
  { n: 1, title: 'Open Shopify Admin',        desc: 'Go to your store admin panel at yourstore.myshopify.com/admin' },
  { n: 2, title: 'Settings → Apps',           desc: 'Click Settings (bottom-left), then Apps and sales channels' },
  { n: 3, title: 'Develop apps',              desc: 'Click Develop apps (top-right corner). Confirm if prompted.' },
  { n: 4, title: 'Create an app',             desc: 'Click Create an app. Name it anything, e.g. "Label Flow".' },
  { n: 5, title: 'Configure API scopes',      desc: 'Click Configure Admin API scopes. Enable: read_orders, read_customers, write_fulfillments. Save.' },
  { n: 6, title: 'Add redirect URL',          desc: 'Under App Setup, paste this redirect URL:', url: 'https://labeluniverse-production.up.railway.app/api/shopify/callback' },
  { n: 7, title: 'Install & copy credentials', desc: 'Go to API credentials tab → Install app. Copy the API key (Client ID) and API secret key (Client Secret).' },
];

const ETSY_GUIDE_STEPS = [
  { n: 1, title: 'Go to Etsy Developers',      desc: 'Visit etsy.com/developers and sign in with your Etsy seller account.' },
  { n: 2, title: 'Create a New App',           desc: 'Click "Manage your apps" → "Create a new app". Enter a name (e.g. "ShipmeHub"), description, and category.' },
  { n: 3, title: 'Copy your Keystring',        desc: 'On the app page, find and copy the Keystring — this is your API Key (Client ID).' },
  { n: 4, title: 'Copy your Shared Secret',    desc: 'Below the Keystring, copy the Shared Secret. Keep this private — it is used to verify webhook events.' },
  { n: 5, title: 'Add Callback URL',           desc: 'Under "Callback URLs" in your app settings, paste this redirect URL and save:', url: 'https://labeluniverse-production.up.railway.app/api/etsy/callback' },
  { n: 6, title: '(Optional) Set up Webhooks', desc: 'In the Webhook portal (commercial apps only), add the endpoint and select order events:', url: 'https://labeluniverse-production.up.railway.app/api/etsy/webhook' },
  { n: 7, title: 'Paste & Connect',            desc: 'Enter your Keystring and Shared Secret above, then click Connect with Etsy.' },
];

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Integrations() {
  const { token }  = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();

  // ── Shopify state ──────────────────────────────────────────────────────────
  const [shopifyStatus, setShopifyStatus] = useState<ShopifyStatus>({ connected: false });
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [shopInput,     setShopInput]     = useState('');
  const [clientId,      setClientId]      = useState('');
  const [clientSecret,  setClientSecret]  = useState('');
  const [shopError,     setShopError]     = useState('');
  const [connecting,    setConnecting]    = useState(false);
  const [syncing,       setSyncing]       = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [guideOpen,     setGuideOpen]     = useState(false);

  // ── Etsy state ─────────────────────────────────────────────────────────────
  const [etsyStatus,       setEtsyStatus]       = useState<EtsyStatus>({ connected: false });
  const [etsyDrawerOpen,   setEtsyDrawerOpen]   = useState(false);
  const [etsyKeystring,    setEtsyKeystring]    = useState('');
  const [etsySharedSecret, setEtsySharedSecret] = useState('');
  const [etsyError,        setEtsyError]        = useState('');
  const [etsyConnecting,   setEtsyConnecting]   = useState(false);
  const [etsySyncing,      setEtsySyncing]      = useState(false);
  const [etsyDisconnecting,setEtsyDisconnecting]= useState(false);
  const [etsyGuideOpen,    setEtsyGuideOpen]    = useState(false);

  // ── Shared message ─────────────────────────────────────────────────────────
  const [syncMsg, setSyncMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const authHeader = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/shopify/status`, { headers: authHeader() });
      setShopifyStatus(res.data);
      if (res.data.shop)     setShopInput(res.data.shop);
      if (res.data.clientId) setClientId(res.data.clientId);
    } catch {
      setShopifyStatus({ connected: false });
    }
  }, [authHeader]);

  const fetchEtsyStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/etsy/status`, { headers: authHeader() });
      setEtsyStatus(res.data);
      if (res.data.keystring) setEtsyKeystring(res.data.keystring);
    } catch {
      setEtsyStatus({ connected: false });
    }
  }, [authHeader]);

  useEffect(() => { fetchStatus(); fetchEtsyStatus(); }, [fetchStatus, fetchEtsyStatus]);

  // OAuth callback params
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get('connected') === 'true') {
      setSyncMsg('Shopify store connected! Orders are being synced.');
      fetchStatus();
      window.history.replaceState({}, '', '/integrations');
    }
    if (p.get('error')) {
      setShopError(`Connection failed: ${p.get('error')}. Please try again.`);
      window.history.replaceState({}, '', '/integrations');
    }
    if (p.get('etsy_connected') === 'true') {
      setSyncMsg('Etsy shop connected! Orders are being synced.');
      fetchEtsyStatus();
      window.history.replaceState({}, '', '/integrations');
    }
    if (p.get('etsy_error')) {
      setEtsyError(`Etsy connection failed: ${p.get('etsy_error')}. Please try again.`);
      window.history.replaceState({}, '', '/integrations');
    }
  }, [location.search, fetchStatus, fetchEtsyStatus]);

  useEffect(() => {
    if (syncMsg) {
      timerRef.current = setTimeout(() => setSyncMsg(''), 5000);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
  }, [syncMsg]);

  const handleConnect = async () => {
    if (!shopInput.trim() || !clientId.trim() || !clientSecret.trim()) {
      setShopError('All three fields are required'); return;
    }
    setShopError(''); setConnecting(true);
    try {
      await axios.post(`${API_BASE}/shopify/credentials`,
        { shop: shopInput.trim(), clientId: clientId.trim(), clientSecret: clientSecret.trim() },
        { headers: authHeader() }
      );
      const res = await axios.get(`${API_BASE}/shopify/auth-url`, { headers: authHeader() });
      window.location.href = res.data.authUrl;
    } catch (err: any) {
      setShopError(err.response?.data?.message || 'Failed to start connection');
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true); setSyncMsg('');
    try {
      const res = await axios.post(`${API_BASE}/shopify/sync`, {}, { headers: authHeader() });
      setSyncMsg(`${res.data.synced} orders synced successfully.`);
      fetchStatus();
    } catch (err: any) {
      setSyncMsg(err.response?.data?.message || 'Sync failed');
    } finally { setSyncing(false); }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(`Disconnect ${shopifyStatus.shop}? All synced orders will be removed.`)) return;
    setDisconnecting(true);
    try {
      await axios.delete(`${API_BASE}/shopify/disconnect`, { headers: authHeader() });
      setShopifyStatus({ connected: false }); setSyncMsg('Store disconnected.');
    } catch (err: any) {
      setSyncMsg(err.response?.data?.message || 'Failed to disconnect');
    } finally { setDisconnecting(false); }
  };

  const handleEtsyConnect = async () => {
    if (!etsyKeystring.trim() || !etsySharedSecret.trim()) {
      setEtsyError('Both Keystring and Shared Secret are required'); return;
    }
    setEtsyError(''); setEtsyConnecting(true);
    try {
      await axios.post(
        `${API_BASE}/etsy/credentials`,
        { keystring: etsyKeystring.trim(), sharedSecret: etsySharedSecret.trim() },
        { headers: authHeader() }
      );
      const res = await axios.get(`${API_BASE}/etsy/auth-url`, { headers: authHeader() });
      window.location.href = res.data.authUrl;
    } catch (err: any) {
      setEtsyError(err.response?.data?.message || 'Failed to start Etsy connection');
      setEtsyConnecting(false);
    }
  };

  const handleEtsySync = async () => {
    setEtsySyncing(true); setSyncMsg('');
    try {
      const res = await axios.post(`${API_BASE}/etsy/sync`, {}, { headers: authHeader() });
      setSyncMsg(`${res.data.synced} Etsy orders synced successfully.`);
      fetchEtsyStatus();
    } catch (err: any) {
      setSyncMsg(err.response?.data?.message || 'Etsy sync failed');
    } finally { setEtsySyncing(false); }
  };

  const handleEtsyDisconnect = async () => {
    if (!window.confirm(`Disconnect ${etsyStatus.shopName || 'Etsy shop'}? All synced orders will be removed.`)) return;
    setEtsyDisconnecting(true);
    try {
      await axios.delete(`${API_BASE}/etsy/disconnect`, { headers: authHeader() });
      setEtsyStatus({ connected: false }); setSyncMsg('Etsy shop disconnected.');
    } catch (err: any) {
      setSyncMsg(err.response?.data?.message || 'Failed to disconnect Etsy');
    } finally { setEtsyDisconnecting(false); }
  };

  const focusI = (e: React.FocusEvent<HTMLInputElement>) =>
    Object.assign(e.currentTarget.style, { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99,102,241,0.12)' });
  const blurI = (e: React.FocusEvent<HTMLInputElement>) =>
    Object.assign(e.currentTarget.style, { borderColor: 'var(--navy-200)', boxShadow: 'none' });

  const connectedCount = (shopifyStatus.connected ? 1 : 0) + (etsyStatus.connected ? 1 : 0);
  const liveCount      = PLATFORMS.filter(p => p.status === 'live').length;
  const comingCount    = PLATFORMS.filter(p => p.status === 'coming').length;

  // ── Shopify drawer (portalled) ─────────────────────────────────────────────
  const ShopifyDrawer = drawerOpen ? ReactDOM.createPortal(
    <>
      <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)', zIndex: 9199 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 460,
        background: 'var(--bg-card)', zIndex: 9200, display: 'flex', flexDirection: 'column',
        boxShadow: '-16px 0 48px rgba(0,0,0,0.16)',
        animation: 'slideInFromRight 0.22s cubic-bezier(0.16,1,0.3,1) both',
        fontFamily: FONT,
      }}>
        {/* Drawer header */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <PlatformLogo id="shopify" size={34} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--navy-900)', fontFamily: FONT }}>Shopify</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', fontFamily: FONT }}>Connect your store via Custom App</div>
          </div>
          <button onClick={() => setDrawerOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 4, display: 'flex', borderRadius: 7 }}>
            <XMarkIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Drawer body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

          {shopError && (
            <div style={{ padding: '0.55rem 0.875rem', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#dc2626', fontSize: '0.8rem', fontWeight: 600, fontFamily: FONT }}>
              {shopError}
            </div>
          )}

          {/* Credentials */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div>
              <label style={lbl}>Store URL</label>
              <input value={shopInput} onChange={e => setShopInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleConnect()} placeholder="mystore.myshopify.com" type="text" style={inp} onFocus={focusI} onBlur={blurI} />
            </div>
            <div>
              <label style={lbl}>API Key <span style={{ color: 'var(--navy-400)', fontWeight: 500, textTransform: 'none', fontSize: '0.65rem' }}>(Client ID)</span></label>
              <input value={clientId} onChange={e => setClientId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleConnect()} placeholder="Paste API key" type="text" style={{ ...inp, fontFamily: 'monospace' }} onFocus={focusI} onBlur={blurI} />
            </div>
            <div>
              <label style={lbl}>API Secret Key <span style={{ color: 'var(--navy-400)', fontWeight: 500, textTransform: 'none', fontSize: '0.65rem' }}>(Client Secret)</span></label>
              <input value={clientSecret} onChange={e => setClientSecret(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleConnect()} placeholder="Paste API secret" type="password" style={{ ...inp, fontFamily: 'monospace' }} onFocus={focusI} onBlur={blurI} />
            </div>
          </div>

          {/* Step-by-step guide */}
          <div style={{ border: '1.5px solid var(--navy-200)', borderRadius: 10, overflow: 'hidden' }}>
            <button onClick={() => setGuideOpen(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.7rem 1rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--navy-700)', fontFamily: FONT }}>How to get your API Key & Secret</span>
              {guideOpen
                ? <ChevronUpIcon   style={{ width: 14, height: 14, color: 'var(--navy-400)' }} />
                : <ChevronDownIcon style={{ width: 14, height: 14, color: 'var(--navy-400)' }} />}
            </button>
            {guideOpen && (
              <div style={{ borderTop: '1px solid var(--navy-100)', padding: '0.875rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--navy-50)' }}>
                {GUIDE_STEPS.map(step => (
                  <div key={step.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <span style={{ fontSize: '0.58rem', fontWeight: 800, color: '#fff', fontFamily: FONT }}>{step.n}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-900)', fontFamily: FONT }}>{step.title}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)', lineHeight: 1.5, fontFamily: FONT }}>{step.desc}</div>
                      {step.url && (
                        <div style={{ marginTop: 4, padding: '4px 8px', background: 'var(--bg-card)', border: '1px solid var(--navy-200)', borderRadius: 5, fontFamily: 'monospace', fontSize: '0.65rem', color: 'var(--navy-700)', wordBreak: 'break-all' }}>
                          {step.url}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Drawer footer */}
        <div style={{ padding: '0.875rem 1.25rem', borderTop: '1px solid var(--navy-100)', display: 'flex', gap: 8 }}>
          <button onClick={() => setDrawerOpen(false)} style={{ flex: 1, padding: '0.6rem', borderRadius: 8, border: '1.5px solid var(--navy-200)', background: 'transparent', color: 'var(--navy-600)', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
            Cancel
          </button>
          <button onClick={handleConnect} disabled={connecting} style={{ flex: 2, padding: '0.6rem', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', fontSize: '0.84rem', fontWeight: 700, cursor: connecting ? 'not-allowed' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: connecting ? 0.7 : 1, boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
            <LinkIcon style={{ width: 14, height: 14 }} />
            {connecting ? 'Connecting…' : 'Connect Store'}
          </button>
        </div>
      </div>
      <style>{`@keyframes slideInFromRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </>,
    document.body
  ) : null;

  // ── Platform card ──────────────────────────────────────────────────────────
  const renderCard = (platform: Platform) => {
    const isShopify   = platform.id === 'shopify';
    const isEtsy      = platform.id === 'etsy';
    const isConnected = (isShopify && shopifyStatus.connected) || (isEtsy && etsyStatus.connected);
    const isLive      = platform.status === 'live';
    const dimmed      = !isLive;

    return (
      <div
        key={platform.id}
        className="db-card"
        style={{
          display: 'flex', flexDirection: 'column',
          opacity: dimmed ? 0.72 : 1,
          transition: 'box-shadow 0.15s, transform 0.15s',
          overflow: 'hidden',
          position: 'relative',
        }}
        onMouseEnter={e => { if (!dimmed) { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-lg)'; } }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'none'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-card)'; }}
      >
        {/* Top accent */}
        <div style={{ height: 3, background: isConnected ? '#10b981' : platform.accentColor, opacity: dimmed ? 0.5 : 1 }} />

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1, gap: '0.875rem' }}>

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <PlatformLogo id={platform.id} size={44} />
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--navy-900)', fontFamily: FONT }}>{platform.name}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', fontFamily: FONT }}>{platform.tagline}</div>
              </div>
            </div>

            {/* Status badge */}
            {isConnected ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 99, fontSize: '0.62rem', fontWeight: 700, background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.22)', flexShrink: 0, fontFamily: FONT }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} /> Connected
              </span>
            ) : isLive ? (
              <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: '0.62rem', fontWeight: 700, background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)', flexShrink: 0, fontFamily: FONT }}>
                Available
              </span>
            ) : (
              <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: '0.62rem', fontWeight: 700, background: 'var(--navy-100)', color: 'var(--navy-400)', border: '1px solid var(--navy-200)', flexShrink: 0, fontFamily: FONT }}>
                Coming Soon
              </span>
            )}
          </div>

          {/* Description */}
          <p style={{ fontSize: '0.8rem', color: 'var(--navy-500)', lineHeight: 1.65, margin: 0, fontFamily: FONT }}>
            {platform.description}
          </p>

          {/* Feature chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {platform.features.map(f => (
              <span key={f} style={{ padding: '2px 8px', borderRadius: 99, fontSize: '0.62rem', fontWeight: 600, background: platform.bgColor, color: platform.chipColor, border: `1px solid ${platform.accentColor}30`, fontFamily: FONT }}>
                {f}
              </span>
            ))}
          </div>

          {/* Connected shop details */}
          {isConnected && (() => {
            const syncAt = isShopify ? shopifyStatus.lastSyncAt : etsyStatus.lastSyncAt;
            const label  = isShopify ? shopifyStatus.shop : (etsyStatus.shopName || '');
            if (!syncAt) return null;
            return (
              <div style={{ padding: '0.6rem 0.875rem', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 8 }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#059669', fontFamily: FONT, marginBottom: 2 }}>
                  {label}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', fontFamily: FONT }}>
                  Last sync: {new Date(syncAt).toLocaleString()}
                </div>
              </div>
            );
          })()}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--navy-100)' }} />

          {/* Action row */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {isConnected ? (
              <>
                <button
                  onClick={() => navigate('/orders')}
                  style={{ flex: 1, padding: '0.5rem 0', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                >
                  View Orders
                </button>
                <button
                  onClick={isEtsy ? handleEtsySync : handleSync}
                  disabled={isEtsy ? etsySyncing : syncing}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1.5px solid var(--navy-200)', background: 'transparent', color: 'var(--navy-600)', fontSize: '0.78rem', fontWeight: 600, cursor: (isEtsy ? etsySyncing : syncing) ? 'not-allowed' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <ArrowPathIcon style={{ width: 13, height: 13, animation: (isEtsy ? etsySyncing : syncing) ? 'spin 1s linear infinite' : 'none' }} />
                  {(isEtsy ? etsySyncing : syncing) ? '…' : 'Sync'}
                </button>
                <button
                  onClick={isEtsy ? handleEtsyDisconnect : handleDisconnect}
                  disabled={isEtsy ? etsyDisconnecting : disconnecting}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.07)', color: '#dc2626', fontSize: '0.78rem', fontWeight: 600, cursor: (isEtsy ? etsyDisconnecting : disconnecting) ? 'not-allowed' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <XCircleIcon style={{ width: 13, height: 13 }} />
                  {(isEtsy ? etsyDisconnecting : disconnecting) ? '…' : 'Disconnect'}
                </button>
              </>
            ) : isLive ? (
              <>
                <button
                  onClick={() => isEtsy ? setEtsyDrawerOpen(true) : setDrawerOpen(true)}
                  style={{ flex: 1, padding: '0.5rem 0', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, boxShadow: '0 4px 10px rgba(99,102,241,0.25)' }}
                >
                  <LinkIcon style={{ width: 13, height: 13 }} />
                  Connect
                </button>
                {platform.docsUrl && (
                  <a href={platform.docsUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1.5px solid var(--navy-200)', background: 'transparent', color: 'var(--navy-500)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
                    <ArrowTopRightOnSquareIcon style={{ width: 13, height: 13 }} /> Docs
                  </a>
                )}
              </>
            ) : (
              <div style={{ flex: 1, padding: '0.5rem 0', textAlign: 'center', fontSize: '0.78rem', color: 'var(--navy-400)', fontWeight: 600, fontFamily: FONT }}>
                Coming Soon
              </div>
            )}
          </div>

        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', fontFamily: FONT, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--navy-900)', letterSpacing: '-0.5px', margin: 0, fontFamily: FONT }}>
            Integrations
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--navy-400)', margin: '5px 0 0', fontFamily: FONT }}>
            Connect your sales channels to sync orders and automate fulfillment.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { label: 'Connected',   value: connectedCount,  color: '#059669', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)' },
            { label: 'Available',   value: liveCount,       color: '#6366f1', bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.2)' },
            { label: 'Coming Soon', value: comingCount,     color: 'var(--navy-400)', bg: 'var(--navy-50)', border: 'var(--navy-200)' },
          ].map(({ label, value, color, bg, border }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: bg, border: `1px solid ${border}`, borderRadius: 99 }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 800, color, fontFamily: FONT }}>{value}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--navy-400)', fontFamily: FONT }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sync/status message */}
      {(syncMsg) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 1rem', borderRadius: 9, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: '#065f46', fontSize: '0.82rem', fontWeight: 600, fontFamily: FONT }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <CheckCircleIcon style={{ width: 14, height: 14 }} /> {syncMsg}
          </span>
          <button onClick={() => setSyncMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46', fontSize: 16, padding: 0 }}>×</button>
        </div>
      )}

      {/* ── Category: E-commerce ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
          <div style={{ height: 1, width: 0, flex: '0 0 0' }} />
          <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: FONT, whiteSpace: 'nowrap' }}>
            E-commerce Platforms
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--navy-100)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {PLATFORMS.filter(p => p.id === 'shopify').map(renderCard)}
        </div>
      </div>

      {/* ── Category: Marketplaces ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: FONT, whiteSpace: 'nowrap' }}>
            Marketplaces
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--navy-100)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {PLATFORMS.filter(p => ['ebay', 'etsy', 'walmart', 'amazon'].includes(p.id)).map(renderCard)}
        </div>
      </div>

      {/* Shopify drawer */}
      {ShopifyDrawer}

      {/* Etsy drawer */}
      {etsyDrawerOpen && ReactDOM.createPortal(
        <>
          <div onClick={() => setEtsyDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)', zIndex: 9199 }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 460,
            background: 'var(--bg-card)', zIndex: 9200, display: 'flex', flexDirection: 'column',
            boxShadow: '-16px 0 48px rgba(0,0,0,0.16)',
            animation: 'slideInFromRight 0.22s cubic-bezier(0.16,1,0.3,1) both',
            fontFamily: FONT,
          }}>
            {/* Header */}
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <PlatformLogo id="etsy" size={34} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--navy-900)', fontFamily: FONT }}>Etsy</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', fontFamily: FONT }}>Connect via your Etsy Developer App</div>
              </div>
              <button onClick={() => setEtsyDrawerOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 4, display: 'flex', borderRadius: 7 }}>
                <XMarkIcon style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {etsyError && (
                <div style={{ padding: '0.55rem 0.875rem', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#dc2626', fontSize: '0.8rem', fontWeight: 600, fontFamily: FONT }}>
                  {etsyError}
                </div>
              )}

              {/* Credentials */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div>
                  <label style={lbl}>API Key <span style={{ color: 'var(--navy-400)', fontWeight: 500, textTransform: 'none', fontSize: '0.65rem' }}>(Keystring)</span></label>
                  <input
                    value={etsyKeystring}
                    onChange={e => setEtsyKeystring(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleEtsyConnect()}
                    placeholder="Paste your Etsy Keystring"
                    type="text"
                    style={{ ...inp, fontFamily: 'monospace' }}
                    onFocus={focusI} onBlur={blurI}
                  />
                </div>
                <div>
                  <label style={lbl}>Shared Secret <span style={{ color: 'var(--navy-400)', fontWeight: 500, textTransform: 'none', fontSize: '0.65rem' }}>(for webhook verification)</span></label>
                  <input
                    value={etsySharedSecret}
                    onChange={e => setEtsySharedSecret(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleEtsyConnect()}
                    placeholder="Paste your Shared Secret"
                    type="password"
                    style={{ ...inp, fontFamily: 'monospace' }}
                    onFocus={focusI} onBlur={blurI}
                  />
                </div>
              </div>

              {/* Step-by-step guide */}
              <div style={{ border: '1.5px solid var(--navy-200)', borderRadius: 10, overflow: 'hidden' }}>
                <button onClick={() => setEtsyGuideOpen(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.7rem 1rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--navy-700)', fontFamily: FONT }}>How to get your Keystring & Shared Secret</span>
                  {etsyGuideOpen
                    ? <ChevronUpIcon   style={{ width: 14, height: 14, color: 'var(--navy-400)' }} />
                    : <ChevronDownIcon style={{ width: 14, height: 14, color: 'var(--navy-400)' }} />}
                </button>
                {etsyGuideOpen && (
                  <div style={{ borderTop: '1px solid var(--navy-100)', padding: '0.875rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--navy-50)' }}>
                    {ETSY_GUIDE_STEPS.map(step => (
                      <div key={step.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(135deg,#F56400,#c44e00)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                          <span style={{ fontSize: '0.58rem', fontWeight: 800, color: '#fff', fontFamily: FONT }}>{step.n}</span>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-900)', fontFamily: FONT }}>{step.title}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)', lineHeight: 1.5, fontFamily: FONT }}>{step.desc}</div>
                          {step.url && (
                            <div style={{ marginTop: 4, padding: '4px 8px', background: 'var(--bg-card)', border: '1px solid var(--navy-200)', borderRadius: 5, fontFamily: 'monospace', fontSize: '0.65rem', color: 'var(--navy-700)', wordBreak: 'break-all' }}>
                              {step.url}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '0.875rem 1.25rem', borderTop: '1px solid var(--navy-100)', display: 'flex', gap: 8 }}>
              <button onClick={() => setEtsyDrawerOpen(false)} style={{ flex: 1, padding: '0.6rem', borderRadius: 8, border: '1.5px solid var(--navy-200)', background: 'transparent', color: 'var(--navy-600)', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                Cancel
              </button>
              <button onClick={handleEtsyConnect} disabled={etsyConnecting} style={{ flex: 2, padding: '0.6rem', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#F56400,#c44e00)', color: '#fff', fontSize: '0.84rem', fontWeight: 700, cursor: etsyConnecting ? 'not-allowed' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: etsyConnecting ? 0.7 : 1, boxShadow: '0 4px 12px rgba(245,100,0,0.3)' }}>
                <LinkIcon style={{ width: 14, height: 14 }} />
                {etsyConnecting ? 'Connecting…' : 'Connect with Etsy'}
              </button>
            </div>
          </div>
        </>,
        document.body
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
