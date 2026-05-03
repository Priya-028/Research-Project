from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import pandas as pd
import numpy as np
import joblib
import os
from werkzeug.utils import secure_filename
import logging
from datetime import datetime
import traceback
import sys
import math
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

KERAS_LOAD_MODEL = None
TENSORFLOW_IMPORT_ERROR = None
try:
    from tensorflow.keras.models import load_model as _keras_load_model
    KERAS_LOAD_MODEL = _keras_load_model
except Exception as e:
    TENSORFLOW_IMPORT_ERROR = e

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

ANN_MODEL_CANDIDATE_PATHS = [
    os.path.join(BASE_DIR, "Two_Model_Output", "ann_productivity_model.h5"),
    os.path.join(BASE_DIR, "ann_productivity_model.h5"),
]

RF_MODEL_CANDIDATE_PATHS = [
    os.path.join(BASE_DIR, "Two_Model_Output", "rf_risk_model.pkl"),
    os.path.join(BASE_DIR, "rf_risk_model.pkl"),
]

PREPROCESSOR_CANDIDATE_PATHS = [
    os.path.join(BASE_DIR, "Two_Model_Output", "shared_preprocessor.pkl"),
    os.path.join(BASE_DIR, "shared_preprocessor.pkl"),
]

RISK_ENCODER_CANDIDATE_PATHS = [
    os.path.join(BASE_DIR, "Two_Model_Output", "risk_label_encoder.pkl"),
    os.path.join(BASE_DIR, "risk_label_encoder.pkl"),
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("api.log")
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

app.config["UPLOAD_FOLDER"] = "uploads"
app.config["RESULT_FOLDER"] = "results"
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024
app.config["ALLOWED_EXTENSIONS"] = {"csv"}

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
os.makedirs(app.config["RESULT_FOLDER"], exist_ok=True)

ann_model = None
rf_model = None
preprocessor = None
risk_encoder = None

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

NUMERIC_COLUMNS = [
    "age",
    "experience_years",
    "avg_task_completion",
    "attendance_rate",
    "projects_handled",
    "overtime_hours",
    "training_hours",
]

CATEGORICAL_COLUMNS = ["role_level", "position"]
FEEDBACK_BLEND_WEIGHT = 0.35


def resolve_existing_path(candidates):
    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    raise FileNotFoundError(f"Artifact not found. Checked: {', '.join(candidates)}")


def load_ann_model(model_path=None):
    if KERAS_LOAD_MODEL is None:
        raise RuntimeError(
            "TensorFlow/Keras is not available. "
            f"Import error: {TENSORFLOW_IMPORT_ERROR!r}"
        )
    resolved_path = resolve_existing_path([model_path] if model_path else ANN_MODEL_CANDIDATE_PATHS)
    model = KERAS_LOAD_MODEL(resolved_path, compile=False)
    logger.info(f"ANN model loaded from {resolved_path}")
    return model


def load_rf_model(model_path=None):
    resolved_path = resolve_existing_path([model_path] if model_path else RF_MODEL_CANDIDATE_PATHS)
    model = joblib.load(resolved_path)
    logger.info(f"RF model loaded from {resolved_path}")
    return model


def load_preprocessor(preprocessor_path=None):
    resolved_path = resolve_existing_path([preprocessor_path] if preprocessor_path else PREPROCESSOR_CANDIDATE_PATHS)
    obj = joblib.load(resolved_path)
    logger.info(f"Preprocessor loaded from {resolved_path}")
    return obj


def load_risk_encoder(encoder_path=None):
    resolved_path = resolve_existing_path([encoder_path] if encoder_path else RISK_ENCODER_CANDIDATE_PATHS)
    obj = joblib.load(resolved_path)
    logger.info(f"Risk encoder loaded from {resolved_path}")
    return obj


def load_artifacts():
    global ann_model, rf_model, preprocessor, risk_encoder
    try:
        ann_model = load_ann_model()
        rf_model = load_rf_model()
        preprocessor = load_preprocessor()
        risk_encoder = load_risk_encoder()
        logger.info("All prediction artifacts loaded successfully.")
        return True
    except Exception as e:
        logger.error(f"Failed to load artifacts: {e}")
        logger.error(traceback.format_exc())
        return False


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in app.config["ALLOWED_EXTENSIONS"]


def validate_input_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    missing_columns = [col for col in FEATURE_COLUMNS if col not in df.columns]
    if missing_columns:
        raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")

    clean_df = df.copy()

    for col in NUMERIC_COLUMNS:
        clean_df[col] = pd.to_numeric(clean_df[col], errors="coerce")
        clean_df[col] = clean_df[col].fillna(clean_df[col].median())

    for col in CATEGORICAL_COLUMNS:
        clean_df[col] = clean_df[col].astype(str).fillna("Unknown")

    return clean_df


def get_productivity_class(x):
    if x < 50:
        return "Low"
    elif x < 75:
        return "Medium"
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
    # (avoids contradicting the productivity score boost for moderate project counts)
    if row["projects_handled"] >= 20 or row["Predicted_Productivity_Risk"] == "High":
        recommendations.append("Monitor workload")
    if row["avg_task_completion"] <= 2:
        recommendations.append("Improve task completion")

    if not recommendations:
        return "Maintain current performance"

    return "; ".join(dict.fromkeys(recommendations))


def predict_productivity_percentage(input_data: pd.DataFrame):
    global ann_model, preprocessor

    X_input = input_data[FEATURE_COLUMNS]
    X_processed = preprocessor.transform(X_input)

    raw_predictions = ann_model.predict(X_processed, verbose=0)
    predictions = np.asarray(raw_predictions).reshape(-1)
    predictions = np.nan_to_num(predictions, nan=0.0)

    attendance_rate = pd.to_numeric(input_data["attendance_rate"], errors="coerce").fillna(0).to_numpy()
    task_completion = pd.to_numeric(input_data["avg_task_completion"], errors="coerce").fillna(0).to_numpy()
    overtime_hours = pd.to_numeric(input_data["overtime_hours"], errors="coerce").fillna(0).to_numpy()
    training_hours = pd.to_numeric(input_data["training_hours"], errors="coerce").fillna(0).to_numpy()
    projects_handled = pd.to_numeric(input_data["projects_handled"], errors="coerce").fillna(0).to_numpy()

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
    # The ANN already captures project-productivity correlation from training data.

    calibration_factor = attendance_factor * task_factor * overtime_factor * training_factor
    calibration_factor = np.clip(calibration_factor, 0.45, 1.05)
    predictions = np.clip(predictions * calibration_factor, 0, 100)

    if "FeedBack" in input_data.columns:
        feedback_values = pd.to_numeric(input_data["FeedBack"], errors="coerce")
        if feedback_values.notna().any():
            fallback_series = pd.Series(predictions, index=input_data.index)
            feedback_values = feedback_values.fillna(fallback_series)
            feedback_percentages = np.where(
                feedback_values.to_numpy() <= 5,
                feedback_values.to_numpy() * 20,
                feedback_values.to_numpy(),
            )
            feedback_percentages = np.clip(feedback_percentages, 0, 100)
            predictions = np.clip(
                (predictions * (1 - FEEDBACK_BLEND_WEIGHT)) +
                (feedback_percentages * FEEDBACK_BLEND_WEIGHT),
                0,
                100,
            )

    return predictions


def predict_productivity_risk(input_data: pd.DataFrame):
    global rf_model, preprocessor, risk_encoder

    X_input = input_data[FEATURE_COLUMNS]
    X_processed = preprocessor.transform(X_input)

    predicted_encoded = rf_model.predict(X_processed)
    predicted_risk = risk_encoder.inverse_transform(predicted_encoded)

    return predicted_risk


def build_results(df: pd.DataFrame, productivity_predictions, risk_predictions):
    results = df.copy()

    results["Predicted_Feedback_Percentage"] = np.round(productivity_predictions, 2)
    results["Productivity_Class"] = results["Predicted_Feedback_Percentage"].apply(get_productivity_class)
    results["Predicted_Productivity_Risk"] = risk_predictions
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


def resolve_employee_id_column(df: pd.DataFrame) -> pd.Series:
    if "Employee_ID" in df.columns:
        return df["Employee_ID"].astype(str)
    if "employee_id" in df.columns:
        return df["employee_id"].astype(str)
    return pd.Series([f"EMP_{idx + 1}" for idx in range(len(df))], index=df.index)


def generate_prediction_graphs(results: pd.DataFrame, result_stem: str) -> dict:
    graph_filenames = {
        "employee_productivity_comparison": f"{result_stem}_employee_productivity_comparison.png",
        "top_10_productivity": f"{result_stem}_top_10_productivity.png",
        "productivity_risk_distribution": f"{result_stem}_risk_distribution.png",
    }

    output_paths = {
        key: os.path.join(app.config["RESULT_FOLDER"], filename)
        for key, filename in graph_filenames.items()
    }

    plot_df = results.copy()
    plot_df["_Employee_ID"] = resolve_employee_id_column(plot_df)
    plot_df["Predicted_Feedback_Percentage"] = pd.to_numeric(
        plot_df["Predicted_Feedback_Percentage"], errors="coerce"
    ).fillna(0)

    # 1) Employee Productivity Comparison
    pred_col = "Predicted_Productivity" if "Predicted_Productivity" in plot_df.columns else "Predicted_Feedback_Percentage"
    
    fig_width = max(12, min(24, len(plot_df) * 0.38))
    plt.figure(figsize=(fig_width, 6))
    plt.bar(
        plot_df["_Employee_ID"],
        plot_df[pred_col],
        color="#5b7cfa",
    )
    plt.xlabel("Employee_ID")
    plt.ylabel("Predicted Productivity (%)")
    plt.title("Employee Productivity Comparison")
    plt.xticks(rotation=70, ha="right", fontsize=8)
    plt.tight_layout()
    plt.savefig(output_paths["employee_productivity_comparison"], dpi=160, bbox_inches="tight")
    plt.close()

    # 2) Top 10 Employees by Predicted Productivity
    top10_df = plot_df.sort_values(pred_col, ascending=False).head(10)
    plt.figure(figsize=(12, 6))
    plt.bar(
        top10_df["_Employee_ID"],
        top10_df[pred_col],
        color="#0ea5a8",
    )
    plt.xlabel("Employee_ID")
    plt.ylabel("Predicted Productivity (%)")
    plt.title("Top 10 Employees by Predicted Productivity")
    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()
    plt.savefig(output_paths["top_10_productivity"], dpi=160, bbox_inches="tight")
    plt.close()

    # 3) Employee Productivity Risk Distribution
    risk_normalized = (
        plot_df["Predicted_Productivity_Risk"]
        .astype(str)
        .str.strip()
        .str.lower()
        .apply(
            lambda value: "Low"
            if "low" in value
            else "Medium"
            if ("medium" in value or "moderate" in value)
            else "High"
            if "high" in value
            else "Unknown"
        )
    )
    risk_counts = risk_normalized.value_counts().to_dict()
    risk_categories = ["Low", "Medium", "High"]
    risk_values = [int(risk_counts.get(category, 0)) for category in risk_categories]

    plt.figure(figsize=(8, 5))
    plt.bar(risk_categories, risk_values, color=["#22c55e", "#f59e0b", "#ef4444"])
    plt.xlabel("Predicted_Productivity_Risk")
    plt.ylabel("Employee Count")
    plt.title("Employee Productivity Risk Distribution")
    plt.tight_layout()
    plt.savefig(output_paths["productivity_risk_distribution"], dpi=160, bbox_inches="tight")
    plt.close()

    return graph_filenames


def save_prediction_excel(results: pd.DataFrame, excel_path: str):
    excel_results = results.copy()
    excel_results = excel_results.rename(columns={
        "Predicted_Feedback_Percentage": "Predicted_Productivity"
    })

    risk_counts = excel_results["Predicted_Productivity_Risk"].value_counts().to_dict()
    class_counts = excel_results["Productivity_Class"].value_counts().to_dict()

    summary_df = pd.DataFrame(
        {
            "Metric": [
                "Total Employees",
                "Average Productivity Percentage",
                "Minimum Productivity Percentage",
                "Maximum Productivity Percentage",
                "Low Risk Count",
                "Medium Risk Count",
                "High Risk Count",
                "Low Productivity Class Count",
                "Medium Productivity Class Count",
                "High Productivity Class Count",
            ],
            "Value": [
                int(len(excel_results)),
                float(excel_results["Predicted_Productivity"].mean()),
                float(excel_results["Predicted_Productivity"].min()),
                float(excel_results["Predicted_Productivity"].max()),
                int(risk_counts.get("Low", 0)),
                int(risk_counts.get("Medium", 0)),
                int(risk_counts.get("High", 0)),
                int(class_counts.get("Low", 0)),
                int(class_counts.get("Medium", 0)),
                int(class_counts.get("High", 0)),
            ],
        }
    )

    top10_df = excel_results.sort_values("Predicted_Productivity", ascending=False).head(10).copy()
    if "Employee_ID" not in top10_df.columns and "employee_id" in top10_df.columns:
        top10_df.rename(columns={"employee_id": "Employee_ID"}, inplace=True)

    with pd.ExcelWriter(excel_path) as writer:
        excel_results.to_excel(writer, sheet_name="Predictions", index=False)
        summary_df.to_excel(writer, sheet_name="Summary", index=False)
        top10_df.to_excel(writer, sheet_name="Top10", index=False)


def convert_numpy_types(record_dict):
    for key, value in record_dict.items():
        if isinstance(value, (np.integer,)):
            record_dict[key] = int(value)
        elif isinstance(value, (np.floating,)):
            record_dict[key] = float(value)
    return record_dict


@app.route("/api/test", methods=["GET"])
def test():
    return jsonify({
        "status": "success",
        "message": "Employee Productivity API is running (Two-Model Version)",
        "models_loaded": all(x is not None for x in [ann_model, rf_model, preprocessor, risk_encoder]),
        "timestamp": datetime.now().isoformat()
    })


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "models_loaded": all(x is not None for x in [ann_model, rf_model, preprocessor, risk_encoder]),
        "timestamp": datetime.now().isoformat()
    })


