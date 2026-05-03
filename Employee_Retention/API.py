# Reload trigger comment v7
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import pandas as pd
import numpy as np
import os
from werkzeug.utils import secure_filename
import logging
from datetime import datetime
import traceback
import sys
import json

from predictor_utils import predict_single_employee
import base_config as bc

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('attrition_api.log')
    ]
)
logger = logging.getLogger("AttritionAPI")

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['RESULT_FOLDER'] = 'results'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max
app.config['ALLOWED_EXTENSIONS'] = {'csv'}

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['RESULT_FOLDER'], exist_ok=True)

bc.AppConfig.display_config()


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']


@app.route('/api/test', methods=['GET'])
def test():
    return jsonify({
        'status': 'success',
        'message': 'Employee Attrition Prediction API is running',
        'model_path': bc.AppConfig.MODEL_PATH,
        'model_exists': os.path.exists(bc.AppConfig.MODEL_PATH),
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'model_path': bc.AppConfig.MODEL_PATH,
        'model_exists': os.path.exists(bc.AppConfig.MODEL_PATH),
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/predict/batch', methods=['POST', 'OPTIONS'])
def predict_batch():
    if request.method == 'OPTIONS':
        return '', 200

    temp_files = []
    output_path = None

    try:

        if 'csv_file' not in request.files:
            return jsonify({'success': False, 'error': 'No CSV file uploaded'}), 400

        file = request.files['csv_file']

        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400

        if not allowed_file(file.filename):
            return jsonify({'success': False, 'error': 'Please upload a CSV file'}), 400

        # Save file temporarily
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], f"input_{datetime.now().timestamp()}_{filename}")
        file.save(filepath)
        temp_files.append(filepath)

        try:
            df = pd.read_csv(filepath)
            logger.info(f"CSV loaded with {len(df)} rows and columns: {list(df.columns)}")
        except Exception as e:
            return jsonify({'success': False, 'error': f'Error reading CSV: {str(e)}'}), 400

        # Instead of a hard fail, we just log what we have
        required_columns = ['Age', 'MonthlyIncome', 'OverTime'] # Bare minimum for some logic
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
             logger.warning(f"CSV missing some recommended columns: {missing_columns}. Model will use medians.")

        logger.info(f"Processing {len(df)} employees for attrition prediction...")

        logger.info(f"Processing {len(df)} employees for attrition prediction...")

        risk_scores = []
        risk_percentages = []
        risk_labels = []
        processed_data = []

        from predictor_utils import predict_attrition_dataframe
        results = predict_attrition_dataframe(bc.AppConfig.MODEL_PATH, df)

        for index, res in enumerate(results):
            if "error" in res:
                logger.error(f"Error processing employee {index}: {res['error']}")
                risk_scores.append(None)
                risk_percentages.append(None)
                risk_labels.append("Error")
            else:
                risk_scores.append(res.get("risk_score"))
                risk_percentages.append(res.get("risk_percentage"))
                risk_labels.append(res.get("risk_label"))

                if index < 10:
                    row_data = df.iloc[index].to_dict()
                    row_data['Risk_Score'] = res.get("risk_score")
                    row_data['Risk_Percentage'] = res.get("risk_percentage")
                    row_data['Risk_Label'] = res.get("risk_label")
                    row_data['Top_Factors'] = res.get("top_factors", [])
                    processed_data.append(row_data)

        df["Risk_Score"] = risk_scores
        df["Risk_Percentage"] = risk_percentages
        df["Risk_Label"] = risk_labels

        output_filename = f"attrition_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        output_path = os.path.join(app.config['RESULT_FOLDER'], output_filename)
        
        # Filter strictly for the columns the user requested
        export_columns = ['Age', 'BusinessTravel', 'JobRole', 'JobLevel', 'MonthlyIncome', 'OverTime', 'Risk_Score', 'Risk_Percentage', 'Risk_Label']
        existing_export_cols = [c for c in export_columns if c in df.columns]
        df[existing_export_cols].to_csv(output_path, index=False)

        risk_counts = df['Risk_Label'].value_counts().to_dict() if 'Risk_Label' in df.columns else {}
        valid_scores = [s for s in risk_scores if s is not None]
        avg_risk_score = sum(valid_scores) / len(valid_scores) if valid_scores else 0

        # Get high risk employees (top 5) - ensure numeric score for nlargest
        if 'Risk_Label' in df.columns and 'Risk_Score' in df.columns:
            # Cast score to numeric to avoid 'dtype object' error in nlargest
            df['Risk_Score'] = pd.to_numeric(df['Risk_Score'], errors='coerce')
            high_risk_df = df[df['Risk_Label'] == bc.AppConfig.RISK_LEVEL_HIGH].nlargest(5, 'Risk_Score')
        else:
            high_risk_df = pd.DataFrame()
        high_risk_employees = []

        if not high_risk_df.empty and 'Name' in high_risk_df.columns:
            for _, row in high_risk_df.iterrows():
                high_risk_employees.append({
                    'name': row.get('Name', f'Employee {row.get("EmployeeID", _)}'),
                    'risk_score': float(row['Risk_Score']),
                    'job_role': row.get('JobRole', 'N/A'),
                    'department': row.get('Department', 'N/A')
                })

        return jsonify({
            'success': True,
            'message': f'Successfully processed {len(df)} employees',
            'total_employees': len(df),
            'summary': {
                'average_risk_score': round(avg_risk_score, 2),
                'risk_distribution': {str(k): int(v) for k, v in risk_counts.items()},
                'high_risk_count': int(risk_counts.get(bc.AppConfig.RISK_LEVEL_HIGH, 0)),
                'medium_risk_count': int(risk_counts.get(bc.AppConfig.RISK_LEVEL_MEDIUM, 0)),
                'low_risk_count': int(risk_counts.get(bc.AppConfig.RISK_LEVEL_LOW, 0))
            },
            'high_risk_employees': high_risk_employees,
            'preview': processed_data[:10],  # First 10 processed rows
            'result_file': output_filename,
            'download_url': f'/api/download/{output_filename}'
        })

    except Exception as e:
        logger.error(f"Batch prediction error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

    finally:
        # Clean up temporary files
        for file_path in temp_files:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
            except:
                pass


@app.route('/api/predict/preview', methods=['POST', 'OPTIONS'])
def predict_preview():
    if request.method == 'OPTIONS':
        return '', 200

    try:
        if 'csv_file' not in request.files:
            return jsonify({'success': False, 'error': 'No CSV file uploaded'}), 400

        file = request.files['csv_file']

        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], f"preview_{datetime.now().timestamp()}_{filename}")
        file.save(filepath)

        try:

            df = pd.read_csv(filepath)

            preview_df = df.head(5).copy()
            preview_data = []

            from predictor_utils import predict_attrition_dataframe
            results = predict_attrition_dataframe(bc.AppConfig.MODEL_PATH, preview_df)

            for index, res in enumerate(results):
                row_data = preview_df.iloc[index].to_dict()
                if "error" in res:
                    logger.error(f"Preview error for row {index}: {res['error']}")
                    row_data['Risk_Score'] = None
                    row_data['Risk_Label'] = 'Error'
                else:
                    row_data['Risk_Score'] = res.get("risk_score")
                    row_data['Risk_Label'] = res.get("risk_label")
                    row_data['Top_Factors'] = res.get("top_factors", [])
                preview_data.append(row_data)

            return jsonify({
                'success': True,
                'preview': preview_data,
                'columns': list(df.columns) + ['Risk_Score', 'Risk_Label'],
                'total_rows': len(df),
                'preview_rows': len(preview_data)
            })

        finally:
            # Clean up
            if os.path.exists(filepath):
                os.remove(filepath)

    except Exception as e:
        logger.error(f"Preview error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/predict/single', methods=['POST', 'OPTIONS'])
def predict_single():
    if request.method == 'OPTIONS':
        return '', 200

    try:
        payload = request.get_json(silent=True) or {}
        print(f"DEBUG [API.py]: Received payload: {payload}")
        # Accept any fields provided in the JSON payload
        employee_data = payload.copy()
        print(f"DEBUG [API.py]: MonthlyIncome from payload: {employee_data.get('MonthlyIncome')}")

        # Basic validation for essential numeric fields if provided
        for field in ['Age', 'JobLevel', 'MonthlyIncome']:
            if field in employee_data and employee_data[field] is not None:
                try:
                    val = float(employee_data[field])
                    if val <= 0:
                        return jsonify({'success': False, 'error': f'{field} must be greater than zero'}), 400
                    # Update back to numeric type
                    employee_data[field] = val
                except (ValueError, TypeError):
                    return jsonify({'success': False, 'error': f'Invalid value for {field}'}), 400

        result = predict_single_employee(bc.AppConfig.MODEL_PATH, employee_data)


        return jsonify({
            'success': True,
            'input': employee_data,
            'risk_score': result.get('risk_score'),
            'risk_label': result.get('risk_label'),
            'top_factors': result.get('top_factors', []),
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        logger.error(f"Single prediction error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/download/<filename>', methods=['GET'])
def download_file(filename):
    """Download a result file"""
    try:
        # Security check - only allow alphanumeric, dots, underscores and hyphens
        import re
        if not re.match(r'^[a-zA-Z0-9_.-]+\.csv$', filename):
            return jsonify({'success': False, 'error': 'Invalid filename format'}), 400

        # Get absolute path to results folder
        results_folder = os.path.abspath(app.config['RESULT_FOLDER'])

        # Construct file path using os.path.join
        file_path = os.path.join(results_folder, filename)

        # Convert to absolute path and normalize
        file_path = os.path.abspath(os.path.normpath(file_path))

        logger.info(f"Results folder absolute path: {results_folder}")
        logger.info(f"Download requested - filename: {filename}")
        logger.info(f"Full file path: {file_path}")

        # Verify the file is within results folder (security)
        if not file_path.startswith(results_folder):
            logger.error(f"Security violation: {file_path} not in {results_folder}")
            return jsonify({'success': False, 'error': 'Invalid file path'}), 400

        # Check if file exists
        if not os.path.exists(file_path):
            logger.error(f"File not found: {file_path}")

            # List available files
            available = []
            if os.path.exists(results_folder):
                available = os.listdir(results_folder)
                logger.info(f"Available files: {available}")

            return jsonify({
                'success': False,
                'error': 'File not found',
                'requested': filename,
                'available_files': available,
                'results_folder': results_folder
            }), 404

        # Check if it's a file (not a directory)
        if not os.path.isfile(file_path):
            return jsonify({'success': False, 'error': 'Path is not a file'}), 400

        # Check file size
        file_size = os.path.getsize(file_path)
        logger.info(f"File found, size: {file_size} bytes")

        if file_size == 0:
            return jsonify({'success': False, 'error': 'File is empty'}), 404

        # Send file with proper headers
        return send_file(
            file_path,
            as_attachment=True,
            download_name=filename,
            mimetype='text/csv'
        )

    except Exception as e:
        logger.error(f"Download error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/model/info', methods=['GET'])
def model_info():
    return jsonify({
        'success': True,
        'model_path': bc.AppConfig.MODEL_PATH,
        'model_exists': os.path.exists(bc.AppConfig.MODEL_PATH),
        'required_features': ['Age', 'BusinessTravel', 'JobRole', 'JobLevel', 'MonthlyIncome', 'OverTime']
    })


@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'success': False, 'error': 'Internal server error'}), 500


if __name__ == '__main__':
    logger.info("Starting Employee Attrition Prediction API...")

    absolute_path = os.path.abspath(bc.AppConfig.MODEL_PATH)

    logger.info(f"Model path from config: {bc.AppConfig.MODEL_PATH}")
    logger.info(f"Absolute model path: {absolute_path}")
    logger.info(f"File exists? {os.path.exists(absolute_path)}")

    app.run(debug=True, host='0.0.0.0', port=5003)
# Reload trigger

# Reload trigger 2

# Reload trigger 3

# Reload trigger 4

# Reload trigger 5
