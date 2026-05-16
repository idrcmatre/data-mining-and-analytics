import React, { useState, useEffect, useRef } from 'react';
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
    TrendingUp, TrendingDown, DollarSign, Package, Users, Calendar,
    Target, Activity, Zap, AlertCircle, RefreshCw, Wifi, WifiOff, Layers,
    Sun, Moon, BarChart2, Briefcase,
} from 'lucide-react';
import PredictionTool from './PredictionTool';
import BatchPrediction from './BatchPrediction';

const API = 'http://127.0.0.1:5000';
const PIE_COLORS = ['#f59e0b', '#60a5fa', '#34d399', '#fb7185', '#a78bfa', '#22d3ee'];

// ── Count-up hook ─────────────────────────────────────────────────────────────
function useCountUp(target, duration = 1200, decimals = 0) {
    const [value, setValue] = useState(0);
    const ref = useRef(null);
    useEffect(() => {
        const end = Number(target) || 0;
        if (end === 0) return;
        const start = Date.now();
        clearInterval(ref.current);
        ref.current = setInterval(() => {
            const progress = Math.min((Date.now() - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(decimals > 0 ? parseFloat((end * eased).toFixed(decimals)) : Math.floor(end * eased));
            if (progress >= 1) { clearInterval(ref.current); setValue(end); }
        }, 16);
        return () => clearInterval(ref.current);
    }, [target, duration, decimals]);
    return value;
}

// ── Dark tooltip ──────────────────────────────────────────────────────────────
const DarkTooltip = ({ active, payload, label, prefix = '', suffix = '' }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: 'var(--card)', border: '1px solid var(--border-hi)',
            borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow)'
        }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color, fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                    {p.name}: {prefix}{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}{suffix}
                </p>
            ))}
        </div>
    );
};

const Sk = ({ h = 16, w = '100%' }) => <div className="skeleton" style={{ height: h, width: w, borderRadius: 6 }} />;

