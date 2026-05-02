import os
import re
import pandas as pd

class DataValidationError(Exception): pass
class ModelLoadingError(Exception): pass
class ProcessingError(Exception): pass

class DataValidator:

    @staticmethod
    def validate_file_path(path: str):
        if not os.path.exists(path):
            raise DataValidationError(f"File not found: {path}")

    @staticmethod
    def validate_dataframe(df: pd.DataFrame, required_columns: list):
        missing = [c for c in required_columns if c not in df.columns]
        if missing:
            raise DataValidationError(f"Missing required columns: {missing}")

    @staticmethod
    def validate_answer_length(text: str) -> bool:
        return 1 <= len(text.strip()) <= 10000

    @staticmethod
    def clean_text(text: str) -> str:
        text = str(text)
        text = re.sub(r'\s+', ' ', text)
        return text.strip()
