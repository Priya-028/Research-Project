import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from xgboost import XGBClassifier
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, roc_curve, auc, precision_recall_curve
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
import joblib
import matplotlib.pyplot as plt
import seaborn as sns
import DataLoad as Data
import feature_engineering as FE
import os
import shap

# Explicit Feature Set from Dashboard
EXPLICIT_NUMERIC_FEATURES = [
    'Age', 'MonthlyIncome', 'JobLevel', 'JobSatisfaction', 
    'WorkLifeBalance', 'EnvironmentSatisfaction', 'StockOptionLevel', 
    'YearsAtCompany', 'DistanceFromHome', 'IncomeRelativeToLevel',
    'YearsInCurrentRole', 'YearsSinceLastPromotion', 'YearsWithCurrManager',
    'PercentSalaryHike', 'NumCompaniesWorked', 'TotalWorkingYears',
    'JobInvolvement', 'PerformanceRating', 'PromotionRatio', 'ManagerStabilityRatio',
    'TotalSatisfaction'
]

EXPLICIT_CATEGORICAL_FEATURES = [
    'BusinessTravel', 'JobRole', 'OverTime', 'Department', 'MaritalStatus'
]

def get_features(df):
    """Dynamically detects only the explicit features requested by the user + engineered ones."""
    numeric_features = [col for col in EXPLICIT_NUMERIC_FEATURES if col in df.columns]
    categorical_features = [col for col in EXPLICIT_CATEGORICAL_FEATURES if col in df.columns]
    return numeric_features, categorical_features

def build_pipeline(numeric_features, categorical_features, scale_pos_weight=1.0):
    numeric_transformer = Pipeline(steps=[
        ('imputer', SimpleImputer(strategy='median')),
        ('scaler', StandardScaler())])
    
    categorical_transformer = Pipeline(steps=[
        ('imputer', SimpleImputer(strategy='constant', fill_value='missing')),
        ('onehot', OneHotEncoder(handle_unknown='ignore'))])
    
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', numeric_transformer, numeric_features),
            ('cat', categorical_transformer, categorical_features)])
    
    # HYBRID ENSEMBLE: Combining RF and XGBoost
    rf = RandomForestClassifier(
        n_estimators=100, 
        max_depth=12,
        class_weight='balanced', 
        random_state=42
    )
    
    xgb = XGBClassifier(
        n_estimators=150,
        scale_pos_weight=scale_pos_weight, 
        use_label_encoder=False, 
        eval_metric='logloss',
        learning_rate=0.08,
        max_depth=5,
        random_state=42
    )

    voting_clf = VotingClassifier(
        estimators=[
            ('rf', rf),
            ('xgb', xgb)
        ],
        voting='soft',
        weights=[1.0, 1.2] # Slightly favor XGBoost for better minority class recall
    )
    
    pipeline = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('classifier', voting_clf)])
    
    return pipeline

