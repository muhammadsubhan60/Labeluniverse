import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import axios from 'axios';
import { useSocket } from '../contexts/SocketContext';

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
  return STATE_ABBR[up] || raw.trim(); // if already full name, use as-is
}

// ── Amber gradient for choropleth ─────────────────────────────
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

function fmt(n: number) { return Math.round(n).toLocaleString(); }
function fmt$(n: number) { return `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

// ── Types ──────────────────────────────────────────────────────
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

// ── Component ──────────────────────────────────────────────────
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

  // Real-time counters driven by socket events
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
      setClock(
        `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`
      );
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

      // Seed the real-time counters from the fetched snapshot
      setRtLabelsToday(data.labelsToday);
      setRtLabelsAllTime(data.labelsAllTime);
      setRtLabelsThisHour(data.labelsThisHour);
      setRtFeed(data.recentLabels || []);

      // Build state map for choropleth
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
    const iv = setInterval(fetchStats, 30_000); // re-sync every 30s
    return () => clearInterval(iv);
  }, [fetchStats]);

  // ── D3 choropleth ──────────────────────────────────────────
  const redrawMap = useCallback(() => {
    if (!mapRef.current) return;
    if (!mapReady.current) {
      drawMap();
      return;
    }
    // Update fill colors only
    const vals = Object.values(stateMap.current);
    const maxVal = vals.length ? Math.max(...vals) : 1;
    const colorScale = d3.scaleQuantize<string>().domain([0, maxVal]).range(AMBER_STOPS);
    d3.select(mapRef.current).selectAll<SVGPathElement, any>('path')
      .attr('fill', (d: any) => {
        const v = stateMap.current[d?.properties?.name] || 0;
        return v > 0 ? colorScale(v) : '#E2E8F0';
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

      // Prepend to live feed
      setRtFeed(prev => [{
        _id:        `rt-${Date.now()}`,
        carrier:    data.carrier,
        trackingId: data.trackingId,
        price:      data.price,
        to_state:   data.toState,
        to_city:    data.toCity,
        createdAt:  data.createdAt,
        user:       null,
        _isRt:      true,
      }, ...prev].slice(0, 20));

      // Update state map count
      const full = resolveState(data.toState);
      if (full) {
        stateMap.current[full] = (stateMap.current[full] || 0) + 1;
        redrawMap();
      }
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
        .append('svg')
        .attr('viewBox', `0 0 ${W} ${H}`)
        .attr('width', '100%')
        .style('display', 'block');

      svgRef.current = svg.node();

      const states = topojson.feature(us, us.objects.states) as any;
      svg.selectAll<SVGPathElement, any>('path')
        .data(states.features)
        .join('path')
        .attr('d', path as any)
        .attr('fill', (d: any) => {
          const v = stateMap.current[d?.properties?.name] || 0;
          return v > 0 ? colorScale(v) : '#E2E8F0';
        })
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.6)
        .append('title')
        .text((d: any) => {
          const name = d?.properties?.name as string;
          return `${name}: ${(stateMap.current[name] || 0).toLocaleString()} labels`;
        });

      mapReady.current = true;
    } catch (err) {
      console.error('[AdminLiveActivity] map error:', err);
    }
  }

  // ── Shared card style ──────────────────────────────────────
  const card: React.CSSProperties = {
    background: '#fff',
    borderRadius: 12,
    padding: '14px 18px',
    border: '1.5px solid var(--navy-100)',
    boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
  };

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', padding:'3rem' }}>
      <div className="spinner" />
    </div>
  );

  if (error) return (
    <div style={{ padding:'2rem', color:'#ef4444', fontSize:'0.875rem' }}>{error}</div>
  );

  if (!stats) return null;

  const totalCarrierLabels = Object.values(stats.labelsByCarrier).reduce((s, v) => s + v.count, 0) || 1;

  const topStates = [...stats.labelsByState]
    .map(s => ({ ...s, fullName: resolveState(s.state) }))
    .filter(s => s.fullName)
    .slice(0, 10);
  const maxStateCount = topStates[0]?.count || 1;

  // Per-minute estimate from real-time hour counter
  const perMin = minElapsed > 0 ? (rtLabelsThisHour / minElapsed).toFixed(1) : stats.perMinuteEst;

  return (
    <>
      <style>{`
        @keyframes la-blink  { 0%,100%{opacity:1} 50%{opacity:0.15} }
        @keyframes la-fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        @keyframes la-flash  { 0%{background:#fef9c3} 100%{background:transparent} }
        .rt-flash { animation: la-flash 0.6s ease; }
      `}</style>

      <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>

        {/* ── Header ─────────────────────────────────────────── */}
        <div style={{
          display:'flex', justifyContent:'space-between', alignItems:'center',
          paddingBottom:14, borderBottom:'1px solid var(--navy-100)',
        }}>
          <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
            <span style={{ fontSize:15, fontWeight:800, letterSpacing:'0.12em', color:'var(--navy-900)', textTransform:'uppercase' }}>
              LABEL UNIVERSE
            </span>
            <span style={{ fontSize:11, color:'var(--navy-400)', letterSpacing:'0.06em', fontWeight:500 }}>
              / Admin Live Monitor
            </span>
            <span style={{
              fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99,
              background:'#fff7ed', color:'#c2410c', border:'1px solid #fed7aa',
              letterSpacing:'0.06em',
            }}>
              REAL DATA
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:20 }}>
            {lastFetch && (
              <span style={{ fontSize:10, color:'var(--navy-400)', fontWeight:500 }}>
                synced {lastFetch}
              </span>
            )}
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:'#16a34a', animation:'la-blink 1.4s ease-in-out infinite', flexShrink:0 }} />
              <span style={{ fontSize:10, color:'#16a34a', letterSpacing:'0.1em', fontWeight:700 }}>LIVE</span>
            </div>
            <span style={{ fontSize:12, color:'var(--navy-600)', fontVariantNumeric:'tabular-nums', fontWeight:500 }}>{clock}</span>
            <span style={{ fontSize:12, color:'var(--navy-400)' }}>{dateStr}</span>
          </div>
        </div>

        {/* ── 4 Metric cards ──────────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:10 }}>

          {/* Labels Today */}
          <div style={{ ...card, animation:'la-fadeUp 0.45s ease both', animationDelay:'0.05s' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>Labels Today</div>
            <div style={{ fontSize:30, fontWeight:800, color:'var(--navy-900)', lineHeight:1, letterSpacing:'-0.02em' }}>
              {fmt(rtLabelsToday)}
            </div>
            <div style={{ fontSize:11, color:'#16a34a', marginTop:8 }}>
              +{fmt(rtLabelsToday - (stats.labelsToday - rtLabelsToday > 0 ? stats.labelsToday - rtLabelsToday : 0))} since midnight
            </div>
          </div>

          {/* All-Time Labels */}
          <div style={{ ...card, animation:'la-fadeUp 0.45s ease both', animationDelay:'0.1s' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>All-Time Labels</div>
            <div style={{ fontSize:30, fontWeight:800, color:'var(--navy-900)', lineHeight:1, letterSpacing:'-0.02em' }}>
              {fmt(rtLabelsAllTime)}
            </div>
            <div style={{ fontSize:11, color:'var(--navy-400)', marginTop:8 }}>Platform-wide</div>
          </div>

          {/* Active Users */}
          <div style={{ ...card, animation:'la-fadeUp 0.45s ease both', animationDelay:'0.15s' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>Active Users</div>
            <div style={{ fontSize:30, fontWeight:800, color:'var(--navy-900)', lineHeight:1, letterSpacing:'-0.02em' }}>
              {fmt(stats.activeUsers)}
            </div>
            <div style={{ fontSize:11, color:'var(--navy-400)', marginTop:8 }}>of {fmt(stats.totalUsers)} total</div>
          </div>

          {/* Total Revenue */}
          <div style={{ ...card, animation:'la-fadeUp 0.45s ease both', animationDelay:'0.2s' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>Total Revenue</div>
            <div style={{ fontSize:30, fontWeight:800, color:'#16a34a', lineHeight:1, letterSpacing:'-0.02em' }}>
              {fmt$(stats.totalRevenue)}
            </div>
            <div style={{ fontSize:11, color:'var(--navy-400)', marginTop:8 }}>All labels + manifests</div>
          </div>
        </div>

        {/* ── Hour ticker banner ──────────────────────────────── */}
        <div style={{
          ...card,
          borderLeft:'3px solid #D97706',
          borderRadius:'0 12px 12px 0',
          padding:'18px 28px',
          display:'flex', alignItems:'center', gap:0,
          background: flashTicker ? '#fffbeb' : '#fff',
          transition:'background 0.4s',
        }}>
          {/* This hour */}
          <div style={{ minWidth:180 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>Labels This Hour</div>
            <div style={{ fontSize:54, fontWeight:800, color:'#D97706', lineHeight:1, letterSpacing:'-0.03em' }}>
              {fmt(rtLabelsThisHour)}
            </div>
          </div>

          <div style={{ width:1, background:'var(--navy-100)', alignSelf:'stretch', margin:'0 28px' }} />

          {/* Per minute */}
          <div style={{ minWidth:120 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>Per Minute (avg)</div>
            <div style={{ fontSize:36, fontWeight:700, color:'var(--navy-900)', lineHeight:1 }}>{perMin}</div>
          </div>

          <div style={{ width:1, background:'var(--navy-100)', alignSelf:'stretch', margin:'0 28px' }} />

          {/* Pending Manifests */}
          <div style={{ minWidth:120 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>Pending Manifests</div>
            <div style={{ fontSize:36, fontWeight:700, color: stats.pendingManifests > 0 ? '#f59e0b' : 'var(--navy-900)', lineHeight:1 }}>
              {fmt(stats.pendingManifests)}
            </div>
          </div>

          <div style={{ width:1, background:'var(--navy-100)', alignSelf:'stretch', margin:'0 28px' }} />

          {/* Completed Manifests */}
          <div style={{ minWidth:120 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>Manifests Done</div>
            <div style={{ fontSize:36, fontWeight:700, color:'#16a34a', lineHeight:1 }}>{fmt(stats.completedManifests)}</div>
          </div>

          <div style={{ width:1, background:'var(--navy-100)', alignSelf:'stretch', margin:'0 28px' }} />

          {/* Hour progress */}
          <div style={{ flex:1, maxWidth:240 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>Hour Progress</div>
            <div style={{ height:6, background:'var(--navy-100)', borderRadius:99, overflow:'hidden' }}>
              <div style={{ height:'100%', background:'#D97706', width:`${hourProgress}%`, transition:'width 1s linear', borderRadius:99 }} />
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
              <span style={{ fontSize:11, color:'var(--navy-500)', fontWeight:500 }}>{minElapsed}m elapsed</span>
              <span style={{ fontSize:11, color:'var(--navy-400)' }}>60m</span>
            </div>
          </div>
        </div>

        {/* ── Map + Top States ─────────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'3fr 1fr', gap:10, alignItems:'start' }}>

          {/* Choropleth */}
          <div style={card}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>
              Shipment Density by State — All-Time (Real Data)
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10, fontSize:10, color:'var(--navy-400)', fontWeight:500 }}>
              <span>Low</span>
              <div style={{ display:'flex', gap:2 }}>
                {AMBER_STOPS.map(c => (
                  <span key={c} style={{ width:20, height:9, background:c, display:'inline-block', borderRadius:2 }} />
                ))}
              </div>
              <span>High</span>
            </div>
            <div ref={mapRef} style={{ width:'100%' }} />
          </div>

          {/* Top States */}
          <div style={card}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:14 }}>
              Top States (Real)
            </div>
            {topStates.length === 0 ? (
              <div style={{ fontSize:12, color:'var(--navy-400)', padding:'8px 0' }}>No state data yet.</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {topStates.map(({ fullName, count }, i) => {
                  const pct = Math.round((count / maxStateCount) * 100);
                  return (
                    <div key={fullName}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ fontSize:10, fontWeight:700, color:'var(--navy-400)', minWidth:16 }}>{i + 1}</span>
                          <span style={{ fontSize:12, color:'var(--navy-800)', fontWeight:600 }}>
                            {fullName.length > 14 ? fullName.slice(0,13) + '…' : fullName}
                          </span>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:'var(--navy-700)' }}>{count.toLocaleString()}</span>
                      </div>
                      <div style={{ height:4, background:'var(--navy-100)', borderRadius:99, overflow:'hidden' }}>
                        <div style={{
                          height:'100%',
                          width:`${pct}%`,
                          background: i === 0 ? '#B45309' : i < 3 ? '#D97706' : '#F59E0B',
                          borderRadius:99, transition:'width 0.6s ease',
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
        <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:10, alignItems:'start' }}>

          {/* Carrier breakdown */}
          <div style={card}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--navy-400)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:14 }}>
              Labels by Carrier (Real)
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {['USPS','UPS','FedEx','DHL'].map(c => {
                const data = stats.labelsByCarrier[c] || { count:0, revenue:0 };
                const pct  = Math.round((data.count / totalCarrierLabels) * 100);
                return (
                  <div key={c}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:CARRIER_COLOR[c] || 'var(--navy-600)' }}>{c}</span>
                      <span style={{ fontSize:11, fontWeight:600, color:'var(--navy-500)' }}>
                        {data.count.toLocaleString()} · {pct}%
                      </span>
                    </div>
                    <div style={{ height:6, background:'var(--navy-100)', borderRadius:99, overflow:'hidden' }}>
                      <div style={{ height:'100%', background:CARRIER_GRADIENT[c] || CARRIER_COLOR[c], width:`${pct}%`, borderRadius:99, transition:'width 0.6s ease' }} />
                    </div>
                    <div style={{ fontSize:10, color:'var(--navy-400)', marginTop:3 }}>
                      Revenue: {fmt$(data.revenue)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live labels feed */}
          <div style={{ ...card, padding:0, overflow:'hidden' }}>
            <div style={{
              padding:'12px 18px', borderBottom:'1px solid var(--navy-100)',
              display:'flex', alignItems:'center', justifyContent:'space-between',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:'#16a34a', animation:'la-blink 1.4s ease-in-out infinite' }} />
                <span style={{ fontSize:11, fontWeight:700, color:'var(--navy-700)', letterSpacing:'0.08em', textTransform:'uppercase' }}>
                  Live Label Feed
                </span>
              </div>
              <span style={{ fontSize:10, color:'var(--navy-400)' }}>last 20 labels · real-time via socket</span>
            </div>
            <div style={{ maxHeight:320, overflowY:'auto' }}>
              {rtFeed.length === 0 ? (
                <div style={{ padding:'1.5rem', textAlign:'center', fontSize:12, color:'var(--navy-400)' }}>
                  No labels yet. Waiting for activity…
                </div>
              ) : (
                rtFeed.map((lbl: any, i) => (
                  <div
                    key={lbl._id || i}
                    className={lbl._isRt ? 'rt-flash' : ''}
                    style={{
                      display:'flex', alignItems:'center', gap:10,
                      padding:'8px 18px',
                      borderBottom:'1px solid var(--navy-50)',
                      transition:'background 0.3s',
                    }}
                  >
                    {/* Carrier badge */}
                    <span className={`carrier-badge ${(lbl.carrier || '').toLowerCase()}`} style={{ flexShrink:0, minWidth:44 }}>
                      {lbl.carrier || '—'}
                    </span>

                    {/* Tracking */}
                    <span style={{ fontFamily:'monospace', fontSize:11, color:'var(--navy-600)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {lbl.trackingId || '—'}
                    </span>

                    {/* State/city */}
                    <span style={{ fontSize:11, color:'var(--navy-400)', whiteSpace:'nowrap', minWidth:70 }}>
                      {lbl.to_city ? `${lbl.to_city}, ` : ''}{lbl.to_state || '—'}
                    </span>

                    {/* Price */}
                    <span style={{ fontSize:11, fontWeight:700, color: lbl.price > 0 ? '#0ea5e9' : 'var(--navy-300)', minWidth:52, textAlign:'right' }}>
                      {lbl.price > 0 ? fmt$(lbl.price) : '—'}
                    </span>

                    {/* Time */}
                    <span style={{ fontSize:10, color:'var(--navy-400)', whiteSpace:'nowrap', minWidth:50, textAlign:'right' }}>
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
