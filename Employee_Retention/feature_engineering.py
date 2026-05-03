import math
import base_config as bc

def feature_engineering(df):
    df = df.copy()

    if 'MonthlyIncome' in df.columns and 'JobLevel' in df.columns:
        def _global_ratio(row):
            try:
                level = int(row['JobLevel'])
            except (ValueError, TypeError):
                level = 1
            median = bc.AppConfig.MEDIAN_INCOME_BY_LEVEL.get(level, 6500.0)
            return row['MonthlyIncome'] / median if median > 0 else 1.0
        df['IncomeRelativeToLevel'] = df.apply(_global_ratio, axis=1)

        # IncomePressure: inverse of income relative to level
        df['IncomePressure'] = 1.0 / df['IncomeRelativeToLevel'].clip(lower=0.1)

    if 'TotalWorkingYears' in df.columns and 'JobLevel' in df.columns:
        df['SeniorityScore'] = df['JobLevel'] + df['TotalWorkingYears']
        
    if 'Age' in df.columns:
        def _career_stage(age):
            if age < 27:   return 1
            elif age < 35: return 2
            elif age < 45: return 3
            else:          return 4
        df['CareerStage'] = df['Age'].apply(_career_stage)

    if 'BusinessTravel' in df.columns:
        travel_mapping = {'Non-Travel': 0, 'Travel_Rarely': 1, 'Travel_Frequently': 2}
        df['BusinessTravelRisk'] = df['BusinessTravel'].map(travel_mapping).fillna(0).astype(int)

    if 'OverTime' in df.columns:
        df['OverTimeNumeric'] = df['OverTime'].map({'No': 0, 'Yes': 1}).fillna(0).astype(int)

    if 'OverTimeNumeric' in df.columns and 'BusinessTravelRisk' in df.columns:
        df['WorkStressScore'] = df['OverTimeNumeric'] + df['BusinessTravelRisk']

    satisfaction_cols = ['EnvironmentSatisfaction', 'JobSatisfaction', 'RelationshipSatisfaction', 'JobInvolvement']
    available_sat = [c for c in satisfaction_cols if c in df.columns]
    if available_sat:
        df['TotalSatisfaction'] = df[available_sat].mean(axis=1)

    return df

def calibrate_probability(prob, employee_data):
    return prob