@app.route("/api/model/status", methods=["GET"])
def model_status():
    return jsonify({
        "models_loaded": all(x is not None for x in [ann_model, rf_model, preprocessor, risk_encoder]),
        "model_1": "ANN Regression",
        "model_2": "Random Forest Classification",
        "main_output": "Predicted_Feedback_Percentage",
        "secondary_output": "Predicted_Productivity_Risk",
        "preprocessor_type": str(type(preprocessor)) if preprocessor else None
    })


@app.route("/api/predict/single", methods=["POST", "OPTIONS"])
def predict_single():
    if request.method == "OPTIONS":
        return "", 200

    if not all(x is not None for x in [ann_model, rf_model, preprocessor, risk_encoder]):
        if not load_artifacts():
            return jsonify({"success": False, "error": "Models not loaded. Check server logs."}), 500

    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "No data provided"}), 400

        employee_df = pd.DataFrame([{
            "role_level": data.get("role_level", "Junior"),
            "position": data.get("position", "Data Analyst"),
            "age": float(data.get("age", 30)),
            "experience_years": float(data.get("experience_years", 5)),
            "avg_task_completion": float(data.get("avg_task_completion", 3)),
            "attendance_rate": float(data.get("attendance_rate", 3)),
            "projects_handled": float(data.get("projects_handled", 5)),
            "overtime_hours": float(data.get("overtime_hours", 20)),
            "training_hours": float(data.get("training_hours", 15)),
        }])

        employee_df = validate_input_dataframe(employee_df)

        productivity_predictions = predict_productivity_percentage(employee_df)
        risk_predictions = predict_productivity_risk(employee_df)
        results = build_results(employee_df, productivity_predictions, risk_predictions)

        result = results.iloc[0].to_dict()
        result = convert_numpy_types(result)

        return jsonify({
            "success": True,
            "result": result,
            "predicted_productivity_percentage": float(results.iloc[0]["Predicted_Feedback_Percentage"]),
            "predicted_feedback_percentage": float(results.iloc[0]["Predicted_Feedback_Percentage"]),
            "productivity_class": results.iloc[0]["Productivity_Class"],
            "predicted_productivity_risk": results.iloc[0]["Predicted_Productivity_Risk"],
            "recommendations": results.iloc[0]["Recommendations"]
        })

    except Exception as e:
        logger.error(f"Single prediction error: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/predict/batch", methods=["POST", "OPTIONS"])
