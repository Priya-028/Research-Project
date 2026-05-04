import pandas as pd
import joblib
import numpy as np
import logging

import feature_engineering as FE
import base_config as bc

import Employee_Retention as ER

logger = logging.getLogger(__name__)

# ── Valid values ─────────────────────────────────────────────────────────────
VALID_BUSINESS_TRAVEL = {'Non-Travel', 'Travel_Rarely', 'Travel_Frequently'}
VALID_OVERTIME        = {'Yes', 'No'}

# Canonical IT job roles accepted by both the UI and the model
VALID_JOB_ROLES = {
    'Junior Software Engineer',
    'Software Engineer',
    'Senior Software Engineer',
    'Frontend Developer',
    'Backend Developer',
    'Full Stack Developer',
    'Mobile App Developer',
    'QA Engineer',
    'Test Engineer',
    'Automation Engineer',
    'Network Engineer',
    'System Administrator',
    'Database Administrator',
    'DevOps Engineer',
    'Cloud Engineer',
    'Data Analyst',
    'Data Engineer',
    'Business Analyst',
    'UI/UX Designer',
    'UI UX Designer',
    'IT Support Specialist',
    'IT Support Engineer',
    'Cybersecurity Analyst',
    'IT Manager',
    'Project Manager',
    'Research Scientist',
    'Sales Representative',
    'Sales Executive',
    'Human Resources',
    'Healthcare Representative',
    'Laboratory Technician',
    'Manufacturing Director',
    'Manager',
}

# Alias map: normalised-lowercase -> canonical form
# Handles hyphens, spacing variations, slash variants, abbreviations
JOBROLE_ALIASES = {
    # Software Engineer variants
    'software engineer':              'Software Engineer',
    'junior software engineer':       'Junior Software Engineer',
    'senior software engineer':       'Senior Software Engineer',
    # Frontend
    'frontend developer':             'Frontend Developer',
    'front end developer':            'Frontend Developer',
    'front-end developer':            'Frontend Developer',
    'fe developer':                   'Frontend Developer',
    # Backend
    'backend developer':              'Backend Developer',
    'back end developer':             'Backend Developer',
    'back-end developer':             'Backend Developer',
    'be developer':                   'Backend Developer',
    # Full Stack
    'full stack developer':           'Full Stack Developer',
    'full-stack developer':           'Full Stack Developer',
    'fullstack developer':            'Full Stack Developer',
    # Mobile
    'mobile app developer':           'Mobile App Developer',
    'mobile developer':               'Mobile App Developer',
    # QA
    'qa engineer':                    'QA Engineer',
    'quality assurance engineer':     'QA Engineer',
    'test engineer':                  'QA Engineer',
    'automation engineer':            'QA Engineer',
    # Network
    'network engineer':               'Network Engineer',
    # Sysadmin
    'system administrator':           'System Administrator',
    'sysadmin':                       'System Administrator',
    # DBA
    'database administrator':         'Database Administrator',
    'dba':                            'Database Administrator',
    # DevOps
    'devops engineer':                'DevOps Engineer',
    'devops':                         'DevOps Engineer',
    # Cloud
    'cloud engineer':                 'Cloud Engineer',
    # Data
    'data analyst':                   'Data Analyst',
    'data engineer':                  'Data Engineer',
    # Business
    'business analyst':               'Business Analyst',
    'ba':                             'Business Analyst',
    # UI/UX
    'ui/ux designer':                 'UI UX Designer',
    'ui ux designer':                 'UI UX Designer',
    'ux designer':                    'UI UX Designer',
    'ui designer':                    'UI UX Designer',
    'uiux designer':                  'UI UX Designer',
    # IT Support
    'it support specialist':          'IT Support Specialist',
    'it support engineer':            'IT Support Specialist',
    'it support':                     'IT Support Specialist',
    # Cybersecurity
    'cybersecurity analyst':          'Cybersecurity Analyst',
    'security analyst':               'Cybersecurity Analyst',
    # Management
    'it manager':                     'IT Manager',
    'project manager':                'Project Manager',
    'pm':                             'Project Manager',
    # Non-IT roles (still trained in model from original IBM dataset)
    'research scientist':             'Research Scientist',
    'sales representative':           'Sales Representative',
    'sales executive':                'Sales Executive',
    'human resources':                'Human Resources',
    'hr':                             'Human Resources',
    'healthcare representative':      'Healthcare Representative',
    'laboratory technician':          'Laboratory Technician',
    'manufacturing director':         'Manufacturing Director',
    'manager':                        'Manager',
}


