"""
Semantic CV/job-description matching utilities.

The functions in this module are intentionally dependency-light at import time.
Sentence Transformers and spaCy are loaded lazily so the Flask app can still
start in environments where the semantic stack has not been installed yet.
"""

from __future__ import annotations

import math
import os
import re
import unicodedata
from functools import lru_cache
from typing import Iterable, List, Optional, Sequence

import numpy as np


DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

_SECTION_HEADINGS = {
    "skills",
    "technical skills",
    "core competencies",
    "technologies",
    "tools",
    "experience",
    "work experience",
    "professional experience",
    "projects",
    "responsibilities",
    "requirements",
    "qualifications",
}

_GENERIC_STOP_PHRASES = {
    "and",
    "or",
    "with",
    "using",
    "team",
    "project",
    "projects",
    "experience",
    "knowledge",
    "skills",
    "responsibilities",
    "requirements",
    "ability",
    "candidate",
    "company",
    "role",
    "job",
    "work",
    "an",
    "at",
    "by",
    "for",
    "from",
    "in",
    "of",
    "on",
    "to",
    "the",
}

_REQUIREMENT_NOISE_PHRASES = {
    "about",
    "about us",
    "benefits",
    "company",
    "company overview",
    "education",
    "job",
    "job description",
    "job summary",
    "job title",
    "key responsibilities",
    "location",
    "opening",
    "overview",
    "position",
    "position title",
    "preferred qualifications",
    "qualification",
    "qualifications",
    "required skills",
    "requirements",
    "responsibilities",
    "role",
    "salary",
    "summary",
    "vacancy",
}

_LEADING_ACTION_WORDS = {
    "built",
    "created",
    "developed",
    "designed",
    "deployed",
    "implemented",
    "managed",
    "worked",
    "used",
}

_ROLE_CATEGORY_TERMS = {
    "software": {
        "title": [
            "software engineer", "software developer", "full stack", "full-stack",
            "backend developer", "frontend developer", "web developer",
            "application developer", "mern", "java developer", "react developer",
        ],
        "skills": [
            "java", "python", "javascript", "typescript", "react", "node",
            "node.js", "express", "spring boot", "django", "laravel", "asp.net",
            ".net", "php", "html", "css", "tailwind", "rest api", "api",
            "mongodb", "mysql", "postgresql", "sql", "git", "docker",
            "microservices", "oop", "data structures", "algorithms",
        ],
    },
    "qa": {
        "title": [
            "quality assurance", "qa engineer", "test engineer", "software tester",
            "automation tester", "manual tester", "qa analyst", "sdet",
        ],
        "skills": [
            "selenium", "playwright", "cypress", "postman", "jmeter", "jira",
            "test case", "test cases", "test plan", "bug", "defect", "regression",
            "smoke testing", "manual testing", "automation testing", "cucumber",
            "serenity", "functional testing", "api testing",
        ],
    },
    "uiux": {
        "title": [
            "ui/ux", "ui ux", "ux designer", "ui designer", "product designer",
            "user experience", "user interface", "visual designer",
        ],
        "skills": [
            "figma", "adobe xd", "wireframe", "wireframing", "prototype",
            "prototyping", "user research", "usability testing", "user testing",
            "user flow", "journey map", "persona", "design system",
            "information architecture", "affinity diagram", "storyboard",
        ],
    },
    "business_analyst": {
        "title": [
            "business analyst", "product manager", "product owner",
            "business systems analyst", "ba consultant",
        ],
        "skills": [
            "requirement elicitation", "requirements gathering", "user stories",
            "brd", "frd", "srs", "functional specification", "process mapping",
            "stakeholder", "stakeholders", "scrum", "agile", "jira", "confluence",
            "product backlog", "roadmap", "uat", "market research", "balsamiq",
            "ms visio", "draw.io",
        ],
    },
    "data_ai": {
        "title": [
            "data engineer", "data scientist", "machine learning engineer",
            "ml engineer", "ai engineer", "analytics engineer", "bi engineer",
        ],
        "skills": [
            "machine learning", "deep learning", "tensorflow", "pytorch",
            "scikit-learn", "pandas", "numpy", "pyspark", "spark", "snowflake",
            "etl", "elt", "airflow", "data pipeline", "data engineering",
            "data analytics", "power bi", "powerbi", "tableau", "nlp",
            "computer vision", "llm", "large language model",
        ],
    },
}


