import pandas as pd
import numpy as np

def validate_dataframe(df, required_columns):
    missing_cols = [col for col in required_columns if col not in df.columns]
    if missing_cols:
        raise ValueError(f"Missing required columns: {missing_cols}")
    
    for col in df.select_dtypes(include=[np.number]).columns:
        df[col] = df[col].fillna(0)
    
    for col in df.select_dtypes(include=[object]).columns:
        df[col] = df[col].fillna('')
    
    return df
