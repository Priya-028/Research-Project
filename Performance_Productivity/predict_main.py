import os
import joblib
import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy import sparse
from tensorflow.keras.models import load_model


# =========================================
# PATH SETTINGS
# =========================================
MODEL_DIR = "Two_Model_Output"
DATA_PATH = "PredictionData/Newupload_employee_input_generated.csv"
OUTPUT_DIR = "Prediction_Result"

OUTPUT_CSV = os.path.join(OUTPUT_DIR, "prediction_results.csv")
OUTPUT_XLSX = os.path.join(OUTPUT_DIR, "prediction_results.xlsx")

GRAPH_PRODUCTIVITY_CLASS = os.path.join(OUTPUT_DIR, "productivity_class_distribution.png")
GRAPH_RISK_DISTRIBUTION = os.path.join(OUTPUT_DIR, "risk_distribution.png")
GRAPH_TOP_EMPLOYEES = os.path.join(OUTPUT_DIR, "top_10_productivity.png")


# =========================================
# REQUIRED INPUT COLUMNS
# =========================================
FEATURE_COLUMNS = [
    "role_level",
    "position",
    "age",
    "experience_years",
    "avg_task_completion",
    "attendance_rate",
    "projects_handled",
    "overtime_hours",
    "training_hours",
]

FEEDBACK_BLEND_WEIGHT = 0.35


# =========================================
# LOAD MODELS
# =========================================
def load_artifacts():
    ann_model = load_model(os.path.join(MODEL_DIR, "ann_productivity_model.h5"))
    rf_model = joblib.load(os.path.join(MODEL_DIR, "rf_risk_model.pkl"))
    preprocessor = joblib.load(os.path.join(MODEL_DIR, "shared_preprocessor.pkl"))
    risk_encoder = joblib.load(os.path.join(MODEL_DIR, "risk_label_encoder.pkl"))

    print("Models and preprocessor loaded successfully.")
    return ann_model, rf_model, preprocessor, risk_encoder


# =========================================
# INPUT VALIDATION
# =========================================
def validate_input(df: pd.DataFrame) -> pd.DataFrame:
    missing_cols = [col for col in FEATURE_COLUMNS if col not in df.columns]
    if missing_cols:
        raise ValueError(f"Missing required columns: {missing_cols}")

    prepared = df.copy()

    numeric_cols = [
        "age",
        "experience_years",
        "avg_task_completion",
        "attendance_rate",
        "projects_handled",
        "overtime_hours",
        "training_hours",
    ]

    for col in numeric_cols:
        prepared[col] = pd.to_numeric(prepared[col], errors="coerce")
        prepared[col] = prepared[col].fillna(prepared[col].median())

    for col in ["role_level", "position"]:
        prepared[col] = prepared[col].astype(str)

    return prepared


# =========================================
# DERIVED OUTPUTS
# =========================================
def get_productivity_class(x):
    if x < 50:
        return "Low"
    elif x < 75:
        return "Medium"
    else:
        return "High"


def get_recommendation(row):
    recommendations = []

    if row["attendance_rate"] <= 2:
        recommendations.append("Improve attendance")
    # Raised threshold: 35h+ is genuinely excessive; 25-34h is manageable
    if row["overtime_hours"] >= 35:
        recommendations.append("Reduce overtime")
    if row["training_hours"] < 15:
        recommendations.append("Increase training")
    # Only flag workload for very high project count OR confirmed High risk
    if row["projects_handled"] >= 20 or row["Predicted_Productivity_Risk"] == "High":
        recommendations.append("Monitor workload")

    if row["avg_task_completion"] <= 2:
        recommendations.append("Improve task completion")

    if not recommendations:
        return "Maintain current performance"

    return "; ".join(dict.fromkeys(recommendations))


