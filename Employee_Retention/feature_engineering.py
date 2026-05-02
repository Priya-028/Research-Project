

import base_config as bc

def feature_engineering(df):
    df = df.copy()

    # 1. Career Stagnation / Speed
    if 'YearsAtCompany' in df.columns and 'YearsSinceLastPromotion' in df.columns:
        # Avoid division by zero
        df['PromotionRatio'] = df['YearsSinceLastPromotion'] / (df['YearsAtCompany'] + 1)
        df['PromotionSpeed'] = df['YearsSinceLastPromotion'] / (df['YearsInCurrentRole'] + 1) if 'YearsInCurrentRole' in df.columns else df['PromotionRatio']

    # 2. Management Stability
    if 'YearsWithCurrManager' in df.columns and 'YearsAtCompany' in df.columns:
        df['ManagerStabilityRatio'] = df['YearsWithCurrManager'] / (df['YearsAtCompany'] + 1)

    # 3. Income Relative to Performance
    if 'MonthlyIncome' in df.columns and 'JobLevel' in df.columns:
        if len(df) > 1:
            # Batch mode: Calculate relative to this specific batch
            median_income_by_level = df.groupby('JobLevel')['MonthlyIncome'].transform('median')
            df['IncomeRelativeToLevel'] = df['MonthlyIncome'] / median_income_by_level
        else:
            # Single Predictor mode: Calculate relative to global dataset medians
            job_level = int(df['JobLevel'].iloc[0])
            global_median = bc.AppConfig.MEDIAN_INCOME_BY_LEVEL.get(job_level, 6500.0)
            df['IncomeRelativeToLevel'] = df['MonthlyIncome'] / global_median

    # 4. Composite Satisfaction
    satisfaction_cols = ['EnvironmentSatisfaction', 'JobSatisfaction', 'RelationshipSatisfaction', 'JobInvolvement']
    available_sat = [c for c in satisfaction_cols if c in df.columns]
    if available_sat:
        df['TotalSatisfaction'] = df[available_sat].mean(axis=1)

    return df
