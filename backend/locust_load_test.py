"""
Inexlink Predictive Analytics Platform
Concurrent Load Test — corrected for real Sprint 6 API
=======================================================

HOW TO RUN
-----------
1. Make sure Flask is running:  python app.py
2. pip install locust  (if not already)

Option A — Web UI (recommended, gets you screenshots):
  locust -f locust_load_test.py --host=http://localhost:5000
  Open http://localhost:8089
  Set Users=10, Spawn rate=2 → Start swarming
  Run ~60 seconds → Stop → screenshot Stats and Charts tabs

Option B — Headless:
  locust -f locust_load_test.py --host=http://localhost:5000 \
         --headless --users 10 --spawn-rate 2 --run-time 60s \
         --html load_test_report.html

SUCCESS CRITERIA
-----------------
  Failures  = 0 across all endpoints
  p95       < 500ms across all endpoints
  /predict  p95 < 300ms for ridge and xgboost
"""

from locust import HttpUser, task, between
import random

# ── Full 16-field payload matching PREDICTION_FEATURES in app.py ──────────
PREDICT_PAYLOADS = [
    {   # Fast seller — new bulldozer, excellent condition
        "equipment_type": "Bulldozer", "manufacturer": "Caterpillar",
        "condition": "Excellent", "age_years": 2.0,
        "listing_price": 150000, "operating_hours": 2000,
        "original_value": 520000, "location": "Nevada USA",
        "seller_type": "Equipment Dealer",
        "has_maintenance_records": True, "has_warranty": True,
        "photos_count": 15, "description_length": 450,
        "listing_month": 9, "price_to_original_ratio": 0.29,
        "hours_per_year": 1000,
    },
    {   # Slow seller — old crusher, needs repair
        "equipment_type": "Crusher", "manufacturer": "Liebherr",
        "condition": "Needs Repair", "age_years": 12.0,
        "listing_price": 90000, "operating_hours": 48000,
        "original_value": 800000, "location": "Chile",
        "seller_type": "Mining Company",
        "has_maintenance_records": False, "has_warranty": False,
        "photos_count": 3, "description_length": 100,
        "listing_month": 1, "price_to_original_ratio": 0.11,
        "hours_per_year": 4000,
    },
    {   # Mid-range — excavator, good condition
        "equipment_type": "Excavator", "manufacturer": "Caterpillar",
        "condition": "Good", "age_years": 5.0,
        "listing_price": 280000, "operating_hours": 8000,
        "original_value": 450000, "location": "Western Australia",
        "seller_type": "Mining Company",
        "has_maintenance_records": True, "has_warranty": False,
        "photos_count": 12, "description_length": 300,
        "listing_month": 6, "price_to_original_ratio": 0.62,
        "hours_per_year": 1600,
    },
]

MODELS = ["ridge", "random_forest", "xgboost"]


class InexlinkAPIUser(HttpUser):
    """Simulates a single Inexlink sales staff member using the dashboard."""
    wait_time = between(1, 3)

    def on_start(self):
        r = self.client.get("/api/health")
        if r.status_code != 200:
            raise Exception(f"API not healthy — {r.status_code}")

    @task(3)
    def health(self):
        with self.client.get("/api/health", catch_response=True) as r:
            if r.status_code != 200:
                r.failure(f"health failed: {r.status_code}")

    @task(4)
    def dashboard_data(self):
        with self.client.get("/api/dashboard_data", catch_response=True) as r:
            if r.status_code != 200:
                r.failure(f"dashboard_data failed: {r.status_code}")

    @task(2)
    def models_list(self):
        with self.client.get("/api/models", catch_response=True) as r:
            if r.status_code != 200:
                r.failure(f"models failed: {r.status_code}")

    @task(5)
    def predict_ridge(self):
        payload = random.choice(PREDICT_PAYLOADS)
        with self.client.post(
            "/api/predict?model_name=ridge",
            json=payload,
            name="/api/predict [ridge]",
            catch_response=True,
        ) as r:
            if r.status_code != 200:
                r.failure(f"predict ridge failed: {r.status_code} — {r.text[:100]}")
            elif "estimated_days_to_sale" not in r.json():
                r.failure("Missing estimated_days_to_sale")

    @task(3)
    def predict_xgboost(self):
        payload = random.choice(PREDICT_PAYLOADS)
        with self.client.post(
            "/api/predict?model_name=xgboost",
            json=payload,
            name="/api/predict [xgboost]",
            catch_response=True,
        ) as r:
            if r.status_code != 200:
                r.failure(f"predict xgboost failed: {r.status_code} — {r.text[:100]}")

    @task(3)
    def feature_importance_ridge(self):
        with self.client.get(
            "/api/feature_importance?model_name=ridge",
            name="/api/feature_importance [ridge]",
            catch_response=True,
        ) as r:
            if r.status_code != 200:
                r.failure(f"feat_imp ridge failed: {r.status_code}")

    @task(2)
    def feature_importance_xgboost(self):
        with self.client.get(
            "/api/feature_importance?model_name=xgboost",
            name="/api/feature_importance [xgboost]",
            catch_response=True,
        ) as r:
            if r.status_code != 200:
                r.failure(f"feat_imp xgboost failed: {r.status_code}")

    @task(3)
    def predictive_insights_ridge(self):
        with self.client.get(
            "/api/predictive_insights?model_name=ridge",
            name="/api/predictive_insights [ridge]",
            catch_response=True,
        ) as r:
            if r.status_code != 200:
                r.failure(f"insights ridge failed: {r.status_code}")

    @task(2)
    def predictive_insights_xgboost(self):
        with self.client.get(
            "/api/predictive_insights?model_name=xgboost",
            name="/api/predictive_insights [xgboost]",
            catch_response=True,
        ) as r:
            if r.status_code != 200:
                r.failure(f"insights xgboost failed: {r.status_code}")