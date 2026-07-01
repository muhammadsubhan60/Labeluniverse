import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

// ── State density data ─────────────────────────────────────────
const STATE_DATA: Record<string, number> = {
  'California':8210,'Texas':6140,'Florida':5380,'New York':4820,
  'Illinois':3190,'Pennsylvania':2870,'Ohio':2430,'Georgia':2210,
  'Washington':2080,'Arizona':1940,'North Carolina':1820,'Michigan':1760,
  'New Jersey':1710,'Virginia':1590,'Colorado':1480,'Tennessee':1360,
  'Indiana':1240,'Nevada':1180,'Minnesota':1120,'Massachusetts':1090,
  'Missouri':1020,'Wisconsin':980,'Oregon':940,'Maryland':920,
  'Connecticut':870,'Alabama':820,'South Carolina':790,'Utah':760,
  'Oklahoma':710,'Kansas':680,'Iowa':650,'Kentucky':630,
  'Arkansas':590,'Nebraska':540,'New Mexico':510,
  'West Virginia':480,'Idaho':440,'Hawaii':420,'Maine':400,
  'New Hampshire':390,'Rhode Island':370,'Montana':350,'Delaware':330,
  'South Dakota':310,'North Dakota':290,'Alaska':270,'Vermont':250,
  'Wyoming':230,'Mississippi':540,
};

const TOP_STATES = Object.entries(STATE_DATA).sort((a, b) => b[1] - a[1]).slice(0, 10);
const MAX_VAL    = TOP_STATES[0][1];

// Amber gradient — low → high
const AMBER_STOPS = ['#FEF3C7','#FDE68A','#FCD34D','#FBBF24','#F59E0B','#D97706','#B45309'];

function fmt(n: number) { return Math.round(n).toLocaleString(); }

