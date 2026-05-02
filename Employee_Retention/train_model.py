import joblib
import DataLoad as Data
import feature_engineering as FE
from Employee_Retention import train_evaluate_model

def main():
    print("Employee Attrition Model Training Started...")


    try:
        df = Data.load_employee_data("employee_attrition_data.csv")
        print("Data loaded successfully.")


        df = FE.feature_engineering(df)
        print("Feature engineering applied.")


        if 'Attrition' not in df.columns:
            raise ValueError("Target column 'Attrition' not found in dataset.")


        model = train_evaluate_model(df)
        print("Model training completed successfully.")

        # Save model to file
        model_filename = "employee_attrition_model.pkl"
        joblib.dump(model, model_filename)
        print(f"Model saved as '{model_filename}'")

 
        test_data = df.drop('Attrition', axis=1).iloc[:5]
        if not test_data.empty:
            predictions = model.predict_proba(test_data)[:, 1]
            print("\nSample Predictions:")
            for i, prob in enumerate(predictions):
                risk_label = 'High Risk' if prob > 0.5 else 'Low Risk'
                print(f"Employee {i+1}: {risk_label} (Probability: {prob:.2f})")

    except FileNotFoundError:
        print("Data file 'employee_attrition_data.csv' not found. Please check your file path.")
    except Exception as e:
        print(f"Error during training: {e}")

if __name__ == "__main__":
    main()
