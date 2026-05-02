from sentence_transformers import SentenceTransformer, util
import Config as CF

_MODEL = None

def _get_model():
    """
    Use a fresh SentenceTransformer instance instead of unpickling.
    This avoids runtime failures when transformers versions change.
    """
    global _MODEL
    if _MODEL is None:
        _MODEL = SentenceTransformer(CF.Config.MODEL_NAME)
        _ = _MODEL.encode("test", convert_to_tensor=True)
    return _MODEL

def predict_similarity(candidate_answer: str, ideal_answer: str):
    model = _get_model()
    emb1 = model.encode(candidate_answer or "", convert_to_tensor=True)
    emb2 = model.encode(ideal_answer or "", convert_to_tensor=True)
    score = util.cos_sim(emb1, emb2).item()
    # Return 0..1 (api.py normalizes to percent) for compatibility.
    return float(score)