def normalize_job_role(raw_value):
    """
    Normalises a raw JobRole string and returns the canonical form if it is
    a recognised role, or None if it cannot be mapped.

    Normalisation steps:
      1. Strip leading/trailing whitespace
      2. Collapse multiple internal spaces
      3. Convert to lowercase for lookup
    """
    if raw_value is None:
        return None
    cleaned = ' '.join(str(raw_value).strip().split())  # collapse spaces
    lookup  = cleaned.lower()
    if not lookup:
        return None
    # Try alias map first (handles every variant)
    if lookup in JOBROLE_ALIASES:
        return JOBROLE_ALIASES[lookup]
    # Fall back to exact canonical name (case-insensitive)
    for canonical in VALID_JOB_ROLES:
        if canonical.lower() == lookup:
            return canonical
    return None  # unrecognised role

# ── Model cache ────────────────────────────────────────────────────────────────
_model_cache = {}
_rebuild_attempted = False


def _looks_like_stale_model_error(exc):
    error_msg = str(exc).lower()
    stale_model_markers = (
        "xgboost",
        "json.cc",
        "expecting",
        "serialized model",
        "inconsistentversionwarning",
        "node array",
        "incompatible dtype",
        "transform_input",
        "numpy._core",
    )
    return any(marker in error_msg for marker in stale_model_markers)


def _rebuild_model_artifact(model_path):
    global _rebuild_attempted
    if _rebuild_attempted:
        return False

    _rebuild_attempted = True
    logger.warning(
        "Employee retention model could not be loaded with this environment; "
        "retraining the model artifact."
    )

    try:
        import retrain_model

        retrain_model.main()
        clear_model_cache()
        return True
    except Exception as exc:
        logger.exception("Employee retention model rebuild failed: %s", exc)
        return False

def _load_model(model_path):
    if model_path not in _model_cache:
        try:
            _model_cache[model_path] = joblib.load(model_path)
        except Exception as exc:
            if not _looks_like_stale_model_error(exc) or not _rebuild_model_artifact(model_path):
                raise
            _model_cache[model_path] = joblib.load(model_path)
    return _model_cache[model_path]

def clear_model_cache():
    """Call this after retraining so the stale model is evicted."""
    _model_cache.clear()


def get_top_factors(model, input_df):
    """Bridge to the XGBoost-native factor extraction logic."""
    base_model = _get_base_pipeline(model)
    return ER.get_top_factors(base_model, input_df)


def _get_base_pipeline(model):
    from sklearn.calibration import CalibratedClassifierCV
    if isinstance(model, CalibratedClassifierCV):
        return model.calibrated_classifiers_[0].estimator
    return model


# ── Required-field validation (runs BEFORE imputation) ────────────────────────
def validate_required_fields(raw_row):
    """
    Validates required input fields on the raw (pre-imputation) row dict.
    Returns (is_valid: bool, error_message: str | None).

    Required fields checked:
      Age            - required, numeric, 18-65
      JobLevel       - required, numeric integer, 1-5
      MonthlyIncome  - required, numeric, >0 and <=100000
      BusinessTravel - required, one of VALID_BUSINESS_TRAVEL
      OverTime       - required, one of VALID_OVERTIME
      JobRole        - required (non-empty string)
    """
    # Age
    raw_age = raw_row.get('Age', None)
    if raw_age is None or str(raw_age).strip() == '':
        return False, "Age is required."
    try:
        age = float(str(raw_age).strip())
        if np.isnan(age):
            raise ValueError()
    except (ValueError, TypeError):
        return False, f"Age must be numeric. Received: '{raw_age}'."
    if age < 18 or age > 65:
        return False, f"Age must be between 18 and 65. Received: {int(age)}."

    # JobLevel
    raw_jl = raw_row.get('JobLevel', None)
    if raw_jl is None or str(raw_jl).strip() == '':
        return False, "JobLevel is required."
    try:
        jl = float(str(raw_jl).strip())
        if np.isnan(jl):
            raise ValueError()
    except (ValueError, TypeError):
        return False, f"JobLevel must be a number between 1 and 5. Received: '{raw_jl}'."
    if jl < 1 or jl > 5:
        return False, f"JobLevel must be between 1 and 5. Received: {jl}."

    # MonthlyIncome
    raw_income = raw_row.get('MonthlyIncome', None)
    if raw_income is None or str(raw_income).strip() == '':
        return False, "MonthlyIncome is required."
    try:
        income = float(str(raw_income).strip())
        if np.isnan(income):
            raise ValueError()
    except (ValueError, TypeError):
        return False, f"MonthlyIncome must be numeric. Received: '{raw_income}'."
    if income <= 0:
        return False, f"MonthlyIncome must be greater than 0. Received: {income}."
    if income > 100000:
        return False, f"MonthlyIncome must be 100,000 or less. Received: {income}."

    # BusinessTravel
    travel = str(raw_row.get('BusinessTravel', '')).strip()
    if not travel:
        return False, "BusinessTravel is required."
    if travel not in VALID_BUSINESS_TRAVEL:
        return False, f"BusinessTravel must be one of {sorted(VALID_BUSINESS_TRAVEL)}. Received: '{travel}'."

    # OverTime
    overtime = str(raw_row.get('OverTime', '')).strip()
    if not overtime:
        return False, "OverTime is required."
    if overtime not in VALID_OVERTIME:
        return False, f"OverTime must be 'Yes' or 'No'. Received: '{overtime}'."

    # JobRole — required, must be a recognised IT-related role
    canonical_role = normalize_job_role(raw_row.get('JobRole', None))
    if canonical_role is None:
        raw_role = raw_row.get('JobRole', None)
        if raw_role is None or str(raw_role).strip() == '':
            return False, "JobRole is required."
        return False, (
            f"Invalid JobRole: '{str(raw_role).strip()}'. "
            "Only IT-related job roles are allowed. "
            "Please enter a valid role such as 'Software Engineer', "
            "'Data Analyst', 'DevOps Engineer', etc."
        )

    return True, None


