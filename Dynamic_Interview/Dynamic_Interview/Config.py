import logging
import os
import openai

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

class Config:
    MODEL_NAME = "all-MiniLM-L6-v2"
    LLM_MODEL = "gpt-3.5-turbo"
    BATCH_SIZE = 16
    MIN_SIMILARITY_THRESHOLD = 0.0
    MAX_SIMILARITY_THRESHOLD = 1.0
    DATA_PATH = os.path.join(BASE_DIR, "interview_data.csv")
    TRAINED_MODEL_PATH = os.path.join(BASE_DIR, "Models", "saved_llm_model.pkl")
    PROCESSED_DATA_PATH = os.path.join(BASE_DIR, "Models", "processed_interview_dataset.pkl")
    MAX_ANSWER_LENGTH = 500

# Load .env manually if python-dotenv is not installed
def _load_env_manually():
    _dir = os.path.dirname(os.path.abspath(__file__))
    _env_path = os.path.join(_dir, ".env")
    if os.path.exists(_env_path):
        with open(_env_path, "r", encoding="utf-8-sig") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip().lstrip("\ufeff")
                    v = v.strip().strip('"').strip("'")
                    if k:
                        os.environ[k] = v

_load_env_manually()
openai.api_key = os.getenv("OPENAI_API_KEY")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("interview_analysis.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

def get_gpt_response(prompt: str, model: str = Config.LLM_MODEL):
    try:
        if not openai.api_key:
            raise ValueError("OPENAI_API_KEY is not set")

        logger.info("Sending request to OpenAI API...")
        response = openai.ChatCompletion.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=Config.MAX_ANSWER_LENGTH
        )
        answer = response["choices"][0]["message"]["content"].strip()
        logger.info("Received response from OpenAI API.")
        return answer

    except Exception as e:
        logger.error(f"Error while calling OpenAI API: {e}")
        return None

if __name__ == "__main__":
    test_prompt = "Generate 3 interview questions for a Python developer role."
    answer = get_gpt_response(test_prompt)
    if answer:
        print("GPT Response:\n", answer)