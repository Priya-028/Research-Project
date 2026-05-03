import pandas as pd
import base_config as bc
from predictor_utils import predict_attrition_dataframe, predict_single_employee

def run_test():
    # User's exact scenario
    row_dict = {
        'Age': 23,
        'BusinessTravel': 'Travel_Frequently',
        'JobRole': 'Junior Software Engineer',
        'JobLevel': 1,
        'MonthlyIncome': 2000,
        'OverTime': 'Yes',
        # Added to match bulk dataset
        'Department': 'Research & Development',
        'MaritalStatus': 'Single'
    }
    
    # 1. Predict via bulk pipeline (as a DataFrame row)
    bulk_df = pd.DataFrame([row_dict])
    bulk_result = predict_attrition_dataframe(bc.AppConfig.MODEL_PATH, bulk_df)
    
    # 2. Predict via individual pipeline (as a dictionary with string types just like JSON)
    # Convert types to string to simulate JSON frontend
    json_payload = {k: str(v) for k, v in row_dict.items()}
    individual_result = predict_single_employee(bc.AppConfig.MODEL_PATH, json_payload)
    
    print("\n--- CONSISTENCY TEST ---")
    print("Bulk Pipeline Risk Score:", bulk_result[0]["risk_score"])
    print("Indiv Pipeline Risk Score:", individual_result["risk_score"])
    
    if bulk_result[0]["risk_score"] == individual_result["risk_score"]:
        print("\n[SUCCESS] Bulk and Individual pipelines produce IDENTICAL results!")
    else:
        print("\n[FAILED] Results differ!")

if __name__ == "__main__":
    run_test()
