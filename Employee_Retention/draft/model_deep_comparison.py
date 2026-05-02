import joblib
import pandas as pd
import numpy as np
import os

def compare_models():
    model_path_v26 = r'c:\Users\User\Desktop\HRReactWeb_App - Copy\HRReactWeb_App - Copy\HRReactWeb_AppV26\Employee_Retention\employee_attrition_model.pkl'
    model_path_old = r'c:\Users\User\Desktop\MyFInalProj\MyFInalProj\employee_attrition_model.pkl'
    
    results = []

    for path, label in [(model_path_v26, "v26_Current"), (model_path_old, "Old_MyFinalProj")]:
        if not os.path.exists(path):
            print(f"Error: {label} not found at {path}")
            continue
        
        try:
            model = joblib.load(path)
            preprocessor = model.named_steps['preprocessor']
            
            # Numeric features
            num_feats = list(preprocessor.transformers_[0][2])
            
            # Categorical features (One-hot encoded)
            ohe = preprocessor.named_transformers_['cat'].named_steps['onehot']
            cat_feats_orig = list(preprocessor.transformers_[1][2])
            cat_feats_new = list(ohe.get_feature_names_out(cat_feats_orig))
            
            feature_names = num_feats + cat_feats_new
            
            # Classifier
            classifier = model.named_steps['classifier']
            importances = classifier.feature_importances_
            
            # Combine
            feat_imp = pd.Series(importances, index=feature_names).sort_values(ascending=False).head(10)
            
            results.append({
                "Label": label,
                "Total_Features": len(feature_names),
                "Top_10_Features": feat_imp.to_dict()
            })
            
        except Exception as e:
            print(f"Error processing {label}: {e}")

    # Output comparison summary
    print("\n=== MODEL COMPARISON SUMMARY ===")
    for result in results:
        print(f"\nModel: {result['Label']}")
        print(f"Computed Features: {result['Total_Features']}")
        print("Top 10 Drivers:")
        for feat, score in result['Top_10_Features'].items():
            print(f"  - {feat}: {score:.4f}")

if __name__ == "__main__":
    compare_models()
