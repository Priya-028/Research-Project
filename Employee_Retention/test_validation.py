"""
Edge-case validation test for predictor_utils.validate_required_fields()
Tests all invalid cases the user reported, plus valid baseline.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import urllib.request, json

API_URL = 'http://localhost:5003/api/predict/single'

VALID_BASE = {
    'Age': 30, 'MonthlyIncome': 5000, 'JobRole': 'Software Engineer',
    'JobLevel': 2, 'BusinessTravel': 'Travel_Rarely', 'OverTime': 'No',
    'Department': 'Research & Development', 'MaritalStatus': 'Married',
    'JobSatisfaction': 3, 'WorkLifeBalance': 3, 'EnvironmentSatisfaction': 3,
    'StockOptionLevel': 1, 'YearsAtCompany': 5, 'JobInvolvement': 3
}

def call(payload):
    try:
        req = urllib.request.Request(
            API_URL, json.dumps(payload).encode('utf-8'),
            {'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode())
    except Exception as ex:
        return {"error": str(ex)}

def test(name, payload, expect_error=True):
    result = call(payload)
    if expect_error:
        has_error = not result.get('success', True) or 'error' in result
        status = "PASS" if has_error else "FAIL"
        detail = result.get('error', result.get('risk_label', 'No error returned'))
    else:
        has_success = result.get('success') and 'risk_score' in result
        status = "PASS" if has_success else "FAIL"
        detail = result.get('risk_label', result.get('error', '?'))
    print(f"  [{status}] {name}: {detail}")

print("\n" + "="*65)
print(" VALIDATION EDGE-CASE TEST")
print("="*65)

print("\n-- Missing required fields --")
p = dict(VALID_BASE); del p['Age']
test("Missing Age", p)
p = dict(VALID_BASE); del p['JobLevel']
test("Missing JobLevel", p)
p = dict(VALID_BASE); del p['MonthlyIncome']
test("Missing MonthlyIncome", p)
p = dict(VALID_BASE); del p['BusinessTravel']
test("Missing BusinessTravel", p)
p = dict(VALID_BASE); del p['OverTime']
test("Missing OverTime", p)
p = dict(VALID_BASE); del p['JobRole']
test("Missing JobRole", p)

print("\n-- Empty string required fields --")
p = dict(VALID_BASE); p['Age'] = ''
test("Empty Age", p)
p = dict(VALID_BASE); p['JobLevel'] = ''
test("Empty JobLevel", p)
p = dict(VALID_BASE); p['MonthlyIncome'] = ''
test("Empty MonthlyIncome", p)
p = dict(VALID_BASE); p['JobRole'] = ''
test("Empty JobRole", p)

print("\n-- Non-numeric text in numeric fields --")
p = dict(VALID_BASE); p['Age'] = 'twenty'
test("Age = 'twenty'", p)
p = dict(VALID_BASE); p['JobLevel'] = 'three'
test("JobLevel = 'three'", p)
p = dict(VALID_BASE); p['MonthlyIncome'] = 'five thousand'
test("MonthlyIncome = 'five thousand'", p)

print("\n-- Out-of-range values --")
p = dict(VALID_BASE); p['Age'] = 15
test("Age = 15 (too young)", p)
p = dict(VALID_BASE); p['Age'] = 70
test("Age = 70 (too old)", p)
p = dict(VALID_BASE); p['JobLevel'] = 0
test("JobLevel = 0 (too low)", p)
p = dict(VALID_BASE); p['JobLevel'] = 6
test("JobLevel = 6 (too high)", p)
p = dict(VALID_BASE); p['MonthlyIncome'] = 0
test("MonthlyIncome = 0", p)
p = dict(VALID_BASE); p['MonthlyIncome'] = -500
test("MonthlyIncome = -500", p)
p = dict(VALID_BASE); p['MonthlyIncome'] = 200000
test("MonthlyIncome = 200000 (too high)", p)

print("\n-- Invalid categorical values --")
p = dict(VALID_BASE); p['BusinessTravel'] = 'Sometimes'
test("BusinessTravel = 'Sometimes'", p)
p = dict(VALID_BASE); p['OverTime'] = 'Maybe'
test("OverTime = 'Maybe'", p)
p = dict(VALID_BASE); p['JobRole'] = 'Doctor'
test("JobRole = 'Doctor' (non-IT role -> must fail)", p, expect_error=True)
p = dict(VALID_BASE); p['JobRole'] = 'Teacher'
test("JobRole = 'Teacher' (non-IT role -> must fail)", p, expect_error=True)
p = dict(VALID_BASE); p['JobRole'] = 'front-end developer'
test("JobRole = 'front-end developer' (alias -> should predict)", p, expect_error=False)
p = dict(VALID_BASE); p['JobRole'] = 'DEVOPS ENGINEER'
test("JobRole = 'DEVOPS ENGINEER' (uppercase alias -> should predict)", p, expect_error=False)

print("\n-- Valid baseline (should predict correctly) --")
test("Valid baseline profile", VALID_BASE, expect_error=False)

print("\n" + "="*65)
