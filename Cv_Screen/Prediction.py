import joblib
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
            text += page.extract_text() + " "
    return text.strip()


def candidate_to_text(candidate):
    return f"{candidate.get('Education','')} {candidate.get('Skills','')} " \
           f"{candidate.get('Previous_Companies','')} {candidate.get('Certifications','')} " \
           f"{candidate.get('Job_Role_Applied','')}"


def predict_fit(candidate, job_pdf_path, model=None, vectorizer=None):
    if model is None or vectorizer is None:
        model, vectorizer = load_model()

    job_text = extract_job_text(job_pdf_path)
    candidate_text = candidate_to_text(candidate)

    combined_text = candidate_text + " " + job_text

    X_text = vectorizer.transform([combined_text])
    X_numeric = [[candidate["Age"], candidate["Experience_Years"]]]

    X = hstack([X_text, X_numeric])

    fit_score = model.predict(X)[0]
    return round(fit_score * 100, 2)  # percentage output



if __name__ == "__main__":
    from Prediction import predict_fit
    # user input
    candidate_example = {
        "Age": 50,
        "Experience_Years": 4,
        "Education": "M.Sc AI",
        "Skills": "Python, Machine Learning, NLP",
        "Previous_Companies": "AI Labs, TechSoft",
        "Certifications": "TensorFlow, PyTorch",
        "Job_Role_Applied": "none"
    }

    fit_percentage = predict_fit(candidate_example, "job_description.pdf")
    print(f"Candidate Fit Score for Job: {fit_percentage}%")
