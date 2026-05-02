import pandas as pd

def load_employee_data(filepath):

    df = pd.read_csv(filepath)
    df.drop(['EmployeeID', 'Over18', 'StandardHours'], axis=1, inplace=True, errors='ignore')

    # Convert target variable
    if 'Attrition' in df.columns:
        # Support Yes/No, 1/0, and True/False
        mapping = {'Yes': 1, 'No': 0, '1': 1, '0': 0, 1: 1, 0: 0, True: 1, False: 0}
        df['Attrition'] = df['Attrition'].map(mapping)
        # Drop rows where mapping failed (NaN) to prevent training errors
        df.dropna(subset=['Attrition'], inplace=True)
        df['Attrition'] = df['Attrition'].astype(int)


    return df