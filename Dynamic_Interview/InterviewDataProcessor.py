import pandas as pd
from sentence_transformers import SentenceTransformer, util
from datetime import datetime
import Config as CF
from Data_Validators import DataValidator, ProcessingError, ModelLoadingError

class InterviewDataProcessor:
    def __init__(self, file_path=CF.Config.DATA_PATH, model_name=CF.Config.MODEL_NAME):
        self.file_path = file_path
        self.df = None
        self.model_name = model_name
        self.model = None
        self.initialize_model()
        self.load_data()

    def initialize_model(self):
        try:
            CF.logger.info(f"Loading embedding model: {self.model_name}")
            self.model = SentenceTransformer(self.model_name)
            _ = self.model.encode("test", convert_to_tensor=True)
            CF.logger.info("Model loaded successfully")
        except Exception as e:
            raise ModelLoadingError(str(e))

    def load_data(self):
        try:
            DataValidator.validate_file_path(self.file_path)
            encodings = ['utf-8', 'latin-1']
            for enc in encodings:
                try:
                    self.df = pd.read_csv(self.file_path, encoding=enc)
                    CF.logger.info(f"CSV loaded with {enc}")
                    break
                except UnicodeDecodeError: continue
            required = ['role','question','candidate_answer','ideal_answer']
            DataValidator.validate_dataframe(self.df, required)
            self.clean_dataset()
        except Exception as e:
            raise ProcessingError(str(e))

    def clean_dataset(self):
        for col in ['role','question','candidate_answer','ideal_answer']:
            self.df[col] = self.df[col].astype(str).apply(DataValidator.clean_text)
        self.df = self.df[self.df['candidate_answer'].apply(DataValidator.validate_answer_length)]

    def evaluate_semantic_similarity(self, texts1, texts2):
        emb1 = self.model.encode(texts1, convert_to_tensor=True)
        emb2 = self.model.encode(texts2, convert_to_tensor=True)
        sim = util.cos_sim(emb1, emb2)
        return [sim[i][i].item() for i in range(len(texts1))]

    def evaluate_all_answers(self):
        cand = self.df['candidate_answer'].tolist()
        ideal = self.df['ideal_answer'].tolist()
        self.df['semantic_similarity'] = self.evaluate_semantic_similarity(cand, ideal)
        self.df['semantic_similarity_percent'] = (self.df['semantic_similarity']*100).round(1)
        return self.df

    def save_processed_data(self, output_path=CF.Config.PROCESSED_DATA_PATH):
        self.df.to_csv(output_path, index=False)
        CF.logger.info(f"Processed dataset saved: {output_path}")
        return output_path

    def get_dataset_info(self):
        if self.df is None:
            return {"rows": 0, "columns": 0, "roles": 0}
        
        info = {
            "rows": len(self.df),
            "columns": len(self.df.columns),
            "roles": self.df['role'].nunique() if 'role' in self.df.columns else 0
        }
        return info