def get_top_factors(model, input_df):
    """Explains why a specific prediction was made using SHAP values."""
    try:
        # Extract preprocessor and feature names
        preprocessor = model.named_steps['preprocessor']
        numeric_features = list(preprocessor.transformers_[0][2])
        categorical_features = list(preprocessor.transformers_[1][2])
        
        ohe = preprocessor.named_transformers_['cat'].named_steps['onehot']
        cat_feature_names = list(ohe.get_feature_names_out(categorical_features))
        all_feature_names = numeric_features + cat_feature_names

        # Extract XGBoost model from VotingClassifier
        voting_clf = model.named_steps['classifier']
        xgb_model = voting_clf.named_estimators_['xgb']
        
        # Get the transformed data for this specific row
        transformed_row = preprocessor.transform(input_df)
        if hasattr(transformed_row, 'toarray'):
            transformed_row = transformed_row.toarray()
            
        # Initialize SHAP TreeExplainer
        explainer = shap.TreeExplainer(xgb_model)
        shap_values = explainer.shap_values(transformed_row)
        
        # Handle cases where shap_values might be a list (multi-class) or array
        # For binary XGBoost, it usually returns a 1D or 2D array
        if isinstance(shap_values, list):
            # For soft-voting/probabilistic outputs we take the positive class impact
            impact_scores = shap_values[1][0] if len(shap_values) > 1 else shap_values[0]
        else:
            impact_scores = shap_values[0] if len(shap_values.shape) > 1 else shap_values

        # AGGREGATION: Map OHE features back to original categorical names
        feature_impacts = {}
        
        # 1. Map Numeric features directly
        for i, name in enumerate(numeric_features):
            feature_impacts[name] = float(impact_scores[i])
            
        # 2. Aggregating Categorical (OHE) features
        # all_feature_names[len(numeric_features):] contains the OHE names
        offset = len(numeric_features)
        for i, full_name in enumerate(cat_feature_names):
            # OHE names are usually 'FeatureName_Category'
            # We find which base categorical feature this belongs to
            base_feature = "Unknown"
            for cat_feat in categorical_features:
                if full_name.startswith(cat_feat):
                    base_feature = cat_feat
                    break
            
            val = float(impact_scores[offset + i])
            feature_impacts[base_feature] = feature_impacts.get(base_feature, 0) + val

        # Convert to list of dicts for sorting
        factors = []
        import re
        for name, impact in feature_impacts.items():
            if abs(impact) > 0.001: # Filter out noise
                # Human-friendly formatting: CamelCase to Space Separated
                display_name = re.sub(r'(?<!^)(?=[A-Z])', ' ', name).replace('_', ' ')
                factors.append({'feature': display_name, 'impact': impact})
        
        # Sort by absolute impact and return top 3
        # We look for features that INCREASE risk (positive impact for attrition)
        top_factors = sorted(factors, key=lambda x: x['impact'], reverse=True)[:3]
        
        # Fallback to absolute if no positive drivers found (prevent empty results)
        if not top_factors:
             top_factors = sorted(factors, key=lambda x: abs(x['impact']), reverse=True)[:3]

        return [f['feature'] for f in top_factors]
    except Exception as e:
        print(f"Error extracting factors via SHAP: {e}")
        return ["Feature Analysis Unavailable"]

def plot_evaluation_metrics(y_test, y_proba, feature_names):
    """Generates professional accuracy plots for the user."""
    plt.figure(figsize=(15, 5))

    # 1. ROC Curve
    plt.subplot(1, 3, 1)
    fpr, tpr, _ = roc_curve(y_test, y_proba)
    roc_auc = auc(fpr, tpr)
    plt.plot(fpr, tpr, color='darkorange', lw=2, label=f'ROC (area = {roc_auc:.2f})')
    plt.plot([0, 1], [0, 1], color='navy', lw=2, linestyle='--')
    plt.title('ROC Curve')
    plt.xlabel('False Positive Rate')
    plt.ylabel('True Positive Rate')
    plt.legend(loc="lower right")

    # 2. Precision-Recall Curve
    plt.subplot(1, 3, 2)
    precision, recall, _ = precision_recall_curve(y_test, y_proba)
    plt.plot(recall, precision, color='blue', lw=2)
    plt.title('Precision-Recall Curve')
    plt.xlabel('Recall')
    plt.ylabel('Precision')

    # 3. Ensemble Weighting Info
    plt.subplot(1, 3, 3)
    labels = ['Random Forest', 'XGBoost']
    weights = [1.2, 1.0]
    plt.bar(labels, weights, color=['#4f46e5', '#10b981'])
    plt.title('Ensemble Weighting (Final)')
    plt.ylabel('Voting Weight')
    
    plt.tight_layout()
    metrics_path = os.path.join(os.path.dirname(__file__), 'evaluation_metrics.png')
    plt.savefig(metrics_path)
    print(f"\n[SUCCESS] Evaluation plots saved to '{metrics_path}'")

