"""
Sensitivity test: Change each field one at a time from the user's baseline profile
and measure the change in risk score.
"""
import urllib.request
import json

API_URL = 'http://localhost:5003/api/predict/single'

# Baseline profile exactly as entered by the user
BASELINE = {
    'Age': 49,
    'MonthlyIncome': 100,
    'JobRole': 'Software Engineer',
    'JobLevel': 4,
    'BusinessTravel': 'Non-Travel',
    'OverTime': 'No',
    'Department': 'Research & Development',
    'MaritalStatus': 'Married',
    'JobSatisfaction': 1,
    'WorkLifeBalance': 1,
    'EnvironmentSatisfaction': 1,
    'StockOptionLevel': 3,
    'YearsAtCompany': 6,
    'DistanceFromHome': 99,
    'YearsSinceLastPromotion': 0,
    'YearsWithCurrManager': 1,
    'PerformanceRating': 3,
    'JobInvolvement': 1,
    'PercentSalaryHike': 12,
    'NumCompaniesWorked': 1,
}

def predict(payload):
    req = urllib.request.Request(
        API_URL,
        json.dumps(payload).encode('utf-8'),
        {'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.loads(resp.read().decode())
    return result.get('risk_score', None)

baseline_score = predict(BASELINE)
print("\n" + "="*65)
print(f" BASELINE => Risk Score: {baseline_score:.4f} ({baseline_score*100:.1f}%)")
print("="*65 + "\n")

tests = [
    ('Age',                    'Age',                        [23, 35, 49, 60]),
    ('MonthlyIncome',          'Monthly Income',             [100, 2000, 5000, 15000]),
    ('JobLevel',               'Job Level',                  [1, 2, 3, 4, 5]),
    ('JobRole',                'Job Role',                   ['Sales Representative', 'Research Scientist', 'Software Engineer']),
    ('BusinessTravel',         'Business Travel',            ['Non-Travel', 'Travel_Rarely', 'Travel_Frequently']),
    ('OverTime',               'OverTime',                   ['No', 'Yes']),
    ('Department',             'Department',                 ['Research & Development', 'Sales', 'Human Resources']),
    ('MaritalStatus',          'Marital Status',             ['Married', 'Single', 'Divorced']),
    ('JobSatisfaction',        'Job Satisfaction',           [1, 2, 3, 4]),
    ('WorkLifeBalance',        'Work-Life Balance',          [1, 2, 3, 4]),
    ('EnvironmentSatisfaction','Environment Satisfaction',   [1, 2, 3, 4]),
    ('StockOptionLevel',       'Stock Option Level',         [0, 1, 2, 3]),
    ('YearsAtCompany',         'Years At Company',           [0, 2, 6, 10, 20]),
    ('DistanceFromHome',       'Distance From Home (km)',    [1, 10, 30, 99]),
    ('YearsSinceLastPromotion','Years Since Last Promotion', [0, 2, 5, 10]),
    ('YearsWithCurrManager',   'Years With Current Manager', [0, 1, 5, 10]),
    ('PerformanceRating',      'Performance Rating',         [1, 2, 3, 4]),
    ('JobInvolvement',         'Job Involvement',            [1, 2, 3, 4]),
    ('PercentSalaryHike',      'Salary Hike %',              [11, 12, 15, 20, 25]),
    ('NumCompaniesWorked',     'Num Companies Worked',       [0, 1, 3, 5, 9]),
]

results = []
for field, display, values in tests:
    scores = []
    for v in values:
        payload = dict(BASELINE)
        payload[field] = v
        try:
            s = predict(payload)
            scores.append((v, s))
        except Exception as e:
            scores.append((v, None))

    valid = [(v, s) for v, s in scores if s is not None]
    if not valid:
        results.append((display, field, False, [], 0.0))
        continue
    score_vals = [s for _, s in valid]
    delta = max(score_vals) - min(score_vals)
    affects = delta > 0.001
    results.append((display, field, affects, valid, delta))

print(f"{'Field':<35} {'Affects?':<12} {'min score':<12} {'max score':<12} {'Max Delta'}")
print('-'*80)
for display, field, affects, vals, delta in results:
    lo = min(s for _, s in vals) if vals else 0
    hi = max(s for _, s in vals) if vals else 0
    flag = "YES" if affects else "NO"
    print(f"{display:<35} {flag:<12} {lo:<12.4f} {hi:<12.4f} {delta:.4f}")

print()
print("=" * 80)
print("FIELDS THAT DO NOT AFFECT THE RISK SCORE:")
no_effect = [d for d, f, a, v, delta in results if not a]
for name in no_effect:
    print(f"  XX  {name}")
if not no_effect:
    print("  (All fields affect the risk score)")

print()
print("FIELDS RANKED BY IMPACT (highest first):")
yes_effect = sorted([(d, delta) for d, f, a, v, delta in results if a], key=lambda x: -x[1])
for i, (name, delta) in enumerate(yes_effect, 1):
    print(f"  {i:>2}. {name:<35}  delta = {delta:.4f}  ({delta*100:.1f}%)")
