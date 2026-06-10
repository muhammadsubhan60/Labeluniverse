import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import uspsLogo  from '../Logos/United_States_Postal_Service-Logo.wine.png';
import upsLogo   from '../Logos/United_Parcel_Service-Logo.wine.png';
import fedexLogo from '../Logos/FedEx_Express-Logo.wine.png';
import dhlLogo   from '../Logos/DHL-Logo.wine.png';
import {
  TruckIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, CheckCircleIcon,
  ExclamationCircleIcon, DocumentTextIcon, XMarkIcon, ClockIcon,
  ClipboardDocumentListIcon, PlusIcon, TrashIcon,
  ArrowLeftIcon, SparklesIcon, BoltIcon,
} from '@heroicons/react/24/outline';
import { getUspsZone1Rate } from '../utils/uspsRates';

// ── External state analytics API ─────────────────────────────────────────────
const EXT     = 'https://shippers-hub-tracking-command-cente.vercel.app/api/public';
const EXT_HDR = { 'x-api-key': 'sh-public-2024-gama' };

// Sentinel value for "Auto — Best per State" vendor option
const AUTO_VENDOR_ID = '__auto__';

// ── Types ─────────────────────────────────────────────────────────────────────
interface AccessItem {
  vendorId:        string;
  vendorName:      string;
  carrier:         string;
  vendorType:      'api' | 'manifest';
  shippingService: string;
  baseRate:        number;
  isAllowed:       boolean;
  rateTiers:       { minLbs: number; maxLbs: number | null; rate: number }[];
  portal:          'shippershub' | 'labelcrow' | 'shiplabel';
}

interface LcAsyncJob {
  type:       'labelcrow-async';
  lcJobId:    string;
  lcOrderId:  number;
  total:      number;
  bulkJobId:  string;
  newBalance: number;
}

interface LcJobProgress {
  status:      'queued' | 'processing' | 'completed' | 'failed';
  total:       number;
  generated:   number;
  failed:      number;
  progress:    number;
  orderId?:    string;
  zipUrl?:     string | null;
  newBalance?: number;
}

interface SlAsyncJob {
  type:       'shiplabel-async';
  bulkJobId:  string;
  total:      number;
  newBalance: number;
}

interface SlLabelResult {
  _id:             string;
  status:          'generated' | 'failed' | 'pending';
  trackingId:      string;
  pdfUrl:          string | null;
  shiplabelOrderId?: string;
  price:           number;
  from_name:       string;
  to_name:         string;
  to_zip:          string;
}

interface SlJobProgress {
  total:     number;
  generated: number;
  failed:    number;
  pending:   number;
  done:      boolean;
  labels:    SlLabelResult[];
}

interface LabelRow  { [key: string]: string; }

interface RowResult {
  success:    boolean;
  trackingId?: string;
  labelId?:   string;
  pdfUrl?:    string;
  cost?:      number;
  error?:     string;
}

interface ApiResult {
  type:       'api';
  bulkJobId:  string;
  results:    RowResult[];
  zipUrl:     string | null;
  newBalance: number;
}

interface ManifestResult {
  type:          'manifest';
  manifestJobId: string;
  status:        string;
  labelCount:    number;
  carrier:       string;
  vendorName:    string;
  totalCost:     number;
  newBalance:    number;
}

interface VendorAnalyticsRow {
  vendor:       string;
  total:        number;
  deliveryRate: number;
}

interface MultiResultRow {
  originalIndex: number;
  labelId:       string | null;
  vendorName:    string;
  trackingId:    string;
  success:       boolean;
  error?:        string;
  pdfUrl:        string | null;
}