# =========================================
# PREDICTION
# =========================================
def generate_predictions(input_df: pd.DataFrame):
    ann_model, rf_model, preprocessor, risk_encoder = load_artifacts()

    clean_df = validate_input(input_df)
    model_input = clean_df[FEATURE_COLUMNS]

    X_processed = preprocessor.transform(model_input)
    if sparse.issparse(X_processed):
        X_processed = X_processed.toarray()

    # Model 1: ANN regression
    predicted_productivity = ann_model.predict(X_processed, verbose=0).flatten()

    attendance_rate = pd.to_numeric(clean_df["attendance_rate"], errors="coerce").fillna(0).to_numpy()
    task_completion = pd.to_numeric(clean_df["avg_task_completion"], errors="coerce").fillna(0).to_numpy()
    overtime_hours = pd.to_numeric(clean_df["overtime_hours"], errors="coerce").fillna(0).to_numpy()
    training_hours = pd.to_numeric(clean_df["training_hours"], errors="coerce").fillna(0).to_numpy()
    projects_handled = pd.to_numeric(clean_df["projects_handled"], errors="coerce").fillna(0).to_numpy()

    attendance_factor = np.where(attendance_rate <= 2, 0.72, np.where(attendance_rate == 3, 0.86, 1.0))
    task_factor = np.where(task_completion <= 2, 0.74, np.where(task_completion == 3, 0.88, 1.0))
    # 4-tier overtime: 40h+ severe | 30-39h moderate | 20-29h mild | <20h neutral
    overtime_factor = np.where(
        overtime_hours >= 40, 0.85,
        np.where(
            overtime_hours >= 30, 0.92,
            np.where(overtime_hours >= 20, 0.96, 1.0)
        )
    )
    training_factor = np.where(training_hours < 10, 0.94, np.where(training_hours < 15, 0.98, 1.0))
    # project_factor REMOVED: the 1.03x boost for high projects directly contradicted
    # the Monitor workload recommendation for the same employees.

    calibration_factor = attendance_factor * task_factor * overtime_factor * training_factor
    calibration_factor = np.clip(calibration_factor, 0.45, 1.05)
    predicted_productivity = np.clip(predicted_productivity * calibration_factor, 0, 100)

    if "FeedBack" in clean_df.columns:
        feedback_values = pd.to_numeric(clean_df["FeedBack"], errors="coerce")
        if feedback_values.notna().any():
            fallback_series = pd.Series(predicted_productivity, index=clean_df.index)
            feedback_values = feedback_values.fillna(fallback_series)
            feedback_percentages = np.where(
                feedback_values.to_numpy() <= 5,
                feedback_values.to_numpy() * 20,
                feedback_values.to_numpy(),
            )
            feedback_percentages = np.clip(feedback_percentages, 0, 100)
            predicted_productivity = np.clip(
                (predicted_productivity * (1 - FEEDBACK_BLEND_WEIGHT)) +
                (feedback_percentages * FEEDBACK_BLEND_WEIGHT),
                0,
                100,
            )

    # Model 2: Random Forest classification
    predicted_risk_encoded = rf_model.predict(X_processed)
    predicted_risk = risk_encoder.inverse_transform(predicted_risk_encoded)

    results = input_df.copy()
    results["Predicted_Feedback_Percentage"] = np.round(predicted_productivity, 2)
    results["Productivity_Class"] = results["Predicted_Feedback_Percentage"].apply(get_productivity_class)
    results["Predicted_Productivity_Risk"] = predicted_risk
    results["Recommendations"] = results.apply(get_recommendation, axis=1)

    results["Output_Summary"] = results.apply(
        lambda row: (
            f"Employee productivity percentage is predicted to be {row['Predicted_Feedback_Percentage']:.2f}%. "
            f"Productivity class: {row['Productivity_Class']}. "
            f"Risk level: {row['Predicted_Productivity_Risk']}. "
            f"Recommended action: {row['Recommendations']}."
        ),
        axis=1
    )

    return results


# =========================================
# SAVE OUTPUTS
# =========================================
def save_outputs(results: pd.DataFrame):
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    csv_results = results.copy()
    csv_results = csv_results.rename(columns={
        "Predicted_Feedback_Percentage": "Predicted_Productivity"
    })
    csv_results.to_csv(OUTPUT_CSV, index=False)

    excel_results = results.copy()
    excel_results = excel_results.rename(columns={
        "Predicted_Feedback_Percentage": "Predicted_Productivity"
    })

    with pd.ExcelWriter(OUTPUT_XLSX, engine="openpyxl") as writer:
        excel_results.to_excel(writer, sheet_name="Predictions", index=False)

        summary = pd.DataFrame({
            "Metric": [
                "Total Employees",
                "Average Productivity Percentage",
                "Minimum Productivity Percentage",
                "Maximum Productivity Percentage",
                "Low Productivity Count",
                "Medium Productivity Count",
                "High Productivity Count",
                "Low Risk Count",
                "Medium Risk Count",
                "High Risk Count",
            ],
            "Value": [
                len(excel_results),
                round(excel_results["Predicted_Productivity"].mean(), 2),
                round(excel_results["Predicted_Productivity"].min(), 2),
                round(excel_results["Predicted_Productivity"].max(), 2),
                int((excel_results["Productivity_Class"] == "Low").sum()),
                int((excel_results["Productivity_Class"] == "Medium").sum()),
                int((excel_results["Productivity_Class"] == "High").sum()),
                int((excel_results["Predicted_Productivity_Risk"] == "Low").sum()),
                int((excel_results["Predicted_Productivity_Risk"] == "Medium").sum()),
                int((excel_results["Predicted_Productivity_Risk"] == "High").sum()),
            ]
        })
        summary.to_excel(writer, sheet_name="Summary", index=False)

    print(f"CSV saved to: {OUTPUT_CSV}")
    print(f"Excel saved to: {OUTPUT_XLSX}")


