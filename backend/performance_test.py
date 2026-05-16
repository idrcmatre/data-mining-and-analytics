"""
Inexlink ML API — Performance Testing Suite
Task 3.3: API performance testing

Tests all endpoints under load and generates a performance report.
Run with: python3 performance_test.py

Requirements: pip install requests tabulate
"""

import requests
import time
import json
import statistics
import sys
from datetime import datetime
from tabulate import tabulate

BASE_URL = "http://127.0.0.1:5000"

VALID_PAYLOAD = {
    "equipment_type": "Excavator",
    "manufacturer": "Caterpillar",
    "condition": "Good",
    "age_years": 5.0,
    "listing_price": 280000,
    "operating_hours": 8000,
    "original_value": 450000,
    "location": "Western Australia",
    "seller_type": "Mining Company",
    "has_maintenance_records": True,
    "has_warranty": False,
    "photos_count": 12,
    "description_length": 300,
    "listing_month": 6,
    "price_to_original_ratio": 0.62,
    "hours_per_year": 1600,
}

ENDPOINTS = [
    {"name": "GET /api/health",              "method": "GET",  "url": f"{BASE_URL}/api/health"},
    {"name": "GET /api/models",              "method": "GET",  "url": f"{BASE_URL}/api/models"},
    {"name": "GET /api/dashboard_data",      "method": "GET",  "url": f"{BASE_URL}/api/dashboard_data"},
    {"name": "POST /api/predict (ridge)",    "method": "POST", "url": f"{BASE_URL}/api/predict?model_name=ridge",         "payload": VALID_PAYLOAD},
    {"name": "POST /api/predict (rf)",       "method": "POST", "url": f"{BASE_URL}/api/predict?model_name=random_forest", "payload": VALID_PAYLOAD},
    {"name": "POST /api/predict (xgboost)",  "method": "POST", "url": f"{BASE_URL}/api/predict?model_name=xgboost",       "payload": VALID_PAYLOAD},
    {"name": "GET /api/feature_importance",  "method": "GET",  "url": f"{BASE_URL}/api/feature_importance?model_name=ridge&top_n=10"},
    {"name": "GET /api/feat_imp (rf)",       "method": "GET",  "url": f"{BASE_URL}/api/feature_importance?model_name=random_forest&top_n=10"},
    {"name": "GET /api/feat_imp (xgboost)",  "method": "GET",  "url": f"{BASE_URL}/api/feature_importance?model_name=xgboost&top_n=10"},
    {"name": "GET /api/pred_insights (rdg)", "method": "GET",  "url": f"{BASE_URL}/api/predictive_insights?model_name=ridge"},
    {"name": "GET /api/pred_insights (rf)",  "method": "GET",  "url": f"{BASE_URL}/api/predictive_insights?model_name=random_forest"},
    {"name": "GET /api/pred_insights (xgb)", "method": "GET",  "url": f"{BASE_URL}/api/predictive_insights?model_name=xgboost"},
]

N_WARMUP = 3    # warm-up requests (not recorded)
N_RUNS   = 20   # timed requests per endpoint

SLA_TARGETS = {
    "p50_ms": 100,   # 50th percentile under 100ms
    "p95_ms": 300,   # 95th percentile under 300ms
    "p99_ms": 500,   # 99th percentile under 500ms
}


def measure_endpoint(ep, n_warmup=N_WARMUP, n_runs=N_RUNS):
    """Run warm-up then timed requests. Returns list of response times in ms."""
    session = requests.Session()
    times = []
    errors = 0

    for i in range(n_warmup + n_runs):
        try:
            t0 = time.perf_counter()
            if ep["method"] == "POST":
                r = session.post(ep["url"], json=ep.get("payload", {}), timeout=10)
            else:
                r = session.get(ep["url"], timeout=10)
            elapsed_ms = (time.perf_counter() - t0) * 1000

            if r.status_code not in (200, 201):
                errors += 1
                continue

            if i >= n_warmup:
                times.append(elapsed_ms)

        except requests.exceptions.ConnectionError:
            print(f"\n❌ Cannot connect to {BASE_URL}. Is the Flask server running?")
            sys.exit(1)
        except Exception as e:
            errors += 1

    return times, errors


def percentile(data, pct):
    if not data:
        return float("nan")
    sorted_data = sorted(data)
    k = (len(sorted_data) - 1) * pct / 100
    f, c = int(k), int(k) + 1
    if c >= len(sorted_data):
        return sorted_data[-1]
    return sorted_data[f] + (sorted_data[c] - sorted_data[f]) * (k - f)


def sla_badge(value, threshold):
    return "✅ PASS" if value <= threshold else "❌ FAIL"