def predict_attrition_dataframe(model_path, df):
    """
    Unified function for both bulk CSV and individual prediction.
    Takes a pandas DataFrame and returns a list of result dictionaries.
    Validation of required fields happens on raw input BEFORE any imputation.
    """
    print(f"DEBUG: Input DataFrame shape before processing: {df.shape}")
    print(f"DEBUG: Columns passed to predict_attrition_dataframe: {list(df.columns)}")

    # Step 0: Capture raw rows for per-row validation BEFORE any coercion
    raw_rows = df.to_dict(orient='records')

    # Step 1: Normalise column names
    column_mapping = {
        'age': 'Age', 'monthlyincome': 'MonthlyIncome', 'income': 'MonthlyIncome',
        'joblevel': 'JobLevel', 'overtime': 'OverTime', 'jobrole': 'JobRole',
        'businesstravel': 'BusinessTravel', 'distancefromhome': 'DistanceFromHome',
        'yearsatcompany': 'YearsAtCompany', 'totalworkingyears': 'TotalWorkingYears',
        'numcompaniesworked': 'NumCompaniesWorked', 'performancerating': 'PerformanceRating',
        'jobsatisfaction': 'JobSatisfaction', 'worklifebalance': 'WorkLifeBalance',
        'environmentsatisfaction': 'EnvironmentSatisfaction', 'stockoptionlevel': 'StockOptionLevel',
        'yearssincelastpromotion': 'YearsSinceLastPromotion',
        'yearswithcurrmanager': 'YearsWithCurrManager',
        'yearsincurrentrole': 'YearsInCurrentRole'
    }
    df = df.rename(columns={k: v for k, v in column_mapping.items() if k in df.columns})

    # Step 2: Validate required fields per row (raw, pre-imputation)
    row_errors = {}
    for idx, raw in enumerate(raw_rows):
        # Normalise keys in the raw dict so validation finds them correctly
        normalised_raw = {column_mapping.get(k.lower(), k): v for k, v in raw.items()}
        ok, msg = validate_required_fields(normalised_raw)
        if not ok:
            row_errors[idx] = msg
            print(f"DEBUG: Row {idx} Validation Error -> {msg}")

    # Step 2b: Normalise JobRole values to canonical form for valid rows
    # (e.g. "front-end developer" -> "Frontend Developer")
    if 'JobRole' in df.columns:
        def _norm_role(v):
            canonical = normalize_job_role(v)
            return canonical if canonical is not None else v
        df['JobRole'] = df['JobRole'].apply(_norm_role)


    # Step 3: Force numeric conversion (invalid strings become NaN)
    numeric_fields_to_cast = [
        'Age', 'MonthlyIncome', 'JobLevel', 'DistanceFromHome', 'YearsAtCompany',
        'TotalWorkingYears', 'NumCompaniesWorked', 'PerformanceRating', 'JobSatisfaction',
        'WorkLifeBalance', 'EnvironmentSatisfaction', 'StockOptionLevel', 'YearsSinceLastPromotion',
        'YearsWithCurrManager', 'YearsInCurrentRole', 'RelationshipSatisfaction', 'JobInvolvement',
        'PercentSalaryHike'
    ]
    for col in numeric_fields_to_cast:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')

    # Step 4: Fill OPTIONAL missing columns with realistic defaults
    # Required fields (Age, JobLevel, MonthlyIncome, BusinessTravel, OverTime, JobRole)
    # are deliberately NOT in this dict — invalid values were captured in row_errors above.
    defaults = {
        'Department': 'Research & Development',
        'MaritalStatus': 'Married',
        'JobSatisfaction': 2.0,
        'WorkLifeBalance': 2.0,
        'EnvironmentSatisfaction': 2.0,
        'RelationshipSatisfaction': 2.0,
        'TotalWorkingYears': 20.0,
        'YearsAtCompany': 9.0,
        'StockOptionLevel': 1.0,
        'JobInvolvement': 3.0,
        'PerformanceRating': 3.0,
        'NumCompaniesWorked': 1.0,
        'YearsInCurrentRole': 3.0,
        'YearsSinceLastPromotion': 1.0,
        'YearsWithCurrManager': 3.0,
        'DistanceFromHome': 5.0
    }
    for col, val in defaults.items():
        if col not in df.columns:
            df[col] = val
    df.fillna(defaults, inplace=True)

    print(f"DEBUG: DataFrame columns before feature engineering: {list(df.columns)}")

    # Step 5: Apply feature engineering
    df_engineered = FE.feature_engineering(df)
    print(f"DEBUG: DataFrame columns after feature engineering: {list(df_engineered.columns)}")

    # Step 6: Load model and extract allowed columns
    print(f"DEBUG: Loading model from: {model_path}")
    model = _load_model(model_path)
    try:
        base_pipeline        = _get_base_pipeline(model)
        preprocessor         = base_pipeline.named_steps['preprocessor']
        numeric_features     = preprocessor.transformers_[0][2]
        categorical_features = preprocessor.transformers_[1][2]
    except Exception:
        raise ValueError("Model pipeline does not contain expected 'preprocessor' step.")

    for col in numeric_features:
        if col not in df_engineered.columns:
            df_engineered[col] = np.nan
    for col in categorical_features:
        if col not in df_engineered.columns:
            df_engineered[col] = "missing"

    allowed_cols = list(numeric_features) + list(categorical_features)
    X = df_engineered[allowed_cols]
    print(f"DEBUG: Exact columns passed to model: {list(X.columns)}")

    # Step 7: Batch predict valid rows only (skip rows that failed validation)
    valid_indices = [i for i in range(len(df)) if i not in row_errors]

    probs_map = {}
    if valid_indices:
        X_valid = X.iloc[valid_indices]
        try:
            valid_probs = model.predict_proba(X_valid)[:, 1]
            for pos, orig_idx in enumerate(valid_indices):
                probs_map[orig_idx] = float(valid_probs[pos])
        except Exception as e:
            raise e

    # Step 8: Assemble results list (one entry per input row)
    results = []
    for i in range(len(df)):
        if i in row_errors:
            results.append({"error": row_errors[i]})
            continue

        prob = probs_map[i]

        if prob >= bc.AppConfig.RISK_THRESHOLD_CRITICAL:
            label = bc.AppConfig.RISK_LEVEL_CRITICAL
        elif prob >= bc.AppConfig.RISK_THRESHOLD_HIGH:
            label = bc.AppConfig.RISK_LEVEL_HIGH
        elif prob >= bc.AppConfig.RISK_THRESHOLD_MEDIUM:
            label = bc.AppConfig.RISK_LEVEL_MEDIUM
        elif prob >= bc.AppConfig.RISK_THRESHOLD_LOW:
            label = bc.AppConfig.RISK_LEVEL_LOW
        else:
            label = bc.AppConfig.RISK_LEVEL_MINIMAL

        factors = get_top_factors(model, X.iloc[[i]])
        res = {
            "risk_score": round(prob, 4),
            "risk_percentage": round(prob * 100, 2),
            "risk_label": label,
            "top_factors": factors[:3]
        }
        print(f"DEBUG: Row {i} Predicted -> Score: {res['risk_score']}, Percentage: {res['risk_percentage']}%, Label: {res['risk_label']}")
        results.append(res)

    return results


def predict_single_employee(model_path, employee_data):
    """
    Predicts attrition risk using the unified predict_attrition_dataframe function.
    """
    print(f"DEBUG: Raw individual input: {employee_data}")
    df = pd.DataFrame([employee_data])
    results = predict_attrition_dataframe(model_path, df)

    if "error" in results[0]:
        raise ValueError(results[0]["error"])

    return results[0]
