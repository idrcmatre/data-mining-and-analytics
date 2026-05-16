# Inexlink Predictive Analytics Platform

**IFN736 — Industry Project (Phase 2) | Group 4 — The ML Squad | QUT 2026**

A machine learning system that predicts time-to-sell for surplus mining equipment
listed on the Inexlink marketplace.

## Structure

    backend/    Flask REST API + ML models (Ridge, XGBoost, Random Forest)
    frontend/   React dashboard (Overview, Analytics, AI Insights, Portfolio,
                Market Map, Get Estimate, Batch Predict)
    docs/       Technical reports and documentation

## Quick Start

Backend:

    cd backend
    python -m venv venv && source venv/bin/activate
    pip install -r requirements.txt
    python app.py

Frontend:

    cd frontend
    npm install
    npm start

Tests:

    cd backend
    pytest test_app.py -v

## Models

| Model | MAE | R2 | Use |
|---|---|---|---|
| Ridge Regression | 6.42 days | 0.524 | Default (production) |
| XGBoost (Tuned) | 6.40 days | 0.524 | User-selectable |
| Random Forest (Tuned) | 6.73 days | 0.489 | Benchmarking only |

## Industry Partner

Inexlink — surplus mining equipment marketplace (www.inexlink.com)
