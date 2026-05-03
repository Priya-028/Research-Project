import pandas as pd
from predictor_utils import predict_single_employee
import base_config as bc
import os

df = pd.read_csv('employee_attrition_data.csv')

out_rows = []
for index, row in df.iterrows():
    employee_data = row.to_dict()
    try:
        result = predict_single_employee(bc.AppConfig.MODEL_PATH, employee_data)
        out_rows.append({
            'Age': employee_data.get('Age'),
            'BusinessTravel': employee_data.get('BusinessTravel'),
            'JobRole': employee_data.get('JobRole'),
            'JobLevel': employee_data.get('JobLevel'),
            'MonthlyIncome': employee_data.get('MonthlyIncome'),
            'OverTime': employee_data.get('OverTime'),
            'Risk_Score': result.get('risk_score'),
            'Risk_Percentage': result.get('risk_percentage'),
            'Risk_Label': result.get('risk_label')
        })
    except Exception as e:
        out_rows.append({
            'Age': employee_data.get('Age'),
            'BusinessTravel': employee_data.get('BusinessTravel'),
            'JobRole': employee_data.get('JobRole'),
            'JobLevel': employee_data.get('JobLevel'),
            'MonthlyIncome': employee_data.get('MonthlyIncome'),
            'OverTime': employee_data.get('OverTime'),
            'Risk_Score': 'Error',
            'Risk_Percentage': 'Error',
            'Risk_Label': 'Error'
        })

out_df = pd.DataFrame(out_rows)
out_path = 'final_employee_predictions.csv'
out_df.to_csv(out_path, index=False)
print(f"Saved to {out_path}")
print(out_df.head(10))
