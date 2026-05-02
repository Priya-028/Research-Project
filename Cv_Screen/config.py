import os

class Config:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATA_PATH = os.path.join(BASE_DIR, "dataset", "cv_job_dataset.csv")
    MODEL_SAVE_PATH = os.path.join(BASE_DIR, "CV Models", "cv_job_fit_model.pkl")
    VECTORIZER_SAVE_PATH = os.path.join(BASE_DIR, "CV Models", "cv_job_fit_vectorizer.pkl")
    MAX_FEATURES = 300
    TEST_SIZE = 0.2
    RANDOM_STATE = 42
