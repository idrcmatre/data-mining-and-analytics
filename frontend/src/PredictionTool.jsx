import React, { useState, useEffect, useCallback } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ReferenceLine, ResponsiveContainer
} from 'recharts';
import {
    Target, Zap, TrendingDown, RefreshCw, AlertCircle,
    Download, GitCompare, Lightbulb, CheckCircle, XCircle
} from 'lucide-react';

const API = 'http://127.0.0.1:5000';

const MODELS = [
    { value: 'ridge', label: 'Ridge Regression', short: 'Ridge', color: '#f59e0b', phase: 'Phase 1' },
    { value: 'xgboost', label: 'XGBoost (Tuned)', short: 'XGBoost', color: '#60a5fa', phase: 'Sprint 6' },
    { value: 'random_forest', label: 'Random Forest', short: 'RF', color: '#34d399', phase: 'Sprint 6' },
];
const LOCATIONS = ['Western Australia', 'Queensland', 'New South Wales', 'Alberta Canada', 'Nevada USA', 'Chile', 'South Africa'];
const SELLER_TYPES = ['Mining Company', 'Equipment Dealer', 'Rental Company', 'Construction Company'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ── Domain knowledge for advice panel ─────────────────────────────────────────
const ADVICE_RULES = [
    {
        key: 'condition',
        label: 'Equipment Condition',
        importance: 0.08,
        eval: (v) => v === 'Excellent' ? 1 : v === 'Good' ? 0.3 : v === 'Fair' ? -0.5 : -1,
        good: (v) => v === 'Excellent' ? 'Excellent condition — strong buyer appeal.' : null,
        bad: (v) => v === 'Needs Repair' ? 'Needs Repair condition significantly extends time to sale.' :
            v === 'Fair' ? 'Fair condition reduces buyer confidence.' : null,
        tip: 'Invest in minor repairs or a professional inspection to improve condition rating.',
    },
    {
        key: 'has_maintenance_records',
        label: 'Maintenance Records',
        importance: 0.06,
        eval: (v) => v ? 0.8 : -0.6,
        good: (v) => v ? 'Maintenance records available — reduces buyer risk.' : null,
        bad: (v) => !v ? 'No maintenance records — buyers pay a risk premium in time.' : null,
        tip: 'Gather and provide any available service history to increase buyer confidence.',
    },
    {
        key: 'has_warranty',
        label: 'Warranty',
        importance: 0.035,
        eval: (v) => v ? 0.6 : 0,
        good: (v) => v ? 'Warranty included — accelerates buyer decisions.' : null,
        bad: () => null,
        tip: null,
    },
    {
        key: 'price_to_original_ratio',
        label: 'Price vs Original Value',
        importance: 0.131,
        eval: (v) => v > 0.7 ? -1 : v > 0.5 ? -0.3 : v > 0.3 ? 0.3 : v > 0.15 ? 0.7 : -0.5,
        good: (v) => v >= 0.3 && v <= 0.6 ? `Priced at ${(v * 100).toFixed(0)}% of original — reasonable market position.` : null,
        bad: (v) => v > 0.7 ? `Priced at ${(v * 100).toFixed(0)}% of original — may be perceived as overpriced.` :
            v < 0.15 ? `Price/original ratio very low — verify the original value is correct.` : null,
        tip: 'Aim for 30–60% of original value for fastest sale velocity.',
    },
    {
        key: 'age_years',
        label: 'Equipment Age',
        importance: 0.234,
        eval: (v) => v <= 3 ? 1 : v <= 7 ? 0.3 : v <= 12 ? -0.4 : -1,
        good: (v) => v <= 3 ? `Only ${v} years old — strong resale appeal.` : null,
        bad: (v) => v > 12 ? `At ${v} years old, depreciation significantly reduces buyer pool.` :
            v > 7 ? `Age of ${v} years is above average — may require competitive pricing.` : null,
        tip: 'Pair older equipment with thorough maintenance records and competitive pricing.',
    },
    {
        key: 'operating_hours',
        label: 'Operating Hours',
        importance: 0.048,
        eval: (v) => v < 5000 ? 1 : v < 15000 ? 0.2 : v < 30000 ? -0.5 : -1,
        good: (v) => v < 5000 ? `Low hours (${v.toLocaleString()}) — near-new usage.` : null,
        bad: (v) => v > 30000 ? `High hours (${v.toLocaleString()}) — significantly limits buyer pool.` :
            v > 15000 ? `Above-average hours (${v.toLocaleString()}) — expect price sensitivity.` : null,
        tip: 'High-hour equipment sells faster when priced accordingly and backed by service records.',
    },
];

function deriveFields(form) {
    const ratio = form.original_value > 0
        ? parseFloat((form.listing_price / form.original_value).toFixed(4)) : 0;
    const hpy = form.age_years > 0
        ? parseFloat((form.operating_hours / form.age_years).toFixed(1)) : 0;
    return { price_to_original_ratio: ratio, hours_per_year: hpy };
}

function getWarnings(form) {
    const d = deriveFields(form);
    const w = [];
    if (form.operating_hours > 50000)
        w.push(`Operating hours (${form.operating_hours.toLocaleString()}) exceeds training range. Predictions may be unreliable.`);
    if (d.hours_per_year > 5000)
        w.push(`Hours/year (${d.hours_per_year.toFixed(0)}) is very high — typical range is 1,000–3,000 hrs/yr.`);
    if (form.original_value > 0 && d.price_to_original_ratio < 0.10)
        w.push(`Price/original ratio (${(d.price_to_original_ratio * 100).toFixed(1)}%) is below training range.`);
    if (d.price_to_original_ratio > 1.0)
        w.push(`Listing price exceeds original value — verify original purchase value.`);
    if (form.age_years > 20)
        w.push(`Age (${form.age_years}y) exceeds training range (0–20 years).`);
    return w;
}

// ── Dark tooltip ──────────────────────────────────────────────────────────────
const DarkTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: 'var(--card)', border: '1px solid var(--border-hi)',
            borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow)'
        }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4 }}>{label}</p>
            <p style={{ color: 'var(--amber)', fontSize: 13, fontWeight: 600 }}>
                {payload[0].value} days
            </p>
        </div>
    );
};