def train_evaluate_model(df):
    numeric_features, categorical_features = get_features(df)
    
    X = df[numeric_features + categorical_features]
    y = df['Attrition']
    
    # Target Class 1 (Yes) is usually the minority
    # count(0)/count(1) is the standard balance. We use a slightly more aggressive weight to boost recall.
    spw = (len(y[y==0]) / len(y[y==1])) * 1.5 
    print(f"Applying Aggressive Class Balancing (spw={spw:.2f})")
    
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y)
    
    pipeline = build_pipeline(numeric_features, categorical_features, scale_pos_weight=spw)
    
    print("\nTraining Hybrid Ensemble Model (RF+XGB) with Expanded Feature Set...")
    pipeline.fit(X_train, y_train)
    
    y_pred = pipeline.predict(X_test)
    y_proba = pipeline.predict_proba(X_test)[:, 1]
    
    print("\nUpdated Hybrid Model Classification Report:")
    report = classification_report(y_test, y_pred)
    print(report)
    
    # Log to metrics file
    metrics_log_path = os.path.join(os.path.dirname(__file__), 'training_metrics.txt')
    with open(metrics_log_path, 'w') as f:
        f.write(f"Training Date: {pd.Timestamp.now()}\n")
        f.write(f"Features Used: {len(numeric_features + categorical_features)}\n")
        f.write(report)
    
    # Extract Feature Names
    ohe = (pipeline.named_steps['preprocessor']
           .named_transformers_['cat']
           .named_steps['onehot'])
    cat_feature_names = list(ohe.get_feature_names_out(categorical_features))
    feature_names = list(numeric_features) + cat_feature_names
    
    plot_evaluation_metrics(y_test, y_proba, feature_names)
    
    return pipeline

if __name__ == "__main__":
    try:
        # 1. Load Data
        data_path = os.path.join(os.path.dirname(__file__), "employee_attrition_data.csv")
        df = Data.load_employee_data(data_path)
        
        # 2. Hardened Feature Engineering
        df = FE.feature_engineering(df)
        
        if 'Attrition' not in df.columns:
            raise ValueError("Target column 'Attrition' not found")

        # 3. Proper Hybrid Training
        model = train_evaluate_model(df)
        
        # 4. Save Hybrid Pipeline
        model_save_path = os.path.join(os.path.dirname(__file__), 'employee_attrition_model.pkl')
        joblib.dump(model, model_save_path)
        print(f"\n[COMPLETE] Model upgraded and saved as '{model_save_path}'")

        # 5. Verification with "Why" (Explainability Test)
        test_case = pd.DataFrame([{
            'Age': 25,
            'MonthlyIncome': 2500,
            'JobRole': 'Sales Representative', 
            'JobLevel': 1,
            'BusinessTravel': 'Travel_Frequently',
            'OverTime': 'Yes',
            'JobSatisfaction': 1, 
            'WorkLifeBalance': 1, 
            'EnvironmentSatisfaction': 1, 
            'StockOptionLevel': 0,
            'YearsAtCompany': 1,
            'DistanceFromHome': 45,
            'YearsSinceLastPromotion': 0,
            'YearsWithCurrManager': 0,
            'YearsInCurrentRole': 0,
            'PercentSalaryHike': 11,
            'NumCompaniesWorked': 5,
            'TotalWorkingYears': 2,
            'JobInvolvement': 1,
            'PerformanceRating': 3,
            'MaritalStatus': 'Single',
            'Department': 'Sales',
            'RelationshipSatisfaction': 1,
            'JobSatisfaction': 1,
            'WorkLifeBalance': 1,
            'EnvironmentSatisfaction': 1
        }])
        test_case = FE.feature_engineering(test_case)
        numeric_features, categorical_features = get_features(df)
        prob = model.predict_proba(test_case[numeric_features + categorical_features])[0, 1]
        factors = get_top_factors(model, test_case[numeric_features + categorical_features])
        
        print(f"\nUPGRADED VERIFICATION (High-Risk Junior Sales):")
        print(f"Risk Score: {prob:.2%}")
        print(f"Top Risk Factors: {', '.join(factors)}")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error during training: {e}")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error during training: {e}")