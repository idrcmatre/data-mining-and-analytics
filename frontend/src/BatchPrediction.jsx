import React, { useState, useRef } from 'react';
import { Upload, Download, RefreshCw, AlertCircle, CheckCircle, FileText, X } from 'lucide-react';

const API = 'http://127.0.0.1:5000';

const MODEL_OPTIONS = [
    { value: 'ridge', label: 'Ridge Regression (default)' },
    { value: 'xgboost', label: 'XGBoost (Tuned)' },
    { value: 'random_forest', label: 'Random Forest (Tuned)' },
];

const REQUIRED_COLS = [
    'equipment_type', 'manufacturer', 'condition', 'age_years', 'listing_price',
    'operating_hours', 'original_value', 'location', 'seller_type',
    'has_maintenance_records', 'has_warranty', 'photos_count',
    'description_length', 'listing_month', 'price_to_original_ratio', 'hours_per_year',
];

function parseCSV(text) {
    const lines = text.trim().split('\n').map(l => l.replace(/\r/g, ''));
    if (lines.length < 2) throw new Error('CSV needs a header row and at least one data row.');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const missing = REQUIRED_COLS.filter(c => !headers.includes(c));
    if (missing.length > 0) throw new Error(`Missing columns: ${missing.join(', ')}`);
    return lines.slice(1).filter(l => l.trim()).map((line, ri) => {
        const values = []; let cur = '', inQ = false;
        for (const ch of line) {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === ',' && !inQ) { values.push(cur.trim()); cur = ''; }
            else cur += ch;
        }
        values.push(cur.trim());
        if (values.length !== headers.length)
            throw new Error(`Row ${ri + 2}: expected ${headers.length} cols, got ${values.length}.`);
        const obj = {};
        headers.forEach((h, i) => {
            const v = values[i];
            if (['age_years', 'listing_price', 'operating_hours', 'original_value',
                'photos_count', 'description_length', 'listing_month',
                'price_to_original_ratio', 'hours_per_year'].includes(h)) {
                obj[h] = parseFloat(v);
            } else if (['has_maintenance_records', 'has_warranty'].includes(h)) {
                obj[h] = v.toLowerCase() === 'true' || v === '1';
            } else { obj[h] = v; }
        });
        return obj;
    });
}

