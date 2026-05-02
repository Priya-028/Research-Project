import joblib
import os
import pandas as pd
import numpy as np

model_path_current = r'c:\Users\User\Desktop\HRReactWeb_App - Copy\HRReactWeb_App - Copy\HRReactWeb_AppV26\Employee_Retention\employee_attrition_model.pkl'
model_path_old = r'c:\Users\User\Desktop\MyFInalProj\MyFInalProj\employee_attrition_model.pkl'

def inspect_model(path, name):
    print(f"\n--- Inspecting {name} ({path}) ---")
    if not os.path.exists(path):
        print("File not found.")
        return None
    
    try:
        model = joblib.load(path)
        print(f"Model Type: {type(model)}")
        
        if hasattr(model, 'named_steps'):
            preprocessor = model.named_steps['preprocessor']
            num_feats = preprocessor.transformers_[0][2]
            cat_feats = preprocessor.transformers_[1][2]
            print(f"Numeric Features ({len(num_feats)}): {num_feats[:5]}...")
            print(f"Categorical Features ({len(cat_feats)}): {cat_feats[:5]}...")
            
            classifier = model.named_steps['classifier']
            print(f"Classifier Params: {classifier.get_params()}")
        else:
            print("Model is not a pipeline.")
        return model
    except Exception as e:
        print(f"Error: {e}")
        return None

model_current = inspect_model(model_path_current, "Current Model")
model_old = inspect_model(model_path_old, "Old Model (MyFinalProj)")

# Test with a "Logical" failing case
test_case = {
    'Age': 30,
    'DailyRate': 800,
    'DistanceFromHome': 5,
    'Education': 3,
    'EnvironmentSatisfaction': 1,
    'JobInvolvement': 2,
    'JobLevel': 5,
    'JobSatisfaction': 1,
    'MonthlyIncome': 2000,
    'NumCompaniesWorked': 1,
    'PercentSalaryHike': 12,
    'PerformanceRating': 3,
    'RelationshipSatisfaction': 3,
    'StockOptionLevel': 0,
    'TotalWorkingYears': 10,
    'TrainingTimesLastYear': 3,
    'WorkLifeBalance': 1,
    'YearsAtCompany': 5,
    'YearsInCurrentRole': 2,
    'YearsSinceLastPromotion': 1,
    'YearsWithCurrManager': 2,
    'BusinessTravel': 'Travel_Rarely',
    'Department': 'Research & Development',
    'Gender': 'Male',
    'JobRole': 'Manager',
    'MaritalStatus': 'Single',
    'OverTime': 'Yes',
    'PromotionSpeed': 0.16,
    'IncomeRelativeToLevel': 0.1  # Manually set low income ratio
}

def get_prob(model, data, name):
    if not model: return
    try:
        df = pd.DataFrame([data])
        # Note: We are bypassing the pipeline's internal feature engineering here for a raw comparison
        # But both models likely expect the same preprocessed columns
        # To be safe, we'll just see if they can predict on a 'full' feature set row
        
        # Realistically, we should use the predictor_utils logic but let's see if we can just push it through
        preprocessor = model.named_steps['preprocessor']
        num_cols = preprocessor.transformers_[0][2]
        cat_cols = preprocessor.transformers_[1][2]
        
        final_df = df[list(num_cols) + list(cat_cols)]
        prob = model.predict_proba(final_df)[0][1]
        print(f"{name} Prediction Prob: {prob:.4f}")
    except Exception as e:
        print(f"{name} Prediction Error: {e}")

print("\n--- Testing 'Logical' Failure Case (Lead with $2,000 Income) ---")
get_prob(model_current, test_case, "Current Model")
get_prob(model_old, test_case, "Old Model")
