import os
import pandas as pd


dataset_path = "DataSet_New.csv"


if not os.path.exists(dataset_path):
    print(f"Dataset not found at {dataset_path}!")
    dataset_path = input("Please enter the correct dataset path: ")

try:
    df = pd.read_csv(dataset_path)
    print(f"Dataset loaded successfully from {dataset_path}")
except Exception as e:
    raise FileNotFoundError(f"Failed to load dataset. Error: {e}")