function exportCSV(results) {
    const out = [...REQUIRED_COLS, 'predicted_days', 'predicted_weeks', 'confidence_low', 'confidence_high', 'recommendation'];
    const header = out.join(',');
    const rows = results.map(r => {
        const d = r.predicted_days;
        const rec = d < 20 ? 'Optimal Listing' : d > 60 ? 'Consider Repricing' : 'Monitor Closely';
        return out.map(col => {
            if (col === 'predicted_days') return d;
            if (col === 'predicted_weeks') return r.predicted_weeks;
            if (col === 'confidence_low') return r.confidence_low;
            if (col === 'confidence_high') return r.confidence_high;
            if (col === 'recommendation') return rec;
            const v = r.input[col];
            return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
        }).join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `inexlink_batch_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
}

function downloadTemplate() {
    const header = REQUIRED_COLS.join(',');
    const rows = [
        'Excavator,Caterpillar,Good,5.0,280000,8000,450000,Western Australia,Mining Company,true,false,12,300,6,0.622,1600',
        'Dump Truck,Komatsu,Fair,10.0,65000,25000,380000,Queensland,Rental Company,false,false,5,150,3,0.171,2500',
        'Bulldozer,Caterpillar,Excellent,2.0,150000,2000,520000,Nevada USA,Equipment Dealer,true,true,15,450,9,0.288,1000',
    ].join('\n');
    const csv = `${header}\n${rows}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'inexlink_batch_template.csv'; a.click();
    URL.revokeObjectURL(url);
}

const RecBadge = ({ days }) => {
    const [label, bg, color] =
        days < 20 ? ['Optimal', 'rgba(52,211,153,0.1)', 'var(--green)'] :
            days > 60 ? ['Reprice', 'rgba(251,113,133,0.1)', 'var(--red)'] :
                ['Monitor', 'rgba(250,204,21,0.1)', '#facc15'];
    return <span style={{
        background: bg, color, border: `1px solid ${color}40`,
        padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700
    }}>
        {label}
    </span>;
};

const BatchPrediction = () => {
    const [selectedModel, setSelectedModel] = useState('ridge');
    const [file, setFile] = useState(null);
    const [parseError, setParseError] = useState('');
    const [parsedRows, setParsedRows] = useState(null);
    const [results, setResults] = useState(null);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [apiError, setApiError] = useState('');
    const [dragging, setDragging] = useState(false);
    const fileRef = useRef();

    const handleFile = (f) => {
        setFile(f); setResults(null); setApiError(''); setParseError(''); setParsedRows(null);
        if (!f) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try { setParsedRows(parseCSV(e.target.result)); }
            catch (err) { setParseError(err.message); }
        };
        reader.readAsText(f);
    };

    const handleDrop = (e) => {
        e.preventDefault(); setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f && f.name.endsWith('.csv')) handleFile(f);
        else setParseError('Please drop a .csv file.');
    };

    const runBatch = async () => {
        if (!parsedRows?.length) return;
        setRunning(true); setApiError(''); setProgress(0); setResults(null);
        try {
            const out = [];
            for (let i = 0; i < parsedRows.length; i++) {
                const r = await fetch(`${API}/api/predict?model_name=${selectedModel}`,
                    {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(parsedRows[i])
                    });
                if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(`Row ${i + 1}: ${e.error || `HTTP ${r.status}`}`); }
                const data = await r.json();
                out.push({
                    input: parsedRows[i], predicted_days: data.estimated_days_to_sale,
                    predicted_weeks: data.estimated_weeks,
                    confidence_low: data.confidence_interval[0], confidence_high: data.confidence_interval[1]
                });
                setProgress(Math.round((i + 1) / parsedRows.length * 100));
            }
            setResults(out);
        } catch (err) { setApiError(err.message); }
        finally { setRunning(false); }
    };

    const clearAll = () => {
        setFile(null); setParsedRows(null); setResults(null);
        setParseError(''); setApiError(''); setProgress(0);
        if (fileRef.current) fileRef.current.value = '';
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header card */}
            <div className="ds-card ds-card-amber" style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div>
                        <h3 className="font-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                            Batch Prediction
                        </h3>
                        <p style={{ color: 'var(--text-sec)', fontSize: 13 }}>
                            Upload a CSV of equipment listings and get predictions for all of them at once.
                        </p>
                    </div>
                    <button className="btn-ghost" onClick={downloadTemplate}>
                        <Download size={13} /> Download template
                    </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label className="ds-label" style={{ whiteSpace: 'nowrap', marginBottom: 0 }}>Model:</label>
                    <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                        className="ds-input" disabled={running}
                        style={{ maxWidth: 280, fontSize: 13 }}>
                        {MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
            </div>

            {/* Drop zone */}
            <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`dropzone${dragging ? ' active' : ''}`}
                style={{ padding: '40px 24px', textAlign: 'center' }}
            >
                <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
                    onChange={e => handleFile(e.target.files[0])} />
                {file ? (
                    <div>
                        <FileText size={28} style={{ color: 'var(--amber)', margin: '0 auto 10px' }} />
                        <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{file.name}</p>
                        {parsedRows && (
                            <p style={{
                                color: 'var(--green)', fontSize: 13, display: 'flex',
                                alignItems: 'center', justifyContent: 'center', gap: 6
                            }}>
                                <CheckCircle size={13} />
                                {parsedRows.length} listing{parsedRows.length !== 1 ? 's' : ''} ready to predict
                            </p>
                        )}
                    </div>
                ) : (
                    <div>
                        <Upload size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
                        <p style={{ color: 'var(--text-sec)', fontSize: 14 }}>
                            Drop your CSV here or <span style={{ color: 'var(--amber)', fontWeight: 600 }}>click to browse</span>
                        </p>
                        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                            Download the template above to get started
                        </p>
                    </div>
                )}
            </div>

            {/* Parse error */}
            {parseError && (
                <div style={{
                    background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.25)',
                    borderRadius: 8, padding: '12px 16px', display: 'flex', gap: 10
                }}>
                    <AlertCircle size={16} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
                    <div>
                        <p style={{ color: 'var(--red)', fontWeight: 600, fontSize: 13 }}>CSV error</p>
                        <p style={{ color: 'var(--text-sec)', fontSize: 12, marginTop: 2 }}>{parseError}</p>
                    </div>
                </div>
            )}

            {/* Controls */}
            {parsedRows && parsedRows.length > 0 && !parseError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button className="btn-primary" onClick={runBatch} disabled={running}>
                        {running
                            ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Running... {progress}%</>
                            : <><RefreshCw size={14} /> Run {parsedRows.length} predictions</>
                        }
                    </button>
                    <button className="btn-ghost" onClick={clearAll} disabled={running}>
                        <X size={13} /> Clear
                    </button>
                </div>
            )}

            {/* Progress */}
            {running && (
                <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
            )}


            {/* Smart Recommendations */}
            {results && results.length > 0 && selectedModel === 'ridge' && (() => {
                // Find listings that are slow AND overpriced (ratio > 0.5 and days > 30)
                const candidates = results
                    .filter(r => r.predicted_days > 30 && r.input.price_to_original_ratio > 0.45)
                    .sort((a, b) => b.predicted_days - a.predicted_days)
                    .slice(0, 3);

                if (candidates.length === 0) return null;

                return (
                    <div className="ds-card" style={{ overflow: 'hidden', borderTop: '2px solid var(--amber)' }}>
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'rgba(245,158,11,0.04)' }}>
                            <h4 className="font-display" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                                Smart Recommendations
                            </h4>
                            <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                These listings have the highest predicted days-to-sale and are priced above 45% of original value — a price reduction is most likely to accelerate their sale.
                            </p>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${candidates.length}, 1fr)`, gap: 16, padding: 20 }}>
                            {candidates.map((r, i) => {
                                const saving = Math.round(r.predicted_days * 0.25);
                                const newPrice = Math.round(r.input.listing_price * 0.85);
                                return (
                                    <div key={i} style={{
                                        background: 'var(--surface)', borderRadius: 10,
                                        border: '1px solid var(--border)', padding: '16px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                                                {r.input.equipment_type}
                                            </p>
                                            <span className="badge badge-red">High Priority</span>
                                        </div>
                                        <p className="font-mono" style={{
                                            fontSize: 28, fontWeight: 700,
                                            color: 'var(--red)', marginBottom: 4
                                        }}>
                                            {r.predicted_days}d
                                        </p>
                                        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>predicted days to sale</p>
                                        <div style={{
                                            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                                            borderRadius: 8, padding: '10px 12px'
                                        }}>
                                            <p style={{
                                                fontSize: 11, fontWeight: 700, color: 'var(--amber)',
                                                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4
                                            }}>
                                                Recommendation
                                            </p>
                                            <p style={{ fontSize: 12, color: 'var(--text-sec)', lineHeight: 1.5 }}>
                                                Reduce price to{' '}
                                                <span style={{ color: 'var(--amber)', fontWeight: 700 }}>
                                                    ${newPrice.toLocaleString()}
                                                </span>{' '}
                                                (−15%) to potentially save ~{saving} days.
                                                Current: ${r.input.listing_price.toLocaleString()} ({(r.input.price_to_original_ratio * 100).toFixed(0)}% of original).
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <p style={{ padding: '8px 24px 16px', fontSize: 11, color: 'var(--text-muted)' }}>
                            Price sensitivity analysis available for Ridge Regression only. Switch to Ridge in the model selector above if using another model.
                        </p>
                    </div>
                );
            })()}
            {/* API error */}
            {apiError && (
                <div style={{
                    background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.25)',
                    borderRadius: 8, padding: '12px 16px', display: 'flex', gap: 10
                }}>
                    <AlertCircle size={16} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
                    <div>
                        <p style={{ color: 'var(--red)', fontWeight: 600, fontSize: 13 }}>Prediction error</p>
                        <p style={{ color: 'var(--text-sec)', fontSize: 12, marginTop: 2 }}>{apiError}</p>
                    </div>
                </div>
            )}

            {/* Results */}
            {results && results.length > 0 && (
                <div className="ds-card" style={{ overflow: 'hidden' }}>
                    <div style={{
                        padding: '16px 24px', borderBottom: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}>
                        <div>
                            <h4 className="font-display" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                                Results
                            </h4>
                            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
                                {results.length} predictions · {MODEL_OPTIONS.find(m => m.value === selectedModel)?.label}
                            </p>
                        </div>
                        <button className="btn-green" onClick={() => exportCSV(results)}>
                            <Download size={13} /> Export CSV
                        </button>
                    </div>

                    <div className="table-scroll">
                        <table className="ds-table">
                            <thead>
                                <tr>
                                    {['#', 'Equipment', 'Condition', 'Age', 'Price', 'Est. Days', 'Confidence', 'Action'].map(h => (
                                        <th key={h}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((r, i) => (
                                    <tr key={i}>
                                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                                        <td>
                                            <p style={{ fontWeight: 600, fontSize: 13 }}>{r.input.equipment_type}</p>
                                            <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>{r.input.manufacturer}</p>
                                        </td>
                                        <td style={{ color: 'var(--text-sec)' }}>{r.input.condition}</td>
                                        <td className="font-mono" style={{ color: 'var(--text-sec)' }}>{r.input.age_years}y</td>
                                        <td className="font-mono" style={{ color: 'var(--amber)' }}>
                                            ${r.input.listing_price.toLocaleString()}
                                        </td>
                                        <td>
                                            <span className="font-mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
                                                {r.predicted_days}
                                            </span>
                                            <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 3 }}>d</span>
                                        </td>
                                        <td className="font-mono" style={{ color: 'var(--text-sec)', fontSize: 12 }}>
                                            {r.confidence_low}–{r.confidence_high}d
                                        </td>
                                        <td><RecBadge days={r.predicted_days} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Summary strip */}
                    {(() => {
                        const avg = Math.round(results.reduce((s, r) => s + r.predicted_days, 0) / results.length);
                        const fast = results.filter(r => r.predicted_days < 20).length;
                        const slow = results.filter(r => r.predicted_days > 60).length;
                        const mid = results.length - fast - slow;
                        return (
                            <div style={{
                                padding: '12px 24px', borderTop: '1px solid var(--border)',
                                background: 'var(--surface)', display: 'flex', flexWrap: 'wrap', gap: 24
                            }}>
                                {[
                                    { label: 'Avg predicted', val: `${avg} days`, color: 'var(--text)' },
                                    { label: 'Optimal', val: `${fast} listings`, color: 'var(--green)' },
                                    { label: 'Monitor', val: `${mid} listings`, color: '#facc15' },
                                    { label: 'Reprice', val: `${slow} listings`, color: 'var(--red)' },
                                ].map(({ label, val, color }) => (
                                    <div key={label} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                                        <span style={{
                                            fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
                                            textTransform: 'uppercase', letterSpacing: '0.06em'
                                        }}>{label}:</span>
                                        <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color }}>{val}</span>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
};

export default BatchPrediction;