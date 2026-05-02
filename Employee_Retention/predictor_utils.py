import pandas as pd
import joblib
import numpy as np

import feature_engineering as FE
import base_config as bc

import Employee_Retention as ER

def get_top_factors(model, input_df):
    """Bridge to the updated SHAP-based factor extraction logic."""
    return ER.get_top_factors(model, input_df)

def preprocess_for_prediction(input_dict, model):
    print(f"DEBUG [predictor_utils.py/preprocess]: Received input_dict: {input_dict}")
    df = pd.DataFrame([input_dict])
    
    # 1. Match CSV Column Names (Case sensitivity & variants)
    # The API might send 'age' instead of 'Age'
    column_mapping = {
        'age': 'Age', 'monthlyincome': 'MonthlyIncome', 'income': 'MonthlyIncome',
        'joblevel': 'JobLevel', 'overtime': 'OverTime', 'jobrole': 'JobRole',
        'businesstravel': 'BusinessTravel', 'distancefromhome': 'DistanceFromHome',
        'yearsatcompany': 'YearsAtCompany', 'totalworkingyears': 'TotalWorkingYears',
        'numcompaniesworked': 'NumCompaniesWorked', 'performancerating': 'PerformanceRating',
        'jobsatisfaction': 'JobSatisfaction', 'worklifebalance': 'WorkLifeBalance',
        'environmentsatisfaction': 'EnvironmentSatisfaction', 'stockoptionlevel': 'StockOptionLevel',
        'yearssincelastpromotion': 'YearsSinceLastPromotion', 'yearswithcurrmanager': 'YearsWithCurrManager',
        'yearsincurrentrole': 'YearsInCurrentRole'
    }
    df = df.rename(columns={k: v for k, v in column_mapping.items() if k in df.columns})
    print(f"DEBUG [predictor_utils.py/preprocess]: Columns after mapping: {list(df.columns)}")
    if 'MonthlyIncome' in df.columns:
        print(f"DEBUG [predictor_utils.py/preprocess]: MonthlyIncome after mapping: {df['MonthlyIncome'].iloc[0]}")

    # Apply feature engineering
    df = FE.feature_engineering(df)

    try:
        preprocessor = model.named_steps['preprocessor']
        numeric_features = preprocessor.transformers_[0][2]
        categorical_features = preprocessor.transformers_[1][2]
    except Exception:
        raise ValueError("Model pipeline does not contain expected 'preprocessor' step.")

    # Fill missing values
    for col in numeric_features:
        if col not in df.columns:
            df[col] = np.nan

    for col in categorical_features:
        if col not in df.columns:
            df[col] = "missing"

    # Restrict and order
    allowed_cols = list(numeric_features) + list(categorical_features)
    df = df[allowed_cols]

    return df


def predict_single_employee(model_path, employee_data):
    print(f"DEBUG [predictor_utils.py/predict]: Starting prediction for data: {employee_data}")
    model = joblib.load(model_path)
    processed_df = preprocess_for_prediction(employee_data, model)
    
    prob = float(model.predict_proba(processed_df)[0][1])
    factors = get_top_factors(model, processed_df)

    # LOGIC BRIDGE: Statistical Outlier Adjuster
    if 'IncomeRelativeToLevel' in processed_df.columns:
        ratio = processed_df['IncomeRelativeToLevel'].iloc[0]
        if ratio < 0.35: # Tightened threshold
            penalty = (0.35 - ratio) * 2.0 
            prob = min(prob + penalty, 0.98)
            if 'Income Relative To Level' not in factors:
                factors.insert(0, 'Critical: Low Income for Level')

    # 5-Tier Risk Labeling
    if prob >= bc.AppConfig.RISK_THRESHOLD_CRITICAL:
        label = bc.AppConfig.RISK_LEVEL_CRITICAL
    elif prob >= bc.AppConfig.RISK_THRESHOLD_HIGH:
        label = bc.AppConfig.RISK_LEVEL_HIGH
    elif prob >= bc.AppConfig.RISK_THRESHOLD_MEDIUM:
        label = bc.AppConfig.RISK_LEVEL_MEDIUM
    elif prob >= bc.AppConfig.RISK_THRESHOLD_LOW:
        label = bc.AppConfig.RISK_LEVEL_LOW
    else:
        label = bc.AppConfig.RISK_LEVEL_MINIMAL

    return {
        "risk_score": round(prob, 4),
        "risk_label": label,
        "top_factors": factors[:3]
    }