// ── Main component ─────────────────────────────────────────────
const LiveActivity: React.FC = () => {
  const [clock,            setClock]           = useState('--:--:--');
  const [dateStr,          setDateStr]         = useState('');
  const [minElapsed,       setMinElapsed]      = useState(0);
  const [hourProgress,     setHourProgress]    = useState(0);

  const [labelsToday,      setLabelsToday]     = useState(47832);
  const [labelsDelta,      setLabelsDelta]     = useState(2341);
  const [labelsAllTime,    setLabelsAllTime]   = useState(3241091);
  const [moneySaved,       setMoneySaved]      = useState(2341490);
  const [hourTicker,       setHourTicker]      = useState(2847);
  const [perMin,           setPerMin]          = useState('47.4');
  const [queued,           setQueued]          = useState(14);
  const [showSavingsTip,   setShowSavingsTip]  = useState(false);

  const mapRef     = useRef<HTMLDivElement>(null);
  const svgRef     = useRef<SVGSVGElement | null>(null);
  const mapReady   = useRef(false);

  // ── Clock ────────────────────────────────────────────────────
  useEffect(() => {
    function tick() {
      const now = new Date();
      setClock(
        `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`
      );
      const m = now.getMinutes();
      setMinElapsed(m);
      setHourProgress(Math.round((m / 60) * 100));
      setDateStr(now.toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric', year:'numeric' }));
    }
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  // ── Label ticker ─────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      if (Math.random() >= 0.3) return;
      setLabelsToday(v => v + 1);
      setLabelsDelta(v => v + 1);
      setLabelsAllTime(v => v + 1);
      setHourTicker(prev => {
        const next = prev + 1;
        const mins = new Date().getMinutes();
        setPerMin((next / Math.max(mins, 1)).toFixed(1));
        return next;
      });
      setMoneySaved(v => v + 4.7 + Math.random() * 2);
      setQueued(Math.floor(Math.random() * 22) + 3);
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  // ── D3 Choropleth map ────────────────────────────────────────
  useEffect(() => {
    if (mapReady.current || !mapRef.current) return;
    let cancelled = false;

    async function draw() {
      try {
        const us = await d3.json<any>('/states-10m.json');
        if (cancelled || !mapRef.current || !us) return;

        // Clear previous render
        d3.select(mapRef.current).selectAll('*').remove();

        const W = mapRef.current.offsetWidth || 560;
        const H = Math.round(W * 0.6);

        const colorScale = d3.scaleQuantize<string>()
          .domain([0, MAX_VAL])
          .range(AMBER_STOPS);

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
            const name = d?.properties?.name as string;
            const v    = STATE_DATA[name] || 0;
            return v > 0 ? colorScale(v) : '#E2E8F0';
          })
          .attr('stroke', '#fff')
          .attr('stroke-width', 0.6)
          .append('title')
          .text((d: any) => {
            const name = d?.properties?.name as string;
            return `${name}: ${(STATE_DATA[name] || 0).toLocaleString()} labels`;
          });

        mapReady.current = true;
      } catch (err) {
        console.error('[LiveActivity] map error:', err);
        if (!cancelled && mapRef.current) {
          mapRef.current.innerHTML =
            '<div style="padding:24px;text-align:center;font-size:12px;color:#94A3B8;">Could not load map data</div>';
        }
      }
    }

    draw();
    return () => { cancelled = true; };
  }, []);

  // ── Shared card style ────────────────────────────────────────
  const card: React.CSSProperties = {
    background: '#fff',
    borderRadius: 12,
    padding: '14px 18px',
    border: '1.5px solid var(--navy-100)',
    boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
  };

  return (
    <>
      <style>{`
        @keyframes la-blink  { 0%,100%{opacity:1} 50%{opacity:0.15} }
        @keyframes la-fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

        {/* ── Header ───────────────────────────────────────────── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingBottom: 14, borderBottom: '1px solid var(--navy-100)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--navy-900)', textTransform: 'uppercase' }}>
              LABEL FLOW
            </span>
            <span style={{ fontSize: 11, color: 'var(--navy-400)', letterSpacing: '0.06em', fontWeight: 500 }}>
              / Platform Live Metrics
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%', background: '#16a34a',
                animation: 'la-blink 1.4s ease-in-out infinite', flexShrink: 0,
              }} />
              <span style={{ fontSize: 10, color: '#16a34a', letterSpacing: '0.1em', fontWeight: 700 }}>LIVE</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--navy-600)', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{clock}</span>
            <span style={{ fontSize: 12, color: 'var(--navy-400)' }}>{dateStr}</span>
          </div>
        </div>

        {/* ── 4 Metric cards ───────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}>

          {/* Labels Today */}
          <div style={{ ...card, animation: 'la-fadeUp 0.45s ease both', animationDelay: '0.05s' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              Labels Today
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--navy-900)', lineHeight: 1, letterSpacing: '-0.02em' }}>
              {fmt(labelsToday)}
            </div>
            <div style={{ fontSize: 11, color: '#16a34a', marginTop: 8, display: 'flex', alignItems: 'center', gap: 3 }}>
              +{fmt(labelsDelta)} <span style={{ color: 'var(--navy-400)', fontWeight: 400 }}>since midnight</span>
            </div>
          </div>

          {/* All-Time Labels */}
          <div style={{ ...card, animation: 'la-fadeUp 0.45s ease both', animationDelay: '0.1s' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              All-Time Labels
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--navy-900)', lineHeight: 1, letterSpacing: '-0.02em' }}>
              {fmt(labelsAllTime)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--navy-400)', marginTop: 8 }}>Since Jan 2022</div>
          </div>

          {/* Active Sellers */}
          <div style={{ ...card, animation: 'la-fadeUp 0.45s ease both', animationDelay: '0.15s' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              Active Sellers
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--navy-900)', lineHeight: 1, letterSpacing: '-0.02em' }}>
              1,847
            </div>
            <div style={{ fontSize: 11, color: '#16a34a', marginTop: 8 }}>+12 this session</div>
          </div>

          {/* Money Saved */}
          <div style={{ ...card, animation: 'la-fadeUp 0.45s ease both', animationDelay: '0.2s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Saved vs USPS Retail
              </div>
              <div
                style={{ position: 'relative', lineHeight: 1, cursor: 'help' }}
                onMouseEnter={() => setShowSavingsTip(true)}
                onMouseLeave={() => setShowSavingsTip(false)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 14, height: 14, color: '#94a3b8' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                </svg>
                {showSavingsTip && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
                    background: '#1e293b', color: '#f1f5f9',
                    borderRadius: 8, padding: '9px 12px',
                    fontSize: 11, lineHeight: 1.55, fontWeight: 400,
                    width: 250, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                    pointerEvents: 'none',
                  }}>
                    This figure compares label costs against standard USPS retail rates. Actual savings may differ if prior negotiated rates were in place. Think of this as an estimated benchmark — not a guaranteed fixed saving.
                  </div>
                )}
              </div>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#16a34a', lineHeight: 1, letterSpacing: '-0.02em' }}>
              ${fmt(moneySaved)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--navy-400)', marginTop: 8 }}>All-time total</div>
          </div>

        </div>

        {/* ── Hour ticker banner ────────────────────────────────── */}
        <div style={{
          ...card,
          borderLeft: '3px solid #D97706',
          borderRadius: '0 12px 12px 0',
          padding: '18px 28px',
          display: 'flex', alignItems: 'center', gap: 0,
        }}>
          {/* This hour */}
          <div style={{ minWidth: 180 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              Labels This Hour
            </div>
            <div style={{ fontSize: 54, fontWeight: 800, color: '#D97706', lineHeight: 1, letterSpacing: '-0.03em' }}>
              {fmt(hourTicker)}
            </div>
          </div>

          <div style={{ width: 1, background: 'var(--navy-100)', alignSelf: 'stretch', margin: '0 28px' }} />

          {/* Per minute */}
          <div style={{ minWidth: 120 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              Per Minute (avg)
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--navy-900)', lineHeight: 1 }}>
              {perMin}
            </div>
          </div>

          <div style={{ width: 1, background: 'var(--navy-100)', alignSelf: 'stretch', margin: '0 28px' }} />

          {/* Queued */}
          <div style={{ minWidth: 100 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              Queued
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--navy-900)', lineHeight: 1 }}>
              {queued}
            </div>
          </div>

          <div style={{ width: 1, background: 'var(--navy-100)', alignSelf: 'stretch', margin: '0 28px' }} />

          {/* Hour progress */}
          <div style={{ flex: 1, maxWidth: 240 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              Hour Progress
            </div>
            <div style={{ height: 6, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', background: '#D97706',
                width: `${hourProgress}%`, transition: 'width 1s linear',
                borderRadius: 99,
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--navy-500)', fontWeight: 500 }}>{minElapsed}m elapsed</span>
              <span style={{ fontSize: 11, color: 'var(--navy-400)' }}>60m</span>
            </div>
          </div>
        </div>

        {/* ── Map + Top States ──────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 10, alignItems: 'start' }}>

          {/* Choropleth map */}
          <div style={card}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              Shipment Density by State — Labels Today
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 10, color: 'var(--navy-400)', fontWeight: 500 }}>
              <span>Low</span>
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                {AMBER_STOPS.map(c => (
                  <span key={c} style={{ width: 20, height: 9, background: c, display: 'inline-block', borderRadius: 2 }} />
                ))}
              </div>
              <span>High</span>
            </div>
            <div ref={mapRef} style={{ width: '100%' }} />
          </div>

          {/* Top States */}
          <div style={card}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
              Top States Today
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {TOP_STATES.map(([name, val], i) => {
                const pct = Math.round((val / MAX_VAL) * 100);
                return (
                  <div key={name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--navy-400)', minWidth: 16 }}>{i + 1}</span>
                        <span style={{ fontSize: 12, color: 'var(--navy-800)', fontWeight: 600 }}>
                          {name.length > 14 ? name.slice(0, 13) + '…' : name}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy-700)' }}>
                        {val.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ height: 4, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: i === 0 ? '#B45309' : i < 3 ? '#D97706' : '#F59E0B',
                        borderRadius: 99,
                        transition: 'width 1s',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default LiveActivity;
