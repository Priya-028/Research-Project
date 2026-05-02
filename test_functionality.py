#!/usr/bin/env python3
"""
Comprehensive functionality test for the HR React Web App
Tests all critical endpoints and features
"""

import requests
import json
import time
import sys
import csv
from pathlib import Path

# API Configuration
API_BASE_URL = "http://localhost:5002"
EMPLOYEE_API_URL = "http://localhost:5000"
TIMEOUT = 10

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def print_test(name, passed, message=""):
    """Print test result with color coding"""
    status = f"{Colors.GREEN}✓ PASSED{Colors.END}" if passed else f"{Colors.RED}✗ FAILED{Colors.END}"
    print(f"  {status} - {name}")
    if message:
        print(f"    {message}")

def print_section(title):
    """Print section header"""
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BLUE}{title}{Colors.END}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}")

def test_api_health():
    """Test 1: API Health Check"""
    print_section("TEST 1: API HEALTH CHECK")
    
    tests_passed = 0
    tests_total = 0
    
    # Test 1.1: Productivity API Health
    tests_total += 1
    try:
        response = requests.get(f"{API_BASE_URL}/api/test", timeout=TIMEOUT)
        passed = response.status_code == 200
        data = response.json() if passed else {}
        model_loaded = data.get('model_loaded', False)
        print_test("Productivity API /api/test endpoint", passed, 
                   f"Status: {response.status_code}, Model loaded: {model_loaded}")
        if passed:
            tests_passed += 1
    except Exception as e:
        print_test("Productivity API /api/test endpoint", False, str(e))
    
    # Test 1.2: Health Check Endpoint
    tests_total += 1
    try:
        response = requests.get(f"{API_BASE_URL}/api/health", timeout=TIMEOUT)
        passed = response.status_code == 200
        print_test("Productivity API /api/health endpoint", passed, f"Status: {response.status_code}")
        if passed:
            tests_passed += 1
    except Exception as e:
        print_test("Productivity API /api/health endpoint", False, str(e))
    
    # Test 1.3: Model Status Endpoint
    tests_total += 1
    try:
        response = requests.get(f"{API_BASE_URL}/api/model/status", timeout=TIMEOUT)
        passed = response.status_code == 200
        data = response.json() if passed else {}
        print_test("Productivity API /api/model/status endpoint", passed, 
                   f"Status: {response.status_code}, Model loaded: {data.get('model_loaded', False)}")
        if passed:
            tests_passed += 1
    except Exception as e:
        print_test("Productivity API /api/model/status endpoint", False, str(e))
    
    return tests_passed, tests_total

def test_single_prediction():
    """Test 2: Single Employee Prediction"""
    print_section("TEST 2: SINGLE EMPLOYEE PREDICTION")
    
    tests_passed = 0
    tests_total = 1
    
    try:
        payload = {
            "role_level": "Senior",
            "position": "Data Analyst",
            "age": 28,
            "experience_years": 5,
            "avg_task_completion": 4.2,
            "attendance_rate": 4.5,
            "projects_handled": 8,
            "overtime_hours": 15,
            "training_hours": 25
        }
        
        response = requests.post(
            f"{API_BASE_URL}/api/predict/single",
            json=payload,
            timeout=TIMEOUT
        )
        
        passed = response.status_code == 200
        data = response.json() if passed else {}
        success = data.get('success', False)
        
        if passed and success:
            result = data.get('result', {})
            feedback = result.get('Predicted_Feedback_Percentage', 'N/A')
            productivity = result.get('Productivity_Score', 'N/A')
            risk = result.get('Risk_Level', 'N/A')
            print_test("Single prediction endpoint", True,
                      f"Feedback: {feedback}%, Productivity: {productivity}, Risk: {risk}")
            tests_passed += 1
        else:
            print_test("Single prediction endpoint", False,
                      f"Status: {response.status_code}, Success: {success}, Error: {data.get('error', 'Unknown')}")
    
    except Exception as e:
        print_test("Single prediction endpoint", False, str(e))
    
    return tests_passed, tests_total

def create_test_csv():
    """Create a test CSV file for batch prediction"""
    test_data = [
        {
            'role_level': 'Junior',
            'position': 'Developer',
            'age': 24,
            'experience_years': 2,
            'avg_task_completion': 3.5,
            'attendance_rate': 4.0,
            'projects_handled': 5,
            'overtime_hours': 10,
            'training_hours': 20
        },
        {
            'role_level': 'Senior',
            'position': 'Manager',
            'age': 35,
            'experience_years': 10,
            'avg_task_completion': 4.5,
            'attendance_rate': 4.8,
            'projects_handled': 15,
            'overtime_hours': 20,
            'training_hours': 30
        },
        {
            'role_level': 'Mid',
            'position': 'Analyst',
            'age': 28,
            'experience_years': 5,
            'avg_task_completion': 3.8,
            'attendance_rate': 3.5,
            'projects_handled': 8,
            'overtime_hours': 5,
            'training_hours': 15
        }
    ]
    
    test_file = Path('test_batch_data.csv')
    
    try:
        with open(test_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=test_data[0].keys())
            writer.writeheader()
            writer.writerows(test_data)
        return test_file
    except Exception as e:
        print(f"Failed to create test CSV: {e}")
        return None

