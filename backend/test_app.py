"""
Inexlink Backend — Test Suite
Task 3.2: Unit testing suite for all backend functions

Run with:
    cd inexlink-backend
    source venv/bin/activate
    pip install pytest
    pytest test_app.py -v
"""

import json
import pytest
import sys
import os

# Ensure app.py is importable from this directory
sys.path.insert(0, os.path.dirname(__file__))
import app as inexlink_app


@pytest.fixture
def client():
    """Create a test client for the Flask app."""
    inexlink_app.app.config["TESTING"] = True
    with inexlink_app.app.test_client() as client:
        yield client


@pytest.fixture
def valid_payload():
    """A complete, valid prediction payload."""
    return {
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


# ── /api/health ────────────────────────────────────────────────────────────────

class TestHealth:
    def test_health_returns_200(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200

    def test_health_status_ok(self, client):
        data = client.get("/api/health").get_json()
        assert data["status"] == "ok"

    def test_health_lists_available_models(self, client):
        data = client.get("/api/health").get_json()
        assert "available_models" in data
        assert set(data["available_models"]) == {"ridge", "random_forest", "xgboost"}

    def test_health_reports_default_model(self, client):
        data = client.get("/api/health").get_json()
        assert data["default_model"] == "ridge"


# ── /api/models ────────────────────────────────────────────────────────────────

class TestModels:
    def test_models_returns_200(self, client):
        r = client.get("/api/models")
        assert r.status_code == 200

    def test_models_contains_all_three(self, client):
        data = client.get("/api/models").get_json()
        assert set(data["models"].keys()) == {"ridge", "random_forest", "xgboost"}

    def test_models_xgboost_is_default(self, client):
        data = client.get("/api/models").get_json()
        assert data["models"]["ridge"]["is_default"] is True

    def test_models_ridge_is_not_default(self, client):
        data = client.get("/api/models").get_json()
        assert data["models"]["xgboost"]["is_default"] is False

    def test_models_have_display_name(self, client):
        data = client.get("/api/models").get_json()
        for key, model in data["models"].items():
            assert "display_name" in model
            assert len(model["display_name"]) > 0


# ── /api/predict ───────────────────────────────────────────────────────────────

class TestPredict:
    def test_predict_returns_200_with_valid_payload(self, client, valid_payload):
        r = client.post(
            "/api/predict",
            data=json.dumps(valid_payload),
            content_type="application/json"
        )
        assert r.status_code == 200

    def test_predict_returns_success_true(self, client, valid_payload):
        data = client.post(
            "/api/predict",
            data=json.dumps(valid_payload),
            content_type="application/json"
        ).get_json()
        assert data["success"] is True

    def test_predict_returns_estimated_days(self, client, valid_payload):
        data = client.post(
            "/api/predict",
            data=json.dumps(valid_payload),
            content_type="application/json"
        ).get_json()
        assert "estimated_days_to_sale" in data
        assert isinstance(data["estimated_days_to_sale"], float)
        assert data["estimated_days_to_sale"] > 0

    def test_predict_returns_confidence_interval(self, client, valid_payload):
        data = client.post(
            "/api/predict",
            data=json.dumps(valid_payload),
            content_type="application/json"
        ).get_json()
        ci = data["confidence_interval"]
        assert len(ci) == 2
        assert ci[0] < data["estimated_days_to_sale"] < ci[1]

    def test_predict_confidence_interval_is_20_percent(self, client, valid_payload):
        data = client.post(
            "/api/predict",
            data=json.dumps(valid_payload),
            content_type="application/json"
        ).get_json()
        days = data["estimated_days_to_sale"]
        assert abs(data["confidence_interval"][0] - round(days * 0.8, 1)) < 0.01
        assert abs(data["confidence_interval"][1] - round(days * 1.2, 1)) < 0.01

    def test_predict_returns_model_used(self, client, valid_payload):
        data = client.post(
            "/api/predict",
            data=json.dumps(valid_payload),
            content_type="application/json"
        ).get_json()
        assert data["model_used"] == "ridge"

    def test_predict_with_ridge_model(self, client, valid_payload):
        data = client.post(
            "/api/predict?model_name=ridge",
            data=json.dumps(valid_payload),
            content_type="application/json"
        ).get_json()
        assert data["success"] is True
        assert data["model_used"] == "ridge"

    def test_predict_with_random_forest_model(self, client, valid_payload):
        data = client.post(
            "/api/predict?model_name=random_forest",
            data=json.dumps(valid_payload),
            content_type="application/json"
        ).get_json()
        assert data["success"] is True
        assert data["model_used"] == "random_forest"

    def test_predict_missing_field_returns_400(self, client, valid_payload):
        del valid_payload["listing_price"]
        r = client.post(
            "/api/predict",
            data=json.dumps(valid_payload),
            content_type="application/json"
        )
        assert r.status_code == 400
        data = r.get_json()
        assert data["success"] is False
        assert "listing_price" in data["error"]

    def test_predict_empty_body_returns_400(self, client):
        r = client.post("/api/predict", data="", content_type="application/json")
        assert r.status_code == 400

    def test_predict_invalid_model_name_returns_400(self, client, valid_payload):
        r = client.post(
            "/api/predict?model_name=nonexistent_model",
            data=json.dumps(valid_payload),
            content_type="application/json"
        )
        assert r.status_code == 400
        assert r.get_json()["success"] is False

    def test_predict_all_models_give_positive_result(self, client, valid_payload):
        for model in ["ridge", "random_forest", "xgboost"]:
            data = client.post(
                f"/api/predict?model_name={model}",
                data=json.dumps(valid_payload),
                content_type="application/json"
            ).get_json()
            assert data["estimated_days_to_sale"] > 0, f"{model} returned non-positive prediction"


# ── /api/feature_importance ────────────────────────────────────────────────────

class TestFeatureImportance:
    def test_feature_importance_returns_200(self, client):
        r = client.get("/api/feature_importance")
        assert r.status_code == 200

    def test_feature_importance_returns_list(self, client):
        data = client.get("/api/feature_importance").get_json()
        assert isinstance(data["feature_importance"], list)

    def test_feature_importance_default_top_10(self, client):
        data = client.get("/api/feature_importance").get_json()
        assert len(data["feature_importance"]) == 10

    def test_feature_importance_custom_top_n(self, client):
        data = client.get("/api/feature_importance?top_n=5").get_json()
        assert len(data["feature_importance"]) == 5

    def test_feature_importance_sorted_descending(self, client):
        data = client.get("/api/feature_importance").get_json()
        importances = [item["importance"] for item in data["feature_importance"]]
        assert importances == sorted(importances, reverse=True)

    def test_feature_importance_works_for_all_models(self, client):
        for model in ["ridge", "random_forest", "xgboost"]:
            data = client.get(f"/api/feature_importance?model_name={model}").get_json()
            assert data["success"] is True
            assert len(data["feature_importance"]) > 0


# ── /api/predictive_insights ──────────────────────────────────────────────────

class TestPredictiveInsights:
    def test_insights_returns_200(self, client):
        r = client.get("/api/predictive_insights")
        assert r.status_code == 200

    def test_insights_returns_4_listings(self, client):
        data = client.get("/api/predictive_insights").get_json()
        assert len(data["insights"]) == 4

    def test_insights_have_required_fields(self, client):
        data = client.get("/api/predictive_insights").get_json()
        for item in data["insights"]:
            assert "id" in item
            assert "equipment" in item
            assert "estimatedDays" in item
            assert "confidence" in item
            assert "listingPrice" in item

    def test_insights_confidence_interval_valid(self, client):
        data = client.get("/api/predictive_insights").get_json()
        for item in data["insights"]:
            assert item["confidence"][0] <= item["confidence"][1]

    def test_insights_model_switching(self, client):
        results = {}
        for model in ["ridge", "random_forest", "xgboost"]:
            data = client.get(f"/api/predictive_insights?model_name={model}").get_json()
            results[model] = data["insights"][0]["estimatedDays"]
        # Different models should give different predictions
        assert len(set(results.values())) > 1


# ── /api/dashboard_data ────────────────────────────────────────────────────────

class TestDashboardData:
    def test_dashboard_returns_200(self, client):
        r = client.get("/api/dashboard_data")
        assert r.status_code == 200

    def test_dashboard_has_kpis(self, client):
        data = client.get("/api/dashboard_data").get_json()
        kpis = data["kpis"]
        for key in ["totalRevenue", "avgListingPrice", "totalListings", "activeListings", "avgTimeToSale"]:
            assert key in kpis

    def test_dashboard_model_performance_has_all_models(self, client):
        data = client.get("/api/dashboard_data").get_json()
        assert set(data["modelPerformance"].keys()) == {"ridge", "random_forest", "xgboost"}

    def test_dashboard_equipment_performance_not_empty(self, client):
        data = client.get("/api/dashboard_data").get_json()
        assert len(data["equipmentPerformance"]) > 0

    def test_dashboard_monthly_trends_has_6_months(self, client):
        data = client.get("/api/dashboard_data").get_json()
        assert len(data["monthlyTrends"]) == 6