interface MultiApiResult {
  type:        'multi-api';
  groups:      { vendorName: string; bulkJobId: string; submitted: number; succeeded: number }[];
  combined:    MultiResultRow[];
  totalSuccess: number;
  totalFailed:  number;
  newBalance:   number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const REQUIRED_COLS = [
  'from_name','from_address1','from_city','from_state','from_zip',
  'to_name','to_address1','to_city','to_state','to_zip','weight',
];

const ALL_COLS = [
  'from_name','from_company','from_phone','from_address1','from_address2','from_city','from_state','from_zip',
  'to_name','to_company','to_phone','to_address1','to_address2','to_city','to_state','to_zip',
  'weight','length','width','height','note',
];

const TABLE_COLS: { key: string; label: string; width: number; required: boolean }[] = [
  { key: 'from_name',     label: 'From Name',    width: 130, required: true  },
  { key: 'from_address1', label: 'From Addr',    width: 150, required: true  },
  { key: 'from_city',     label: 'F. City',      width: 100, required: true  },
  { key: 'from_state',    label: 'F.St',         width: 60,  required: true  },
  { key: 'from_zip',      label: 'F.Zip',        width: 80,  required: true  },
  { key: 'to_name',       label: 'To Name',      width: 130, required: true  },
  { key: 'to_address1',   label: 'To Addr',      width: 150, required: true  },
  { key: 'to_city',       label: 'T. City',      width: 100, required: true  },
  { key: 'to_state',      label: 'T.St',         width: 60,  required: true  },
  { key: 'to_zip',        label: 'T.Zip',        width: 80,  required: true  },
  { key: 'weight',        label: 'Wt (lbs)',     width: 80,  required: true  },
  { key: 'length',        label: 'Len',          width: 65,  required: false },
  { key: 'width',         label: 'Wid',          width: 65,  required: false },
  { key: 'height',        label: 'Hgt',          width: 65,  required: false },
  { key: 'note',          label: 'Note',         width: 120, required: false },
];

const CARRIERS = [
  { name: 'USPS',  accentColor: '#1D4ED8', selectedBg: '#EFF6FF', selectedBorder: '#1D4ED8', badgeClass: 'usps'  },
  { name: 'UPS',   accentColor: '#92400E', selectedBg: '#FFFBEB', selectedBorder: '#92400E', badgeClass: 'ups'   },
  { name: 'FedEx', accentColor: '#5B21B6', selectedBg: '#F5F3FF', selectedBorder: '#5B21B6', badgeClass: 'fedex' },
  { name: 'DHL',   accentColor: '#B45309', selectedBg: '#FEF3C7', selectedBorder: '#B45309', badgeClass: 'dhl'   },
];

const CARRIER_LOGOS: Record<string, string> = {
  USPS: uspsLogo, UPS: upsLogo, FedEx: fedexLogo, DHL: dhlLogo,
};

const PORTALS = [
  { id: 'shippershub' as const, label: 'ShippersHub', accentColor: '#1D4ED8', selectedBg: '#EFF6FF', selectedBorder: '#1D4ED8' },
  { id: 'labelcrow'   as const, label: 'Label Crow',  accentColor: '#7C3AED', selectedBg: '#F5F3FF', selectedBorder: '#7C3AED' },
  { id: 'shiplabel'   as const, label: 'ShipLabel',   accentColor: '#059669', selectedBg: '#ECFDF5', selectedBorder: '#059669' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const CarrierLogo = ({ name }: { name: string }) => {
  const src = CARRIER_LOGOS[name];
  if (!src) return null;
  return (
    <div style={{ width: 52, height: 28, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <img src={src} alt={name} style={{ width: 80, height: 48, objectFit: 'contain', display: 'block' }} />
    </div>
  );
};

const SAMPLE_ROWS: Record<string, string[][]> = {
  USPS:  [['John Doe','Acme Corp','555-1234','123 Main St','Suite 100','New York','NY','10001','Jane Smith','','','456 Oak Ave','','Los Angeles','CA','90001','16','12','10','8','Fragile']],
  UPS:   [['John Doe','','555-9876','789 Elm Rd','','Chicago','IL','60601','Bob Lee','','','321 Pine St','','Houston','TX','77001','20','','','','']],
  FedEx: [['Alice Brown','Corp LLC','','555 Maple Dr','','Seattle','WA','98101','Tom Green','','','99 River Rd','','Miami','FL','33101','10','','','','']],
  DHL:   [['Alice Brown','Corp LLC','','555 Maple Dr','','Seattle','WA','98101','Tom Green','','','99 River Rd','','Miami','FL','33101','10','','','','']],
};

function buildSampleCSV(carrier: string): string {
  const header = ALL_COLS.join(',');
  const rows   = (SAMPLE_ROWS[carrier] || SAMPLE_ROWS.USPS)
    .map(r => r.map(v => v.includes(',') ? `"${v}"` : v).join(','));
  return [header, ...rows].join('\n');
}

function downloadTemplate(carrier: string) {
  const csv  = buildSampleCSV(carrier);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${carrier}_bulk_template.csv`; a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text: string): { headers: string[]; rows: LabelRow[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let cur = ''; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    result.push(cur.trim());
    return result;
  };
  const headers = parseRow(lines[0]).map(h => h.toLowerCase().trim());
  const rows    = lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseRow(line);
    const obj: LabelRow = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

function validateRow(row: LabelRow): string[] {
  const errs: string[] = [];
  for (const col of REQUIRED_COLS) {
    if (!row[col]?.trim()) errs.push(`${col.replace(/_/g,' ')} required`);
  }
  if (row.weight && isNaN(parseFloat(row.weight))) errs.push('weight must be a number');
  return errs;
}

function emptyRow(): LabelRow {
  const row: LabelRow = {};
  ALL_COLS.forEach(c => { row[c] = ''; });
  return row;
}

/** Extract tracking prefix code from analytics vendor name e.g. "usps pitney priority (9401)" → "9401" */
function extractServiceCode(vendorName: string): string {
  const m = vendorName.match(/\((\w+)\)\s*$/);
  return m ? m[1] : '';
}

/** Calculate effective rate for an AccessItem given a weight */
function getVendorEffectiveRate(vendor: AccessItem, weight: number): number {
  if (!vendor.rateTiers?.length) return vendor.baseRate;
  const tier = vendor.rateTiers.find(t =>
    weight >= t.minLbs && (t.maxLbs === null || weight <= t.maxLbs)
  );
  return tier?.rate ?? vendor.baseRate;
}

/**
 * Find the best accessible vendor for a state.
 * Tries analytics vendors sorted by deliveryRate desc, matches by shippingService code.
 * Only considers api-type (non-manifest) vendors.
 */
function assignBestVendor(
  stateVendors: VendorAnalyticsRow[],
  allowedVendors: AccessItem[],
): AccessItem | null {
  const sorted = [...stateVendors].sort((a, b) => b.deliveryRate - a.deliveryRate);
  for (const sv of sorted) {
    const analyticsCode = extractServiceCode(sv.vendor);
    if (!analyticsCode) continue;
    // Match by the code embedded in the vendor's own name, not shippingService
    // (shippingService stores generic labels like "ground"/"priority", not numeric codes)
    const match = allowedVendors.find(av => {
      const vendorCode = extractServiceCode(av.vendorName);
      return vendorCode === analyticsCode && av.isAllowed;
    });
    if (match) {
      console.log(`[assignBest] code "${analyticsCode}" → matched "${match.vendorName}" (rate ${sv.deliveryRate}%)`);
      return match;
    }
  }
  console.log(`[assignBest] no match for any analytics vendor. allowedVendors codes: ${allowedVendors.map(av => extractServiceCode(av.vendorName) || '(none)').join(', ')}`);
  return null;
}

function parseAnalyticsData(raw: any): VendorAnalyticsRow[] {
  if (Array.isArray(raw)) return raw;
  for (const k of ['data', 'vendors', 'breakdown']) {
    if (raw[k] && Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

// ── Component ──────────────────────────────────────────────────────────────────
const BulkLabelGenerator: React.FC = () => {
  const navigate = useNavigate();

  // ── Existing state ──────────────────────────────────────────────────────────
  const [accessList,     setAccessList]     = useState<AccessItem[]>([]);
  const [selectedCarrier,setSelectedCarrier]= useState('');
  const [selectedVendor, setSelectedVendor] = useState<AccessItem | null>(null);
  const [fileName,       setFileName]       = useState('');
  const [rows,           setRows]           = useState<LabelRow[]>([]);
  const [rowErrors,      setRowErrors]      = useState<Record<number, string[]>>({});
  const [headerMissing,  setHeaderMissing]  = useState<string[]>([]);
  const [isGenerating,   setIsGenerating]   = useState(false);
  const [apiResult,      setApiResult]      = useState<ApiResult | null>(null);
  const [manifestResult, setManifestResult] = useState<ManifestResult | null>(null);
  const [genError,       setGenError]       = useState('');
  const [isDragging,     setIsDragging]     = useState(false);

  // ── Auto-vendor state ───────────────────────────────────────────────────────
  const [isAutoMode,     setIsAutoMode]     = useState(false);
  const [rowAssignments, setRowAssignments] = useState<(AccessItem | null)[]>([]);
  const [autoLoading,    setAutoLoading]    = useState(false);
  const [multiApiResult, setMultiApiResult] = useState<MultiApiResult | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);

  // ── Portal state ────────────────────────────────────────────
  const [selectedPortal, setSelectedPortal] = useState<'shippershub' | 'labelcrow' | 'shiplabel' | ''>('');

  // ── Label Crow async state ───────────────────────────────────
  const [lcAsyncJob,    setLcAsyncJob]    = useState<LcAsyncJob | null>(null);
  const [lcJobProgress, setLcJobProgress] = useState<LcJobProgress | null>(null);

  // ── ShipLabel async state ────────────────────────────────────
  const [slAsyncJob,    setSlAsyncJob]    = useState<SlAsyncJob | null>(null);
  const [slJobProgress, setSlJobProgress] = useState<SlJobProgress | null>(null);

  const fileRef              = useRef<HTMLInputElement>(null);
  const isAutoModeRef        = useRef(false);
  const stateVendorCacheRef  = useRef<Record<string, VendorAnalyticsRow[]>>({});
  const lcPollRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const slPollRef            = useRef<ReturnType<typeof setInterval> | null>(null);

  isAutoModeRef.current = isAutoMode;

  useEffect(() => {
    axios.get('/access/me')
      .then(r => {
        const list = r.data.access || [];
        console.log('[BulkAuto] accessList loaded:', list.length, 'items');
        console.log('[BulkAuto] USPS vendors:', list.filter((a: AccessItem) => a.carrier === 'USPS'));
        setAccessList(list);
      })
      .catch(e => console.error('[BulkAuto] /access/me failed:', e));
  }, []);

  const vendorsForCarrier = accessList.filter(a =>
    a.carrier === selectedCarrier &&
    a.isAllowed &&
    (a.portal || 'shippershub') === selectedPortal
  );

  const allowedUspsVendors = useMemo(() => {
    const filtered = accessList.filter(a =>
      a.carrier === 'USPS' && a.isAllowed && (a.portal || 'shippershub') === 'shippershub'
    );
    console.log('[BulkAuto] allowedUspsVendors recalculated:', filtered.length, filtered.map(v => `${v.vendorName}(${v.shippingService})`));
    return filtered;
  }, [accessList]);

  const getEffectiveRate = useCallback((weight: number) => {
    if (!selectedVendor) return 0;
    return getVendorEffectiveRate(selectedVendor, weight);
  }, [selectedVendor]);

  // Unified per-row rate (works in both normal and auto mode)
  const getRowRate = useCallback((rowIdx: number, weight: number): number => {
    if (isAutoMode) {
      const v = rowAssignments[rowIdx];
      return v ? getVendorEffectiveRate(v, weight) : 0;
    }
    return getEffectiveRate(weight);
  }, [isAutoMode, rowAssignments, getEffectiveRate]);

  // Merge row validation errors + auto-vendor errors
  const allRowErrors = useMemo(() => {
    const combined: Record<number, string[]> = { ...rowErrors };
    if (isAutoMode && rowAssignments.length === rows.length) {
      rows.forEach((row, i) => {
        if (!rowAssignments[i]) {
          combined[i] = [...(combined[i] || []), `No vendor for state ${row.to_state || '?'} — ask admin to enable access`];
        }
      });
    }
    return combined;
  }, [rowErrors, isAutoMode, rowAssignments, rows]);

  const totalCost = rows.reduce((sum, r, i) => sum + getRowRate(i, parseFloat(r.weight) || 0), 0);
  const hasErrors  = Object.keys(allRowErrors).length > 0 || headerMissing.length > 0 || autoLoading;
  const carrier    = CARRIERS.find(c => c.name === selectedCarrier);

  const hasRateTiers  = !!selectedVendor?.rateTiers?.length;
  const validRowCount = rows.length - Object.keys(allRowErrors).length;

  // Savings vs retail — only in single-vendor USPS API mode
  const totalSavings = useMemo(() => {
    if (selectedCarrier !== 'USPS' || isAutoMode || selectedVendor?.vendorType === 'manifest') return 0;
    return rows.reduce((sum, r) => {
      const w = parseFloat(r.weight) || 0;
      if (w <= 0) return sum;
      const retail = getUspsZone1Rate(w);
      if (retail === null) return sum;
      const saving = retail - getEffectiveRate(w);
      return sum + (saving > 0 ? saving : 0);
    }, 0);
  }, [rows, selectedCarrier, isAutoMode, selectedVendor, getEffectiveRate]);

  // ── Row editing ──────────────────────────────────────────────────────────────
  const revalidateRows = useCallback((newRows: LabelRow[]) => {
    const errors: Record<number, string[]> = {};
    newRows.forEach((row, i) => {
      const e = validateRow(row);
      if (e.length) errors[i] = e;
    });
    setRowErrors(errors);
    return errors;
  }, []);

  const updateCell = (rowIdx: number, col: string, val: string) => {
    const newRows = rows.map((r, i) => i === rowIdx ? { ...r, [col]: val } : r);
    setRows(newRows);
    revalidateRows(newRows);
  };

  const deleteRow = (rowIdx: number) => {
    const newRows = rows.filter((_, i) => i !== rowIdx);
    setRows(newRows);
    revalidateRows(newRows);
    if (isAutoMode) {
      setRowAssignments(prev => prev.filter((_, i) => i !== rowIdx));
    }
  };

  const addRow = () => {
    const newRows = [...rows, emptyRow()];
    setRows(newRows);
    revalidateRows(newRows);
    if (isAutoMode) setRowAssignments(prev => [...prev, null]);
  };

  // ── Auto-vendor assignment ────────────────────────────────────────────────────
  const autoAssignVendors = useCallback(async (parsedRows: LabelRow[]) => {
    setAutoLoading(true);
    setRowAssignments([]);
    console.log('[BulkAuto] autoAssignVendors START — rows:', parsedRows.length, '| allowedUspsVendors:', allowedUspsVendors.length);
    try {
      const uniqueStates = Array.from(new Set(
        parsedRows.map(r => r.to_state?.trim().toUpperCase()).filter(Boolean)
      )) as string[];
      console.log('[BulkAuto] unique to_states in file:', uniqueStates);

      const statesToFetch = uniqueStates.filter(s => !stateVendorCacheRef.current[s]);
      console.log('[BulkAuto] states to fetch from API:', statesToFetch);

      if (statesToFetch.length > 0) {
        const fetched = await Promise.all(
          statesToFetch.map(async state => {
            try {
              const res = await axios.get(`${EXT}/state-vendor-breakdown?state=${state}`, { headers: EXT_HDR });
              const vendors = parseAnalyticsData(res.data);
              console.log(`[BulkAuto] ${state} → ${vendors.length} analytics vendors`, vendors.map((v: VendorAnalyticsRow) => `${v.vendor}(${v.deliveryRate}%)`));
              return [state, vendors] as [string, VendorAnalyticsRow[]];
            } catch (e) {
              console.error(`[BulkAuto] fetch failed for state ${state}:`, e);
              return [state, []] as [string, VendorAnalyticsRow[]];
            }
          })
        );
        fetched.forEach(([state, vendors]) => { stateVendorCacheRef.current[state] = vendors; });
      }

      const assignments: (AccessItem | null)[] = parsedRows.map((row, i) => {
        const state = row.to_state?.trim().toUpperCase();
        if (!state) { console.warn(`[BulkAuto] row ${i} has no to_state`); return null; }
        const stateVendors = stateVendorCacheRef.current[state] || [];
        const match = assignBestVendor(stateVendors, allowedUspsVendors);
        console.log(`[BulkAuto] row ${i} state=${state} → assigned: ${match ? match.vendorName + '(' + match.shippingService + ')' : 'NULL — no match'}`);
        return match;
      });

      console.log('[BulkAuto] final assignments:', assignments.map(a => a?.vendorName ?? 'null'));
      setRowAssignments(assignments);
    } catch (e) {
      console.error('[BulkAuto] assignment error', e);
    } finally {
      setAutoLoading(false);
    }
  }, [allowedUspsVendors]);

  const overrideRowVendor = (rowIdx: number, vendorId: string) => {
    const v = allowedUspsVendors.find(x => x.vendorId === vendorId) || null;
    setRowAssignments(prev => {
      const next = [...prev];
      next[rowIdx] = v;
      return next;
    });
  };

  // ── File processing ──────────────────────────────────────────────────────────
  const clearFile = () => {
    setFileName(''); setRows([]); setRowErrors({}); setHeaderMissing([]);
    setRowAssignments([]);
  };

  const processFile = (file: File) => {
    if (!file.name.endsWith('.csv')) { setHeaderMissing(['Please upload a .csv file']); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows: parsedRows } = parseCSV(text);
      const missing = REQUIRED_COLS.filter(c => !headers.includes(c));
      setHeaderMissing(missing);
      if (missing.length === 0) {
        setRows(parsedRows);
        revalidateRows(parsedRows);
        if (isAutoModeRef.current) autoAssignVendors(parsedRows);
      } else {
        setRows([]);
        setRowAssignments([]);
      }
    };
    reader.readAsText(file);
  };

  const handleFileDrop  = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  // ── Generate — normal single-vendor ─────────────────────────────────────────
  const handleGenerateNormal = async () => {
    if (!selectedVendor || hasErrors || rows.length === 0) return;
    setIsGenerating(true); setGenError('');
    try {
      const res = await axios.post('/labels/bulk', { vendorId: selectedVendor.vendorId, labels: rows });
      if (res.data.type === 'manifest') {
        setManifestResult(res.data as ManifestResult);
      } else if (res.data.type === 'labelcrow-async') {
        setLcAsyncJob(res.data as LcAsyncJob);
        startLcPoll(res.data.lcJobId);
      } else if (res.data.type === 'shiplabel-async') {
        setSlAsyncJob(res.data as SlAsyncJob);
        startSlPoll(res.data.bulkJobId);
      } else {
        setApiResult(res.data as ApiResult);
      }
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.errors?.length) setGenError(data.errors.map((e: any) => e.msg).join(' · '));
      else setGenError(data?.message || 'Failed to generate labels');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Generate — auto multi-vendor ─────────────────────────────────────────────
  const handleGenerateAuto = async () => {
    setIsGenerating(true); setGenError('');

    // Group rows by assigned vendorId, preserving original indices
    const groups = new Map<string, { vendor: AccessItem; rows: LabelRow[]; origIdx: number[] }>();
    rows.forEach((row, i) => {
      const v = rowAssignments[i];
      if (!v) return;
      const g = groups.get(v.vendorId);
      if (g) { g.rows.push(row); g.origIdx.push(i); }
      else groups.set(v.vendorId, { vendor: v, rows: [row], origIdx: [i] });
    });

    // Pre-fill combined with placeholder failures
    const combined: MultiResultRow[] = rows.map((_, i) => ({
      originalIndex: i,
      labelId:      null,
      vendorName:   rowAssignments[i]?.vendorName || '—',
      trackingId:   '',
      success:      false,
      error:        rowAssignments[i] ? 'Pending' : 'No vendor assigned',
      pdfUrl:       null,
    }));

    let newBalance = 0;
    const groupSummaries: MultiApiResult['groups'] = [];

    for (const group of Array.from(groups.values())) {
      try {
        const res = await axios.post('/labels/bulk', { vendorId: group.vendor.vendorId, labels: group.rows });
        newBalance = res.data.newBalance ?? newBalance;

        if (res.data.type === 'manifest') {
          group.origIdx.forEach((idx: number) => {
            combined[idx] = { ...combined[idx], success: true, error: undefined, vendorName: group.vendor.vendorName };
          });
          groupSummaries.push({ vendorName: group.vendor.vendorName, bulkJobId: res.data.manifestJobId, submitted: group.rows.length, succeeded: group.rows.length });
        } else {
          const results: RowResult[] = res.data.results || [];
          let succeeded = 0;
          group.origIdx.forEach((origIdx: number, j: number) => {
            const r = results[j] || { success: false, error: 'No response' };
            if (r.success) succeeded++;
            combined[origIdx] = {
              originalIndex: origIdx,
              labelId:       r.labelId  || null,
              vendorName:    group.vendor.vendorName,
              trackingId:    r.trackingId || '',
              success:       r.success,
              error:         r.error,
              pdfUrl:        r.pdfUrl   || null,
            };
          });
          groupSummaries.push({ vendorName: group.vendor.vendorName, bulkJobId: res.data.bulkJobId || '', submitted: group.rows.length, succeeded });
        }
      } catch (err: any) {
        const msg = err.response?.data?.message || 'Failed';
        group.origIdx.forEach((idx: number) => { combined[idx] = { ...combined[idx], success: false, error: msg }; });
        groupSummaries.push({ vendorName: group.vendor.vendorName, bulkJobId: '', submitted: group.rows.length, succeeded: 0 });
      }
    }

    setMultiApiResult({
      type:         'multi-api',
      groups:       groupSummaries,
      combined,
      totalSuccess: combined.filter(r => r.success).length,
      totalFailed:  combined.filter(r => !r.success).length,
      newBalance,
    });
    setIsGenerating(false);
  };

  const handleGenerate = () => isAutoMode ? handleGenerateAuto() : handleGenerateNormal();

  // ── Available portals (only show portals where user has ≥1 allowed vendor) ──
  const availablePortals = useMemo(() =>
    PORTALS.filter(p => accessList.some(a => a.isAllowed && (a.portal || 'shippershub') === p.id)),
  [accessList]);

  // Stop polling on unmount
  useEffect(() => () => { stopLcPoll(); stopSlPoll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Must be before early returns (Rules of Hooks) ────────────────────────────
  const autoVendorGroups = useMemo(() => {
    if (!isAutoMode || rowAssignments.length === 0) return [];
    const map = new Map<string, { name: string; count: number }>();
    rowAssignments.forEach(v => {
      if (!v) return;
      const existing = map.get(v.vendorId);
      if (existing) existing.count++;
      else map.set(v.vendorId, { name: v.vendorName, count: 1 });
    });
    return Array.from(map.values());
  }, [isAutoMode, rowAssignments]);

  // ── Combined ZIP download (auto mode) ────────────────────────────────────────
  const downloadCombinedZip = async () => {
    if (!multiApiResult) return;
    setDownloadingZip(true);
    try {
      // Each vendor group has its own pre-built ZIP — download them sequentially.
      // The existing /zip/bulk/:id endpoint serves the pre-built ZIP directly.
      const groups = multiApiResult.groups.filter(g => g.bulkJobId && g.succeeded > 0);
      if (groups.length === 0) { alert('No labels were generated — nothing to download.'); return; }

      for (const group of groups) {
        const res = await axios.get(`/labels/zip/bulk/${group.bulkJobId}`, { responseType: 'blob' });
        const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }));
        const safeName = group.vendorName.replace(/[^a-zA-Z0-9()]/g, '-').replace(/-+/g, '-');
        const a = document.createElement('a');
        a.href = url;
        a.download = `labels-${safeName}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        // Brief pause so the browser doesn't block simultaneous downloads
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    } catch (e: any) {
      console.error('[downloadCombinedZip] error:', e);
      alert('Failed to download ZIP. Please try again.');
    } finally {
      setDownloadingZip(false);
    }
  };

  const stopLcPoll = () => {
    if (lcPollRef.current) { clearInterval(lcPollRef.current); lcPollRef.current = null; }
  };

  const startLcPoll = (jobId: string) => {
    stopLcPoll();
    lcPollRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`/labels/labelcrow-job/${jobId}`);
        setLcJobProgress(res.data);
        if (res.data.status === 'completed' || res.data.status === 'failed') stopLcPoll();
      } catch (e) {
        console.error('[LcPoll]', e);
      }
    }, 2500);
  };

  const stopSlPoll = () => {
    if (slPollRef.current) { clearInterval(slPollRef.current); slPollRef.current = null; }
  };

  const startSlPoll = (bulkJobId: string) => {
    stopSlPoll();
    slPollRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`/labels/shiplabel-job/${bulkJobId}`);
        setSlJobProgress(res.data);
        if (res.data.done) stopSlPoll();
      } catch (e) {
        console.error('[SlPoll]', e);
      }
    }, 2000);
  };

  const reset = () => {
    stopLcPoll(); stopSlPoll();
    setSelectedPortal(''); setSelectedCarrier(''); setSelectedVendor(null); setIsAutoMode(false);
    setFileName(''); setRows([]); setRowErrors({}); setHeaderMissing([]);
    setApiResult(null); setManifestResult(null); setMultiApiResult(null);
    setLcAsyncJob(null); setLcJobProgress(null);
    setSlAsyncJob(null); setSlJobProgress(null);
    setGenError(''); setRowAssignments([]);
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // RESULT — Manifest
  // ══════════════════════════════════════════════════════════════════════════════
  if (manifestResult) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fadeIn">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={reset} className="btn btn-ghost btn-sm" style={{ padding: '0.375rem' }}>
          <ArrowLeftIcon style={{ width: 18, height: 18 }} />
        </button>
        <div className="page-header" style={{ margin: 0 }}>
          <h1 className="page-title">Job Submitted</h1>
          <p className="page-subtitle">Your manifest job has been broadcast to available vendors.</p>
        </div>
      </div>
      <div className="sh-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', textAlign: 'center', borderTop: '4px solid var(--accent-500)' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent-50)', border: '2px solid var(--accent-200)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ClockIcon style={{ width: 32, height: 32, color: 'var(--accent-600)' }} />
        </div>
        <div>
          <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: 6 }}>Waiting for a vendor to accept</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--navy-500)' }}>
            Your request has been sent to all {manifestResult.carrier} manifest vendors.
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%', maxWidth: 480 }}>
          {[
            { val: manifestResult.labelCount, label: 'Labels', color: 'var(--navy-900)' },
            { val: `$${manifestResult.totalCost.toFixed(2)}`, label: 'Charged', color: 'var(--danger-600)' },
            { val: `$${manifestResult.newBalance.toFixed(2)}`, label: 'Balance', color: 'var(--accent-600)' },
          ].map(({ val, label, color }) => (
            <div key={label} style={{ padding: '0.875rem', background: 'var(--navy-50)', borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--navy-600)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--navy-50)', borderRadius: 8, padding: '0.75rem 1.25rem', display: 'flex', gap: 10, width: '100%', maxWidth: 480 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>Job ID</span>
          <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--navy-700)', wordBreak: 'break-all' }}>{manifestResult.manifestJobId}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button className="btn btn-ghost" onClick={reset}>Submit Another Batch</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // RESULT — Single API vendor
  // ══════════════════════════════════════════════════════════════════════════════
  if (apiResult) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fadeIn">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={reset} className="btn btn-ghost btn-sm" style={{ padding: '0.375rem' }}>
          <ArrowLeftIcon style={{ width: 18, height: 18 }} />
        </button>
        <div className="page-header" style={{ margin: 0 }}>
          <h1 className="page-title">Bulk Generation Complete</h1>
          <p className="page-subtitle">
            {apiResult.results.filter(r => r.success).length} succeeded · {apiResult.results.filter(r => !r.success).length} failed
          </p>
        </div>
      </div>
      {(() => {
        const successSavings = selectedCarrier === 'USPS' && selectedVendor?.vendorType !== 'manifest'
          ? apiResult.results.reduce((sum, r, i) => {
              if (!r.success) return sum;
              const w = parseFloat(rows[i]?.weight) || 0;
              const retail = getUspsZone1Rate(w);
              if (!retail) return sum;
              const saving = retail - getEffectiveRate(w);
              return sum + (saving > 0 ? saving : 0);
            }, 0)
          : 0;
        const cards = [
          { val: apiResult.results.filter(r => r.success).length,  label: 'Generated', color: 'var(--success-600)' },
          { val: apiResult.results.filter(r => !r.success).length, label: 'Failed',    color: apiResult.results.some(r => !r.success) ? 'var(--danger-600)' : 'var(--navy-500)' },
          { val: `$${apiResult.newBalance.toFixed(2)}`,            label: 'Remaining', color: 'var(--accent-600)' },
          ...(successSavings > 0 ? [{ val: `$${successSavings.toFixed(2)}`, label: 'Saved vs USPS', color: '#059669' }] : []),
        ];
        return (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cards.length}, 1fr)`, gap: '1rem' }}>
            {cards.map(({ val, label, color }) => (
              <div key={label} className="sh-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                {label === 'Saved vs USPS' && <SparklesIcon style={{ width: 18, height: 18, color: '#059669', margin: '0 auto 4px' }} />}
                <div style={{ fontSize: '2rem', fontWeight: 800, color }}>{val}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--navy-500)', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        );
      })()}
      <div className="sh-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="sh-table">
            <thead><tr><th>#</th><th>To Name</th><th>Tracking ID</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {apiResult.results.map((r, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--navy-500)', fontSize: '0.8rem' }}>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{rows[i]?.to_name || '—'}</td>
                  <td><span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{r.trackingId || '—'}</span></td>
                  <td>
                    {r.success
                      ? <span className="badge badge-green"><CheckCircleIcon style={{ width: 11, height: 11 }} />Generated</span>
                      : <span className="badge badge-red"><ExclamationCircleIcon style={{ width: 11, height: 11 }} />{r.error || 'Failed'}</span>}
                  </td>
                  <td>
                    {r.pdfUrl && (
                      <button className="btn btn-ghost btn-sm" onClick={() => window.open(r.pdfUrl!, '_blank')}>
                        <ArrowDownTrayIcon style={{ width: 13, height: 13 }} /> PDF
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" onClick={reset}>Generate Another Batch</button>
        {apiResult.zipUrl && (
          <button className="btn btn-primary" onClick={async () => {
            try {
              const res = await axios.get(apiResult.zipUrl!, { responseType: 'blob' });
              const url = window.URL.createObjectURL(new Blob([res.data]));
              const a = document.createElement('a');
              a.href = url; a.download = 'bulk-labels.zip';
              document.body.appendChild(a); a.click(); a.remove();
              window.URL.revokeObjectURL(url);
            } catch { alert('Failed to download ZIP.'); }
          }}>
            <ArrowDownTrayIcon style={{ width: 16, height: 16 }} /> Download All Labels (ZIP)
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => navigate('/labels/history')}>View History</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // RESULT — Multi-vendor auto mode
  // ══════════════════════════════════════════════════════════════════════════════
  if (multiApiResult) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fadeIn">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={reset} className="btn btn-ghost btn-sm" style={{ padding: '0.375rem' }}>
          <ArrowLeftIcon style={{ width: 18, height: 18 }} />
        </button>
        <div className="page-header" style={{ margin: 0 }}>
          <h1 className="page-title">Auto-Vendor Bulk Complete</h1>
          <p className="page-subtitle">
            {multiApiResult.totalSuccess} generated · {multiApiResult.totalFailed} failed · {multiApiResult.groups.length} vendor group{multiApiResult.groups.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '1rem' }}>
        {[
          { val: multiApiResult.totalSuccess,            label: 'Generated', color: 'var(--success-600)' },
          { val: multiApiResult.totalFailed,             label: 'Failed',    color: multiApiResult.totalFailed > 0 ? 'var(--danger-600)' : 'var(--navy-500)' },
          { val: multiApiResult.groups.length,           label: 'Vendors',   color: '#7C3AED' },
          { val: `$${multiApiResult.newBalance.toFixed(2)}`, label: 'Balance', color: 'var(--accent-600)' },
        ].map(({ val, label, color }) => (
          <div key={label} className="sh-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color }}>{val}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--navy-500)', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Group breakdown */}
      <div className="sh-card">
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
          Vendor Groups
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {multiApiResult.groups.map((g, i) => (
            <div key={i} style={{ padding: '6px 14px', borderRadius: 99, background: '#EFF6FF', border: '1.5px solid #BFDBFE', fontSize: '0.78rem', fontWeight: 700, color: '#1D4ED8', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{g.vendorName}</span>
              <span style={{ background: '#DBEAFE', padding: '1px 7px', borderRadius: 99, fontSize: '0.7rem' }}>{g.succeeded}/{g.submitted}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Unified result table */}
      <div className="sh-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="sh-table">
            <thead>
              <tr><th>#</th><th>To Name</th><th>Vendor</th><th>Tracking ID</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {multiApiResult.combined.map((r, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--navy-500)', fontSize: '0.8rem' }}>{r.originalIndex + 1}</td>
                  <td style={{ fontWeight: 500 }}>{rows[r.originalIndex]?.to_name || '—'}</td>
                  <td><span style={{ fontSize: '0.72rem', color: '#1D4ED8', fontWeight: 700, background: '#EFF6FF', padding: '2px 8px', borderRadius: 99 }}>{r.vendorName}</span></td>
                  <td><span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{r.trackingId || '—'}</span></td>
                  <td>
                    {r.success
                      ? <span className="badge badge-green"><CheckCircleIcon style={{ width: 11, height: 11 }} />Generated</span>
                      : <span className="badge badge-red"><ExclamationCircleIcon style={{ width: 11, height: 11 }} />{r.error || 'Failed'}</span>}
                  </td>
                  <td>
                    {r.pdfUrl && (
                      <button className="btn btn-ghost btn-sm" onClick={() => window.open(r.pdfUrl!, '_blank')}>
                        <ArrowDownTrayIcon style={{ width: 13, height: 13 }} /> PDF
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" onClick={reset}>Generate Another Batch</button>
        {multiApiResult.totalSuccess > 0 && (() => {
          const dlGroups = multiApiResult.groups.filter(g => g.bulkJobId && g.succeeded > 0);
          return (
            <button
              className="btn btn-primary"
              disabled={downloadingZip}
              onClick={downloadCombinedZip}
            >
              {downloadingZip
                ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Downloading…</>
                : <><ArrowDownTrayIcon style={{ width: 16, height: 16 }} />
                    Download Labels ({dlGroups.length} ZIP{dlGroups.length !== 1 ? 's' : ''})</>}
            </button>
          );
        })()}
        <button className="btn btn-ghost" onClick={() => navigate('/labels/history')}>View History</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // RESULT — Label Crow async polling
  // ══════════════════════════════════════════════════════════════════════════════
  if (lcAsyncJob && (!lcJobProgress || lcJobProgress.status === 'queued' || lcJobProgress.status === 'processing')) {
    const prog = lcJobProgress;
    const pct  = prog ? Math.round((prog.generated / Math.max(prog.total, 1)) * 100) : 0;
    return (
      <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="page-header" style={{ margin: 0 }}>
          <h1 className="page-title">Generating Labels…</h1>
          <p className="page-subtitle">Label Crow is processing your batch. This usually takes 10–60 seconds.</p>
        </div>
        <div className="sh-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#7C3AED', marginBottom: 4 }}>
              {prog ? `${prog.generated} / ${prog.total}` : `0 / ${lcAsyncJob.total}`}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--navy-500)' }}>labels generated</div>
          </div>
          <div style={{ height: 8, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden', maxWidth: 480, margin: '0 auto 16px' }}>
            <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#7C3AED,#6D28D9)', width: `${pct}%`, transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ fontSize: '0.8rem', color: '#7C3AED', fontWeight: 600 }}>
            {prog?.status === 'processing' ? `Processing… ${pct}%` : 'Queued — starting shortly…'}
          </div>
          {(prog?.failed ?? 0) > 0 && (
            <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--danger-600)' }}>
              {prog!.failed} failed so far
            </div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // RESULT — Label Crow complete / failed
  // ══════════════════════════════════════════════════════════════════════════════
  if (lcAsyncJob && lcJobProgress && (lcJobProgress.status === 'completed' || lcJobProgress.status === 'failed')) {
    const prog = lcJobProgress;
    return (
      <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={reset} className="btn btn-ghost btn-sm" style={{ padding: '0.375rem' }}>
            <ArrowLeftIcon style={{ width: 18, height: 18 }} />
          </button>
          <div className="page-header" style={{ margin: 0 }}>
            <h1 className="page-title">
              {prog.status === 'completed' ? 'Label Crow Bulk Complete' : 'Label Crow Bulk Failed'}
            </h1>
            <p className="page-subtitle">{prog.generated} generated · {prog.failed} failed</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '1rem' }}>
          {[
            { val: prog.generated, label: 'Generated', color: 'var(--success-600)' },
            { val: prog.failed,    label: 'Failed',    color: prog.failed > 0 ? 'var(--danger-600)' : 'var(--navy-500)' },
            { val: `$${(prog.newBalance ?? 0).toFixed(2)}`, label: 'Balance', color: 'var(--accent-600)' },
          ].map(({ val, label, color }) => (
            <div key={label} className="sh-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--navy-500)', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={reset}>Generate Another Batch</button>
          {prog.status === 'completed' && prog.zipUrl && (
            <button className="btn btn-primary" onClick={async () => {
              try {
                const r = await axios.get(prog.zipUrl!, { responseType: 'blob' });
                const url = window.URL.createObjectURL(new Blob([r.data]));
                const a = document.createElement('a');
                a.href = url; a.download = 'labelcrow-labels.zip';
                document.body.appendChild(a); a.click(); a.remove();
                window.URL.revokeObjectURL(url);
              } catch { alert('Download failed. Please try again.'); }
            }}>
              <ArrowDownTrayIcon style={{ width: 16, height: 16 }} /> Download All Labels (ZIP)
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => navigate('/labels/history')}>View History</button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // RESULT — ShipLabel live row-by-row progress
  // ══════════════════════════════════════════════════════════════════════════════
  if (slAsyncJob && slJobProgress && !slJobProgress.done) {
    const { total, generated, failed, pending } = slJobProgress;
    const pct = Math.round(((generated + failed) / Math.max(total, 1)) * 100);
    return (
      <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="page-header" style={{ margin: 0 }}>
          <h1 className="page-title">Generating Labels…</h1>
          <p className="page-subtitle">ShipLabel is processing your batch — updating live.</p>
        </div>
        <div className="sh-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#059669', marginBottom: 4 }}>
              {generated + failed} / {total}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--navy-500)' }}>labels processed</div>
          </div>
          <div style={{ height: 8, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden', maxWidth: 480, margin: '0 auto 12px' }}>
            <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#059669,#047857)', width: `${pct}%`, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, fontSize: '0.82rem', marginBottom: 8 }}>
            <span style={{ color: '#059669', fontWeight: 700 }}>{generated} generated</span>
            {failed > 0 && <span style={{ color: 'var(--danger-600)', fontWeight: 700 }}>{failed} failed</span>}
            <span style={{ color: 'var(--navy-500)' }}>{pending} pending</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>{pct}% complete…</div>
        </div>
        {slJobProgress.labels.filter(l => l.status !== 'pending').length > 0 && (
          <div className="sh-card">
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              Live Results
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="sh-table">
                <thead><tr><th>#</th><th>To Name</th><th>Tracking ID</th><th>Status</th></tr></thead>
                <tbody>
                  {slJobProgress.labels.filter(l => l.status !== 'pending').map((l, i) => (
                    <tr key={l._id}>
                      <td style={{ color: 'var(--navy-500)', fontSize: '0.8rem' }}>{i + 1}</td>
                      <td style={{ fontWeight: 500 }}>{l.to_name || '—'}</td>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{l.trackingId || '—'}</span></td>
                      <td>
                        {l.status === 'generated'
                          ? <span className="badge badge-green"><CheckCircleIcon style={{ width: 11, height: 11 }} />Generated</span>
                          : <span className="badge badge-red"><ExclamationCircleIcon style={{ width: 11, height: 11 }} />Failed</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ShipLabel: show progress screen while waiting for first poll response
  if (slAsyncJob && !slJobProgress) {
    return (
      <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="page-header" style={{ margin: 0 }}>
          <h1 className="page-title">Generating Labels…</h1>
          <p className="page-subtitle">ShipLabel is processing your batch — updating live.</p>
        </div>
        <div className="sh-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4, borderColor: '#059669', margin: '0 auto 16px' }} />
          <div style={{ fontSize: '0.875rem', color: 'var(--navy-500)' }}>Starting… 0 / {slAsyncJob.total}</div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // RESULT — ShipLabel done
  // ══════════════════════════════════════════════════════════════════════════════
  if (slAsyncJob && slJobProgress && slJobProgress.done) {
    const { total, generated, failed, labels } = slJobProgress;
    return (
      <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={reset} className="btn btn-ghost btn-sm" style={{ padding: '0.375rem' }}>
            <ArrowLeftIcon style={{ width: 18, height: 18 }} />
          </button>
          <div className="page-header" style={{ margin: 0 }}>
            <h1 className="page-title">ShipLabel Bulk Complete</h1>
            <p className="page-subtitle">{generated} generated · {failed} failed</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '1rem' }}>
          {[
            { val: generated, label: 'Generated', color: 'var(--success-600)' },
            { val: failed,    label: 'Failed',    color: failed > 0 ? 'var(--danger-600)' : 'var(--navy-500)' },
            { val: total,     label: 'Total',     color: 'var(--navy-700)' },
            { val: `$${slAsyncJob.newBalance.toFixed(2)}`, label: 'Balance', color: 'var(--accent-600)' },
          ].map(({ val, label, color }) => (
            <div key={label} className="sh-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--navy-500)', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
        <div className="sh-card">
          <div style={{ overflowX: 'auto' }}>
            <table className="sh-table">
              <thead>
                <tr><th>#</th><th>To Name</th><th>To ZIP</th><th>Tracking ID</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {labels.map((l, i) => (
                  <tr key={l._id}>
                    <td style={{ color: 'var(--navy-500)', fontSize: '0.8rem' }}>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{l.to_name || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{l.to_zip || '—'}</td>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{l.trackingId || '—'}</span></td>
                    <td>
                      {l.status === 'generated'
                        ? <span className="badge badge-green"><CheckCircleIcon style={{ width: 11, height: 11 }} />Generated</span>
                        : <span className="badge badge-red"><ExclamationCircleIcon style={{ width: 11, height: 11 }} />Failed</span>}
                    </td>
                    <td>
                      {l.pdfUrl && (
                        <button className="btn btn-ghost btn-sm" onClick={() => window.open(l.pdfUrl!, '_blank')}>
                          <ArrowDownTrayIcon style={{ width: 13, height: 13 }} /> PDF
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={reset}>Generate Another Batch</button>
          <button className="btn btn-ghost" onClick={() => navigate('/labels/history')}>View History</button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MAIN VIEW
  // ══════════════════════════════════════════════════════════════════════════════
  const uploadEnabled = !!(selectedVendor || isAutoMode);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', paddingBottom: rows.length > 0 && uploadEnabled ? 80 : 0 }} className="animate-fadeIn">

      {/* ── Combined service card ─────────────────────────────── */}
      <div className="sh-card" style={{ overflow: 'hidden' }}>

        {/* Row 0 — Portal pills */}
        {availablePortals.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.625rem 1rem', borderBottom: '1px solid var(--navy-100)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Portal</span>
            {availablePortals.map(p => {
              const isSel = selectedPortal === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    if (isSel) { setSelectedPortal(''); setSelectedCarrier(''); setSelectedVendor(null); setIsAutoMode(false); clearFile(); return; }
                    setSelectedPortal(p.id); setSelectedCarrier(''); setSelectedVendor(null); setIsAutoMode(false); clearFile();
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: 34, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
                    border: isSel ? `2px solid ${p.accentColor}` : '1.5px solid #e2e8f0',
                    background: isSel ? p.selectedBg : '#fff',
                    boxShadow: isSel ? `0 0 0 3px ${p.accentColor}18` : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: isSel ? p.accentColor : 'var(--navy-600)' }}>
                    {p.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Row 1 — Carrier pills + vendor dropdown + template */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem 1rem', flexWrap: 'wrap', borderBottom: '1px solid var(--navy-100)' }}>

          {/* Carrier pills — filtered to selected portal */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {CARRIERS.map(c => {
              const allowed    = accessList.filter(a => a.carrier === c.name && a.isAllowed && (a.portal || 'shippershub') === selectedPortal);
              const isEnabled  = allowed.length > 0;
              const isSelected = selectedCarrier === c.name;
              return (
                <div
                  key={c.name}
                  onClick={() => {
                    if (!isEnabled) return;
                    if (isSelected) { setSelectedCarrier(''); setSelectedVendor(null); setIsAutoMode(false); clearFile(); return; }
                    setSelectedCarrier(c.name); setSelectedVendor(null); setIsAutoMode(false); clearFile();
                  }}
                  title={isEnabled ? `${c.name} · ${allowed.length} vendor${allowed.length !== 1 ? 's' : ''}` : 'No access'}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: 46, minWidth: 80, padding: '4px 12px', borderRadius: 10,
                    border: isSelected ? `2px solid ${c.accentColor}` : '1.5px solid #e2e8f0',
                    background: isSelected ? c.selectedBg : '#fff',
                    cursor: isEnabled ? 'pointer' : 'not-allowed',
                    opacity: isEnabled ? 1 : 0.35,
                    boxShadow: isSelected ? `0 0 0 3px ${c.accentColor}18, 0 2px 8px ${c.accentColor}20` : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  <CarrierLogo name={c.name} />
                </div>
              );
            })}
          </div>

          <div style={{ width: 1, height: 34, background: 'var(--navy-100)', flexShrink: 0 }} />

          {/* Vendor dropdown */}
          <div style={{ flex: 1, minWidth: 200, maxWidth: 360 }}>
            <select
              className="form-input form-select"
              value={isAutoMode ? AUTO_VENDOR_ID : (selectedVendor?.vendorId || '')}
              disabled={!selectedPortal || !selectedCarrier}
              onChange={e => {
                const val = e.target.value;
                if (val === AUTO_VENDOR_ID) {
                  setSelectedVendor(null);
                  setIsAutoMode(true);
                  clearFile();
                } else {
                  const v = vendorsForCarrier.find(x => x.vendorId === val) || null;
                  setSelectedVendor(v);
                  setIsAutoMode(false);
                  clearFile();
                }
              }}
              style={{ padding: '0.45rem 2rem 0.45rem 0.75rem', fontSize: '0.82rem', cursor: selectedCarrier ? 'pointer' : 'not-allowed' }}
            >
              <option value="">
                {!selectedPortal ? '← pick a portal first' : !selectedCarrier ? '← pick a carrier' : '— select vendor —'}
              </option>
              {/* Auto option — ShippersHub USPS only */}
              {selectedCarrier === 'USPS' && selectedPortal === 'shippershub' && (
                <option value={AUTO_VENDOR_ID}>⚡ Auto — Best per State</option>
              )}
              {vendorsForCarrier.map(v => (
                <option key={v.vendorId} value={v.vendorId}>
                  {v.vendorName}{v.shippingService ? ` · ${v.shippingService}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Vendor / auto badges */}
          {isAutoMode && (
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'linear-gradient(90deg,#EFF6FF,#F5F3FF)', border: '1.5px solid #BFDBFE', padding: '3px 10px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 700, color: '#4338CA' }}>
                <BoltIcon style={{ width: 11, height: 11 }} /> Auto — Best per State
              </span>
            </div>
          )}
          {!isAutoMode && selectedVendor && (
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
              {selectedVendor.shippingService && <span className="badge badge-blue">{selectedVendor.shippingService}</span>}
              {selectedVendor.vendorType === 'manifest'
                ? <span className="badge badge-amber">Manifested</span>
                : <span className="badge badge-green">Auto</span>}
            </div>
          )}

          <div style={{ flex: 1 }} />

          {selectedCarrier && (
            <button className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', flexShrink: 0 }} onClick={() => downloadTemplate(selectedCarrier)}>
              <ArrowDownTrayIcon style={{ width: 13, height: 13 }} /> Template
            </button>
          )}
        </div>

        {/* Row 2 — File upload */}
        <div style={{ padding: '0.625rem 1rem' }}>
          {fileName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <DocumentTextIcon style={{ width: 15, height: 15, color: 'var(--accent-500)', flexShrink: 0 }} />
              <span style={{ fontWeight: 600, color: 'var(--navy-800)', fontSize: '0.82rem' }}>{fileName}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--navy-500)' }}>{rows.length} rows</span>
              {autoLoading && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#7C3AED' }}>
                  <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> Assigning vendors…
                </span>
              )}
              {!autoLoading && headerMissing.length === 0 && Object.keys(allRowErrors).length === 0 && rows.length > 0 && (
                <span className="badge badge-green"><CheckCircleIcon style={{ width: 10, height: 10 }} />Valid</span>
              )}
              {!autoLoading && (headerMissing.length > 0 || Object.keys(allRowErrors).length > 0) && (
                <span className="badge badge-red"><ExclamationCircleIcon style={{ width: 10, height: 10 }} />
                  {headerMissing.length > 0 ? 'Bad columns' : `${Object.keys(allRowErrors).length} row error${Object.keys(allRowErrors).length !== 1 ? 's' : ''}`}
                </span>
              )}
              {headerMissing.length > 0 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--danger-600)' }}>
                  Missing: {headerMissing.join(', ')} —{' '}
                  <button style={{ background: 'none', border: 'none', color: 'var(--accent-600)', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit' }} onClick={() => downloadTemplate(selectedCarrier)}>
                    get template
                  </button>
                </span>
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', padding: '0.2rem 0.5rem' }} onClick={clearFile}>
                <XMarkIcon style={{ width: 12, height: 12 }} />
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                border: isDragging ? '2px dashed var(--accent-400)' : '2px dashed var(--navy-200)',
                borderRadius: 9, padding: '0.55rem 0.875rem',
                background: isDragging ? 'var(--accent-50)' : 'var(--navy-50)',
                cursor: uploadEnabled ? 'pointer' : 'not-allowed',
                opacity: uploadEnabled ? 1 : 0.5,
                transition: 'all 0.15s',
              }}
              onDragOver={e => { if (!uploadEnabled) return; e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { if (!uploadEnabled) return; handleFileDrop(e); }}
              onClick={() => { if (!uploadEnabled) return; fileRef.current?.click(); }}
            >
              <ArrowUpTrayIcon style={{ width: 16, height: 16, color: isDragging ? 'var(--accent-500)' : 'var(--navy-500)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 500, color: isDragging ? 'var(--accent-700)' : 'var(--navy-600)' }}>
                {!uploadEnabled
                  ? !selectedPortal ? 'Select a portal above to get started'
                    : !selectedCarrier ? 'Select a carrier above'
                    : 'Select a vendor above to upload CSV'
                  : isDragging ? 'Drop it!'
                  : isAutoMode ? 'Drop CSV here — vendor will be auto-assigned per state'
                  : 'Drop CSV here or click to browse'}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--navy-500)', marginLeft: 4 }}>.csv only</span>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileInput} />
            </div>
          )}
        </div>
      </div>

      {/* ── Data table ───────────────────────────────────────────── */}
      {rows.length > 0 && headerMissing.length === 0 && (
        <div className="sh-card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.625rem 1rem', borderBottom: '1px solid var(--navy-100)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-600)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Review & Edit
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--navy-500)' }}>{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
            {autoLoading
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#7C3AED' }}><div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />Assigning vendors…</span>
              : Object.keys(allRowErrors).length > 0
                ? <span className="badge badge-red"><ExclamationCircleIcon style={{ width: 10, height: 10 }} />{Object.keys(allRowErrors).length} error{Object.keys(allRowErrors).length !== 1 ? 's' : ''}</span>
                : <span className="badge badge-green"><CheckCircleIcon style={{ width: 10, height: 10 }} />All valid</span>}
            {isAutoMode && !autoLoading && autoVendorGroups.length > 0 && (
              <span style={{ fontSize: '0.73rem', color: '#7C3AED', marginLeft: 4 }}>
                {autoVendorGroups.length} vendor{autoVendorGroups.length !== 1 ? 's' : ''}: {autoVendorGroups.map(g => `${g.name} ×${g.count}`).join(', ')}
              </span>
            )}
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={addRow}>
              <PlusIcon style={{ width: 13, height: 13 }} /> Add Row
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'var(--navy-50)', borderBottom: '1px solid var(--navy-100)' }}>
                  <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', fontWeight: 700, color: 'var(--navy-600)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: 32 }}>#</th>
                  {TABLE_COLS.map(col => (
                    <th key={col.key} style={{ padding: '0.4rem 0.5rem', textAlign: 'left', fontWeight: 700, color: 'var(--navy-600)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', minWidth: col.width }}>
                      {col.label}{col.required && <span style={{ color: 'var(--danger-400)', marginLeft: 2 }}>*</span>}
                    </th>
                  ))}
                  {/* Vendor column — auto mode only */}
                  {isAutoMode && (
                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', fontWeight: 700, color: '#7C3AED', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', minWidth: 160 }}>
                      ⚡ Vendor
                    </th>
                  )}
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => {
                  const errs        = allRowErrors[rowIdx] || [];
                  const hasRowError = errs.length > 0;
                  const assignment  = isAutoMode ? rowAssignments[rowIdx] : null;
                  const vendorError = isAutoMode && !autoLoading && rowAssignments.length > rowIdx && !assignment;
                  return (
                    <tr
                      key={rowIdx}
                      style={{ borderBottom: '1px solid var(--navy-50)', background: hasRowError ? 'rgba(239,68,68,0.025)' : 'transparent' }}
                    >
                      <td style={{ padding: '0.25rem 0.5rem', color: 'var(--navy-500)', fontWeight: 600, fontSize: '0.75rem', verticalAlign: 'middle' }}>
                        {hasRowError
                          ? <ExclamationCircleIcon style={{ width: 13, height: 13, color: 'var(--danger-400)' }} title={errs.join(', ')} />
                          : rowIdx + 1}
                      </td>
                      {TABLE_COLS.map(col => {
                        const isEmpty     = col.required && !row[col.key]?.trim();
                        const isWeightErr = col.key === 'weight' && row[col.key] && isNaN(parseFloat(row[col.key]));
                        const cellError   = isEmpty || isWeightErr;
                        return (
                          <td key={col.key} style={{ padding: '0.2rem 0.25rem', verticalAlign: 'middle' }}>
                            <input
                              value={row[col.key] || ''}
                              onChange={e => updateCell(rowIdx, col.key, e.target.value)}
                              placeholder={col.key}
                              style={{
                                width: col.width, padding: '0.28rem 0.45rem',
                                border: cellError ? '1.5px solid var(--danger-400)' : '1.5px solid var(--navy-200)',
                                borderRadius: 6, fontSize: '0.8rem',
                                fontFamily: 'var(--font-sans)', color: 'var(--navy-900)',
                                background: cellError ? 'rgba(239,68,68,0.04)' : '#fff',
                                outline: 'none', transition: 'border-color 0.15s',
                              }}
                              onFocus={e => { if (!cellError) e.target.style.borderColor = 'var(--accent-400)'; }}
                              onBlur={e => { e.target.style.borderColor = cellError ? 'var(--danger-400)' : 'var(--navy-200)'; }}
                            />
                          </td>
                        );
                      })}
                      {/* Auto-vendor cell */}
                      {isAutoMode && (
                        <td style={{ padding: '0.2rem 0.5rem', verticalAlign: 'middle', minWidth: 160 }}>
                          {autoLoading ? (
                            <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
                          ) : (
                            <select
                              value={assignment?.vendorId || ''}
                              onChange={e => overrideRowVendor(rowIdx, e.target.value)}
                              style={{
                                padding: '3px 6px', borderRadius: 7,
                                border: vendorError ? '1.5px solid var(--danger-400)' : '1.5px solid #BFDBFE',
                                background: vendorError ? 'rgba(239,68,68,0.07)' : '#EFF6FF',
                                color: vendorError ? 'var(--danger-600)' : '#1D4ED8',
                                fontSize: '0.73rem', fontWeight: 700,
                                cursor: 'pointer', outline: 'none',
                                maxWidth: 155,
                              }}
                              title={vendorError ? `No vendor for state ${row.to_state} — select manually or ask admin` : assignment?.vendorName}
                            >
                              <option value="">— not available —</option>
                              {allowedUspsVendors.map(v => (
                                <option key={v.vendorId} value={v.vendorId}>
                                  {v.vendorName}{v.shippingService ? ` (${v.shippingService})` : ''}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      )}
                      <td style={{ padding: '0.2rem 0.4rem', verticalAlign: 'middle' }}>
                        <button
                          onClick={() => deleteRow(rowIdx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-300)', padding: 3, borderRadius: 5, display: 'flex', transition: 'color 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger-500)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--navy-300)')}
                        >
                          <TrashIcon style={{ width: 13, height: 13 }} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--navy-50)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={addRow}>
              <PlusIcon style={{ width: 12, height: 12 }} /> Add Row
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--navy-500)' }}>
              {isAutoMode
                ? 'Vendor auto-assigned by state delivery rate · click dropdown to override'
                : 'Click any cell to edit · red = required field missing'}
            </span>
          </div>
        </div>
      )}

      {/* ── Sticky footer ────────────────────────────────────────── */}
      {rows.length > 0 && uploadEnabled && headerMissing.length === 0 && (
        <div
          className="bulk-sticky-footer"
          style={{
            position: 'fixed', bottom: 0,
            left: 'var(--sidebar-w, 256px)', right: 0,
            background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(10px)',
            borderTop: '1px solid var(--navy-100)', boxShadow: '0 -4px 20px rgba(0,0,0,0.07)',
            padding: '0.75rem 1.5rem', zIndex: 30,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {carrier && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: carrier.accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isAutoMode
                    ? <BoltIcon style={{ width: 12, height: 12, color: '#fff' }} />
                    : <TruckIcon style={{ width: 12, height: 12, color: '#fff' }} />}
                </div>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--navy-900)' }}>{selectedCarrier}</span>
              </div>
            )}
            <span style={{ color: 'var(--navy-300)', fontSize: '0.8rem' }}>·</span>

            {isAutoMode ? (
              <span style={{ fontSize: '0.8rem', color: '#7C3AED', fontWeight: 600 }}>
                Auto — {autoVendorGroups.length > 0 ? `${autoVendorGroups.length} vendor${autoVendorGroups.length !== 1 ? 's' : ''}` : 'assigning…'}
              </span>
            ) : (
              <span style={{ fontSize: '0.8rem', color: 'var(--navy-600)' }}>{selectedVendor?.vendorName}</span>
            )}

            <span style={{ color: 'var(--navy-300)', fontSize: '0.8rem' }}>·</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--navy-600)' }}>
                <strong style={{ color: 'var(--navy-900)' }}>{rows.length}</strong> label{rows.length !== 1 ? 's' : ''}
              </span>
              {!isAutoMode && !hasRateTiers && <>
                <span style={{ color: 'var(--navy-300)' }}>×</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--navy-600)' }}><strong>${selectedVendor?.baseRate.toFixed(2)}</strong>/ea</span>
              </>}
              <span style={{ color: 'var(--navy-300)' }}>=</span>
              <span style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--accent-600)' }}>${totalCost.toFixed(2)}</span>
            </div>

            {!isAutoMode && totalSavings > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ color: 'var(--navy-300)', fontSize: '0.8rem' }}>·</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7', padding: '2px 10px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700 }}>
                  <SparklesIcon style={{ width: 11, height: 11 }} /> Save ${totalSavings.toFixed(2)} vs USPS retail
                </span>
              </div>
            )}

            {validRowCount !== rows.length && (
              <span className="badge badge-amber"><ExclamationCircleIcon style={{ width: 10, height: 10 }} />{Object.keys(allRowErrors).length} row error{Object.keys(allRowErrors).length !== 1 ? 's' : ''}</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {genError && <span style={{ fontSize: '0.8rem', color: 'var(--danger-600)', maxWidth: 260 }}>{genError}</span>}
            <button
              className="btn btn-primary"
              disabled={hasErrors || isGenerating || rows.length === 0}
              onClick={handleGenerate}
              style={{ minWidth: 190, padding: '0.6rem 1.25rem', fontSize: '0.875rem' }}
            >
              {isGenerating ? (
                <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Processing…</>
              ) : isAutoMode ? (
                <><BoltIcon style={{ width: 15, height: 15 }} />Generate {rows.length} Label{rows.length !== 1 ? 's' : ''} (Auto)</>
              ) : selectedVendor?.vendorType === 'manifest' ? (
                <><ClipboardDocumentListIcon style={{ width: 15, height: 15 }} />Submit Manifest Job</>
              ) : (
                <><TruckIcon style={{ width: 15, height: 15 }} />Generate {rows.length} Label{rows.length !== 1 ? 's' : ''}</>
              )}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) { .bulk-sticky-footer { left: 0 !important; } }
      `}</style>
    </div>
  );
};

export default BulkLabelGenerator;
