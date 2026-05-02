import joblib
import pandas as pd
from scipy.sparse import hstack
import pdfplumber
from Setup_File import logger
from config import Config


def load_model():
    logger.info("Loading trained model and vectorizer...")
    model = joblib.load(Config.MODEL_SAVE_PATH)
    vectorizer = joblib.load(Config.VECTORIZER_SAVE_PATH)
    logger.info("Model and vectorizer loaded successfully.")
    return model, vectorizer


def extract_job_text(pdf_path):
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + " "
    return text.strip()


def candidate_to_text(candidate):
    return f"{candidate.get('Education','')} {candidate.get('Skills','')} " \
           f"{candidate.get('Previous_Companies','')} {candidate.get('Certifications','')} " \
           f"{candidate.get('Job_Role_Applied','')}"


def predict_fit_batch(csv_input_path, job_pdf_path, csv_output_path):
    """
    Upload employee CSV → Predict all → Save results CSV
    """

    logger.info("Starting batch prediction...")

    # Load model once
    model, vectorizer = load_model()

    # Extract job description text once
    job_text = extract_job_text(job_pdf_path)

    # Read uploaded CSV
    df = pd.read_csv(csv_input_path)

    # Store results
    fit_scores = []

    for index, row in df.iterrows():

        candidate = {
            "Age": row["Age"],
            "Experience_Years": row["Experience_Years"],
            "Education": row.get("Education", ""),
            "Skills": row.get("Skills", ""),
            "Previous_Companies": row.get("Previous_Companies", ""),
            "Certifications": row.get("Certifications", ""),
            "Job_Role_Applied": row.get("Job_Role_Applied", "")
        }

        candidate_text = candidate_to_text(candidate)
        combined_text = candidate_text + " " + job_text

        X_text = vectorizer.transform([combined_text])
        X_numeric = [[candidate["Age"], candidate["Experience_Years"]]]

        X = hstack([X_text, X_numeric])

        fit_score = model.predict(X)[0]
        fit_scores.append(round(fit_score * 100, 2))

    # Add results column
    df["Fit_Percentage"] = fit_scores

    # Save output CSV
    df.to_csv(csv_output_path, index=False)

    logger.info(f"Batch prediction completed. Results saved to {csv_output_path}")

    return csv_output_path


if __name__ == "__main__":
    input_csv = "employees.csv"          # uploaded employees file
    job_pdf = "job_description.pdf"      # job description
    output_csv = "employees_results.csv" # result file

    result_file = predict_fit_batch(input_csv, job_pdf, output_csv)
    print(f"Results saved in: {result_file}")