import joblib
from InterviewDataProcessor import InterviewDataProcessor
import Config as CF

def train_and_save():
    processor = InterviewDataProcessor(file_path=CF.Config.DATA_PATH)
    df = processor.evaluate_all_answers()
    joblib.dump(processor.model, CF.Config.TRAINED_MODEL_PATH)
    joblib.dump(df, CF.Config.PROCESSED_DATA_PATH)
    print("Model & processed dataset saved successfully!")

if __name__ == "__main__":
    train_and_save()