def run_tests():
    print("\n" + "=" * 70)
    print("  Inexlink ML API — Performance Test Suite")
    print(f"  Target: {BASE_URL}")
    print(f"  Runs per endpoint: {N_RUNS}  |  Warm-up: {N_WARMUP}")
    print(f"  SLA targets: p50 ≤ {SLA_TARGETS['p50_ms']}ms  |  p95 ≤ {SLA_TARGETS['p95_ms']}ms  |  p99 ≤ {SLA_TARGETS['p99_ms']}ms")
    print("=" * 70)

    results = []

    for ep in ENDPOINTS:
        print(f"  Testing  {ep['name']:<40}", end="", flush=True)
        times, errors = measure_endpoint(ep)

        if not times:
            print("  ERROR — no successful responses")
            results.append({
                "endpoint": ep["name"], "min": None, "mean": None,
                "p50": None, "p95": None, "p99": None, "max": None,
                "errors": errors, "p50_pass": False, "p95_pass": False, "p99_pass": False
            })
            continue

        p50 = percentile(times, 50)
        p95 = percentile(times, 95)
        p99 = percentile(times, 99)

        results.append({
            "endpoint":  ep["name"],
            "min":       min(times),
            "mean":      statistics.mean(times),
            "p50":       p50,
            "p95":       p95,
            "p99":       p99,
            "max":       max(times),
            "errors":    errors,
            "p50_pass":  p50 <= SLA_TARGETS["p50_ms"],
            "p95_pass":  p95 <= SLA_TARGETS["p95_ms"],
            "p99_pass":  p99 <= SLA_TARGETS["p99_ms"],
        })
        status = "✅" if (p50 <= SLA_TARGETS["p50_ms"] and p95 <= SLA_TARGETS["p95_ms"]) else "⚠️ "
        print(f"  {status}  p50={p50:.1f}ms  p95={p95:.1f}ms")

    return results


def print_report(results):
    print("\n" + "=" * 70)
    print("  PERFORMANCE REPORT")
    print("=" * 70)

    table_data = []
    for r in results:
        if r["min"] is None:
            table_data.append([r["endpoint"], "ERROR", "-", "-", "-", "-", str(r["errors"])])
        else:
            p50_s = sla_badge(r["p50"], SLA_TARGETS["p50_ms"])
            p95_s = sla_badge(r["p95"], SLA_TARGETS["p95_ms"])
            p99_s = sla_badge(r["p99"], SLA_TARGETS["p99_ms"])
            table_data.append([
                r["endpoint"],
                f"{r['mean']:.1f}",
                f"{r['p50']:.1f}  {p50_s}",
                f"{r['p95']:.1f}  {p95_s}",
                f"{r['p99']:.1f}  {p99_s}",
                f"{r['max']:.1f}",
                str(r["errors"]),
            ])

    headers = ["Endpoint", "Mean (ms)", "p50 (ms)", "p95 (ms)", "p99 (ms)", "Max (ms)", "Errors"]
    print(tabulate(table_data, headers=headers, tablefmt="simple"))

    # ── Summary ───────────────────────────────────────────────────────
    valid = [r for r in results if r["min"] is not None]
    total_endpoints = len(results)
    passing_p50 = sum(1 for r in valid if r["p50_pass"])
    passing_p95 = sum(1 for r in valid if r["p95_pass"])
    passing_p99 = sum(1 for r in valid if r["p99_pass"])

    print("\n" + "-" * 70)
    print(f"  SLA Summary ({N_RUNS} runs per endpoint, {total_endpoints} endpoints tested)")
    print(f"  p50 ≤ {SLA_TARGETS['p50_ms']}ms :  {passing_p50}/{len(valid)} endpoints passing")
    print(f"  p95 ≤ {SLA_TARGETS['p95_ms']}ms :  {passing_p95}/{len(valid)} endpoints passing")
    print(f"  p99 ≤ {SLA_TARGETS['p99_ms']}ms :  {passing_p99}/{len(valid)} endpoints passing")

    all_times = []
    for r in valid:
        all_times.append(r["mean"])
    if all_times:
        slowest = max(valid, key=lambda r: r["p95"])
        fastest = min(valid, key=lambda r: r["p50"])
        print(f"\n  Slowest endpoint (p95): {slowest['endpoint']}  →  {slowest['p95']:.1f}ms")
        print(f"  Fastest endpoint (p50): {fastest['endpoint']}  →  {fastest['p50']:.1f}ms")

    overall = "✅ ALL SLA TARGETS MET" if passing_p95 == len(valid) else f"⚠️  {len(valid) - passing_p95} endpoint(s) exceeded p95 SLA"
    print(f"\n  Overall result: {overall}")
    print("=" * 70)

    return {
        "timestamp":        datetime.now().isoformat(),
        "base_url":         BASE_URL,
        "n_runs":           N_RUNS,
        "sla_targets":      SLA_TARGETS,
        "endpoints_tested": total_endpoints,
        "passing_p50":      passing_p50,
        "passing_p95":      passing_p95,
        "passing_p99":      passing_p99,
        "results":          results,
    }


def save_report(summary):
    fname = f"performance_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(fname, "w") as f:
        json.dump(summary, f, indent=2, default=str)
    print(f"\n  📄 Full report saved to: {fname}")
    return fname


if __name__ == "__main__":
    print("\n⚠️  Make sure app.py is running before starting tests.")
    print("    Start it with: python3 app.py\n")

    try:
        requests.get(f"{BASE_URL}/api/health", timeout=3)
    except requests.exceptions.ConnectionError:
        print(f"❌ Cannot connect to {BASE_URL}. Start the Flask server first.")
        sys.exit(1)

    results = run_tests()
    summary = print_report(results)
    save_report(summary)
