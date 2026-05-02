import os
import logging
from typing import Dict, Any
from predictor_utils import predict_single_employee
import base_config as bc
logger = logging.getLogger("AttritionPredictor")

class EmployeeDataBuilder:
    @staticmethod
    def build() -> Dict[str, Any]:
        logger.debug("Constructing employee sample data...")

        employee = {
            "Age": 30,
            "BusinessTravel": "Travel_Rarely",
            "JobRole": "Research Scientist",
            "JobLevel": 2,
            "MonthlyIncome": 5000,
            "OverTime": "Yes"
        }

        logger.debug(f"Employee Data Constructed: {employee}")
        return employee


# RESULT FORMATTER
class ResultFormatter:
    @staticmethod
    def format(result: Dict[str, Any]) -> str:
        logger.debug("Formatting prediction result...")

        return (
            "\n===== ATTRITION PREDICTION RESULT =====\n"
            f"Risk Score : {result.get('risk_score')}\n"
            f"Risk Label : {result.get('risk_label')}\n"
        )



class EmployeeAttritionEngine:

    def __init__(self):
        self.model_path = bc.AppConfig.MODEL_PATH

    def run(self):
        logger.info("Prediction process started.")
        bc.AppConfig.display_config()

        try:
            employee_data = EmployeeDataBuilder.build()

            logger.info("Invoking prediction engine...")
            result = predict_single_employee(self.model_path, employee_data)

            logger.info("Prediction completed successfully.")
            formatted = ResultFormatter.format(result)

            print(formatted)

        except Exception as ex:
            logger.error(f"Prediction Failed: {ex}", exc_info=True)
            print(f"\nERROR: {ex}\n")



if __name__ == "__main__":
    engine = EmployeeAttritionEngine()
    engine.run()
