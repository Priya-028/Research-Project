import pandas as pd
import numpy as np
import os
import joblib
import re

from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from xgboost import XGBClassifier
from sklearn.metrics import (classification_report, confusion_matrix, accuracy_score, 
                             roc_auc_score, precision_score, recall_score, f1_score)
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer

import DataLoad as Data
import feature_engineering as FE

# Explicit Feature Set from Dashboard
EXPLICIT_NUMERIC_FEATURES = [
    'Age', 'MonthlyIncome', 'JobLevel', 'JobSatisfaction', 
    'WorkLifeBalance', 'EnvironmentSatisfaction', 'StockOptionLevel', 
    'YearsAtCompany', 'DistanceFromHome', 'IncomeRelativeToLevel',
    'YearsInCurrentRole', 'YearsSinceLastPromotion', 'YearsWithCurrManager',
    'PercentSalaryHike', 'NumCompaniesWorked', 'TotalWorkingYears',
    'JobInvolvement', 'PerformanceRating', 'PromotionRatio', 'ManagerStabilityRatio',
    'TotalSatisfaction', 'IncomePressure', 'TravelRisk'
]

EXPLICIT_CATEGORICAL_FEATURES = [
    'BusinessTravel', 'JobRole', 'OverTime', 'Department', 'MaritalStatus'
]

def get_features(df):
    """Dynamically detects only the explicit features requested by the user + engineered ones."""
    numeric_features = [col for col in EXPLICIT_NUMERIC_FEATURES if col in df.columns]
    categorical_features = [col for col in EXPLICIT_CATEGORICAL_FEATURES if col in df.columns]
    return numeric_features, categorical_features

def build_pipeline(numeric_features, categorical_features, scale_pos_weight=1.0):
    # 1. Preprocessing: StandardScaler for Numeric, OneHotEncoder for Categorical
    numeric_transformer = Pipeline(steps=[
        ('imputer', SimpleImputer(strategy='median')),
        ('scaler', StandardScaler())
    ])
    
    categorical_transformer = Pipeline(steps=[
        ('imputer', SimpleImputer(strategy='constant', fill_value='missing')),
        ('onehot', OneHotEncoder(handle_unknown='ignore'))
    ])
    
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', numeric_transformer, numeric_features),
            ('cat', categorical_transformer, categorical_features)
        ]
    )
    
    # 2. Models Setup
    # Logistic Regression (good baseline, inherently balanced with class_weight)
    lr = LogisticRegression(
        class_weight='balanced', 
        max_iter=1000, 
        random_state=42
    )

    # Random Forest
    rf = RandomForestClassifier(
        n_estimators=100, 
        max_depth=8, # Restrict depth to avoid over-reliance on a few features
        min_samples_leaf=4,
        class_weight='balanced', 
        random_state=42
    )
    
    # XGBoost
    # Tuning colsample_bytree and max_depth forces the tree to look at MonthlyIncome/JobLevel
    # instead of just splitting on OverTime every time.
    xgb = XGBClassifier(
        n_estimators=150,
        scale_pos_weight=scale_pos_weight, 
        eval_metric='logloss',
        learning_rate=0.05,
        max_depth=4,
        colsample_bytree=0.6, # Use 60% of features per tree (forces variety)
        subsample=0.8,
        random_state=42
    )

    # Ensemble of the best performing models
    voting_clf = VotingClassifier(
        estimators=[
            ('lr', lr),
            ('rf', rf),
            ('xgb', xgb)
        ],
        voting='soft',
        weights=[1.0, 1.5, 1.5] 
    )
    
    pipeline = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('classifier', voting_clf)
    ])
    
    return pipeline, lr, rf, xgb, preprocessor

