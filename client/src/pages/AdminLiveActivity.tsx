import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import axios from 'axios';
import { useSocket } from '../contexts/SocketContext';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

// ── State abbreviation → full name ────────────────────────────
const STATE_ABBR: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',
  KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',
  MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',
  NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',
  NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
  DC:'District of Columbia',
};

function resolveState(raw: string): string {
  if (!raw) return '';
  const up = raw.trim().toUpperCase();
  return STATE_ABBR[up] || raw.trim();
}

const AMBER_STOPS = ['#FEF3C7','#FDE68A','#FCD34D','#FBBF24','#F59E0B','#D97706','#B45309'];
const CARRIER_COLOR: Record<string, string> = {
  USPS:'#1D4ED8', UPS:'#92400E', FedEx:'#5B21B6', DHL:'#B45309',
};
const CARRIER_GRADIENT: Record<string, string> = {
  USPS:'linear-gradient(90deg,#1D4ED8,#60A5FA)',
  UPS: 'linear-gradient(90deg,#92400E,#F59E0B)',
  FedEx:'linear-gradient(90deg,#5B21B6,#A78BFA)',
  DHL: 'linear-gradient(90deg,#B45309,#FCD34D)',
};
const CARRIER_BG: Record<string, string> = {
  USPS:'rgba(29,78,216,0.08)', UPS:'rgba(146,64,14,0.08)',
  FedEx:'rgba(91,33,182,0.08)', DHL:'rgba(180,83,9,0.08)',
};

function fmt(n: number)  { return Math.round(n).toLocaleString(); }
function fmt$(n: number) { return `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}`; }

interface LiveStats {
  labelsToday:        number;
  labelsAllTime:      number;
  labelsThisHour:     number;
  perMinuteEst:       string;
  activeUsers:        number;
  totalUsers:         number;
  pendingManifests:   number;
  completedManifests: number;
  totalRevenue:       number;
  labelsByCarrier:    Record<string, { count: number; revenue: number }>;
  labelsByState:      { state: string; count: number }[];
  recentLabels:       any[];
  fetchedAt:          string;
}