def test_batch_prediction():
    """Test 3: Batch Prediction"""
    print_section("TEST 3: BATCH PREDICTION")
    
    tests_passed = 0
    tests_total = 1
    
    # Create test CSV
    test_file = create_test_csv()
    if not test_file:
        print_test("Batch prediction with CSV file", False, "Failed to create test CSV")
        return tests_passed, tests_total
    
    try:
        with open(test_file, 'rb') as f:
            files = {'csv_file': (test_file.name, f, 'text/csv')}
            response = requests.post(
                f"{API_BASE_URL}/api/predict/batch",
                files=files,
                timeout=TIMEOUT
            )
        
        passed = response.status_code == 200
        data = response.json() if passed else {}
        success = data.get('success', False)
        
        if passed and success:
            total = data.get('total_employees', 0)
            message = data.get('message', '')
            summary = data.get('summary', {})
            avg_feedback = summary.get('average_feedback_percentage', 'N/A')
            avg_productivity = summary.get('average_productivity', 'N/A')
            
            print_test("Batch prediction endpoint", True,
                      f"Processed {total} employees, Avg Feedback: {avg_feedback}%, "
                      f"Avg Productivity: {avg_productivity}%")
            tests_passed += 1
        else:
            error = data.get('error', 'Unknown error')
            print_test("Batch prediction endpoint", False,
                      f"Status: {response.status_code}, Error: {error}")
    
    except Exception as e:
        print_test("Batch prediction endpoint", False, str(e))
    
    finally:
        # Clean up
        if test_file.exists():
            test_file.unlink()
    
    return tests_passed, tests_total

def test_preview():
    """Test 4: Preview Endpoint"""
    print_section("TEST 4: PREVIEW ENDPOINT")
    
    tests_passed = 0
    tests_total = 1
    
    # Create test CSV
    test_file = create_test_csv()
    if not test_file:
        print_test("Preview endpoint with CSV file", False, "Failed to create test CSV")
        return tests_passed, tests_total
    
    try:
        with open(test_file, 'rb') as f:
            files = {'csv_file': (test_file.name, f, 'text/csv')}
            response = requests.post(
                f"{API_BASE_URL}/api/predict/preview",
                files=files,
                timeout=TIMEOUT
            )
        
        passed = response.status_code == 200
        data = response.json() if passed else {}
        success = data.get('success', False)
        
        if passed and success:
            preview_rows = len(data.get('preview', []))
            total_rows = data.get('total_rows', 0)
            columns = len(data.get('columns', []))
            
            print_test("Preview endpoint", True,
                      f"Preview rows: {preview_rows}, Total rows: {total_rows}, Columns: {columns}")
            tests_passed += 1
        else:
            error = data.get('error', 'Unknown error')
            print_test("Preview endpoint", False,
                      f"Status: {response.status_code}, Error: {error}")
    
    except Exception as e:
        print_test("Preview endpoint", False, str(e))
    
    finally:
        # Clean up
        if test_file.exists():
            test_file.unlink()
    
    return tests_passed, tests_total

def test_file_listing():
    """Test 5: File Listing Endpoint"""
    print_section("TEST 5: FILE LISTING")
    
    tests_passed = 0
    tests_total = 1
    
    try:
        response = requests.get(f"{API_BASE_URL}/api/files", timeout=TIMEOUT)
        passed = response.status_code == 200
        data = response.json() if passed else {}
        success = data.get('success', False)
        
        if passed and success:
            file_count = data.get('count', 0)
            print_test("File listing endpoint", True, f"Found {file_count} result files")
            tests_passed += 1
        else:
            error = data.get('error', 'Unknown error')
            print_test("File listing endpoint", False,
                      f"Status: {response.status_code}, Error: {error}")
    
    except Exception as e:
        print_test("File listing endpoint", False, str(e))
    
    return tests_passed, tests_total

def main():
    """Run all tests"""
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BLUE}HR REACT WEB APP - FUNCTIONALITY TEST SUITE{Colors.END}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"Testing API endpoints at {API_BASE_URL}")
    print(f"Timeout: {TIMEOUT} seconds\n")
    
    total_passed = 0
    total_tests = 0
    
    # Run all tests
    test_functions = [
        test_api_health,
        test_single_prediction,
        test_batch_prediction,
        test_preview,
        test_file_listing
    ]
    
    for test_func in test_functions:
        try:
            passed, total = test_func()
            total_passed += passed
            total_tests += total
        except Exception as e:
            print(f"{Colors.RED}Error running {test_func.__name__}: {e}{Colors.END}")
    
    # Print summary
    print_section("SUMMARY")
    percentage = (total_passed / total_tests * 100) if total_tests > 0 else 0
    
    if total_passed == total_tests:
        status_color = Colors.GREEN
        status = "ALL TESTS PASSED ✓"
    elif total_passed > total_tests / 2:
        status_color = Colors.YELLOW
        status = "SOME TESTS FAILED ⚠"
    else:
        status_color = Colors.RED
        status = "MOST TESTS FAILED ✗"
    
    print(f"{status_color}Overall: {total_passed}/{total_tests} tests passed ({percentage:.1f}%){Colors.END}")
    print(f"Status: {status_color}{status}{Colors.END}\n")
    
    return 0 if total_passed == total_tests else 1

if __name__ == "__main__":
    sys.exit(main())
