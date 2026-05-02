# MasterApi.py
import subprocess
import os
import sys

# List of API scripts to run (relative paths)
# Format: (script_path, python_executable)
# Cv_Screen uses Python 3.14 for Gemini AI support (requires Python 3.9+)
apis = [
    ("Cv_Screen/API.py",                  sys.executable),
    ("Dynamic_Interview/api.py",           sys.executable),
    ("Employee_Retention/API.py",          sys.executable),
    ("Performance_Productivity/Api.py",    sys.executable),
]

# Store processes
processes = []

try:
    for api_path, python_exe in apis:
        # Make sure the file exists
        if not os.path.exists(api_path):
            print(f"File not found: {api_path}")
            continue

        # Run the script in a new process
        print(f"Starting {api_path} ...")
        api_dir = os.path.dirname(os.path.abspath(api_path))
        script_name = os.path.basename(api_path)
        proc = subprocess.Popen([python_exe, script_name], cwd=api_dir)
        processes.append(proc)

    print("All APIs started. Press Ctrl+C to stop.")

    # Keep the master script running while child processes run
    for proc in processes:
        proc.wait()

except KeyboardInterrupt:
    print("\nStopping all APIs...")
    # Terminate all child processes
    for proc in processes:
        proc.terminate()
    print("All APIs stopped.")