import os
import sys
import importlib.util
import socket
import joblib
import pandas as pd
import numpy as np

def check_package(package_name):
    spec = importlib.util.find_spec(package_name)
    if spec is None:
        print(f"  [X] Missing: {package_name}")
        return False
    print(f"  [V] Found: {package_name}")
    return True

def check_file(filepath):
    if os.path.exists(filepath):
        print(f"  [V] Found: {filepath} ({os.path.getsize(filepath) / 1024:.1f} KB)")
        return True
    else:
        print(f"  [X] Missing: {filepath}")
        return False

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def run_checks():
    print("="*60)
    print("   Employee Retention Module: Requirements System Check")
    print("="*60 + "\n")

    # 1. Check Python Dependencies
    print("--- Checking Python Libraries ---")
    required_packages = [
        'pandas', 'numpy', 'sklearn', 'xgboost', 'joblib', 
        'flask', 'flask_cors', 'matplotlib', 'seaborn'
    ]
    all_packages_ok = all([check_package(p) for p in required_packages])

    # 2. Check Core Files
    print("\n--- Checking Core Module Files ---")
    retention_dir = "Employee_Retention"
    if not os.path.exists(retention_dir):
        # Maybe we are already inside the folder?
        if os.path.exists("API.py"):
            retention_dir = "."
        else:
            print(f"  [FATAL] Folder 'Employee_Retention' not found in {os.getcwd()}")
            return

    core_files = [
        os.path.join(retention_dir, "API.py"),
        os.path.join(retention_dir, "Employee_Retention.py"),
        os.path.join(retention_dir, "predictor_utils.py"),
        os.path.join(retention_dir, "feature_engineering.py"),
        os.path.join(retention_dir, "DataLoad.py"),
        os.path.join(retention_dir, "base_config.py"),
        os.path.join(retention_dir, "employee_attrition_data.csv")
    ]
    all_files_ok = all([check_file(f) for f in core_files])

    # 3. Check Model Health
    print("\n--- Checking Machine Learning Model Health ---")
    model_path = os.path.join(retention_dir, "employee_attrition_model.pkl")
    if os.path.exists(model_path):
        try:
            model = joblib.load(model_path)
            print(f"  [V] Model Status: Healthy (Loaded successfully)")
            # Check if it's a pipeline
            if hasattr(model, 'named_steps'):
                print(f"  [i] Pipeline Type: {type(model.named_steps['classifier']).__name__}")
            else:
                print(f"  [!] Warning: Model is not wrapped in a Scikit-Learn Pipeline")
        except Exception as e:
            print(f"  [X] Model Status: Corrupt! Error: {e}")
    else:
        print(f"  [X] Model Status: Not Trained! Run 'train_model.py' first.")

    # 4. Check API Connectivity
    print("\n--- Checking API & Network Status ---")
    port = 5003
    if is_port_in_use(port):
        print(f"  [!] Port {port}: IN USE (Retention API is likely already running)")
    else:
        print(f"  [V] Port {port}: AVAILABLE (Ready to start service)")

    # Final Verdict
    print("\n" + "="*60)
    if all_packages_ok and all_files_ok and os.path.exists(model_path):
        print("  SYSTEM READY: The Employee Retention module is good to go!")
    else:
        print("  SYSTEM INCOMPLETE: Please address the [X] marks above.")
    print("="*60 + "\n")

if __name__ == "__main__":
    run_checks()