def get_top_factors(model, input_df):
    """
    Returns the top risk factors driving this prediction using XGBoost gain.
    Works with both single XGBClassifier and legacy VotingClassifier pipelines.
    """
    try:
        preprocessor = model.named_steps['preprocessor']
        numeric_features = list(preprocessor.transformers_[0][2])
        categorical_features = list(preprocessor.transformers_[1][2])

        cat_pipeline = preprocessor.named_transformers_['cat']
        if 'onehot' in cat_pipeline.named_steps:
            ohe = cat_pipeline.named_steps['onehot']
        else:
            ohe = cat_pipeline.named_steps['ohe']
            
        cat_feature_names = list(ohe.get_feature_names_out(categorical_features))
        all_feature_names = numeric_features + cat_feature_names

        classifier = model.named_steps['classifier']

        # Support both single XGBClassifier and legacy VotingClassifier
        if hasattr(classifier, 'named_estimators_'):
            xgb_model = classifier.named_estimators_['xgb']
        elif hasattr(classifier, 'get_booster'):
            xgb_model = classifier
        else:
            return ["Feature Analysis Unavailable"]

        booster = xgb_model.get_booster()
        raw_scores = booster.get_score(importance_type='gain')

        feature_impacts = {}
        for fname, score in raw_scores.items():
            try:
                idx = int(fname[1:])
                if idx < len(all_feature_names):
                    col = all_feature_names[idx]
                    feature_impacts[col] = feature_impacts.get(col, 0) + float(score)
            except (ValueError, IndexError):
                pass

        aggregated = {}
        for col, score in feature_impacts.items():
            base = col
            for cat_feat in categorical_features:
                if col.startswith(cat_feat):
                    base = cat_feat
                    break
            aggregated[base] = aggregated.get(base, 0) + score

        factors = []
        for name, score in aggregated.items():
            if score > 0:
                display_name = re.sub(r'(?<![^A-Za-z])(?=[A-Z])', ' ', name).replace('_', ' ').strip()
                factors.append({'feature': display_name, 'impact': score})

        top_factors = sorted(factors, key=lambda x: x['impact'], reverse=True)[:3]
        if not top_factors:
            return ["Feature Analysis Unavailable"]
        return [f['feature'] for f in top_factors]

    except Exception as e:
        print(f"Error extracting factors via XGBoost importance: {e}")
        return ["Feature Analysis Unavailable"]

def train_evaluate_model(df):
    numeric_features, categorical_features = get_features(df)
    
    X = df[numeric_features + categorical_features]
    y = df['Attrition']
    
    # Calculate scale_pos_weight for XGBoost
    spw = (len(y[y==0]) / len(y[y==1])) * 1.2
    
    # Proper train-test split with Stratification
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    pipeline, lr, rf, xgb, preprocessor = build_pipeline(numeric_features, categorical_features, scale_pos_weight=spw)
    
    print("\n--- Model Comparison & Evaluation ---")
    
    # Train individually to show metrics
    X_train_processed = preprocessor.fit_transform(X_train)
    X_test_processed = preprocessor.transform(X_test)
    
    models = {'Logistic Regression': lr, 'Random Forest': rf, 'XGBoost': xgb}
    
    for name, m in models.items():
        m.fit(X_train_processed, y_train)
        preds = m.predict(X_test_processed)
        probs = m.predict_proba(X_test_processed)[:, 1]
        
        acc = accuracy_score(y_test, preds)
        prec = precision_score(y_test, preds, zero_division=0)
        rec = recall_score(y_test, preds)
        f1 = f1_score(y_test, preds)
        roc = roc_auc_score(y_test, probs)
        
        print(f"\n[{name}]")
        print(f"Accuracy: {acc:.4f} | Precision: {prec:.4f} | Recall: {rec:.4f} | F1: {f1:.4f} | ROC-AUC: {roc:.4f}")
        print("Confusion Matrix:")
        print(confusion_matrix(y_test, preds))

    # Train Final Ensemble
    print("\nTraining Final Voting Classifier...")
    pipeline.fit(X_train, y_train)
    
    y_pred = pipeline.predict(X_test)
    y_proba = pipeline.predict_proba(X_test)[:, 1]
    
    print("\n[Final Ensemble] Classification Report:")
    report = classification_report(y_test, y_pred)
    print(report)
    print("Final Confusion Matrix:")
    print(confusion_matrix(y_test, y_pred))
    
    return pipeline

