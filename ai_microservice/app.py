from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
from sklearn.linear_model import LinearRegression
import uvicorn

app = FastAPI(title="Payroll AI Microservice", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── helpers ────────────────────────────────────────────────────────────────

def risk_band(score: float) -> str:
    if score >= 70:
        return "High"
    if score >= 40:
        return "Medium"
    return "Low"


def insight_for_risk(emp: dict) -> str:
    signals = []
    if float(emp.get("absent_days", 0)) >= 3:
        signals.append(f"{int(emp['absent_days'])} absence day(s)")
    if float(emp.get("late_days", 0)) >= 3:
        signals.append(f"{int(emp['late_days'])} tardy day(s)")
    if float(emp.get("leave_days", 0)) >= 5:
        signals.append(f"{float(emp['leave_days']):.1f} approved leave day(s)")
    if float(emp.get("approved_ot_hours", 0)) >= 8:
        signals.append(f"{float(emp['approved_ot_hours']):.1f} approved OT hour(s)")
    if float(emp.get("tenure_days", 999)) < 180:
        signals.append("new employee")
    return ", ".join(signals) if signals else "Stable attendance and workload signals"


# ─── schemas ─────────────────────────────────────────────────────────────────

class EmployeeData(BaseModel):
    employee_id: Optional[int] = None
    emp_code: Optional[str] = None
    employee_name: Optional[str] = None
    department: Optional[str] = None
    tenure_days: float = 0
    late_days: float = 0
    absent_days: float = 0
    leave_days: float = 0
    approved_ot_hours: float = 0


class OTWeekData(BaseModel):
    week_key: str
    week_start: Optional[str] = None
    department: Optional[str] = None
    total_hours: float = 0
    request_count: int = 0


class PredictRequest(BaseModel):
    employees: List[EmployeeData] = []
    overtime_patterns: List[OTWeekData] = []


# ─── endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "Payroll AI Microservice"}


@app.post("/predict")
def predict(req: PredictRequest):

    # ── Attrition Risk (weighted feature scoring via numpy) ──────────────────
    attrition_results = []
    for emp in req.employees:
        features = np.array([
            float(emp.absent_days),
            float(emp.late_days),
            float(emp.leave_days),
            float(emp.approved_ot_hours),
            1.0 if float(emp.tenure_days) < 180 else 0.0,
        ])
        weights = np.array([8.0, 5.0, 2.0, 1.5, 15.0])
        score = float(np.clip(features @ weights, 0, 100))

        attrition_results.append({
            "employee_id": emp.employee_id,
            "emp_code": emp.emp_code,
            "employee_name": emp.employee_name,
            "department": emp.department,
            "tenure_days": emp.tenure_days,
            "late_days": emp.late_days,
            "absent_days": emp.absent_days,
            "leave_days": emp.leave_days,
            "approved_ot_hours": emp.approved_ot_hours,
            "risk_score": round(score, 2),
            "risk_band": risk_band(score),
            "insight": insight_for_risk(emp.model_dump()),
        })

    attrition_results.sort(key=lambda x: x["risk_score"], reverse=True)

    # ── OT Forecast via Linear Regression ────────────────────────────────────
    week_totals: dict = {}
    for row in req.overtime_patterns:
        week_totals[row.week_key] = week_totals.get(row.week_key, 0.0) + float(row.total_hours)

    ot_forecast = {
        "next_week_forecast": 0.0,
        "direction": "Stable",
        "weekly_average": 0.0,
        "current_week_hours": 0.0,
        "prior_week_hours": 0.0,
    }

    if week_totals:
        sorted_weeks = sorted(week_totals.keys())
        hours_series = [week_totals[wk] for wk in sorted_weeks]
        current_week = hours_series[-1]
        prior_week = hours_series[-2] if len(hours_series) >= 2 else current_week
        weekly_avg = sum(hours_series) / len(hours_series)

        if len(hours_series) >= 3:
            X = np.arange(len(hours_series), dtype=float).reshape(-1, 1)
            y = np.array(hours_series, dtype=float)
            model = LinearRegression().fit(X, y)
            next_val = max(0.0, float(model.predict([[float(len(hours_series))]])[0]))
        else:
            next_val = max(0.0, weekly_avg + (current_week - prior_week) * 0.35)

        direction = (
            "Increasing" if current_week > prior_week
            else "Decreasing" if current_week < prior_week
            else "Stable"
        )
        ot_forecast = {
            "next_week_forecast": round(next_val, 2),
            "direction": direction,
            "weekly_average": round(weekly_avg, 2),
            "current_week_hours": round(current_week, 2),
            "prior_week_hours": round(prior_week, 2),
        }

    # ── Summary ───────────────────────────────────────────────────────────────
    total = len(attrition_results)
    high = sum(1 for e in attrition_results if e["risk_band"] == "High")
    medium = sum(1 for e in attrition_results if e["risk_band"] == "Medium")

    return {
        "attrition_risks": attrition_results,
        "ot_forecast": ot_forecast,
        "summary": {
            "total_employees_analyzed": total,
            "high_risk_count": high,
            "medium_risk_count": medium,
            "low_risk_count": total - high - medium,
        },
    }


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=5001, reload=True)
