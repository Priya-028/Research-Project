import sys

with open('Employee_Retention/API.py', 'r') as f:
    content = f.read()

old_batch = """        risk_scores = []
        risk_percentages = []
        risk_labels = []
        processed_data = []

        for index, row in df.iterrows():
            try:
                # Pass the entire row data to take advantage of all available features
                employee_data = row.to_dict()

                logger.info(f"Predicting employee index {index}...")

                result = predict_single_employee(bc.AppConfig.MODEL_PATH, employee_data)

                risk_scores.append(result.get("risk_score"))
                risk_percentages.append(result.get("risk_percentage"))
                risk_labels.append(result.get("risk_label"))

                if index < 10:
                    row_data = row.to_dict()
                    row_data['Risk_Score'] = result.get("risk_score")
                    row_data['Risk_Percentage'] = result.get("risk_percentage")
                    row_data['Risk_Label'] = result.get("risk_label")
                    row_data['Top_Factors'] = result.get("top_factors", [])
                    processed_data.append(row_data)

            except Exception as e:
                logger.error(f"Error processing employee {index}: {str(e)}")
                risk_scores.append(None)
                risk_percentages.append(None)
                risk_labels.append("Error")"""

new_batch = """        risk_scores = []
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
                    processed_data.append(row_data)"""

if old_batch in content:
    content = content.replace(old_batch, new_batch)
    print('Batch replacement success')
else:
    print('Batch not found')

old_preview = """            preview_df = df.head(5).copy()
            preview_data = []

            for index, row in preview_df.iterrows():
                try:
                    # Send the full row
                    employee_data = row.to_dict()

                    result = predict_single_employee(bc.AppConfig.MODEL_PATH, employee_data)

                    row_data = row.to_dict()
                    row_data['Risk_Score'] = result.get("risk_score")
                    row_data['Risk_Label'] = result.get("risk_label")
                    row_data['Top_Factors'] = result.get("top_factors", [])
                    preview_data.append(row_data)

                except Exception as e:
                    logger.error(f"Preview error for row {index}: {str(e)}")
                    row_data = row.to_dict()
                    row_data['Risk_Score'] = None
                    row_data['Risk_Label'] = 'Error'
                    preview_data.append(row_data)"""

new_preview = """            preview_df = df.head(5).copy()
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
                preview_data.append(row_data)"""

if old_preview in content:
    content = content.replace(old_preview, new_preview)
    print('Preview replacement success')
else:
    print('Preview not found')

with open('Employee_Retention/API.py', 'w') as f:
    f.write(content)
