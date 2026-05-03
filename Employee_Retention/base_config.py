from datetime import datetime
import os
import logging


BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _resolve_model_path():
    configured_path = os.getenv("MODEL_PATH")
    if configured_path:
        return configured_path if os.path.isabs(configured_path) else os.path.abspath(configured_path)

    return os.path.join(BASE_DIR, "employee_attrition_model.pkl")

class AppConfig:
    MODEL_PATH = _resolve_model_path()
    APP_NAME = "Employee Attrition Risk Engine"
    VERSION = "2.0.0"
    RISK_THRESHOLD_CRITICAL = 0.80
    RISK_THRESHOLD_HIGH = 0.60
    RISK_THRESHOLD_MEDIUM = 0.40
    RISK_THRESHOLD_LOW = 0.20

    RISK_LEVEL_CRITICAL = "Critical Risk"
    RISK_LEVEL_HIGH = "High Risk"
    RISK_LEVEL_MEDIUM = "Medium Risk"
    RISK_LEVEL_LOW = "Low Risk"
    RISK_LEVEL_MINIMAL = "Minimal Risk"

    # Global Salary Medians by Job Level (Extracted from 1,490 records)
    # This prevents the "Single Row" prediction bug (comparing to self)
    MEDIAN_INCOME_BY_LEVEL = {
        1: 5390.0,
        2: 10034.0,
        3: 16407.0,
        4: 20244.0,
        5: 25332.0
    }

    @classmethod
    def display_config(cls):
        print(f"Model Path   : {cls.MODEL_PATH}")
        print(f"Started At   : {datetime.now()}")



# LOGGER SETUP

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[
        logging.FileHandler("attrition_prediction.log"),
        logging.StreamHandler()
    ]
)