const AdminLiveActivity: React.FC = () => {
  const { socket } = useSocket();

  const [stats,        setStats]        = useState<LiveStats | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [clock,        setClock]        = useState('--:--:--');
  const [dateStr,      setDateStr]      = useState('');
  const [hourProgress, setHourProgress] = useState(0);
  const [minElapsed,   setMinElapsed]   = useState(0);
  const [lastFetch,    setLastFetch]    = useState('');

  const [rtLabelsToday,    setRtLabelsToday]    = useState(0);
  const [rtLabelsAllTime,  setRtLabelsAllTime]  = useState(0);
  const [rtLabelsThisHour, setRtLabelsThisHour] = useState(0);
  const [rtFeed,           setRtFeed]           = useState<any[]>([]);
  const [flashTicker,      setFlashTicker]      = useState(false);

  const mapRef   = useRef<HTMLDivElement>(null);
  const svgRef   = useRef<SVGSVGElement | null>(null);
  const mapReady = useRef(false);
  const stateMap = useRef<Record<string, number>>({});

  // ── Clock ──────────────────────────────────────────────────
  useEffect(() => {
    function tick() {
      const now = new Date();
      setClock(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`);
      setMinElapsed(now.getMinutes());
      setHourProgress(Math.round((now.getMinutes() / 60) * 100));
      setDateStr(now.toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric', year:'numeric' }));
    }
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  // ── Fetch real stats ───────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const { data } = await axios.get<LiveStats>('/stats/admin-live');
      setStats(data);
      setRtLabelsToday(data.labelsToday);
      setRtLabelsAllTime(data.labelsAllTime);
      setRtLabelsThisHour(data.labelsThisHour);
      setRtFeed(data.recentLabels || []);
      const sm: Record<string, number> = {};
      for (const s of data.labelsByState) {
        const full = resolveState(s.state);
        if (full) sm[full] = (sm[full] || 0) + s.count;
      }
      stateMap.current = sm;
      redrawMap();
      const now = new Date(data.fetchedAt);
      setLastFetch(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`);
      setError('');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to fetch live stats');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchStats();
    const iv = setInterval(fetchStats, 30_000);
    return () => clearInterval(iv);
  }, [fetchStats]);

  // ── D3 choropleth ──────────────────────────────────────────
  const redrawMap = useCallback(() => {
    if (!mapRef.current) return;
    if (!mapReady.current) { drawMap(); return; }
    const vals = Object.values(stateMap.current);
    const maxVal = vals.length ? Math.max(...vals) : 1;
    const colorScale = d3.scaleQuantize<string>().domain([0, maxVal]).range(AMBER_STOPS);
    d3.select(mapRef.current).selectAll<SVGPathElement, any>('path')
      .attr('fill', (d: any) => {
        const v = stateMap.current[d?.properties?.name] || 0;
        return v > 0 ? colorScale(v) : 'var(--navy-100)';
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket real-time events ────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handler = (data: any) => {
      setRtLabelsToday(v => v + 1);
      setRtLabelsAllTime(v => v + 1);
      setRtLabelsThisHour(v => v + 1);
      setFlashTicker(true);
      setTimeout(() => setFlashTicker(false), 600);
      setRtFeed(prev => [{
        _id: `rt-${Date.now()}`,
        carrier: data.carrier, trackingId: data.trackingId,
        price: data.price, to_state: data.toState, to_city: data.toCity,
        createdAt: data.createdAt, user: null, _isRt: true,
      }, ...prev].slice(0, 20));
      const full = resolveState(data.toState);
      if (full) { stateMap.current[full] = (stateMap.current[full] || 0) + 1; redrawMap(); }
    };
    socket.on('admin-label-generated', handler);
    return () => { socket.off('admin-label-generated', handler); };
  }, [socket, redrawMap]);

  async function drawMap() {
    if (mapReady.current || !mapRef.current) return;
    try {
      const us = await d3.json<any>('/states-10m.json');
      if (!us || !mapRef.current) return;
      d3.select(mapRef.current).selectAll('*').remove();
      const W = mapRef.current.offsetWidth || 560;
      const H = Math.round(W * 0.6);
      const vals = Object.values(stateMap.current);
      const maxVal = vals.length ? Math.max(...vals) : 1;
      const colorScale = d3.scaleQuantize<string>().domain([0, maxVal]).range(AMBER_STOPS);
      const proj = d3.geoAlbersUsa().scale(W * 1.22).translate([W / 2, H / 2]);
      const path = d3.geoPath(proj);
      const svg = d3.select(mapRef.current)
        .append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').style('display','block');
      svgRef.current = svg.node();
      const states = topojson.feature(us, us.objects.states) as any;
      svg.selectAll<SVGPathElement, any>('path').data(states.features).join('path')
        .attr('d', path as any)
        .attr('fill', (d: any) => { const v = stateMap.current[d?.properties?.name] || 0; return v > 0 ? colorScale(v) : '#E2E8F0'; })
        .attr('stroke', '#fff').attr('stroke-width', 0.6)
        .append('title').text((d: any) => { const name = d?.properties?.name as string; return `${name}: ${(stateMap.current[name] || 0).toLocaleString()} labels`; });
      mapReady.current = true;
    } catch (err) { console.error('[AdminLiveActivity] map error:', err); }
  }

  // ── Loading / error guards ─────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', padding:'4rem', fontFamily: FONT }}>
      <div className="spinner" />
    </div>
  );

  if (error) return (
    <div style={{ padding:'1.5rem', fontFamily: FONT }}>
      <div style={{ padding:'0.75rem 1rem', borderRadius:9, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', color:'#dc2626', fontSize:'0.82rem', fontWeight:600 }}>{error}</div>
    </div>
  );

  if (!stats) return null;

  const totalCarrierLabels = Object.values(stats.labelsByCarrier).reduce((s, v) => s + v.count, 0) || 1;
  const topStates = [...stats.labelsByState]
    .map(s => ({ ...s, fullName: resolveState(s.state) }))
    .filter(s => s.fullName).slice(0, 10);
  const maxStateCount = topStates[0]?.count || 1;
  const perMin = minElapsed > 0 ? (rtLabelsThisHour / minElapsed).toFixed(1) : stats.perMinuteEst;

  return (
    <>
      <style>{`
        @keyframes la-blink  { 0%,100%{opacity:1} 50%{opacity:0.15} }
        @keyframes la-fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        @keyframes la-pulse  { 0%,100%{box-shadow:0 0 0 0 rgba(22,163,74,0.4)} 60%{box-shadow:0 0 0 6px rgba(22,163,74,0)} }
        .rt-row-flash { animation: la-rtflash 0.7s ease; }
        @keyframes la-rtflash { 0%{background:rgba(99,102,241,0.08)} 100%{background:transparent} }
      `}</style>

      <div style={{ maxWidth: 1200, margin: '0 auto', display:'flex', flexDirection:'column', gap:'1rem', fontFamily: FONT }}>

        {/* ── Header ─────────────────────────────────────────── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <h1 style={{ fontSize:'1.3rem', fontWeight:900, color:'var(--navy-900)', letterSpacing:'-0.5px', margin:0, fontFamily:FONT }}>
                Live Monitor
              </h1>
              <span style={{ fontSize:'0.6rem', fontWeight:700, color:'#6366f1', background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.2)', padding:'2px 7px', borderRadius:99, fontFamily:FONT }}>
                Admin
              </span>
              <span style={{ fontSize:'0.6rem', fontWeight:700, color:'#c2410c', background:'#fff7ed', border:'1px solid #fed7aa', padding:'2px 7px', borderRadius:99, fontFamily:FONT }}>
                REAL DATA
              </span>
            </div>
            <p style={{ fontSize:'0.78rem', color:'var(--navy-400)', margin:'4px 0 0', fontFamily:FONT }}>
              Platform-wide activity — syncs every 30s, real-time via socket
            </p>
          </div>

          {/* Right side: live dot + clock */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {lastFetch && (
              <span style={{ fontSize:'0.68rem', color:'var(--navy-400)', fontFamily:FONT }}>
                synced {lastFetch}
              </span>
            )}
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:99, background:'rgba(22,163,74,0.08)', border:'1px solid rgba(22,163,74,0.2)' }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:'#16a34a', animation:'la-blink 1.4s ease-in-out infinite, la-pulse 2s ease infinite', flexShrink:0 }} />
              <span style={{ fontSize:'0.65rem', color:'#16a34a', letterSpacing:'0.1em', fontWeight:800, fontFamily:FONT }}>LIVE</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
              <span style={{ fontSize:'1rem', fontWeight:700, color:'var(--navy-800)', fontVariantNumeric:'tabular-nums', letterSpacing:'-0.5px', lineHeight:1.1, fontFamily:FONT }}>{clock}</span>
              <span style={{ fontSize:'0.62rem', color:'var(--navy-400)', fontFamily:FONT }}>{dateStr}</span>
            </div>
          </div>
        </div>

        {/* ── 4 Metric cards ──────────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:'0.75rem' }}>

          {[
            {
              label: 'Labels Today', value: fmt(rtLabelsToday),
              sub: 'since midnight', subColor: '#16a34a',
              accent: '#6366f1', accentBg: 'rgba(99,102,241,0.06)',
              delay: '0.05s',
            },
            {
              label: 'All-Time Labels', value: fmt(rtLabelsAllTime),
              sub: 'platform-wide', subColor: 'var(--navy-400)',
              accent: '#0ea5e9', accentBg: 'rgba(14,165,233,0.06)',
              delay: '0.10s',
            },
            {
              label: 'Active Users', value: fmt(stats.activeUsers),
              sub: `of ${fmt(stats.totalUsers)} total`, subColor: 'var(--navy-400)',
              accent: '#10b981', accentBg: 'rgba(16,185,129,0.06)',
              delay: '0.15s',
            },
            {
              label: 'Total Revenue', value: fmt$(stats.totalRevenue),
              sub: 'all labels + manifests', subColor: 'var(--navy-400)',
              accent: '#16a34a', accentBg: 'rgba(22,163,74,0.06)',
              valueColor: '#16a34a',
              delay: '0.20s',
            },
          ].map(({ label, value, sub, subColor, accent, accentBg, valueColor, delay }) => (
            <div
              key={label}
              className="db-card"
              style={{ padding:'1.1rem 1.25rem', animation:`la-fadeUp 0.4s ease both`, animationDelay:delay, overflow:'hidden', position:'relative' }}
            >
              {/* top accent line */}
              <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:accent, borderRadius:'16px 16px 0 0', opacity:0.7 }} />
              <div style={{ fontSize:'0.65rem', fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10, fontFamily:FONT }}>
                {label}
              </div>
              <div style={{ fontSize:'1.85rem', fontWeight:900, color: valueColor || 'var(--navy-900)', lineHeight:1, letterSpacing:'-0.03em', fontFamily:FONT }}>
                {value}
              </div>
              <div style={{ fontSize:'0.7rem', color: subColor, marginTop:8, fontFamily:FONT, fontWeight:500 }}>
                {sub}
              </div>
              {/* bg tint */}
              <div style={{ position:'absolute', bottom:-12, right:-12, width:64, height:64, borderRadius:'50%', background:accentBg, pointerEvents:'none' }} />
            </div>
          ))}
        </div>

        {/* ── Hour ticker banner ──────────────────────────────── */}
        <div
          className="db-card"
          style={{
            padding:'1.1rem 1.5rem',
            display:'grid',
            gridTemplateColumns:'auto 1px auto 1px auto 1px auto 1px 1fr',
            alignItems:'center', gap:0,
            background: flashTicker ? 'rgba(251,191,36,0.06)' : 'var(--bg-card)',
            transition:'background 0.4s',
            borderLeft: `3px solid ${flashTicker ? '#D97706' : '#f59e0b'}`,
          }}
        >
          {/* Labels This Hour */}
          <div style={{ padding:'0 1.5rem 0 0' }}>
            <div style={{ fontSize:'0.62rem', fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:6, fontFamily:FONT }}>
              Labels This Hour
            </div>
            <div style={{ fontSize:'2.6rem', fontWeight:900, color:'#D97706', lineHeight:1, letterSpacing:'-0.04em', fontFamily:FONT }}>
              {fmt(rtLabelsThisHour)}
            </div>
          </div>

          <div style={{ height:48, width:1, background:'var(--navy-100)', margin:'0 1.5rem' }} />

          {/* Per Minute */}
          <div style={{ padding:'0 1.5rem 0 0' }}>
            <div style={{ fontSize:'0.62rem', fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:6, fontFamily:FONT }}>
              Per Minute (avg)
            </div>
            <div style={{ fontSize:'1.9rem', fontWeight:800, color:'var(--navy-900)', lineHeight:1, fontFamily:FONT }}>{perMin}</div>
          </div>

          <div style={{ height:48, width:1, background:'var(--navy-100)', margin:'0 1.5rem' }} />

          {/* Pending Manifests */}
          <div style={{ padding:'0 1.5rem 0 0' }}>
            <div style={{ fontSize:'0.62rem', fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:6, fontFamily:FONT }}>
              Pending Manifests
            </div>
            <div style={{ fontSize:'1.9rem', fontWeight:800, color: stats.pendingManifests > 0 ? '#f59e0b' : 'var(--navy-900)', lineHeight:1, fontFamily:FONT }}>
              {fmt(stats.pendingManifests)}
            </div>
          </div>

          <div style={{ height:48, width:1, background:'var(--navy-100)', margin:'0 1.5rem' }} />

          {/* Completed Manifests */}
          <div style={{ padding:'0 1.5rem 0 0' }}>
            <div style={{ fontSize:'0.62rem', fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:6, fontFamily:FONT }}>
              Manifests Done
            </div>
            <div style={{ fontSize:'1.9rem', fontWeight:800, color:'#16a34a', lineHeight:1, fontFamily:FONT }}>{fmt(stats.completedManifests)}</div>
          </div>

          <div style={{ height:48, width:1, background:'var(--navy-100)', margin:'0 1.5rem' }} />

          {/* Hour progress */}
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:7 }}>
              <span style={{ fontSize:'0.62rem', fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', fontFamily:FONT }}>Hour Progress</span>
              <span style={{ fontSize:'0.62rem', fontWeight:700, color:'#D97706', fontFamily:FONT }}>{hourProgress}%</span>
            </div>
            <div style={{ height:6, background:'var(--navy-100)', borderRadius:99, overflow:'hidden' }}>
              <div style={{ height:'100%', background:'linear-gradient(90deg,#F59E0B,#D97706)', width:`${hourProgress}%`, transition:'width 1s linear', borderRadius:99 }} />
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
              <span style={{ fontSize:'0.68rem', color:'var(--navy-500)', fontWeight:600, fontFamily:FONT }}>{minElapsed}m elapsed</span>
              <span style={{ fontSize:'0.68rem', color:'var(--navy-400)', fontFamily:FONT }}>60m</span>
            </div>
          </div>
        </div>

        {/* ── Map + Top States ─────────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'3fr 1fr', gap:'0.75rem', alignItems:'start' }}>

          {/* Choropleth */}
          <div className="db-card" style={{ padding:'1.1rem 1.25rem' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <div style={{ fontSize:'0.65rem', fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', fontFamily:FONT }}>
                Shipment Density by State — All-Time
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.65rem', color:'var(--navy-400)', fontFamily:FONT }}>
                <span>Low</span>
                <div style={{ display:'flex', gap:2 }}>
                  {AMBER_STOPS.map(c => (
                    <span key={c} style={{ width:18, height:8, background:c, display:'inline-block', borderRadius:2 }} />
                  ))}
                </div>
                <span>High</span>
              </div>
            </div>
            <div ref={mapRef} style={{ width:'100%', borderRadius:8, overflow:'hidden' }} />
          </div>

          {/* Top States */}
          <div className="db-card" style={{ padding:'1.1rem 1.25rem' }}>
            <div style={{ fontSize:'0.65rem', fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:14, fontFamily:FONT }}>
              Top States
            </div>
            {topStates.length === 0 ? (
              <div style={{ fontSize:'0.8rem', color:'var(--navy-400)', padding:'8px 0', fontFamily:FONT }}>No state data yet.</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
                {topStates.map(({ fullName, count }, i) => {
                  const pct = Math.round((count / maxStateCount) * 100);
                  return (
                    <div key={fullName}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                          <span style={{
                            fontSize:'0.6rem', fontWeight:800, color: i === 0 ? '#B45309' : 'var(--navy-400)',
                            minWidth:16, fontFamily:FONT,
                          }}>{i + 1}</span>
                          <span style={{ fontSize:'0.78rem', color:'var(--navy-800)', fontWeight:600, fontFamily:FONT }}>
                            {fullName.length > 14 ? fullName.slice(0,13) + '…' : fullName}
                          </span>
                        </div>
                        <span style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--navy-700)', fontFamily:FONT }}>{count.toLocaleString()}</span>
                      </div>
                      <div style={{ height:4, background:'var(--navy-100)', borderRadius:99, overflow:'hidden' }}>
                        <div style={{
                          height:'100%', width:`${pct}%`, borderRadius:99, transition:'width 0.6s ease',
                          background: i === 0 ? '#B45309' : i < 3 ? '#D97706' : '#F59E0B',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Carrier breakdown + Live feed ────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:'0.75rem', alignItems:'start' }}>

          {/* Carrier breakdown */}
          <div className="db-card" style={{ padding:'1.1rem 1.25rem' }}>
            <div style={{ fontSize:'0.65rem', fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:16, fontFamily:FONT }}>
              Labels by Carrier
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {['USPS','UPS','FedEx','DHL'].map(c => {
                const data = stats.labelsByCarrier[c] || { count:0, revenue:0 };
                const pct  = Math.round((data.count / totalCarrierLabels) * 100);
                return (
                  <div key={c}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <div style={{
                          width:28, height:20, borderRadius:5, background: CARRIER_BG[c] || 'var(--navy-50)',
                          display:'flex', alignItems:'center', justifyContent:'center',
                        }}>
                          <span style={{ fontSize:'0.6rem', fontWeight:800, color: CARRIER_COLOR[c], fontFamily:FONT }}>{c}</span>
                        </div>
                        <span style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--navy-700)', fontFamily:FONT }}>
                          {pct}%
                        </span>
                      </div>
                      <span style={{ fontSize:'0.7rem', fontWeight:600, color:'var(--navy-500)', fontFamily:FONT }}>
                        {data.count.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ height:5, background:'var(--navy-100)', borderRadius:99, overflow:'hidden', marginBottom:3 }}>
                      <div style={{ height:'100%', background: CARRIER_GRADIENT[c] || CARRIER_COLOR[c], width:`${pct}%`, borderRadius:99, transition:'width 0.6s ease' }} />
                    </div>
                    <div style={{ fontSize:'0.65rem', color:'var(--navy-400)', fontFamily:FONT }}>
                      {fmt$(data.revenue)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live labels feed */}
          <div className="db-card" style={{ padding:0, overflow:'hidden' }}>
            {/* Feed header */}
            <div style={{ padding:'0.875rem 1.25rem', borderBottom:'1px solid var(--navy-100)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:'#16a34a', animation:'la-blink 1.4s ease-in-out infinite', flexShrink:0 }} />
                <span style={{ fontSize:'0.72rem', fontWeight:800, color:'var(--navy-800)', letterSpacing:'0.08em', textTransform:'uppercase', fontFamily:FONT }}>
                  Live Label Feed
                </span>
                <span style={{ fontSize:'0.6rem', fontWeight:600, padding:'1px 6px', borderRadius:99, background:'rgba(99,102,241,0.1)', color:'#6366f1', fontFamily:FONT }}>
                  {rtFeed.length}
                </span>
              </div>
              <span style={{ fontSize:'0.65rem', color:'var(--navy-400)', fontFamily:FONT }}>
                last 20 · real-time socket
              </span>
            </div>

            {/* Column headers */}
            <div style={{ display:'grid', gridTemplateColumns:'64px 1fr 90px 64px 64px', gap:0, padding:'0.45rem 1.25rem', borderBottom:'1px solid var(--navy-50)', background:'var(--navy-50)' }}>
              {['Carrier','Tracking','Location','Price','Time'].map(h => (
                <span key={h} style={{ fontSize:'0.6rem', fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.08em', textTransform:'uppercase', fontFamily:FONT, textAlign: h === 'Price' || h === 'Time' ? 'right' : 'left' }}>
                  {h}
                </span>
              ))}
            </div>

            <div style={{ maxHeight:340, overflowY:'auto' }}>
              {rtFeed.length === 0 ? (
                <div style={{ padding:'2rem', textAlign:'center', fontSize:'0.8rem', color:'var(--navy-400)', fontFamily:FONT }}>
                  No labels yet. Waiting for activity…
                </div>
              ) : (
                rtFeed.map((lbl: any, i) => (
                  <div
                    key={lbl._id || i}
                    className={lbl._isRt ? 'rt-row-flash' : ''}
                    style={{
                      display:'grid', gridTemplateColumns:'64px 1fr 90px 64px 64px',
                      alignItems:'center', gap:0,
                      padding:'0.5rem 1.25rem',
                      borderBottom:'1px solid var(--navy-50)',
                      transition:'background 0.3s',
                    }}
                  >
                    <span className={`carrier-badge ${(lbl.carrier || '').toLowerCase()}`} style={{ flexShrink:0 }}>
                      {lbl.carrier || '—'}
                    </span>
                    <span style={{ fontFamily:'monospace', fontSize:'0.72rem', color:'var(--navy-600)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:8 }}>
                      {lbl.trackingId || '—'}
                    </span>
                    <span style={{ fontSize:'0.72rem', color:'var(--navy-400)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8 }}>
                      {lbl.to_city ? `${lbl.to_city}, ` : ''}{lbl.to_state || '—'}
                    </span>
                    <span style={{ fontSize:'0.72rem', fontWeight:700, color: lbl.price > 0 ? '#0ea5e9' : 'var(--navy-300)', textAlign:'right' }}>
                      {lbl.price > 0 ? fmt$(lbl.price) : '—'}
                    </span>
                    <span style={{ fontSize:'0.65rem', color:'var(--navy-400)', whiteSpace:'nowrap', textAlign:'right' }}>
                      {new Date(lbl.createdAt).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </>
  );
};

export default AdminLiveActivity;