def run_sensitivity_tests(model, numeric_features, categorical_features):
    print("\n--- Sensitivity Testing ---")
    base_employee = {
        'Age': 35, 'JobLevel': 2, 'BusinessTravel': 'Travel_Rarely', 'JobRole': 'Sales Executive',
        'OverTime': 'No', 'JobSatisfaction': 3, 'WorkLifeBalance': 3, 'EnvironmentSatisfaction': 3,
        'RelationshipSatisfaction': 3, 'YearsAtCompany': 5, 'YearsSinceLastPromotion': 1,
        'YearsWithCurrManager': 3, 'YearsInCurrentRole': 3, 'TotalWorkingYears': 8,
        'PercentSalaryHike': 12, 'JobInvolvement': 3, 'PerformanceRating': 3, 'StockOptionLevel': 1,
        'DistanceFromHome': 5, 'NumCompaniesWorked': 1, 'Department': 'Sales', 'MaritalStatus': 'Single',
        'MonthlyIncome': 5000
    }
    
    def predict(overrides):
        emp = base_employee.copy()
        emp.update(overrides)
        
        # Mirror API Validation
        age = float(emp.get('Age', 30))
        if age < 18 or age > 65: return "Error"
        
        job_level = float(emp.get('JobLevel', 1))
        if job_level < 1 or job_level > 5: return "Error"
        
        income = float(emp.get('MonthlyIncome', 5000))
        if income < 1000 or income > 30000: return "Error"
        
        travel = emp.get('BusinessTravel', 'Travel_Rarely')
        if travel not in ['Travel_Frequently', 'Travel_Rarely', 'Non-Travel']: return "Error"
        
        overtime = emp.get('OverTime', 'No')
        if overtime not in ['Yes', 'No']: return "Error"
        
        df = pd.DataFrame([emp])
        df = FE.feature_engineering(df)
        
        for col in numeric_features:
            if col not in df.columns:
                df[col] = 0.0
        for col in categorical_features:
            if col not in df.columns:
                df[col] = 'missing'
                
        # ML Prediction
        prob = model.predict_proba(df[numeric_features + categorical_features])[0, 1]
        
        # Explainable Post-Model Calibration
        prob = FE.calibrate_probability(prob, emp)
        return prob

    def get_label(prob):
        if prob >= 0.80: return "Critical Risk"
        elif prob >= 0.60: return "High Risk"
        elif prob >= 0.40: return "Medium Risk"
        elif prob >= 0.20: return "Low Risk"
        else: return "Minimal Risk"
        
    print("\n1. MonthlyIncome Sensitivity (OverTime=No, JobLevel=2)")
    print(f"{'Income':<10} | {'Risk':<10} | {'Label'}")
    print("-" * 40)
    for inc in [100, 1000, 3000, 5000, 7000, 10000, 15000, 30000, 50000]:
        p = predict({'MonthlyIncome': inc})
        if p == "Error":
            print(f"{inc:<10} | Error      | Error")
        else:
            print(f"{inc:<10} | {p:>7.2%}    | {get_label(p)}")
        
    print("\n2. BusinessTravel Sensitivity (MonthlyIncome=5000)")
    print(f"{'Travel':<20} | {'Risk':<10} | {'Label'}")
    print("-" * 45)
    for tr in ['Travel_Frequently', 'Travel_Rarely', 'Non-Travel']:
        p = predict({'BusinessTravel': tr})
        print(f"{tr:<20} | {p:>7.2%}    | {get_label(p)}")
        
    print("\n3. OverTime Sensitivity (MonthlyIncome=5000)")
    print(f"{'OverTime':<10} | {'Risk':<10} | {'Label'}")
    print("-" * 40)
    for ot in ['Yes', 'No']:
        p = predict({'OverTime': ot})
        print(f"{ot:<10} | {p:>7.2%}    | {get_label(p)}")
        
    print("\n4. JobLevel Sensitivity (MonthlyIncome=5000)")
    print(f"{'JobLevel':<10} | {'Risk':<10} | {'Label'}")
    print("-" * 40)
    for jl in [1, 2, 3, 4, 5]:
        p = predict({'JobLevel': jl})
        print(f"{jl:<10} | {p:>7.2%}    | {get_label(p)}")
        
    print("\n5. Age Sensitivity (MonthlyIncome=5000)")
    print(f"{'Age':<10} | {'Risk':<10} | {'Label'}")
    print("-" * 40)
    for age in [22, 28, 35, 45, 55]:
        p = predict({'Age': age})
        print(f"{age:<10} | {p:>7.2%}    | {get_label(p)}")

    print("\n6. BusinessTravel Sensitivity (Low Risk Profile)")
    print("Profile: Age=35, QA Engineer, JobLevel=4, MonthlyIncome=10000, OverTime=No")
    print(f"{'Travel':<20} | {'Risk':<10} | {'Label'}")
    print("-" * 45)
    for tr in ['Travel_Frequently', 'Travel_Rarely', 'Non-Travel']:
        p = predict({'JobRole': 'QA Engineer', 'JobLevel': 4, 'MonthlyIncome': 10000, 'OverTime': 'No', 'BusinessTravel': tr})
        print(f"{tr:<20} | {p:>7.2%}    | {get_label(p)}")
        
    print("\n7. JobLevel Sensitivity (Low Risk Profile)")
    print("Profile: Age=35, QA Engineer, MonthlyIncome=10000, OverTime=No, BusinessTravel=Travel_Rarely")
    print(f"{'JobLevel':<10} | {'Risk':<10} | {'Label'}")
    print("-" * 40)
    for jl in [1, 2, 3, 4, 5]:
        p = predict({'JobRole': 'QA Engineer', 'MonthlyIncome': 10000, 'OverTime': 'No', 'BusinessTravel': 'Travel_Rarely', 'JobLevel': jl})
        print(f"{jl:<10} | {p:>7.2%}    | {get_label(p)}")

    print("\n8. High-Risk Income Sensitivity (Reported Profile)")
    print("Profile: Age=23, Network Engineer, JobLevel=2, OverTime=Yes, BusinessTravel=Travel_Frequently")
    print(f"{'Income':<10} | {'Risk':<10} | {'Label'}")
    print("-" * 40)
    for inc in [1000, 3000, 5000, 7000, 10000, 15000, 30000]:
        p = predict({
            'Age': 23, 'JobRole': 'Network Engineer', 'JobLevel': 2, 
            'OverTime': 'Yes', 'BusinessTravel': 'Travel_Frequently', 'MonthlyIncome': inc
        })
        print(f"{inc:<10} | {p:>7.2%}    | {get_label(p)}")

if __name__ == "__main__":
    try:
        data_path = os.path.join(os.path.dirname(__file__), "employee_attrition_data.csv")
        df = Data.load_employee_data(data_path)
        df = FE.feature_engineering(df)
        
        if 'Attrition' not in df.columns:
            raise ValueError("Target column 'Attrition' not found")

        model = train_evaluate_model(df)
        
        model_save_path = os.path.join(os.path.dirname(__file__), 'employee_attrition_model.pkl')
        joblib.dump(model, model_save_path)
        print(f"\n[COMPLETE] Model upgraded and saved as '{model_save_path}'")

        num_f, cat_f = get_features(df)
        run_sensitivity_tests(model, num_f, cat_f)

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error during training: {e}")