const recStyle = (days) =>
    days < 20 ? { label: 'Optimal Listing', bg: 'rgba(52,211,153,0.1)', color: 'var(--green)', border: 'rgba(52,211,153,0.3)' } :
        days > 60 ? { label: 'Consider Repricing', bg: 'rgba(251,113,133,0.1)', color: 'var(--red)', border: 'rgba(251,113,133,0.3)' } :
            { label: 'Monitor Closely', bg: 'rgba(250,204,21,0.1)', color: '#facc15', border: 'rgba(250,204,21,0.3)' };

// ── Download report ───────────────────────────────────────────────────────────
function downloadReport(formData, prediction, comparisonResults) {
    const lines = [
        'INEXLINK PREDICTIVE ANALYTICS — PREDICTION REPORT',
        '='.repeat(52),
        `Generated: ${new Date().toLocaleString()}`,
        '',
        'EQUIPMENT DETAILS',
        '-'.repeat(30),
        `Type:              ${formData.equipment_type}`,
        `Manufacturer:      ${formData.manufacturer}`,
        `Condition:         ${formData.condition}`,
        `Age:               ${formData.age_years} years`,
        `Operating Hours:   ${formData.operating_hours.toLocaleString()}`,
        `Listing Price:     $${formData.listing_price.toLocaleString()}`,
        `Original Value:    $${formData.original_value.toLocaleString()}`,
        `Price/Original:    ${(formData.price_to_original_ratio * 100).toFixed(1)}%`,
        `Hours/Year:        ${formData.hours_per_year.toFixed(0)}`,
        `Location:          ${formData.location}`,
        `Seller Type:       ${formData.seller_type}`,
        `Listing Month:     ${MONTHS[formData.listing_month - 1]}`,
        `Maintenance Rec:   ${formData.has_maintenance_records ? 'Yes' : 'No'}`,
        `Warranty:          ${formData.has_warranty ? 'Yes' : 'No'}`,
        '',
        'PREDICTION RESULT',
        '-'.repeat(30),
        `Model:             ${prediction.model_display_name}`,
        `Predicted Days:    ${prediction.estimated_days_to_sale} days`,
        `Estimated Weeks:   ${prediction.estimated_weeks} weeks`,
        `Confidence Range:  ${prediction.confidence_interval[0]} – ${prediction.confidence_interval[1]} days`,
        `Recommendation:    ${recStyle(prediction.estimated_days_to_sale).label}`,
    ];

    if (comparisonResults && comparisonResults.length > 0) {
        lines.push('', 'MODEL COMPARISON', '-'.repeat(30));
        comparisonResults.forEach(r => {
            if (r.data) {
                lines.push(`${r.label.padEnd(20)} ${r.data.estimated_days_to_sale} days (${r.data.confidence_interval[0]}–${r.data.confidence_interval[1]})`);
            }
        });
    }

    lines.push('', '─'.repeat(52));
    lines.push('Inexlink Predictive Analytics Platform — Group 4, QUT IFN736');

    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inexlink_prediction_${formData.equipment_type.replace(' ', '_')}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── Advice Panel ──────────────────────────────────────────────────────────────
const AdvicePanel = ({ formData }) => {
    const derived = deriveFields(formData);
    const data = { ...formData, ...derived };
    const good = [], bad = [];

    ADVICE_RULES.forEach(rule => {
        const score = rule.eval(data[rule.key]);
        const goodMsg = rule.good(data[rule.key]);
        const badMsg = rule.bad(data[rule.key]);
        if (score > 0.2 && goodMsg) good.push({ label: rule.label, msg: goodMsg, importance: rule.importance });
        if (score < -0.1 && badMsg) bad.push({ label: rule.label, msg: badMsg, tip: rule.tip, importance: rule.importance });
    });

    good.sort((a, b) => b.importance - a.importance);
    bad.sort((a, b) => b.importance - a.importance);

    if (good.length === 0 && bad.length === 0) return null;

    return (
        <div className="ds-card" style={{
            padding: '20px 24px', marginTop: 16,
            borderTop: '2px solid var(--purple)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Lightbulb size={16} style={{ color: 'var(--purple)' }} />
                <h4 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                    Listing Analysis
                </h4>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>— factors affecting your predicted sale time</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Helping factors */}
                {good.length > 0 && (
                    <div>
                        <p style={{
                            fontSize: 11, fontWeight: 700, color: 'var(--green)',
                            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10
                        }}>
                            Working in your favour
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {good.slice(0, 3).map((g, i) => (
                                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                    <CheckCircle size={14} style={{ color: 'var(--green)', flexShrink: 0, marginTop: 1 }} />
                                    <div>
                                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 1 }}>{g.label}</p>
                                        <p style={{ fontSize: 12, color: 'var(--text-sec)' }}>{g.msg}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {/* Hurting factors */}
                {bad.length > 0 && (
                    <div>
                        <p style={{
                            fontSize: 11, fontWeight: 700, color: 'var(--red)',
                            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10
                        }}>
                            Areas to address
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {bad.slice(0, 3).map((b, i) => (
                                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                    <XCircle size={14} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
                                    <div>
                                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 1 }}>{b.label}</p>
                                        <p style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: b.tip ? 3 : 0 }}>{b.msg}</p>
                                        {b.tip && (
                                            <p style={{ fontSize: 11, color: 'var(--amber)', fontStyle: 'italic' }}>
                                                Tip: {b.tip}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Model Comparison ──────────────────────────────────────────────────────────
const ModelComparison = ({ formData, onClose }) => {
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const run = async () => {
            setLoading(true);
            const out = await Promise.all(MODELS.map(async (m) => {
                try {
                    const r = await fetch(`${API}/api/predict?model_name=${m.value}`,
                        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
                    const data = await r.json();
                    return { ...m, data, error: null };
                } catch {
                    return { ...m, data: null, error: 'Failed' };
                }
            }));
            setResults(out);
            setLoading(false);
        };
        run();
    }, [formData]);

    return (
        <div className="ds-card" style={{
            padding: '20px 24px', marginTop: 16,
            borderTop: '2px solid var(--blue)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <GitCompare size={16} style={{ color: 'var(--blue)' }} />
                    <h4 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                        Model Comparison
                    </h4>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>— same listing across all 3 models</span>
                </div>
                <button className="btn-ghost" onClick={onClose} style={{ fontSize: 12, padding: '4px 10px' }}>
                    Close
                </button>
            </div>

            {loading ? (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 10, padding: '32px', color: 'var(--text-sec)', fontSize: 13
                }}>
                    <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Running all 3 models...
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                    {results.map((r) => {
                        const rec = r.data ? recStyle(r.data.estimated_days_to_sale) : null;
                        return (
                            <div key={r.value} style={{
                                background: 'var(--surface)', borderRadius: 10,
                                border: `1px solid var(--border)`,
                                borderTop: `3px solid ${r.color}`,
                                padding: '18px',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{r.short}</p>
                                    <span style={{
                                        fontSize: 10, color: r.color, background: `${r.color}18`,
                                        padding: '2px 7px', borderRadius: 10, fontWeight: 600
                                    }}>
                                        {r.phase}
                                    </span>
                                </div>
                                {r.data ? (
                                    <>
                                        <p className="font-mono" style={{
                                            fontSize: 36, fontWeight: 700,
                                            color: r.color, lineHeight: 1, marginBottom: 4
                                        }}>
                                            {r.data.estimated_days_to_sale}
                                        </p>
                                        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>days to sale</p>
                                        <p style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 10 }}>
                                            {r.data.confidence_interval[0]}–{r.data.confidence_interval[1]}d range
                                        </p>
                                        <span style={{
                                            background: rec.bg, color: rec.color,
                                            border: `1px solid ${rec.border}`,
                                            padding: '3px 10px', borderRadius: 20,
                                            fontSize: 11, fontWeight: 700
                                        }}>
                                            {rec.label}
                                        </span>
                                    </>
                                ) : (
                                    <p style={{ color: 'var(--red)', fontSize: 13 }}>Failed to load</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <p style={{ marginTop: 14, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--amber)' }}>Ridge</strong> is recommended for production predictions and price sensitivity analysis.{' '}
                <strong style={{ color: 'var(--blue)' }}>XGBoost</strong> and <strong style={{ color: 'var(--green)' }}>RF</strong> capture non-linear interactions but may show different characteristics on synthetic data.
            </p>
        </div>
    );
};

// ── Price sensitivity ─────────────────────────────────────────────────────────
const PriceSensitivityChart = ({ baseForm, baseResult, selectedModel, onSwitchToRidge }) => {
    const [chartData, setChartData] = useState([]);
    const [chartLoading, setChartLoading] = useState(false);
    const [chartError, setChartError] = useState('');
    const isRidge = selectedModel === 'ridge';

    const run = useCallback(async () => {
        if (!isRidge) return;
        setChartLoading(true); setChartError('');
        const offsets = [-0.30, -0.20, -0.10, 0, 0.10, 0.20, 0.30];
        try {
            const results = await Promise.all(offsets.map(async (pct) => {
                const newPrice = Math.round(baseForm.listing_price * (1 + pct));
                const derived = deriveFields({ ...baseForm, listing_price: newPrice });
                const payload = { ...baseForm, listing_price: newPrice, ...derived };
                const r = await fetch(`${API}/api/predict?model_name=ridge`,
                    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (!r.ok) throw new Error();
                const data = await r.json();
                return {
                    label: pct === 0 ? 'Current' : `${pct > 0 ? '+' : ''}${(pct * 100).toFixed(0)}%`,
                    price: newPrice,
                    days: data.estimated_days_to_sale,
                    isCurrent: pct === 0,
                };
            }));
            setChartData(results);
        } catch { setChartError('Could not run sensitivity analysis.'); }
        finally { setChartLoading(false); }
    }, [baseForm, isRidge]);

    useEffect(() => { if (baseResult && isRidge) run(); }, [baseResult, isRidge, run]);
    if (!baseResult) return null;

    if (!isRidge) {
        return (
            <div className="ds-card" style={{ padding: '24px', marginTop: 16, borderLeft: '3px solid var(--blue)' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <div style={{ background: 'rgba(96,165,250,0.1)', borderRadius: 8, padding: 10, flexShrink: 0 }}>
                        <AlertCircle size={20} style={{ color: 'var(--blue)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h4 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                            Price Sensitivity — Ridge Regression only
                        </h4>
                        <p style={{ color: 'var(--text-sec)', fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>
                            <strong style={{ color: 'var(--text)' }}>XGBoost</strong> and{' '}
                            <strong style={{ color: 'var(--text)' }}>Random Forest</strong> predict in discrete steps —
                            small price changes often land in the same decision tree leaf, producing a flat line that carries no useful information.
                        </p>
                        <p style={{ color: 'var(--text-sec)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
                            <strong style={{ color: 'var(--amber)' }}>Ridge Regression</strong> is the right model for price guidance — it has a direct price coefficient, so every price change shifts the prediction proportionally.
                        </p>
                        <button className="btn-ghost" onClick={onSwitchToRidge}
                            style={{ fontSize: 13, color: 'var(--amber)', borderColor: 'rgba(245,158,11,0.3)' }}>
                            Switch to Ridge for price analysis →
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const saving = chartData.length > 0
        ? Math.round((chartData.find(d => d.isCurrent)?.days || 0) - (chartData[0]?.days || 0)) : 0;

    return (
        <div className="ds-card ds-card-blue" style={{ padding: '20px 24px', marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                    <h4 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                        Price Sensitivity Analysis
                    </h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
                        How does changing listing price affect predicted days to sale? (Ridge Regression)
                    </p>
                </div>
                {!chartLoading && chartData.length > 0 && (
                    <button className="btn-ghost" onClick={run} style={{ fontSize: 12 }}>
                        <RefreshCw size={12} /> Refresh
                    </button>
                )}
                {chartLoading && <RefreshCw size={14} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />}
            </div>
            {chartError && <p style={{ color: 'var(--red)', fontSize: 13 }}>{chartError}</p>}
            {chartLoading && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', fontSize: 13 }}>
                    Running sensitivity analysis...
                </div>
            )}
            {!chartLoading && chartData.length > 0 && (
                <>
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={chartData} margin={{ top: 28, right: 20, bottom: 8, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                            <XAxis dataKey="label" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false}
                                label={{ value: 'Days', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 11, dx: -4 }} />
                            <Tooltip content={<DarkTooltip />} />
                            <ReferenceLine x="Current" stroke="var(--amber)" strokeDasharray="4 3"
                                label={{ value: 'Current', position: 'top', fill: 'var(--amber)', fontSize: 10 }} />
                            <Line type="monotone" dataKey="days" stroke="var(--amber)" strokeWidth={2.5}
                                dot={(props) => {
                                    const pt = chartData[props.index];
                                    return <circle key={props.index} cx={props.cx} cy={props.cy}
                                        r={pt?.isCurrent ? 6 : 3}
                                        fill={pt?.isCurrent ? 'var(--amber)' : 'var(--surface)'}
                                        stroke="var(--amber)" strokeWidth={2} />;
                                }}
                                activeDot={{ r: 6, fill: 'var(--amber)' }} />
                        </LineChart>
                    </ResponsiveContainer>
                    {saving > 2 && (
                        <div style={{
                            marginTop: 12, background: 'rgba(245,158,11,0.08)',
                            border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8,
                            padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 8
                        }}>
                            <TrendingDown size={15} style={{ color: 'var(--amber)', marginTop: 1, flexShrink: 0 }} />
                            <p style={{ fontSize: 12, color: 'var(--text-sec)' }}>
                                Reducing price by 30% to{' '}
                                <span style={{ color: 'var(--amber)', fontWeight: 600 }}>${chartData[0]?.price.toLocaleString()}</span>{' '}
                                could reduce time-to-sale by approximately{' '}
                                <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{saving} days</span>.
                            </p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const PredictionTool = () => {
    const [selectedModel, setSelectedModel] = useState('ridge');
    const [formData, setFormData] = useState({
        equipment_type: 'Excavator', manufacturer: 'Caterpillar', condition: 'Good',
        age_years: 5.0, listing_price: 250000, original_value: 450000,
        operating_hours: 8000, location: 'Western Australia',
        seller_type: 'Mining Company', listing_month: 6,
        photos_count: 10, description_length: 300,
        has_maintenance_records: true, has_warranty: false,
        price_to_original_ratio: 0, hours_per_year: 0,
    });
    const [prediction, setPrediction] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showCompare, setShowCompare] = useState(false);
    const [compareData, setCompareData] = useState(null);

    useEffect(() => {
        const derived = deriveFields(formData);
        setFormData(prev => ({ ...prev, ...derived }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.listing_price, formData.original_value, formData.operating_hours, formData.age_years]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        const final = type === 'checkbox' ? checked : type === 'number' ? parseFloat(value) || 0 : value;
        setFormData(prev => ({ ...prev, [name]: final }));
        setPrediction(null); setShowCompare(false);
    };

    const handleSubmit = async () => {
        setIsLoading(true); setError(''); setPrediction(null); setShowCompare(false);
        try {
            const r = await fetch(`${API}/api/predict?model_name=${selectedModel}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
            if (!r.ok) throw new Error('Prediction failed. Check the server console.');
            setPrediction(await r.json());
        } catch (err) { setError(err.message); }
        finally { setIsLoading(false); }
    };

    const warnings = getWarnings(formData);
    const derived = deriveFields(formData);

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

                {/* ── Form ──────────────────────────────────────────────── */}
                <div className="ds-card ds-card-amber" style={{ padding: 24 }}>
                    <h3 className="font-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 20 }}>
                        Equipment Details
                    </h3>

                    {/* Model selector */}
                    <div style={{
                        background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
                        borderRadius: 8, padding: '12px 14px', marginBottom: 20
                    }}>
                        <label className="ds-label" style={{ color: 'var(--amber)', marginBottom: 6 }}>Prediction Model</label>
                        <select value={selectedModel}
                            onChange={e => { setSelectedModel(e.target.value); setPrediction(null); setShowCompare(false); }}
                            className="ds-input">
                            {MODELS.map(m => <option key={m.value} value={m.value}>{m.label} — {m.phase}</option>)}
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div><label className="ds-label">Equipment Type</label>
                                <select name="equipment_type" value={formData.equipment_type} onChange={handleChange} className="ds-input">
                                    {['Excavator', 'Dump Truck', 'Bulldozer', 'Wheel Loader', 'Crusher', 'Conveyor System'].map(o => <option key={o}>{o}</option>)}
                                </select>
                            </div>
                            <div><label className="ds-label">Manufacturer</label>
                                <select name="manufacturer" value={formData.manufacturer} onChange={handleChange} className="ds-input">
                                    {['Caterpillar', 'Komatsu', 'Liebherr', 'Volvo', 'Hitachi', 'JCB', 'Generic'].map(o => <option key={o}>{o}</option>)}
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div><label className="ds-label">Condition</label>
                                <select name="condition" value={formData.condition} onChange={handleChange} className="ds-input">
                                    {['Excellent', 'Good', 'Fair', 'Needs Repair'].map(o => <option key={o}>{o}</option>)}
                                </select>
                            </div>
                            <div><label className="ds-label">Seller Type</label>
                                <select name="seller_type" value={formData.seller_type} onChange={handleChange} className="ds-input">
                                    {SELLER_TYPES.map(o => <option key={o}>{o}</option>)}
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div><label className="ds-label">Location</label>
                                <select name="location" value={formData.location} onChange={handleChange} className="ds-input">
                                    {LOCATIONS.map(o => <option key={o}>{o}</option>)}
                                </select>
                            </div>
                            <div><label className="ds-label">Listing Month</label>
                                <select name="listing_month" value={formData.listing_month} onChange={handleChange} className="ds-input">
                                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div><label className="ds-label">Age (Years)</label>
                                <input type="number" name="age_years" value={formData.age_years} onChange={handleChange} className="ds-input" step="0.1" min="0" />
                            </div>
                            <div><label className="ds-label">Operating Hours</label>
                                <input type="number" name="operating_hours" value={formData.operating_hours} onChange={handleChange} className="ds-input" min="0" />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div><label className="ds-label">Listing Price ($)</label>
                                <input type="number" name="listing_price" value={formData.listing_price} onChange={handleChange} className="ds-input" min="0" />
                            </div>
                            <div><label className="ds-label">Original Value ($)</label>
                                <input type="number" name="original_value" value={formData.original_value} onChange={handleChange} className="ds-input" min="0" />
                            </div>
                        </div>

                        {/* Auto-calculated */}
                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                            <p className="ds-label" style={{ marginBottom: 10 }}>Auto-calculated</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label className="ds-label">Price / Original Ratio</label>
                                    <div className="ds-input font-mono" style={{ opacity: 0.7, cursor: 'not-allowed', color: 'var(--amber)', fontSize: 14 }}>
                                        {derived.price_to_original_ratio.toFixed(3)}
                                        <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>({(derived.price_to_original_ratio * 100).toFixed(1)}%)</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="ds-label">Hours Per Year</label>
                                    <div className="ds-input font-mono" style={{ opacity: 0.7, cursor: 'not-allowed', color: 'var(--cyan)', fontSize: 14 }}>
                                        {derived.hours_per_year.toFixed(0)} hrs/yr
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Checkboxes */}
                        <div style={{ display: 'flex', gap: 24 }}>
                            {[{ name: 'has_maintenance_records', label: 'Maintenance Records' }, { name: 'has_warranty', label: 'Includes Warranty' }].map(({ name, label }) => (
                                <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text-sec)' }}>
                                    <input type="checkbox" name={name} checked={formData[name]} onChange={handleChange}
                                        style={{ accentColor: 'var(--amber)', width: 16, height: 16 }} />
                                    {label}
                                </label>
                            ))}
                        </div>

                        {/* Warnings */}
                        {warnings.length > 0 && (
                            <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '12px 14px' }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                                    ⚠ Input Warning
                                </p>
                                {warnings.map((w, i) => <p key={i} style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: 3 }}>{w}</p>)}
                            </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button className="btn-primary" onClick={handleSubmit} disabled={isLoading}
                                style={{ flex: 1, justifyContent: 'center', padding: '12px' }}>
                                <Zap size={16} />
                                {isLoading ? 'Calculating...' : 'Get Prediction'}
                            </button>
                            {prediction && (
                                <button className="btn-ghost" onClick={() => setShowCompare(!showCompare)} style={{ padding: '10px 14px' }}>
                                    <GitCompare size={14} />
                                </button>
                            )}
                            {prediction && (
                                <button className="btn-ghost" onClick={() => downloadReport(formData, prediction, compareData)}
                                    style={{ padding: '10px 14px' }}>
                                    <Download size={14} />
                                </button>
                            )}
                        </div>
                        {prediction && (
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: -6 }}>
                                <GitCompare size={10} style={{ display: 'inline', marginRight: 4 }} />Compare models
                                {'  ·  '}
                                <Download size={10} style={{ display: 'inline', marginRight: 4 }} />Download report
                            </p>
                        )}
                    </div>
                </div>

                {/* ── Result ────────────────────────────────────────────── */}
                <div className="ds-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, minHeight: 500 }}>
                    {!prediction && !isLoading && !error && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: '50%', background: 'rgba(245,158,11,0.08)',
                                border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', margin: '0 auto 20px'
                            }}>
                                <Target size={28} style={{ color: 'rgba(245,158,11,0.4)' }} />
                            </div>
                            <p style={{ color: 'var(--text-sec)', fontSize: 14 }}>Your live prediction will appear here.</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6 }}>Fill in the details and click Get Prediction.</p>
                        </div>
                    )}
                    {isLoading && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                width: 44, height: 44, border: '3px solid var(--border)',
                                borderTopColor: 'var(--amber)', borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite', margin: '0 auto 16px'
                            }} />
                            <p style={{ color: 'var(--text-sec)', fontSize: 14 }}>Getting prediction...</p>
                        </div>
                    )}
                    {error && (
                        <div style={{ textAlign: 'center' }}>
                            <AlertCircle size={32} style={{ color: 'var(--red)', margin: '0 auto 12px' }} />
                            <p style={{ color: 'var(--red)', fontWeight: 600, marginBottom: 6 }}>Error</p>
                            <p style={{ color: 'var(--text-sec)', fontSize: 13, maxWidth: 260 }}>{error}</p>
                        </div>
                    )}
                    {prediction && !isLoading && (
                        <div style={{ textAlign: 'center', width: '100%' }}>
                            <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                                {prediction.model_display_name}
                            </p>
                            <p style={{ color: 'var(--text-sec)', fontSize: 14, marginBottom: 12 }}>Predicted Time to Sale</p>
                            <p className="font-mono animate-glow" style={{ fontSize: 88, fontWeight: 700, color: 'var(--amber)', lineHeight: 1, marginBottom: 4 }}>
                                {prediction.estimated_days_to_sale}
                            </p>
                            <p style={{ color: 'var(--text-sec)', fontSize: 22, marginBottom: 4 }}>days</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>≈ {prediction.estimated_weeks} weeks</p>
                            {(() => {
                                const s = recStyle(prediction.estimated_days_to_sale);
                                return (
                                    <span style={{
                                        background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                                        padding: '6px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                                        display: 'inline-block', marginBottom: 24
                                    }}>
                                        {s.label}
                                    </span>
                                );
                            })()}
                            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
                                <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                                    Confidence Range
                                </p>
                                <p className="font-mono" style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>
                                    {prediction.confidence_interval[0]} – {prediction.confidence_interval[1]} days
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Advice panel */}
            {prediction && <AdvicePanel formData={formData} />}

            {/* Model comparison */}
            {showCompare && (
                <ModelComparison
                    formData={formData}
                    onClose={() => setShowCompare(false)}
                />
            )}

            {/* Price sensitivity */}
            <PriceSensitivityChart
                baseForm={formData}
                baseResult={prediction}
                selectedModel={selectedModel}
                onSwitchToRidge={() => { setSelectedModel('ridge'); setPrediction(null); setShowCompare(false); }}
            />
        </div>
    );
};

export default PredictionTool;