# =========================================
# GRAPHS
# =========================================
def generate_graphs(results: pd.DataFrame):
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 1. Productivity class distribution
    class_counts = results["Productivity_Class"].value_counts().reindex(["Low", "Medium", "High"], fill_value=0)

    plt.figure(figsize=(8, 5))
    plt.bar(class_counts.index, class_counts.values)
    plt.xlabel("Productivity Class")
    plt.ylabel("Number of Employees")
    plt.title("Productivity Class Distribution")
    plt.tight_layout()
    plt.savefig(GRAPH_PRODUCTIVITY_CLASS)
    plt.close()

    # 2. Risk distribution
    risk_counts = results["Predicted_Productivity_Risk"].value_counts().reindex(["Low", "Medium", "High"], fill_value=0)

    plt.figure(figsize=(8, 5))
    plt.bar(risk_counts.index, risk_counts.values)
    plt.xlabel("Productivity Risk")
    plt.ylabel("Number of Employees")
    plt.title("Predicted Productivity Risk Distribution")
    plt.tight_layout()
    plt.savefig(GRAPH_RISK_DISTRIBUTION)
    plt.close()

    # 3. Top 10 productivity employees
    plot_df = results.copy()

    if "Employee_ID" not in plot_df.columns:
        plot_df["Employee_ID"] = ["Emp_" + str(i + 1) for i in range(len(plot_df))]

    pred_col = "Predicted_Productivity" if "Predicted_Productivity" in plot_df.columns else "Predicted_Feedback_Percentage"
    top10 = plot_df.sort_values(pred_col, ascending=False).head(10)

    plt.figure(figsize=(12, 6))
    plt.bar(top10["Employee_ID"].astype(str), top10[pred_col])
    plt.xlabel("Employee")
    plt.ylabel("Predicted Productivity Percentage")
    plt.title("Top 10 Employees by Predicted Productivity")
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.savefig(GRAPH_TOP_EMPLOYEES)
    plt.close()

    print(f"Graph saved: {GRAPH_PRODUCTIVITY_CLASS}")
    print(f"Graph saved: {GRAPH_RISK_DISTRIBUTION}")
    print(f"Graph saved: {GRAPH_TOP_EMPLOYEES}")


# =========================================
# CONSOLE SUMMARY
# =========================================
def print_summary(results: pd.DataFrame):
    print("\n" + "=" * 90)
    print("PREDICTION SUMMARY")
    print("=" * 90)

    print(f"Total Employees Processed: {len(results)}")
    print(f"Average Predicted Feedback: {results['Predicted_Feedback_Percentage'].mean():.2f}%")

    print("\nProductivity Class Distribution:")
    for cls, count in results["Productivity_Class"].value_counts().items():
        print(f"  {cls}: {count} ({count / len(results) * 100:.1f}%)")

    print("\nProductivity Risk Distribution:")
    for risk, count in results["Predicted_Productivity_Risk"].value_counts().items():
        print(f"  {risk}: {count} ({count / len(results) * 100:.1f}%)")

    print("\nSample Results:")
    display_cols = [
        "role_level",
        "position",
        "Predicted_Feedback_Percentage",
        "Productivity_Class",
        "Predicted_Productivity_Risk",
        "Recommendations",
    ]

    available_cols = [col for col in display_cols if col in results.columns]
    print(results[available_cols].head(10).to_string(index=False))

    print("\nDetailed First Employee Output:")
    print(results.iloc[0]["Output_Summary"])


# =========================================
# MAIN
# =========================================
def main():
    print("Loading new employee data...")
    input_df = pd.read_csv(DATA_PATH)
    print(f"Data loaded from: {DATA_PATH}")
    print(f"Shape: {input_df.shape}")

    results = generate_predictions(input_df)
    save_outputs(results)
    generate_graphs(results)
    print_summary(results)

    return results


if __name__ == "__main__":
    main()