def predict_batch():
    if request.method == "OPTIONS":
        return "", 200

    if not all(x is not None for x in [ann_model, rf_model, preprocessor, risk_encoder]):
        if not load_artifacts():
            return jsonify({"success": False, "error": "Models not loaded. Check server logs."}), 500

    temp_files = []

    try:
        if "csv_file" not in request.files:
            return jsonify({"success": False, "error": "No CSV file uploaded"}), 400

        file = request.files["csv_file"]
        if file.filename == "":
            return jsonify({"success": False, "error": "No file selected"}), 400
        if not allowed_file(file.filename):
            return jsonify({"success": False, "error": "Please upload a CSV file"}), 400

        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config["UPLOAD_FOLDER"], f"input_{datetime.now().timestamp()}_{filename}")
        file.save(filepath)
        temp_files.append(filepath)

        df = pd.read_csv(filepath)
        logger.info(f"CSV loaded with {len(df)} rows and columns: {list(df.columns)}")

        clean_df = validate_input_dataframe(df)

        productivity_predictions = predict_productivity_percentage(clean_df)
        risk_predictions = predict_productivity_risk(clean_df)
        results = build_results(df, productivity_predictions, risk_predictions)

        timestamp_token = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_filename = f"productivity_results_{timestamp_token}.csv"
        output_path = os.path.join(app.config["RESULT_FOLDER"], output_filename)
        
        csv_results = results.copy()
        csv_results = csv_results.rename(columns={
            "Predicted_Feedback_Percentage": "Predicted_Productivity"
        })
        csv_results.to_csv(output_path, index=False)

        output_stem = os.path.splitext(output_filename)[0]
        output_excel_filename = f"{output_stem}.xlsx"
        output_excel_path = os.path.join(app.config["RESULT_FOLDER"], output_excel_filename)
        save_prediction_excel(results, output_excel_path)

        graph_files = generate_prediction_graphs(results, output_stem)

        risk_distribution = {
            str(k): int(v)
            for k, v in results["Predicted_Productivity_Risk"].value_counts().to_dict().items()
        }

        productivity_class_distribution = {
            str(k): int(v)
            for k, v in results["Productivity_Class"].value_counts().to_dict().items()
        }

        position_distribution = {}
        if "position" in results.columns:
            position_distribution = {
                str(k): int(v)
                for k, v in results["position"].value_counts().to_dict().items()
            }

        top_performers = []
        if "Predicted_Feedback_Percentage" in results.columns:
            id_column = "Employee_ID" if "Employee_ID" in results.columns else ("employee_id" if "employee_id" in results.columns else None)

            selected_columns = [
                "position",
                "role_level",
                "Predicted_Feedback_Percentage",
                "Productivity_Class",
                "Predicted_Productivity_Risk",
                "Recommendations",
            ]
            if id_column:
                selected_columns.insert(0, id_column)

            top_df = results.nlargest(5, "Predicted_Feedback_Percentage")[selected_columns].copy()

            if id_column and id_column != "Employee_ID":
                top_df.rename(columns={id_column: "Employee_ID"}, inplace=True)
            if "Employee_ID" not in top_df.columns:
                top_df["Employee_ID"] = ""

            top_performers = top_df.to_dict("records")
            top_performers = [convert_numpy_types(x) for x in top_performers]

        output_summaries = []
        output_summary_df = results.copy()
        if "Employee_ID" not in output_summary_df.columns:
            if "employee_id" in output_summary_df.columns:
                output_summary_df.rename(columns={"employee_id": "Employee_ID"}, inplace=True)
            else:
                output_summary_df["Employee_ID"] = resolve_employee_id_column(output_summary_df)

        output_summary_columns = [
            "Employee_ID",
            "position",
            "role_level",
            "Predicted_Feedback_Percentage",
            "Productivity_Class",
            "Predicted_Productivity_Risk",
            "Recommendations",
            "Output_Summary",
        ]
        available_output_summary_columns = [
            column for column in output_summary_columns
            if column in output_summary_df.columns
        ]

        if available_output_summary_columns:
            output_summary_rows = output_summary_df[available_output_summary_columns].to_dict("records")
            output_summaries = [convert_numpy_types(x) for x in output_summary_rows]

        return jsonify({
            "success": True,
            "message": f"Successfully processed {len(results)} employees",
            "total_employees": int(len(results)),
            "summary": {
                "average_productivity_percentage": float(results["Predicted_Feedback_Percentage"].mean()),
                "average_feedback_percentage": float(results["Predicted_Feedback_Percentage"].mean()),
                "max_productivity_percentage": float(results["Predicted_Feedback_Percentage"].max()),
                "max_feedback_percentage": float(results["Predicted_Feedback_Percentage"].max()),
                "min_productivity_percentage": float(results["Predicted_Feedback_Percentage"].min()),
                "min_feedback_percentage": float(results["Predicted_Feedback_Percentage"].min()),
                "risk_distribution": risk_distribution,
                "productivity_class_distribution": productivity_class_distribution,
                "position_distribution": position_distribution
            },
            "top_performers": top_performers,
            "output_summaries": output_summaries,
            "result_file": output_filename,
            "download_url": f"/api/download/{output_filename}",
            "excel_file": output_excel_filename,
            "download_excel_url": f"/api/download/{output_excel_filename}",
            "graph_files": graph_files,
            "graph_urls": {
                key: f"/api/download/{filename}"
                for key, filename in graph_files.items()
            },
        })

    except Exception as e:
        logger.error(f"Batch prediction error: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500

    finally:
        for file_path in temp_files:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
            except Exception:
                pass


@app.route("/api/predict/preview", methods=["POST", "OPTIONS"])
def predict_preview():
    if request.method == "OPTIONS":
        return "", 200

    if not all(x is not None for x in [ann_model, rf_model, preprocessor, risk_encoder]):
        if not load_artifacts():
            return jsonify({"success": False, "error": "Models not loaded"}), 500

    temp_file = None

    try:
        if "csv_file" not in request.files:
            return jsonify({"success": False, "error": "No CSV file uploaded"}), 400

        file = request.files["csv_file"]
        if file.filename == "":
            return jsonify({"success": False, "error": "No file selected"}), 400

        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config["UPLOAD_FOLDER"], f"preview_{datetime.now().timestamp()}_{filename}")
        file.save(filepath)
        temp_file = filepath

        df = pd.read_csv(filepath)
        clean_df = validate_input_dataframe(df)

        try:
            page = int(request.args.get("page", 1))
        except Exception:
            page = 1

        try:
            page_size = int(request.args.get("page_size", 10))
        except Exception:
            page_size = 10

        page = max(1, page)
        page_size = max(1, min(100, page_size))

        total_rows = int(len(clean_df))
        total_pages = max(1, int(math.ceil(total_rows / float(page_size))) if total_rows else 1)
        page = min(page, total_pages)

        start_index = (page - 1) * page_size
        end_index = min(start_index + page_size, total_rows)

        preview_raw_df = df.iloc[start_index:end_index].copy()
        preview_clean_df = clean_df.iloc[start_index:end_index].copy()

        productivity_predictions = predict_productivity_percentage(preview_clean_df)
        risk_predictions = predict_productivity_risk(preview_clean_df)
        preview_results = build_results(preview_raw_df, productivity_predictions, risk_predictions)

        preview_data = preview_results.to_dict("records")
        preview_data = [convert_numpy_types(x) for x in preview_data]

        return jsonify({
            "success": True,
            "preview": preview_data,
            "columns": list(preview_results.columns),
            "total_rows": total_rows,
            "preview_rows": len(preview_data),
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages
        })

    except Exception as e:
        logger.error(f"Preview error: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500

    finally:
        if temp_file and os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except Exception:
                pass


@app.route("/api/download/<filename>", methods=["GET"])
def download_file(filename):
    try:
        import re

        if not re.match(r"^[a-zA-Z0-9_.-]+\.(csv|xlsx|png)$", filename, re.IGNORECASE):
            return jsonify({"success": False, "error": "Invalid filename format"}), 400

        results_folder = os.path.abspath(app.config["RESULT_FOLDER"])
        file_path = os.path.join(results_folder, filename)
        file_path = os.path.abspath(os.path.normpath(file_path))

        if not file_path.startswith(results_folder):
            return jsonify({"success": False, "error": "Invalid file path"}), 400

        if not os.path.exists(file_path):
            return jsonify({"success": False, "error": "File not found"}), 404

        extension = filename.rsplit(".", 1)[1].lower()
        mime_map = {
            "csv": "text/csv",
            "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "png": "image/png",
        }
        is_attachment = extension != "png"

        return send_file(
            file_path,
            as_attachment=is_attachment,
            download_name=filename if is_attachment else None,
            mimetype=mime_map.get(extension, "application/octet-stream")
        )

    except Exception as e:
        logger.error(f"Download error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/files", methods=["GET"])
def list_files():
    try:
        files = []
        if os.path.exists(app.config["RESULT_FOLDER"]):
            for f in os.listdir(app.config["RESULT_FOLDER"]):
                if f.lower().endswith((".csv", ".xlsx", ".png")):
                    file_path = os.path.join(app.config["RESULT_FOLDER"], f)
                    files.append({
                        "filename": f,
                        "size": os.path.getsize(file_path),
                        "created": datetime.fromtimestamp(os.path.getctime(file_path)).isoformat(),
                        "download_url": f"/api/download/{f}"
                    })

        return jsonify({
            "success": True,
            "files": files,
            "count": len(files)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.errorhandler(404)
def not_found(error):
    return jsonify({"success": False, "error": "Endpoint not found"}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({"success": False, "error": "Internal server error"}), 500


if __name__ == "__main__":
    logger.info("Starting Employee Productivity API (Two-Model Version)...")

    if load_artifacts():
        logger.info("API ready to accept requests")
    else:
        logger.warning("API starting without loaded artifacts")

    app.run(debug=False, host="0.0.0.0", port=5002, use_reloader=False)
