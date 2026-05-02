import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from scipy.sparse import hstack

from Setup_File import logger
from config import Config
from preprocess import combine_text_features, vectorize_text
from Data_Validators import validate_dataframe

def train_model():
    logger.info("Loading dataset...")
    df = pd.read_csv(Config.DATA_PATH)

    required_columns = ["Age", "Experience_Years", "Education", "Skills", "Previous_Companies",
                        "Certifications", "Job_Role_Applied", "Job_Description", "Fit_Score"]
    df = validate_dataframe(df, required_columns)

    text_columns = ["Education", "Skills", "Previous_Companies", "Certifications",
                    "Job_Role_Applied", "Job_Description"]
    df = combine_text_features(df, text_columns)

    logger.info("Vectorizing text features...")
    X_text, vectorizer = vectorize_text(df, max_features=Config.MAX_FEATURES, fit=True)

    X_numeric = df[["Age", "Experience_Years"]].values
    X = hstack([X_text, X_numeric])
    y = df["Fit_Score"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=Config.TEST_SIZE, random_state=Config.RANDOM_STATE
    )

    logger.info("Training RandomForestRegressor model...")
    model = RandomForestRegressor(n_estimators=200, random_state=Config.RANDOM_STATE)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    mse = mean_squared_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)

    logger.info(f"Model evaluation -> MAE: {mae:.3f}, MSE: {mse:.3f}, RMSE: {rmse:.3f}, R2: {r2:.3f}")

    joblib.dump(model, Config.MODEL_SAVE_PATH)
    joblib.dump(vectorizer, Config.VECTORIZER_SAVE_PATH)
    logger.info("Model and vectorizer saved successfully!")

if __name__ == "__main__":
    train_model()