def clean_text(text: object) -> str:
    """General text cleanup for semantic matching without domain dictionaries."""
    if text is None:
        return ""

    cleaned = unicodedata.normalize("NFKC", str(text))
    cleaned = cleaned.replace("\u00a0", " ")
    cleaned = re.sub(r"[\u2022\u2023\u25e6\u2043\u2219]+", " ", cleaned)
    cleaned = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", cleaned)
    cleaned = re.sub(r"(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])", " ", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _split_sentences(text: str) -> List[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n+", clean_text(text))
    return [part.strip(" -:\t") for part in parts if len(part.strip()) >= 3]


@lru_cache(maxsize=1)
def _load_spacy():
    try:
        import spacy
    except Exception:
        return None

    for model_name in ("en_core_web_trf", "en_core_web_md", "en_core_web_sm"):
        try:
            return spacy.load(model_name)
        except Exception:
            continue

    try:
        return spacy.blank("en")
    except Exception:
        return None


@lru_cache(maxsize=1)
def _load_sentence_model(model_name: str = DEFAULT_EMBEDDING_MODEL):
    try:
        from sentence_transformers import SentenceTransformer
    except Exception:
        return None

    try:
        allow_download = os.environ.get("CV_SCREEN_ALLOW_MODEL_DOWNLOAD", "").lower() in {"1", "true", "yes"}
        if allow_download or os.path.exists(model_name):
            return SentenceTransformer(model_name)
        return SentenceTransformer(model_name, local_files_only=True)
    except Exception:
        return None


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def _semantic_similarity_matrix(left: Sequence[str], right: Sequence[str]) -> Optional[np.ndarray]:
    model = _load_sentence_model()
    if model is None or not left or not right:
        return None

    left_vecs = model.encode(list(left), normalize_embeddings=True, show_progress_bar=False)
    right_vecs = model.encode(list(right), normalize_embeddings=True, show_progress_bar=False)
    return np.matmul(np.asarray(left_vecs), np.asarray(right_vecs).T)


def semantic_similarity_score(candidate_text: str, job_text: str) -> float:
    """
    Return a CV/job match score from 0 to 100.

    Primary path: SentenceTransformer cosine similarity.
    Fallback path: local TF-IDF cosine similarity when the transformer stack is
    unavailable. This keeps the API usable while deployments install/cache the
    embedding model.
    """
    candidate = clean_text(candidate_text)
    job = clean_text(job_text)
    if not candidate or not job:
        return 0.0

    model = _load_sentence_model()
    if model is not None:
        vectors = model.encode([candidate, job], normalize_embeddings=True, show_progress_bar=False)
        cosine = _cosine(np.asarray(vectors[0]), np.asarray(vectors[1]))
        return round(max(0.0, min(1.0, cosine)) * 100, 2)

    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity

        matrix = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            max_features=2000,
            min_df=1,
        ).fit_transform([candidate, job])
        cosine = float(cosine_similarity(matrix[0], matrix[1]).flatten()[0])
        return round(max(0.0, min(1.0, math.sqrt(cosine))) * 100, 2)
    except Exception:
        return 0.0


def semantic_similarity_scores(candidate_texts: Sequence[str], job_text: str) -> List[float]:
    job = clean_text(job_text)
    candidates = [clean_text(text) for text in candidate_texts]
    if not job:
        return [0.0 for _ in candidates]

    model = _load_sentence_model()
    if model is not None and candidates:
        vectors = model.encode(candidates + [job], normalize_embeddings=True, show_progress_bar=False)
        job_vector = np.asarray(vectors[-1])
        scores = [_cosine(np.asarray(vector), job_vector) for vector in vectors[:-1]]
        return [round(max(0.0, min(1.0, score)) * 100, 2) for score in scores]

    return [semantic_similarity_score(candidate, job) for candidate in candidates]


def _candidate_phrases_from_spacy(text: str) -> List[str]:
    nlp = _load_spacy()
    if nlp is None:
        return []

    doc = nlp(clean_text(text)[:100000])
    phrases = []

    if doc.has_annotation("DEP"):
        phrases.extend(chunk.text for chunk in doc.noun_chunks)

    if doc.has_annotation("ENT_IOB"):
        phrases.extend(
            ent.text
            for ent in doc.ents
            if ent.label_ in {"PRODUCT", "ORG", "WORK_OF_ART", "LANGUAGE", "EVENT"}
        )

    return phrases


def _candidate_phrases_from_regex(text: str) -> List[str]:
    phrases = []
    cleaned = clean_text(text)

    for line in cleaned.splitlines():
        line = line.strip(" -:\t")
        if not line:
            continue

        if re.search(r"[,|;/]", line) or any(h in line.lower() for h in _SECTION_HEADINGS):
            for part in re.split(r"[,|;/]", line):
                part = part.strip(" -:\t")
                if part:
                    phrases.append(part)

        phrases.extend(re.findall(r"\b[A-Z][A-Za-z0-9+#.]{1,}(?:[ .-][A-Z]?[A-Za-z0-9+#.]{1,}){0,3}\b", line))

    words = re.findall(r"[A-Za-z][A-Za-z0-9+#.]{1,}", cleaned)
    for size in (1, 2, 3):
        for idx in range(0, max(0, len(words) - size + 1)):
            phrases.append(" ".join(words[idx:idx + size]))

    return phrases


def _normalize_phrase(phrase: str) -> str:
    phrase = clean_text(phrase)
    phrase = re.sub(r"^[^\w+#.]+|[^\w+#.]+$", "", phrase)
    phrase = re.sub(r"\s+", " ", phrase)
    return phrase.strip()


def _filter_phrases(phrases: Iterable[str]) -> List[str]:
    seen = set()
    filtered = []
    for phrase in phrases:
        normalized = _normalize_phrase(phrase)
        key = normalized.lower()
        token_count = len(key.split())
        if not normalized or key in seen:
            continue
        if key in _GENERIC_STOP_PHRASES or len(key) < 2 or len(key) > 60:
            continue
        if token_count == 1 and key.islower() and not re.search(r"[+#.\d]", key):
            continue
        if key.split()[0] in _LEADING_ACTION_WORDS:
            continue
        if token_count > 5:
            continue
        if re.fullmatch(r"\d+(?:\.\d+)?", key):
            continue
        if sum(ch.isalpha() for ch in key) < 2:
            continue
        seen.add(key)
        filtered.append(normalized)
    return filtered


def extract_skills(text: str, context_text: Optional[str] = None, top_k: int = 25) -> str:
    """
    Dynamically extract likely skills from CV or job text.

    This uses noun chunks/entities when spaCy is available, plus generic phrase
    mining. If Sentence Transformers are available, phrases are ranked by their
    semantic closeness to the job/context text instead of by a fixed dictionary.
    """
    cleaned = clean_text(text)
    if not cleaned:
        return ""

    phrases = _filter_phrases(
        _candidate_phrases_from_spacy(cleaned) + _candidate_phrases_from_regex(cleaned)
    )
    if not phrases:
        return ""

    context = clean_text(context_text or cleaned)
    sim_matrix = _semantic_similarity_matrix(phrases, [context])
    if sim_matrix is not None:
        ranked = sorted(zip(phrases, sim_matrix[:, 0]), key=lambda item: item[1], reverse=True)
        selected = [phrase for phrase, score in ranked if score >= 0.22][:top_k]
    else:
        counts = {}
        lower_text = cleaned.lower()
        for phrase in phrases:
            counts[phrase] = lower_text.count(phrase.lower())
        selected = [
            phrase
            for phrase, _ in sorted(counts.items(), key=lambda item: (item[1], len(item[0])), reverse=True)
        ][:top_k]

    return ", ".join(selected)


def _job_title_candidates(job_text: str) -> List[str]:
    lines = [line.strip(" -:\t") for line in clean_text(job_text).splitlines() if line.strip()]
    candidates = []

    for line in lines[:30]:
        if len(line) <= 90 and not re.search(r"https?://|@|\d{4,}", line):
            label_match = re.match(r"(?i)^(job title|position|role|opening|vacancy)\s*[:\-]\s*(.+)$", line)
            candidates.append(label_match.group(2).strip() if label_match else line)

    for sentence in _split_sentences(job_text)[:20]:
        match = re.search(
            r"(?i)\b(?:hiring|seeking|looking for|recruiting)\s+(?:a|an|the)?\s*([^.;,\n]{3,80})",
            sentence,
        )
        if match:
            candidates.append(match.group(1).strip())

    phrases = _filter_phrases(_candidate_phrases_from_spacy(job_text) + _candidate_phrases_from_regex(job_text))
    candidates.extend(phrase for phrase in phrases if 2 <= len(phrase.split()) <= 5)
    return _filter_phrases(candidates)


def detect_job_role(job_text: str) -> str:
    """
    Detect a job role using candidate-title generation plus semantic ranking.

    This avoids maintaining a role dictionary. It works best with Sentence
    Transformers installed, but still returns a reasonable heading/cue fallback.
    """
    cleaned = clean_text(job_text)
    if not cleaned:
        return ""

    candidates = _job_title_candidates(cleaned)
    if not candidates:
        return ""

    context = " ".join(_split_sentences(cleaned)[:8]) or cleaned
    sim_matrix = _semantic_similarity_matrix(candidates, [context])
    if sim_matrix is not None:
        return max(zip(candidates, sim_matrix[:, 0]), key=lambda item: item[1])[0]

    return candidates[0]


def _contains_term(text: str, term: str) -> bool:
    text = clean_text(text).lower()
    term = clean_text(term).lower()
    if not text or not term:
        return False

    compact_text = re.sub(r"[^a-z0-9+#.]+", "", text)
    compact_term = re.sub(r"[^a-z0-9+#.]+", "", term)
    if not compact_term:
        return False

    if " " in term or "." in term or "-" in term:
        return term in text or compact_term in compact_text

    return bool(re.search(rf"(?<![a-z0-9+#.]){re.escape(term)}(?![a-z0-9+#.])", text))


def _token_set(text: str) -> set:
    return {
        token
        for token in re.findall(r"[a-z0-9+#.]+", clean_text(text).lower())
        if len(token) > 1 and token not in _GENERIC_STOP_PHRASES
    }


def _split_requirement_items(text: str) -> List[str]:
    items = []
    for line in clean_text(text).splitlines():
        line = line.strip(" -:\t")
        if not line:
            continue

        line_parts = [line]
        if ":" in line:
            left, right = line.split(":", 1)
            left_key = clean_text(left).lower().strip()
            if left_key in _REQUIREMENT_NOISE_PHRASES or len(left_key.split()) <= 4:
                line_parts.append(right)

        for line_part in line_parts:
            items.extend(part.strip(" -:\t") for part in re.split(r"[,;/|]", line_part) if part.strip())
        for inner in re.findall(r"\((?:e\.g\.,?\s*)?([^)]+)\)", line, flags=re.IGNORECASE):
            items.extend(part.strip(" -:\t") for part in re.split(r"[,;/|]", inner) if part.strip())
    return items


def _is_requirement_noise(phrase: str) -> bool:
    key = _normalize_phrase(phrase).lower()
    if not key:
        return True
    if key in _REQUIREMENT_NOISE_PHRASES:
        return True
    if key.endswith(" job description") or key.endswith(" description"):
        return True
    if re.fullmatch(r"(job|role|position|title)\s*[:\-]?\s*.+", key):
        return True
    if re.search(r"\b(email|phone|address|apply now|send your cv)\b", key):
        return True
    return False


def _job_requirement_phrases(job_text: str, top_k: int = 40) -> List[str]:
    """
    Derive requirement phrases from the actual uploaded JD.

    This intentionally avoids role-specific dictionaries. It combines generic
    phrase mining with comma/parenthesis splitting so a JD line like
    "Java, Python, C++, JavaScript" becomes separate requirements.
    """
    mined = extract_skills(job_text, context_text=job_text, top_k=top_k)
    candidates = _split_requirement_items(job_text)
    if mined:
        candidates.extend(part.strip() for part in mined.split(",") if part.strip())

    filtered = []
    seen = set()
    for phrase in _filter_phrases(candidates):
        if _is_requirement_noise(phrase):
            continue
        key = phrase.lower()
        token_count = len(_token_set(phrase))
        if token_count == 0:
            continue
        if token_count > 6:
            continue
        if key in seen:
            continue
        seen.add(key)
        filtered.append(phrase)
    return filtered[:top_k]


def _phrase_evidence_score(candidate_text: str, phrase: str) -> float:
    if _contains_term(candidate_text, phrase):
        return 1.0

    phrase_tokens = _token_set(phrase)
    if not phrase_tokens:
        return 0.0

    candidate_tokens = _token_set(candidate_text)
    overlap = len(phrase_tokens & candidate_tokens) / len(phrase_tokens)
    if overlap >= 0.75:
        return 0.75
    if overlap >= 0.5:
        return 0.45
    if overlap > 0 and len(phrase_tokens) <= 2:
        return 0.25
    return 0.0


def _jd_evidence_score(candidate_text: str, job_text: str) -> float:
    requirements = _job_requirement_phrases(job_text)
    if not requirements:
        return 50.0

    direct_scores = [_phrase_evidence_score(candidate_text, phrase) for phrase in requirements]

    sim_matrix = _semantic_similarity_matrix(requirements, [candidate_text])
    if sim_matrix is not None:
        semantic_support = [
            0.65 if score >= 0.48 else 0.35 if score >= 0.38 else 0.0
            for score in sim_matrix[:, 0]
        ]
        direct_scores = [max(direct, semantic) for direct, semantic in zip(direct_scores, semantic_support)]

    coverage = sum(direct_scores) / len(requirements)
    strong_hits = sum(score >= 0.75 for score in direct_scores)
    strong_hit_bonus = min(0.12, strong_hits / max(1, len(requirements)) * 0.35)
    return max(0.0, min(100.0, (coverage + strong_hit_bonus) * 100))


def _required_skills_match_score(candidate_text: str, job_text: str) -> float:
    """
    Measure strict coverage of requirements mined from the JD.

    This is intentionally more literal than JD evidence: exact phrase/token
    support matters here, while _jd_evidence_score can add semantic support.
    """
    requirements = _job_requirement_phrases(job_text)
    if not requirements:
        return 100.0

    direct_scores = [_phrase_evidence_score(candidate_text, phrase) for phrase in requirements]
    coverage = sum(direct_scores) / len(requirements)
    strong_hits = sum(score >= 0.75 for score in direct_scores)
    strong_hit_bonus = min(0.10, strong_hits / max(1, len(requirements)) * 0.25)
    return max(0.0, min(100.0, (coverage + strong_hit_bonus) * 100))


def _education_requirement_phrases(job_text: str) -> List[str]:
    phrases = []
    cleaned = clean_text(job_text)
    for line in cleaned.splitlines():
        line_lower = line.lower()
        if not re.search(r"\b(education|degree|qualification|bachelor|master|bsc|msc|phd|diploma)\b", line_lower):
            continue
        parts = re.split(r"[,;/|]|\bor\b|\band\b", line, flags=re.IGNORECASE)
        phrases.extend(part.strip(" -:\t.") for part in parts if part.strip())

    phrases.extend(
        match.group(0)
        for match in re.finditer(
            r"\b(?:bachelor'?s?|master'?s?|bsc|msc|phd|degree|diploma)\b(?:\s+(?:in|of)\s+[A-Za-z][A-Za-z &/.-]{2,40})?",
            cleaned,
            flags=re.IGNORECASE,
        )
    )
    return _filter_phrases(phrases)


def _education_match_score(candidate_text: str, job_text: str) -> float:
    requirements = _education_requirement_phrases(job_text)
    if not requirements:
        return 100.0

    scores = [_phrase_evidence_score(candidate_text, phrase) for phrase in requirements]
    return max(0.0, min(100.0, (sum(scores) / len(scores)) * 100))


def _role_category_scores(text: str) -> dict:
    cleaned = clean_text(text).lower()
    if not cleaned:
        return {}

    scores = {}
    for category, groups in _ROLE_CATEGORY_TERMS.items():
        title_hits = sum(1 for term in groups["title"] if _contains_term(cleaned, term))
        skill_hits = sum(1 for term in groups["skills"] if _contains_term(cleaned, term))
        scores[category] = (title_hits * 3.0) + skill_hits
    return scores


def _primary_role_category(text: str, min_score: float = 3.0) -> Optional[str]:
    scores = _role_category_scores(text)
    if not scores:
        return None

    category, score = max(scores.items(), key=lambda item: item[1])
    if score < min_score:
        return None
    return category


def _role_category_alignment(candidate_text: str, job_text: str, evidence_score: float) -> tuple:
    """
    Return (multiplier, cap) for JD role-category fit.

    A mismatched role should not rank high purely because of seniority or generic
    words like Agile/Jira/projects. Strong literal JD evidence can soften the cap,
    but it should not erase a clear BA/UI/UX/QA/software mismatch.
    """
    job_category = _primary_role_category(job_text, min_score=3.0)
    if not job_category:
        return 1.0, 99.0

    candidate_scores = _role_category_scores(candidate_text)
    candidate_category = _primary_role_category(candidate_text, min_score=3.0)
    job_score_in_candidate = candidate_scores.get(job_category, 0.0)

    if candidate_category == job_category:
        return 1.0, 99.0

    if job_score_in_candidate >= 5.0:
        return 0.85, 72.0
    if evidence_score >= 55.0 and job_score_in_candidate >= 3.0:
        return 0.80, 68.0
    if candidate_category:
        return 0.55, 45.0
    return 0.70, 58.0


def _calibrate_match_score(raw_score: float) -> float:
    """Scale the weighted ATS raw score into a practical 0-99 fit percentage."""
    score = max(0.0, float(raw_score))
    return min(score * 1.70, 99.0)


def score_candidates(candidate_texts: Sequence[str], job_text: str, experience_scores: Optional[Sequence[float]] = None) -> List[float]:
    """
    Score candidates against a job description using semantic similarity plus
    evidence derived from the uploaded JD itself.

    Experience is treated as a small calibration feature, not as a hard rule.
    """
    semantic_scores = semantic_similarity_scores(candidate_texts, job_text)
    final_scores = []
    for idx, semantic in enumerate(semantic_scores):
        candidate_text = candidate_texts[idx]
        evidence = _jd_evidence_score(candidate_text, job_text)
        if experience_scores is None:
            exp = 0.0
        else:
            experience = experience_scores[idx]
            exp = 0.0 if experience is None else max(0.0, min(100.0, float(experience)))
        score = (
            (semantic * 0.40)
            + (evidence * 0.45)
            + (exp * 0.15)
        )
        calibrated = _calibrate_match_score(score)
        role_multiplier, role_cap = _role_category_alignment(candidate_text, job_text, evidence)
        final_scores.append(round(min(calibrated * role_multiplier, role_cap), 2))
    return final_scores
