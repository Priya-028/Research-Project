import os
import logging
import pandas as pd
from typing import Dict, Any
from predictor_utils import predict_single_employee
import base_config as bc

logger = logging.getLogger("AttritionPredictor")
logging.basicConfig(level=logging.INFO)


class EmployeeAttritionBatchEngine:

    def __init__(self):
        self.model_path = bc.AppConfig.MODEL_PATH

    def predict_from_csv(self, input_csv: str, output_csv: str):

        logger.info("Starting batch attrition prediction...")
        bc.AppConfig.display_config()

        try:
            # Load employee CSV
            df = pd.read_csv(input_csv)

            results = []

            for index, row in df.iterrows():

                employee_data = {
                    "Age": row["Age"],
                    "BusinessTravel": row["BusinessTravel"],
                    "JobRole": row["JobRole"],
                    "JobLevel": row["JobLevel"],
                    "MonthlyIncome": row["MonthlyIncome"],
                    "OverTime": row["OverTime"]
                }

                logger.info(f"Predicting employee index {index}...")

                result = predict_single_employee(self.model_path, employee_data)

                df.loc[index, "Risk_Score"] = result.get("risk_score")
                df.loc[index, "Risk_Label"] = result.get("risk_label")

            # Save output file
            df.to_csv(output_csv, index=False)

            logger.info(f"Batch prediction completed. Results saved to {output_csv}")
            print(f"\nResults saved to: {output_csv}")

        except Exception as ex:
            logger.error(f"Prediction Failed: {ex}", exc_info=True)
            print(f"\nERROR: {ex}\n")


if __name__ == "__main__":
    engine = EmployeeAttritionBatchEngine()
    engine.predict_from_csv(
        input_csv="employees.csv",
        output_csv="employees_attrition_results.csv"
    )