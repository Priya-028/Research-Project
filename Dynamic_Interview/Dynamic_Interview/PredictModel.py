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
    cand = str(candidate_answer or "").strip()
    if not cand or cand.lower() == "no answer provided.":
        return 0.0
        
    model = _get_model()
    # 1. Semantic Similarity (SentenceTransformer)
    emb1 = model.encode(cand, convert_to_tensor=True)
    emb2 = model.encode(ideal_answer or "", convert_to_tensor=True)
    semantic_score = util.cos_sim(emb1, emb2).item()
    semantic_score = max(0.0, semantic_score)

    # 2. Keyword Overlap (Technical Precision check)
    # Simple heuristic: filter for words > 3 chars as a proxy for technical terms
    stop_words = {"this", "that", "there", "their", "with", "from", "should", "could", "would", "about"}
    def get_terms(text):
        words = str(text).lower().replace(".", " ").replace(",", " ").split()
        return {w for w in words if len(w) > 3 and w not in stop_words}

    cand_terms = get_terms(cand)
    ideal_terms = get_terms(ideal_answer)
    
    keyword_score = 0.0
    if ideal_terms:
        matches = cand_terms.intersection(ideal_terms)
        keyword_score = len(matches) / len(ideal_terms)

    # 3. Hybrid Calculation (Weighted)
    # Semantic gives the 'gist', Keyword gives the 'precision'
    hybrid_score = (semantic_score * 0.75) + (keyword_score * 0.25)
    
    return float(min(1.0, hybrid_score))

def generate_detailed_feedback(candidate_answer: str, ideal_answer: str, score: float):
    """
    Use GPT to generate constructive feedback based on the candidate's answer 
    compared to the ideal answer.
    """
    prompt = f"""
Analyze the following interview answer and provide a professional diagnostic assessment.
Compare the Candidate Answer to the Ideal Precision Benchmark.

Ideal Benchmark: {ideal_answer}
Candidate Answer: {candidate_answer}
Overall Precision: {score*100:.1f}%

Format your response in exactly 2 sections:
1. KEY STRENGTHS: Identify what the candidate answered correctly (1 sentence).
2. AREAS FOR IMPROVEMENT: Identify specifically which technical concepts or nuances were missing compared to the benchmark (1-2 sentences).

Rules:
- Be professional, technical, and objective.
- Do not mention scores or numbers.
- If the answer is extremely poor, focus on the fundamental missing concepts.
"""
    try:
        feedback = CF.get_gpt_response(prompt)
        if feedback:
            return feedback
    except Exception:
        pass

    # Heuristic Fallback if LLM fails
    fallbacks = [
        "KEY STRENGTHS: The response demonstrates a basic conceptual alignment with the core topic.\nAREAS FOR IMPROVEMENT: The answer lacks the technical specificity and mentions of the benchmark components noted in the ideal response.",
        "KEY STRENGTHS: Good attempt at addressing the high-level requirements.\nAREAS FOR IMPROVEMENT: Consider providing more granular examples or technical implementation details as highlighted in the precision benchmark.",
        "KEY STRENGTHS: Relevant response with decent flow.\nAREAS FOR IMPROVEMENT: Focus on incorporating the nuanced technical terminology and end-to-end logic found in the ideal solution."
    ]
    import hashlib
    h = int(hashlib.md5(candidate_answer.encode()).hexdigest(), 16)
    return fallbacks[h % len(fallbacks)]


def check_style_consistency(answers: list):
    """
    Analyzes the writing style across multiple answers to detect potential AI use or inconsistency.
    Returns a score (0.0 to 1.0) and a message.
    """
    if not answers or len([a for a in answers if a.strip()]) < 2:
        return 1.0, "Consistent (Not enough data to analyze style shifts)", {}

    metrics = []
    for ans in answers:
        if not ans.strip():
            continue
        words = ans.split()
        sentences = [s for s in ans.replace('!', '.').replace('?', '.').split('.') if s.strip()]
        
        avg_word_len = sum(len(w) for w in words) / len(words) if words else 0
        avg_sent_len = len(words) / len(sentences) if sentences else 0
        richness = len(set(words)) / len(words) if words else 0
        
        metrics.append({
            'word_len': avg_word_len,
            'sent_len': avg_sent_len,
            'richness': richness
        })

    if len(metrics) < 2:
        return 1.0, "Consistent (Not enough valid answers to compare)", {}

    # Calculate variance across answers for each metric
    variances = {}
    for key in ['word_len', 'sent_len', 'richness']:
        vals = [m[key] for m in metrics]
        mean = sum(vals) / len(vals)
        var = sum((x - mean) ** 2 for x in vals) / len(vals)
        variances[f'{key}_var'] = round(var, 3)

    # Average variance (normalized roughly)
    avg_var = sum(variances.values()) / len(variances)
    
    summary_metrics = {
        'avg_word_len': round(sum(m['word_len'] for m in metrics) / len(metrics), 2),
        'avg_sent_len': round(sum(m['sent_len'] for m in metrics) / len(metrics), 2),
        'avg_richness': round(sum(m['richness'] for m in metrics) / len(metrics), 2),
        'variances': variances
    }

    if avg_var > 15.0:
        return 0.4, "High inconsistency detected. Possible AI assistance.", summary_metrics
    elif avg_var > 8.0:
        return 0.7, "Moderate inconsistency. Review required.", summary_metrics
    else:
        return 0.95, "Consistent writing style verified.", summary_metrics