// ── KPI Card ──────────────────────────────────────────────────────────────────
const KPICard = ({ title, rawValue, icon: Icon, change, prefix = '', suffix = '', accent = 'amber', decimals = 0, customDisplay }) => {
    const animated = useCountUp(rawValue, 1200, decimals);
    const display = customDisplay || (decimals > 0 ? animated.toFixed(decimals) : animated.toLocaleString());
    const colors = {
        amber: { border: '#f59e0b', bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
        blue: { border: '#60a5fa', bg: 'rgba(96,165,250,0.1)', text: '#60a5fa' },
        green: { border: '#34d399', bg: 'rgba(52,211,153,0.1)', text: '#34d399' },
        red: { border: '#fb7185', bg: 'rgba(251,113,133,0.1)', text: '#fb7185' },
        purple: { border: '#a78bfa', bg: 'rgba(167,139,250,0.1)', text: '#a78bfa' },
        cyan: { border: '#22d3ee', bg: 'rgba(34,211,238,0.1)', text: '#22d3ee' },
    };
    const c = colors[accent] || colors.amber;
    return (
        <div className="ds-card animate-fade-up" style={{ borderTop: `2px solid ${c.border}`, padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{title}</p>
                    <p className="font-mono" style={{ fontSize: 26, fontWeight: 600, color: 'var(--text)', lineHeight: 1.1, marginBottom: 8 }}>
                        {prefix}{display}{suffix}
                    </p>
                    {change !== undefined && (
                        <span className={`stat-pill ${change > 0 ? 'stat-up' : 'stat-down'}`}>
                            {change > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {Math.abs(change)}% vs last period
                        </span>
                    )}
                </div>
                <div style={{ background: c.bg, padding: 12, borderRadius: 10, marginLeft: 16 }}>
                    <Icon size={20} style={{ color: c.text }} />
                </div>
            </div>
        </div>
    );
};

const SectionError = ({ message, onRetry }) => (
    <div style={{ padding: '40px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <AlertCircle size={28} style={{ color: 'var(--red)', opacity: 0.7 }} />
        <p style={{ color: 'var(--text-sec)', fontSize: 13, maxWidth: 280 }}>{message}</p>
        {onRetry && <button className="btn-ghost" onClick={onRetry}><RefreshCw size={12} />Retry</button>}
    </div>
);

const recBadge = (days) =>
    days < 20 ? ['Optimal Listing', 'badge-green'] :
        days > 60 ? ['Consider Repricing', 'badge-red'] :
            ['Monitor Closely', 'badge-yellow'];

// ── Survival Curve data (Weibull, purely mathematical) ────────────────────────
function weibullSurvivor(t, scale, shape = 1.5) {
    return Math.exp(-Math.pow(t / scale, shape));
}
const SURVIVAL_DAYS = [0, 7, 14, 21, 28, 35, 42, 56, 70, 90, 120];
const SURVIVAL_DATA = SURVIVAL_DAYS.map(d => ({
    day: d,
    'Fast Seller': Math.round(weibullSurvivor(d, 14) * 100),
    'Average': Math.round(weibullSurvivor(d, 28) * 100),
    'Slow Seller': Math.round(weibullSurvivor(d, 55) * 100),
}));

// ── Market Map (Age × Price heatmap) ─────────────────────────────────────────
const HEATMAP_AGES = [1, 4, 8, 12, 16];
const HEATMAP_RATIOS = [0.80, 0.60, 0.45, 0.30, 0.15];

function heatColor(days) {
    if (days <= 0) return { bg: 'var(--border)', text: 'var(--text-muted)' };
    const fast = 10, slow = 80;
    const t = Math.min(Math.max((days - fast) / (slow - fast), 0), 1);
    const r = Math.round(52 + (251 - 52) * t);
    const g = Math.round(211 + (113 - 211) * t);
    const b = Math.round(153 + (133 - 153) * t);
    return {
        bg: `rgba(${r},${g},${b},0.2)`,
        border: `rgba(${r},${g},${b},0.4)`,
        text: `rgb(${r},${g},${b})`,
    };
}

const MarketMapTab = () => {
    const [grid, setGrid] = useState({});
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState('');

    const basePayload = {
        equipment_type: 'Excavator', manufacturer: 'Caterpillar', condition: 'Good',
        operating_hours: 8000, original_value: 450000, location: 'Western Australia',
        seller_type: 'Mining Company', listing_month: 6, photos_count: 10,
        description_length: 300, has_maintenance_records: true, has_warranty: false,
    };

    const runHeatmap = async () => {
        setLoading(true); setError(''); setGrid({});
        try {
            const combos = [];
            HEATMAP_AGES.forEach(age => {
                HEATMAP_RATIOS.forEach(ratio => {
                    combos.push({ age, ratio });
                });
            });
            const results = await Promise.all(combos.map(async ({ age, ratio }) => {
                const price = Math.round(basePayload.original_value * ratio);
                const payload = {
                    ...basePayload,
                    age_years: age,
                    listing_price: price,
                    price_to_original_ratio: ratio,
                    hours_per_year: parseFloat((basePayload.operating_hours / age).toFixed(1)),
                };
                const r = await fetch(`${API}/api/predict?model_name=ridge`,
                    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (!r.ok) throw new Error();
                const data = await r.json();
                return { key: `${age}_${ratio}`, days: data.estimated_days_to_sale };
            }));
            const g = {};
            results.forEach(({ key, days }) => { g[key] = days; });
            setGrid(g);
            setLoaded(true);
        } catch { setError('Could not generate market map. Make sure the API is running.'); }
        finally { setLoading(false); }
    };

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="ds-card ds-card-amber" style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                        <h3 className="font-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                            Market Map — Age × Price Heatmap
                        </h3>
                        <p style={{ color: 'var(--text-sec)', fontSize: 13 }}>
                            Predicted days to sale across combinations of equipment age and price (as % of original value).
                            Fixed: Excavator · Caterpillar · Good condition · Western Australia. Model: Ridge Regression.
                        </p>
                    </div>
                    <button className="btn-primary" onClick={runHeatmap} disabled={loading} style={{ flexShrink: 0, marginLeft: 16 }}>
                        {loading ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />Running 25 predictions...</> : <><BarChart2 size={13} />{loaded ? 'Refresh' : 'Generate Map'}</>}
                    </button>
                </div>
                {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
            </div>

            {loaded && !loading && (
                <div className="ds-card" style={{ padding: 24, overflowX: 'auto' }}>
                    {/* Legend */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Days to sale:</span>
                        {[['≤15', 'var(--green)'], ['16–35', '#facc15'], ['36–60', '#f97316'], ['60+', 'var(--red)']].map(([label, color]) => (
                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 12, height: 12, borderRadius: 3, background: color, opacity: 0.3, border: `1px solid ${color}` }} />
                                <span style={{ fontSize: 12, color: 'var(--text-sec)' }}>{label} days</span>
                            </div>
                        ))}
                    </div>

                    {/* Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${HEATMAP_AGES.length}, 1fr)`, gap: 6 }}>
                        {/* Header row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8 }}>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right', lineHeight: 1.3 }}>Price %<br />of Original</span>
                        </div>
                        {HEATMAP_AGES.map(age => (
                            <div key={age} style={{ textAlign: 'center', padding: '6px 0' }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sec)' }}>Age</p>
                                <p className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{age}y</p>
                            </div>
                        ))}
                        {/* Data rows */}
                        {HEATMAP_RATIOS.map(ratio => (
                            <React.Fragment key={ratio}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8 }}>
                                    <span className="font-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber)' }}>
                                        {(ratio * 100).toFixed(0)}%
                                    </span>
                                </div>
                                {HEATMAP_AGES.map(age => {
                                    const key = `${age}_${ratio}`;
                                    const days = grid[key];
                                    const c = days != null ? heatColor(days) : { bg: 'var(--border)', text: 'var(--text-muted)', border: 'var(--border)' };
                                    return (
                                        <div key={key} className="heatmap-cell"
                                            style={{ height: 56, background: c.bg, border: `1px solid ${c.border || c.bg}`, color: c.text }}>
                                            {days != null ? (
                                                <div style={{ textAlign: 'center' }}>
                                                    <p style={{ fontSize: 14, fontWeight: 700 }}>{days}d</p>
                                                    <p style={{ fontSize: 10, opacity: 0.7 }}>${Math.round(450000 * ratio / 1000)}k</p>
                                                </div>
                                            ) : '—'}
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </div>
                    <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                        Green = fast sale (&lt;15 days) · Red = slow sale (60+ days) · Price shown in $k (original value $450k)
                    </p>
                </div>
            )}

            {!loaded && !loading && (
                <div className="ds-card" style={{ padding: 48, textAlign: 'center' }}>
                    <BarChart2 size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.4 }} />
                    <p style={{ color: 'var(--text-sec)', fontSize: 14, marginBottom: 4 }}>Click Generate Map to run the analysis.</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Makes 25 Ridge Regression predictions across age and price combinations.</p>
                </div>
            )}
        </div>
    );
};

// ── Portfolio Tab ─────────────────────────────────────────────────────────────
const PortfolioTab = () => {
    const [model, setModel] = useState('ridge');
    const [insights, setInsights] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = async (m) => {
        setLoading(true); setError('');
        try {
            const r = await fetch(`${API}/api/predictive_insights?model_name=${m}`);
            if (!r.ok) throw new Error();
            setInsights((await r.json()).insights || []);
        } catch { setError('Could not load portfolio.'); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(model); }, [model]);

    const urgencyColor = (days) =>
        days < 20 ? 'var(--green)' : days > 60 ? 'var(--red)' : '#facc15';

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="ds-card ds-card-green" style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h3 className="font-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                            Active Listings Portfolio
                        </h3>
                        <p style={{ color: 'var(--text-sec)', fontSize: 13 }}>
                            Live ML predictions for sample equipment listings. Switch models to compare predictions.
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {loading && <RefreshCw size={13} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />}
                        <select value={model} onChange={e => { setModel(e.target.value); }} className="ds-input"
                            style={{ width: 'auto', fontSize: 12, padding: '6px 12px' }}>
                            <option value="ridge">Ridge Regression</option>
                            <option value="xgboost">XGBoost</option>
                            <option value="random_forest">Random Forest</option>
                        </select>
                    </div>
                </div>
            </div>

            {error && <SectionError message={error} onRetry={() => load(model)} />}

            {loading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
                    {[1, 2, 3, 4].map(i => <div key={i} className="ds-card" style={{ padding: 24 }}><Sk h={120} /></div>)}
                </div>
            )}

            {!loading && !error && (
                <>
                    {/* Summary strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                        {[
                            { label: 'Total Listings', val: insights.length, color: 'var(--text)' },
                            { label: 'Optimal', val: insights.filter(i => i.estimatedDays < 20).length + ' listings', color: 'var(--green)' },
                            { label: 'Monitor Closely', val: insights.filter(i => i.estimatedDays >= 20 && i.estimatedDays <= 60).length + ' listings', color: '#facc15' },
                            { label: 'Consider Reprice', val: insights.filter(i => i.estimatedDays > 60).length + ' listings', color: 'var(--red)' },
                        ].map(({ label, val, color }) => (
                            <div key={label} className="ds-card" style={{ padding: '14px 18px', textAlign: 'center' }}>
                                <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</p>
                                <p className="font-mono" style={{ fontSize: 22, fontWeight: 700, color }}>{val}</p>
                            </div>
                        ))}
                    </div>

                    {/* Portfolio cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
                        {insights.map((item) => {
                            const [label, cls] = recBadge(item.estimatedDays);
                            const col = urgencyColor(item.estimatedDays);
                            const pct = Math.min(item.estimatedDays / 90 * 100, 100);
                            return (
                                <div key={item.id} className="portfolio-card">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                                        <div>
                                            <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 2 }}>{item.equipment}</p>
                                            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>ID: {item.id}</p>
                                        </div>
                                        <span className={`badge ${cls}`}>{label}</span>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
                                        <p className="font-mono" style={{ fontSize: 48, fontWeight: 700, color: col, lineHeight: 1 }}>
                                            {item.estimatedDays}
                                        </p>
                                        <div>
                                            <p style={{ color: 'var(--text-sec)', fontSize: 14 }}>days</p>
                                            <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>{(item.estimatedDays / 7).toFixed(1)} weeks</p>
                                        </div>
                                    </div>

                                    {/* Urgency bar */}
                                    <div style={{ marginBottom: 14 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sale velocity</span>
                                            <span style={{ fontSize: 11, color: col, fontWeight: 600 }}>
                                                {item.estimatedDays < 20 ? 'Fast' : 'item.estimatedDays>60' ? 'Slow' : 'Moderate'}
                                            </span>
                                        </div>
                                        <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                                            <div style={{
                                                height: '100%', borderRadius: 3, width: `${100 - pct}%`,
                                                background: `linear-gradient(90deg, ${col}, ${col}88)`,
                                                transition: 'width 0.6s ease'
                                            }} />
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        <div style={{ background: 'var(--surface)', borderRadius: 7, padding: '10px 12px' }}>
                                            <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Listing Price</p>
                                            <p className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--amber)' }}>
                                                ${item.listingPrice.toLocaleString()}
                                            </p>
                                        </div>
                                        <div style={{ background: 'var(--surface)', borderRadius: 7, padding: '10px 12px' }}>
                                            <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Confidence Range</p>
                                            <p className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-sec)' }}>
                                                {item.confidence[0]}–{item.confidence[1]}d
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};

// ── Main Dashboard ────────────────────────────────────────────────────────────
const InexlinkDashboard = () => {
    const [theme, setTheme] = useState(() => localStorage.getItem('inexlink-theme') || 'dark');
    const [activeTab, setActiveTab] = useState('overview');
    const [dashboardData, setDashboardData] = useState(null);
    const [dashLoading, setDashLoading] = useState(true);
    const [dashError, setDashError] = useState(null);
    const [featureImportance, setFeatureImportance] = useState([]);
    const [featureLoading, setFeatureLoading] = useState(true);
    const [featureError, setFeatureError] = useState(null);
    const [insights, setInsights] = useState([]);
    const [insightsLoading, setInsightsLoading] = useState(true);
    const [insightsError, setInsightsError] = useState(null);
    const [insightsModel, setInsightsModel] = useState('ridge');
    const [apiOnline, setApiOnline] = useState(null);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('inexlink-theme', theme);
    }, [theme]);

    const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

    const fetchDashboard = async () => {
        setDashLoading(true); setDashError(null);
        try {
            const r = await fetch(`${API}/api/dashboard_data`);
            if (!r.ok) throw new Error(`Server error ${r.status}`);
            setDashboardData(await r.json()); setApiOnline(true);
        } catch (e) {
            setDashError(e.message.includes('fetch') ? 'Cannot reach the API. Is app.py running on port 5000?' : e.message);
            setApiOnline(false);
        } finally { setDashLoading(false); }
    };

    const fetchFeatures = async () => {
        setFeatureLoading(true); setFeatureError(null);
        try {
            const r = await fetch(`${API}/api/feature_importance?model_name=ridge&top_n=8`);
            if (!r.ok) throw new Error();
            setFeatureImportance((await r.json()).feature_importance || []);
        } catch { setFeatureError('Could not load feature importance.'); }
        finally { setFeatureLoading(false); }
    };

    const fetchInsights = async (model) => {
        setInsightsLoading(true); setInsightsError(null);
        try {
            const r = await fetch(`${API}/api/predictive_insights?model_name=${model}`);
            if (!r.ok) throw new Error();
            setInsights((await r.json()).insights || []);
        } catch { setInsightsError('Could not load predictions.'); setInsights([]); }
        finally { setInsightsLoading(false); }
    };

    useEffect(() => { fetchDashboard(); fetchFeatures(); }, []);
    useEffect(() => { fetchInsights(insightsModel); }, [insightsModel]);

    if (dashLoading) return (
        <div data-theme={theme} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ width: 44, height: 44, border: '3px solid var(--border)', borderTopColor: 'var(--amber)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                <p className="font-display" style={{ color: 'var(--text-sec)', fontSize: 13 }}>Connecting to API...</p>
            </div>
        </div>
    );

    if (dashError) return (
        <div data-theme={theme} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, background: 'var(--bg)' }}>
            <div className="ds-card ds-card-red" style={{ maxWidth: 480, width: '100%', padding: 40, textAlign: 'center' }}>
                <WifiOff size={40} style={{ color: 'var(--red)', margin: '0 auto 16px' }} />
                <h2 className="font-display" style={{ fontSize: 20, color: 'var(--text)', marginBottom: 8 }}>API Unavailable</h2>
                <p style={{ color: 'var(--text-sec)', fontSize: 13, marginBottom: 24 }}>{dashError}</p>
                <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '14px 18px', fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: 'var(--green)', textAlign: 'left', marginBottom: 24 }}>
                    <span style={{ color: 'var(--text-muted)' }}># Start the API</span><br />cd inexlink-backend<br />python3 app.py
                </div>
                <button className="btn-primary" onClick={fetchDashboard}><RefreshCw size={14} />Retry Connection</button>
            </div>
        </div>
    );

    const d = dashboardData;
    const totalRev = d.equipmentPerformance.reduce((s, e) => s + e.revenue, 0);

    const renderOverview = () => (
        <div className="animate-fade-in">
            <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
                <KPICard title="Total Sales Revenue" rawValue={d.kpis.totalRevenue} icon={DollarSign} change={12.3} prefix="$" accent="amber" />
                <KPICard title="Avg Listing Price" rawValue={d.kpis.avgListingPrice} icon={TrendingUp} change={8.7} prefix="$" accent="blue" />
                <KPICard title="Avg Time to Sale" rawValue={d.kpis.avgTimeToSale} icon={Calendar} change={-15.2} suffix=" days" accent="green" />
                <KPICard title="Total Listings" rawValue={d.kpis.totalListings} icon={Package} change={18.9} accent="purple" />
                <KPICard title="Active Listings" rawValue={d.kpis.activeListings} icon={Activity} change={-3.1} accent="cyan" />
                <KPICard title="Top Seller Type" rawValue={0} customDisplay="Mining Co." icon={Users} accent="red" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
                <div className="ds-card ds-card-blue animate-fade-up" style={{ padding: 24, animationDelay: '0.2s' }}>
                    <h3 className="font-display" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 20 }}>Monthly Sales &amp; Listings</h3>
                    <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={d.monthlyTrends}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                            <XAxis dataKey="month" tick={{ fill: 'var(--text-sec)', fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: 'var(--text-sec)', fontSize: 12 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<DarkTooltip />} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Line type="monotone" dataKey="sales" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b' }} name="Sold" />
                            <Line type="monotone" dataKey="listings" stroke="#60a5fa" strokeWidth={2.5} dot={{ r: 4, fill: '#60a5fa' }} name="Listed" strokeDasharray="5 3" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <div className="ds-card ds-card-amber animate-fade-up" style={{ padding: 24, animationDelay: '0.25s' }}>
                    <h3 className="font-display" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 20 }}>Revenue by Equipment</h3>
                    <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                            <Pie data={d.equipmentPerformance} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={95} innerRadius={40}
                                label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: 'var(--border-hi)' }}>
                                {d.equipmentPerformance.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                            </Pie>
                            <Tooltip content={<DarkTooltip prefix="$" />} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );

    const renderAnalytics = () => (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="ds-card ds-card-purple" style={{ padding: 24 }}>
                    <h3 className="font-display" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 20 }}>Seller Type — Avg Days to Sale</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={d.sellerTypePerformance} layout="vertical" margin={{ left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                            <XAxis type="number" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis dataKey="type" type="category" width={120} tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<DarkTooltip suffix=" days" />} />
                            <Bar dataKey="avgTimeToSale" fill="#a78bfa" radius={[0, 4, 4, 0]} name="Avg Days" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="ds-card ds-card-cyan" style={{ padding: 24 }}>
                    <h3 className="font-display" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 20 }}>Regional Sales Revenue</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={d.regionalData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                            <XAxis dataKey="region" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1e6).toFixed(0)}M`} />
                            <Tooltip content={<DarkTooltip prefix="$" />} />
                            <Bar dataKey="revenue" fill="#22d3ee" radius={[4, 4, 0, 0]} name="Revenue" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <div className="ds-card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
                    <h3 className="font-display" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Equipment Performance</h3>
                </div>
                <div className="table-scroll">
                    <table className="ds-table">
                        <thead><tr>{['Equipment', 'Units Sold', 'Avg Price', 'Revenue', 'Market Share'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                        <tbody>
                            {d.equipmentPerformance.map((eq, i) => (
                                <tr key={eq.name}>
                                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length] }} /><span style={{ fontWeight: 600 }}>{eq.name}</span></div></td>
                                    <td className="font-mono" style={{ color: 'var(--text-sec)' }}>{eq.sales.toLocaleString()}</td>
                                    <td className="font-mono" style={{ color: 'var(--amber)' }}>${eq.avgPrice.toLocaleString()}</td>
                                    <td className="font-mono">${eq.revenue.toLocaleString()}</td>
                                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2 }}><div style={{ height: '100%', borderRadius: 2, width: `${(eq.revenue / totalRev * 100).toFixed(0)}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} /></div><span className="font-mono" style={{ fontSize: 11, color: 'var(--text-sec)', minWidth: 36 }}>{(eq.revenue / totalRev * 100).toFixed(1)}%</span></div></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderInsights = () => {
        const md = d.modelPerformance?.[insightsModel] || {};
        return (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                    <div className="ds-card ds-card-blue animate-fade-up" style={{ padding: 22 }}>
                        <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>R² Score</p>
                        <p className="font-mono" style={{ fontSize: 32, fontWeight: 600, color: 'var(--blue)' }}>{md.rSquared?.toFixed(4) ?? '—'}</p>
                        <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>{md.label}</p>
                    </div>
                    <div className="ds-card ds-card-green animate-fade-up" style={{ padding: 22, animationDelay: '0.05s' }}>
                        <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>MAE</p>
                        <p className="font-mono" style={{ fontSize: 32, fontWeight: 600, color: 'var(--green)' }}>{md.mae?.toFixed(2) ?? '—'} <span style={{ fontSize: 14, opacity: 0.7 }}>days</span></p>
                        <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>Mean absolute error</p>
                    </div>
                    <div className="ds-card animate-fade-up" style={{ padding: 22, animationDelay: '0.1s' }}>
                        <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Training Data</p>
                        <p className="font-mono" style={{ fontSize: 32, fontWeight: 600, color: 'var(--text)' }}>2,000</p>
                        <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>Synthetic listings (seed=42)</p>
                    </div>
                </div>

                {/* Survival Curve */}
                <div className="ds-card ds-card-amber" style={{ padding: 24 }}>
                    <h3 className="font-display" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                        Time-to-Sale Survival Curve
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 20 }}>
                        Probability that equipment remains unsold after X days — Weibull model based on synthetic dataset distribution (mean=25.7d, range 7–164d).
                    </p>
                    <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={SURVIVAL_DATA} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                            <XAxis dataKey="day" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false}
                                label={{ value: 'Days on Market', position: 'insideBottom', fill: 'var(--text-muted)', fontSize: 11, dy: 14 }} />
                            <YAxis tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false}
                                tickFormatter={v => `${v}%`}
                                label={{ value: 'Prob. Unsold', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 11, dx: -4 }} />
                            <Tooltip formatter={(v, name) => [`${v}%`, name]} labelFormatter={l => `Day ${l}`}
                                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border-hi)', borderRadius: 8 }}
                                labelStyle={{ color: 'var(--text-muted)', fontSize: 11 }} />
                            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                            <Line type="monotone" dataKey="Fast Seller" stroke="var(--green)" strokeWidth={2.5} dot={false} name="Fast Seller (Excellent cond., fair price)" />
                            <Line type="monotone" dataKey="Average" stroke="var(--amber)" strokeWidth={2.5} dot={false} name="Average Listing" />
                            <Line type="monotone" dataKey="Slow Seller" stroke="var(--red)" strokeWidth={2.5} dot={false} strokeDasharray="5 3" name="Slow Seller (Poor cond., overpriced)" />
                        </LineChart>
                    </ResponsiveContainer>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                        Based on Weibull survival function — shape=1.5, scales: Fast=14d, Average=28d, Slow=55d. Consistent with Sprint 6 Survival Analysis Research Report.
                    </p>
                </div>

                {/* Model benchmark + predictions */}
                <div className="ds-card" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
                        <h3 className="font-display" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Sprint 6 Model Benchmark</h3>
                    </div>
                    <div className="table-scroll">
                        <table className="ds-table">
                            <thead><tr>{['Model', 'Test R²', 'MAE', 'RMSE', 'CV R²', 'Status'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                            <tbody>
                                {Object.entries(d.modelPerformance).map(([key, m]) => (
                                    <tr key={key}>
                                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontWeight: 600, color: key === insightsModel ? 'var(--amber)' : 'var(--text)' }}>{m.label}</span>{key === insightsModel && <span className="badge badge-amber" style={{ fontSize: 10 }}>Active</span>}</div></td>
                                        <td className="font-mono" style={{ color: 'var(--blue)' }}>{m.rSquared?.toFixed(4) ?? '—'}</td>
                                        <td className="font-mono">{m.mae?.toFixed(2) ?? '—'} days</td>
                                        <td className="font-mono">{m.rmse?.toFixed(2) ?? '—'} days</td>
                                        <td className="font-mono" style={{ color: 'var(--text-sec)' }}>{m.cvR2?.toFixed(4) ?? '—'}</td>
                                        <td>
                                            {key === 'ridge' && <span className="badge badge-blue">Phase 1 baseline</span>}
                                            {key === 'xgboost' && <span className="badge badge-green">Sprint 6 ✓</span>}
                                            {key === 'random_forest' && <span className="badge badge-yellow">Benchmark only</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Live predictions + feature importance */}
                <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
                    <div className="ds-card" style={{ overflow: 'hidden' }}>
                        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h3 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Live Sample Predictions</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {insightsLoading && <RefreshCw size={13} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />}
                                <select value={insightsModel} onChange={e => setInsightsModel(e.target.value)} disabled={insightsLoading} className="ds-input" style={{ width: 'auto', fontSize: 12, padding: '5px 10px' }}>
                                    <option value="ridge">Ridge Regression</option>
                                    <option value="xgboost">XGBoost</option>
                                    <option value="random_forest">Random Forest</option>
                                </select>
                            </div>
                        </div>
                        {insightsError ? <SectionError message={insightsError} onRetry={() => fetchInsights(insightsModel)} /> :
                            insightsLoading ? <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>{[1, 2, 3, 4].map(i => <Sk key={i} h={40} />)}</div> : (
                                <div className="table-scroll">
                                    <table className="ds-table">
                                        <thead><tr>{['Equipment', 'Price', 'Est. Days', 'Confidence', 'Recommendation'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                                        <tbody>
                                            {insights.map(item => {
                                                const [label, cls] = recBadge(item.estimatedDays);
                                                return (
                                                    <tr key={item.id}>
                                                        <td><p style={{ fontWeight: 600, fontSize: 13 }}>{item.equipment}</p><p style={{ color: 'var(--text-muted)', fontSize: 11 }}>{item.id}</p></td>
                                                        <td className="font-mono" style={{ color: 'var(--amber)' }}>${item.listingPrice.toLocaleString()}</td>
                                                        <td><span className="font-mono" style={{ fontSize: 20, fontWeight: 700 }}>{item.estimatedDays}</span><span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 4 }}>days</span></td>
                                                        <td className="font-mono" style={{ color: 'var(--text-sec)', fontSize: 12 }}>{item.confidence[0]}–{item.confidence[1]}d</td>
                                                        <td><span className={`badge ${cls}`}>{label}</span></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                    </div>
                    <div className="ds-card" style={{ padding: '20px 24px' }}>
                        <h3 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Key Predictive Factors</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 20 }}>Ridge model — feature importance</p>
                        {featureError ? <SectionError message={featureError} onRetry={fetchFeatures} /> :
                            featureLoading ? <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Sk key={i} h={24} />)}</div> : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    {featureImportance.map((item, i) => {
                                        const max = featureImportance[0]?.importance || 1;
                                        const hues = ['#f59e0b', '#60a5fa', '#34d399', '#a78bfa', '#22d3ee', '#fb7185', '#f59e0b', '#60a5fa'];
                                        const col = hues[i % hues.length];
                                        return (
                                            <div key={item.feature}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                                    <span style={{ fontSize: 12, color: 'var(--text-sec)', fontWeight: 500 }}>{item.feature}</span>
                                                    <span className="font-mono" style={{ fontSize: 11, color: col, fontWeight: 600 }}>{(item.importance * 100).toFixed(1)}%</span>
                                                </div>
                                                <div style={{ height: 5, background: 'var(--border)', borderRadius: 3 }}>
                                                    <div style={{ height: '100%', borderRadius: 3, width: `${(item.importance / max * 100).toFixed(0)}%`, background: col, boxShadow: `0 0 6px ${col}40`, transition: 'width 0.6s ease' }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                    </div>
                </div>
            </div>
        );
    };

    const tabs = [
        { id: 'overview', label: 'Overview', icon: TrendingUp },
        { id: 'analytics', label: 'Analytics', icon: Activity },
        { id: 'ai_insights', label: 'AI Insights', icon: Target },
        { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
        { id: 'market_map', label: 'Market Map', icon: BarChart2 },
        { id: 'prediction_tool', label: 'Get Estimate', icon: Zap },
        { id: 'batch', label: 'Batch Predict', icon: Layers },
    ];

    return (
        <div data-theme={theme} style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            {/* Header */}
            <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'blur(12px)' }}>
                <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Zap size={18} style={{ color: '#000' }} />
                        </div>
                        <div>
                            <h1 className="font-display" style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', lineHeight: 1, letterSpacing: '0.05em' }}>INEXLINK</h1>
                            <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>Predictive Analytics</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Theme toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {theme === 'light' ? <Sun size={14} style={{ color: 'var(--amber)' }} /> : <Moon size={14} style={{ color: 'var(--text-muted)' }} />}
                            <button className="theme-toggle" onClick={toggleTheme} title="Toggle light/dark mode" />
                        </div>
                        {apiOnline !== null && (
                            <div className={`badge ${apiOnline ? 'api-online' : 'api-offline'}`}>
                                {apiOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
                                {apiOnline ? 'API online' : 'API offline'}
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Tab nav */}
            <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '10px 24px' }}>
                <div style={{ maxWidth: 1400, margin: '0 auto' }}>
                    <div className="ds-tab-bar">
                        {tabs.map(({ id, label, icon: Icon }) => (
                            <button key={id} className={`ds-tab ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>
                                <Icon size={13} />{label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'analytics' && renderAnalytics()}
                {activeTab === 'ai_insights' && renderInsights()}
                {activeTab === 'portfolio' && <PortfolioTab />}
                {activeTab === 'market_map' && <MarketMapTab />}
                {activeTab === 'prediction_tool' && <div className="animate-fade-in"><PredictionTool /></div>}
                {activeTab === 'batch' && <div className="animate-fade-in"><BatchPrediction /></div>}
            </main>
        </div>
    );
};

export default InexlinkDashboard;