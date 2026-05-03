from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import joblib
import pandas as pd
# UNUSED: legacy sklearn feature stacking import; semantic scoring no longer uses it.
# from scipy.sparse import hstack
import pdfplumber
import os
import sys
import warnings
from werkzeug.utils import secure_filename
# UNUSED: top-level logging import; this file uses Setup_File.logger instead.
# import logging
from datetime import datetime
import json
import traceback
# UNUSED: no temporary-file APIs are used directly in this module.
# import tempfile
import time
import re
import uuid

def _load_dotenv():
    for _dir in (os.path.dirname(os.path.abspath(__file__)), os.getcwd()):
        _env_path = os.path.join(_dir, ".env")
        if os.path.exists(_env_path):
            with open(_env_path, "r", encoding="utf-8-sig") as _f:
                for _line in _f:
                    _line = _line.strip()
                    if _line and not _line.startswith("#") and "=" in _line:
                        _k, _v = _line.split("=", 1)
                        _k = _k.strip().lstrip("\ufeff")
                        _v = _v.strip().strip('"').strip("'")
                        if _k and _k not in os.environ:
                            os.environ[_k] = _v
            return


_load_dotenv()

# Import your existing working modules
from Setup_File import logger
from config import Config
from Train import train_model
from semantic_matching import (
    clean_text as semantic_clean_text,
    detect_job_role,
    extract_skills as extract_semantic_skills,
    score_candidates as score_semantic_candidates,
)

# ──────────────────────────────────────────────────────────────────────
# Gemini toggle  -> 1 = use Gemini 2.0 Flash (needs internet + API key)
#                  0 = use local semantic/heuristic extraction only
USE_GEMINI = os.environ.get("CV_SCREEN_USE_GEMINI", "0").lower() in {"1", "true", "yes"}
USE_GEMINI_EXPERIENCE = os.environ.get("CV_SCREEN_USE_GEMINI_EXPERIENCE", "0").lower() in {"1", "true", "yes"}
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

if USE_GEMINI or USE_GEMINI_EXPERIENCE:
    try:
        from google import genai as _genai_mod
        if GEMINI_API_KEY:
            _gemini_client = _genai_mod.Client(api_key=GEMINI_API_KEY)
        else:
            import logging as _lg
            _lg.getLogger(__name__).warning(
                "Gemini is enabled but GEMINI_API_KEY env var is not set — Gemini disabled")
            USE_GEMINI = 0
            USE_GEMINI_EXPERIENCE = 0
            _gemini_client = None
    except ImportError:
        import logging as _lg
        _lg.getLogger(__name__).warning(
            "google-genai not installed — Gemini disabled. "
            "Run: pip install google-genai")
        USE_GEMINI = 0
        USE_GEMINI_EXPERIENCE = 0
        _gemini_client = None
else:
    _gemini_client = None
# ──────────────────────────────────────────────────────────────────────

# Get absolute paths and override Config paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)  # Add current dir to path
MODEL_PATH = os.path.join(BASE_DIR, "CV Models", "cv_job_fit_model.pkl")
VECTORIZER_PATH = os.path.join(BASE_DIR, "CV Models", "cv_job_fit_vectorizer.pkl")
TECH_TAXONOMY_PATH = os.path.join(BASE_DIR, "technology_taxonomy.json")
_TECH_TAXONOMY_CACHE = None

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Get the absolute path of the current directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Configuration with absolute paths
app.config['UPLOAD_FOLDER'] = os.path.join(BASE_DIR, 'uploads')
app.config['RESULTS_FOLDER'] = os.path.join(BASE_DIR, 'results')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024
app.config['ALLOWED_EXTENSIONS'] = {'pdf', 'csv'}
app.config['RESULT_FILE_RETENTION_HOURS'] = 24  # Keep result files for 24 hours

# Create necessary folders
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['RESULTS_FOLDER'], exist_ok=True)

# Output columns for preview and CSV (professional, no Age / Previous_Companies)
OUTPUT_COLUMNS = [
    'Name',
    'Email',
    'Experience_Years',
    'Education',
    'Skills',
    'Certifications',
    'Job_Role_Applied',
    'Experience_Source',
    'Fit_Percentage'
]

# Log the paths for debugging
logger.info(f"BASE_DIR: {BASE_DIR}")
logger.info(f"UPLOAD_FOLDER: {app.config['UPLOAD_FOLDER']}")
logger.info(f"RESULTS_FOLDER: {app.config['RESULTS_FOLDER']}")

model = None
vectorizer = None
model_load_error = None
model_rebuild_attempted = False


def is_model_loaded():
    return model is not None and vectorizer is not None


def rebuild_model_artifacts():
    global model_load_error, model_rebuild_attempted

    if model_rebuild_attempted:
        return False

    model_rebuild_attempted = True

    if not os.path.exists(Config.DATA_PATH):
        model_load_error = f"Training dataset not found at {Config.DATA_PATH}"
        logger.error(model_load_error)
        return False

    try:
        logger.warning("Attempting to rebuild CV screening model artifacts with the current environment...")
        train_model()
        logger.info("Model artifacts rebuilt successfully.")
        return True
    except Exception as exc:
        model_load_error = f"Model rebuild failed: {str(exc)[:200]}"
        logger.error(model_load_error)
        logger.error(traceback.format_exc())
        return False

# Load models at startup
logger.info(f"Loading model from: {MODEL_PATH}")
logger.info(f"Loading vectorizer from: {VECTORIZER_PATH}")

if not os.path.exists(MODEL_PATH):
    model_load_error = f"Model file not found at {MODEL_PATH}"
    logger.error(f"✗ {model_load_error}")
elif not os.path.exists(VECTORIZER_PATH):
    model_load_error = f"Vectorizer file not found at {VECTORIZER_PATH}"
    logger.error(f"✗ {model_load_error}")
else:
    # Try to load models at startup using improved loading function
    try:
        import warnings
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=UserWarning)
            model = joblib.load(MODEL_PATH)
            vectorizer = joblib.load(VECTORIZER_PATH)
        logger.info(f"✓ Model and vectorizer loaded successfully at startup")
    except ValueError as e:
        error_msg = str(e)
        # This is likely the scikit-learn tree compatibility issue
        if "node array" in error_msg or "incompatible dtype" in error_msg:
            logger.error(f"\n" + "="*70)
            logger.error(f"SKLEARN COMPATIBILITY ISSUE DETECTED")
            logger.error(f"The CV Fit model was saved with sklearn 1.2.1")
            logger.error(f"Current system has sklearn 1.4.0+")
            logger.error(f"\nFIX OPTIONS:")
            logger.error(f"1. Retrain model with current sklearn version")
            logger.error(f"2. Run: pip install scikit-learn==1.2.1")
            logger.error(f"="*70 + "\n")
            model_load_error = "Sklearn version mismatch - see logs for solutions"
        else:
            logger.warning(f"⚠ Model loading deferred: {error_msg[:100]}")
            model_load_error = error_msg[:150]
        
        model = None
        vectorizer = None
    except Exception as e:
        error_msg = str(e)
        logger.warning(f"⚠ Model loading deferred (will attempt on first request): {error_msg[:100]}")
        model = None
        vectorizer = None
        model_load_error = error_msg[:150]


def cleanup_old_files():
    """
    Clean up result files older than retention period
    """
    try:
        current_time = time.time()
        retention_seconds = app.config['RESULT_FILE_RETENTION_HOURS'] * 3600
        cleaned_count = 0

        for filename in os.listdir(app.config['RESULTS_FOLDER']):
            if filename.startswith('results_') and filename.endswith('.csv'):
                file_path = os.path.join(app.config['RESULTS_FOLDER'], filename)
                file_age = current_time - os.path.getctime(file_path)

                if file_age > retention_seconds:
                    os.remove(file_path)
                    cleaned_count += 1
                    logger.info(f"Cleaned up old result file: {filename}")

        if cleaned_count > 0:
            logger.info(f"Cleanup completed: removed {cleaned_count} old files")
    except Exception as e:
        logger.error(f"Error during cleanup: {str(e)}")


def load_model_global():
    global model, vectorizer, model_load_error
    try:
        logger.info("Loading trained model and vectorizer...")
        logger.info(f"Model path: {MODEL_PATH}")
        logger.info(f"Vectorizer path: {VECTORIZER_PATH}")

        if not os.path.exists(MODEL_PATH):
            logger.error(f"Model file not found at {MODEL_PATH}")
            if not rebuild_model_artifacts():
                model_load_error = f"Model file not found at {MODEL_PATH}"
                return False

        if not os.path.exists(VECTORIZER_PATH):
            logger.error(f"Vectorizer file not found at {VECTORIZER_PATH}")
            if not rebuild_model_artifacts():
                model_load_error = f"Vectorizer file not found at {VECTORIZER_PATH}"
                return False

        # Suppress sklearn version compatibility warnings
        import warnings
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=UserWarning)
            model = joblib.load(MODEL_PATH)
            vectorizer = joblib.load(VECTORIZER_PATH)
        
        model_load_error = None
        logger.info("Model and vectorizer loaded successfully.")
        return True
    except Exception as e:
        error_msg = str(e)
        # Try to load despite version issues
        if "dtype" in error_msg or "incompatible" in error_msg.lower():
            try:
                logger.warning(f"Detected sklearn version issue, attempting alternative load...")
                import warnings
                with warnings.catch_warnings():
                    warnings.filterwarnings("ignore")
                    # Try with different protocol
                    # UNUSED: these legacy compatibility imports are not referenced.
                    # import importlib
                    # import sklearn
                    model = joblib.load(MODEL_PATH, mmap_mode=None)
                    vectorizer = joblib.load(VECTORIZER_PATH, mmap_mode=None)
                model_load_error = None
                logger.info("Model loaded with compatibility workaround.")
                return True
            except Exception as e2:
                logger.error(f"Alternative load also failed: {str(e2)[:200]}")
                model_load_error = str(e2)[:200]

        if rebuild_model_artifacts():
            try:
                with warnings.catch_warnings():
                    warnings.filterwarnings("ignore", category=UserWarning)
                    model = joblib.load(MODEL_PATH)
                    vectorizer = joblib.load(VECTORIZER_PATH)
                model_load_error = None
                logger.info("Model and vectorizer loaded successfully after rebuild.")
                return True
            except Exception as rebuild_load_error:
                error_msg = str(rebuild_load_error)
                model_load_error = error_msg[:200]
                logger.error(f"Reload after rebuild failed: {model_load_error}")
                logger.error(traceback.format_exc())
                return False
        
        model_load_error = error_msg[:200]
        logger.error(f"Error loading model: {error_msg[:200]}")
        logger.error(traceback.format_exc())
        return False


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']


def _extract_page_text_multicolumn(page):
    """
    Extract text from a single pdfplumber page handling multi-column layouts.

    Strategy:
    1. Try word-level extraction grouped into columns by x-position.
    2. Fall back to standard extract_text() if words are unavailable.

    Multi-column detection: if the page has words spread across two distinct
    horizontal bands (left half / right half) we sort each column top-to-bottom
    and concatenate them rather than letting pdfplumber interleave the columns.
    """
    try:
        words = page.extract_words(
            x_tolerance=3,
            y_tolerance=3,
            keep_blank_chars=False,
            use_text_flow=False,
        )
    except Exception:
        words = []

    if not words:
        return page.extract_text() or ""

    page_width = page.width or 1

    # Detect whether the page uses a two-column layout.
    # A simple heuristic: check if there is a clear gap in the middle third of
    # the page where very few words start (i.e. most words are in the left or
    # right half rather than the centre).
    mid_lo = page_width * 0.35
    mid_hi = page_width * 0.65
    centre_words = [w for w in words if mid_lo <= w["x0"] <= mid_hi]
    left_words   = [w for w in words if w["x0"] < mid_lo]
    right_words  = [w for w in words if w["x0"] > mid_hi]

    x_starts = sorted(set(round(w["x0"], 1) for w in words))
    x_gaps = [
        (right - left, left, right)
        for left, right in zip(x_starts, x_starts[1:])
        if page_width * 0.12 <= left <= page_width * 0.80
    ]
    best_gap = max(x_gaps, default=(0, None, None))
    gap_split_x = (best_gap[1] + best_gap[2]) / 2 if best_gap[1] is not None else None
    gap_left_words = [w for w in words if gap_split_x is not None and w["x0"] < gap_split_x]
    gap_right_words = [w for w in words if gap_split_x is not None and w["x0"] >= gap_split_x]
    is_gap_two_column = (
        gap_split_x is not None
        and best_gap[0] >= page_width * 0.04
        and len(gap_left_words) >= 20
        and len(gap_right_words) >= 20
        and 0.4 <= (len(gap_right_words) / max(len(gap_left_words), 1)) <= 2.5
    )

    is_two_column = (
        is_gap_two_column
        or (
            len(right_words) > 5
            and len(centre_words) < max(len(left_words), len(right_words)) * 0.25
            and 0.4 <= (len(right_words) / max(len(left_words), 1)) <= 2.5
        )
    )

    # FIX: strip leading bullet/special chars from word text so "•Python" → "Python"
    _BULLET_STRIP = re.compile(r'^[•‣◦⁃∙•\-\*]+\s*')

    def _clean_word(text):
        return _BULLET_STRIP.sub('', text).strip()

    if is_two_column:
        # FIX: use non-overlapping halves so split_x is always inside the gap
        if is_gap_two_column:
            split_x = gap_split_x
        else:
            left_cluster  = sorted([w["x1"] for w in words if w["x0"] < page_width * 0.50])
            right_cluster = sorted([w["x0"] for w in words if w["x0"] >= page_width * 0.50])
            if left_cluster and right_cluster:
                split_x = (left_cluster[-1] + right_cluster[0]) / 2
            else:
                split_x = page_width * 0.50

        def _words_to_lines(word_list):
            if not word_list:
                return ""
            word_list = sorted(word_list, key=lambda w: (round(w["top"] / 4) * 4, w["x0"]))
            lines = []
            current_line = []
            current_y = None
            for w in word_list:
                cleaned = _clean_word(w["text"])
                if not cleaned:
                    continue
                y_bucket = round(w["top"] / 4) * 4
                if current_y is None or abs(y_bucket - current_y) <= 1:
                    current_line.append(cleaned)
                    current_y = y_bucket
                else:
                    if current_line:
                        lines.append(" ".join(current_line))
                    current_line = [cleaned]
                    current_y = y_bucket
            if current_line:
                lines.append(" ".join(current_line))
            return "\n".join(lines)

        left_col  = _words_to_lines([w for w in words if w["x0"] < split_x])
        right_col = _words_to_lines([w for w in words if w["x0"] >= split_x])
        return left_col + "\n" + right_col

    # Single-column path — also strip bullet chars from words
    standard_text = page.extract_text()
    if standard_text:
        return standard_text

    words_sorted = sorted(words, key=lambda w: (round(w["top"] / 4) * 4, w["x0"]))
    lines = []
    current_line = []
    current_y = None
    for w in words_sorted:
        cleaned = _clean_word(w["text"])
        if not cleaned:
            continue
        y_bucket = round(w["top"] / 4) * 4
        if current_y is None or abs(y_bucket - current_y) <= 1:
            current_line.append(cleaned)
            current_y = y_bucket
        else:
            if current_line:
                lines.append(" ".join(current_line))
            current_line = [cleaned]
            current_y = y_bucket
    if current_line:
        lines.append(" ".join(current_line))
    return "\n".join(lines)


def extract_job_text_from_pdf(pdf_path):
    text = ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_text = _extract_page_text_multicolumn(page)
                if page_text:
                    text += page_text + "\n"
        return text.strip()
    except Exception as e:
        logger.error(f"Error extracting text from PDF: {str(e)}")
        return ""


def extract_job_role_from_job_text(job_text):
    """Extract the job title/position using semantic title-candidate ranking."""
    try:
        return detect_job_role(job_text)
    except Exception as exc:
        logger.warning(f"Semantic job role detection failed: {exc}")
        return ""


r'''
UNUSED legacy taxonomy code.
The current semantic matching flow uses semantic_matching.extract_skills()
through extract_technologies_from_text(), so these helpers are not called by
the active routes.

def load_technology_taxonomy():
    """Load local technology aliases used for Experience_Source extraction."""
    global _TECH_TAXONOMY_CACHE
    if _TECH_TAXONOMY_CACHE is not None:
        return _TECH_TAXONOMY_CACHE

    fallback = {
        "Python": ["python"],
        "Java": ["java"],
        "JavaScript": ["javascript", "java script", "js"],
        "React.js": ["react", "react js", "react.js", "reactjs"],
        "Node.js": ["node", "node.js", "nodejs"],
        "REST API": ["rest api", "rest apis", "restful api"],
        "SQL": ["sql"],
        "MySQL": ["mysql"],
        "MongoDB": ["mongodb", "mongo db"],
        "Git": ["git"],
    }

    try:
        with open(TECH_TAXONOMY_PATH, "r", encoding="utf-8") as taxonomy_file:
            taxonomy = json.load(taxonomy_file)
        if not isinstance(taxonomy, dict):
            raise ValueError("Technology taxonomy must be a JSON object")

        cleaned = {}
        for label, aliases in taxonomy.items():
            if not isinstance(label, str) or not label.strip():
                continue
            if isinstance(aliases, str):
                aliases = [aliases]
            if not isinstance(aliases, list):
                continue
            alias_list = [str(alias).strip() for alias in aliases if str(alias).strip()]
            if alias_list:
                cleaned[label.strip()] = alias_list

        _TECH_TAXONOMY_CACHE = cleaned or fallback
    except Exception as exc:
        logger.warning(f"Could not load technology taxonomy: {exc}. Using fallback list.")
        _TECH_TAXONOMY_CACHE = fallback

    return _TECH_TAXONOMY_CACHE


# UNUSED with load_technology_taxonomy(); kept for legacy reference only.
def _technology_alias_matches(text, alias):
    compact_text = re.sub(r"[^a-z0-9+#.]+", "", (text or "").lower())
    compact_alias = re.sub(r"[^a-z0-9+#.]+", "", (alias or "").lower())
    alias_lower = (alias or "").lower().strip()
    if not compact_alias:
        return False

    if len(compact_alias) <= 2:
        return bool(re.search(rf"(?<![a-z0-9+#.]){re.escape(alias_lower)}(?![a-z0-9+#.])", text))

    if " " in alias_lower or "." in alias_lower:
        return alias_lower in text or compact_alias in compact_text

    return bool(re.search(rf"(?<![a-z0-9+#.]){re.escape(alias_lower)}(?![a-z0-9+#.])", text))
'''


def extract_technologies_from_text(text):
    """Extract likely skills/tools dynamically instead of using a fixed taxonomy."""
    try:
        return extract_semantic_skills(text)
    except Exception as exc:
        logger.warning(f"Semantic skill extraction failed: {exc}")
        return ""


def normalize_text_for_matching(text):
    """Generalized cleanup for semantic matching."""
    return semantic_clean_text(text)


def normalize_candidate_name(name):
    """Clean candidate names extracted from stylized PDF headers."""
    if not name:
        return ""

    cleaned = re.sub(r"\s+", " ", str(name)).strip()
    if "@" in cleaned or re.search(r"https?://|www\.|linkedin|github|\d{3,}", cleaned, re.IGNORECASE):
        return ""
    if re.fullmatch(r"(?:[A-Za-z]\s+){2,}[A-Za-z]", cleaned):
        cleaned = cleaned.replace(" ", "")
    return cleaned.title()


def infer_name_from_email_and_text(email, raw_text, original_filename=None):
    """Fallback for CVs where decorative headers split a name into fragments."""
    local_part = (email or "").split("@")[0]
    if local_part and "." in local_part:
        parts = [part for part in re.split(r"[._+\-]+", local_part) if part and not part.isdigit()]
        if len(parts) >= 2 and all(re.fullmatch(r"[A-Za-z]+", part) for part in parts[:2]):
            first = parts[0].lower()
            last_prefix = parts[1].lower()
            lines = [line.strip() for line in (raw_text or "").splitlines() if line.strip()]
            for line in lines[:30]:
                if "@" in line or re.search(r"https?://|www\.|linkedin|github|\d{3,}", line, re.IGNORECASE):
                    continue
                compact = re.sub(r"[^a-z]", "", line.lower())
                if first in compact and last_prefix in compact:
                    return normalize_candidate_name(line)
            return normalize_candidate_name(" ".join(parts[:2]))

    if original_filename:
        base = os.path.splitext(original_filename)[0]
        base = re.sub(r"(?i)\b(cv|resume|example|final|new|copy|\d+)\b", " ", base)
        base = re.sub(r"[_\-()]+", " ", base)
        words = [word for word in base.split() if re.fullmatch(r"[A-Za-z]+", word)]
        if 2 <= len(words) <= 4:
            return normalize_candidate_name(" ".join(words))

    return ""


def extract_experience_evidence_from_text(text):
    """Return work/project evidence that should influence fit scoring."""
    if not text or not text.strip():
        return ""

    normalized = normalize_text_for_matching(text)
    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    lower_lines = [line.lower() for line in lines]
    start_keywords = [
        "experience", "work experience", "professional experience",
        "employment", "career history", "internship",
    ]
    end_keywords = [
        "education", "skills", "technical skills", "certifications",
        "certificates", "references", "languages", "volunteer",
        "activities", "declaration",
    ]

    start_idx = -1
    for idx, line in enumerate(lower_lines):
        if any(re.fullmatch(rf".*\b{re.escape(keyword)}\b.*", line) for keyword in start_keywords):
            start_idx = idx
            break

    if start_idx != -1:
        end_idx = len(lines)
        for idx in range(start_idx + 1, len(lines)):
            stripped = lower_lines[idx].strip(": -")
            if any(stripped == keyword or stripped.startswith(keyword + ":") for keyword in end_keywords):
                end_idx = idx
                break
        section = "\n".join(lines[start_idx:end_idx])
        if len(section) > 120:
            return section[:6000]

    evidence_keywords = [
        "engineer", "developer", "intern", "analyst", "data", "pipeline",
        "etl", "elt", "snowflake", "pyspark", "spark", "sql", "aws",
        "docker", "kubernetes", "fastapi", "api", "machine learning",
        "deep learning", "tensorflow", "pytorch", "project", "developed",
        "designed", "implemented", "automated", "integrated", "deployed",
    ]
    evidence_lines = [
        line for line, lower_line in zip(lines, lower_lines)
        if any(keyword in lower_line for keyword in evidence_keywords)
    ]
    return "\n".join(evidence_lines[:80])[:6000]


def extract_project_evidence_from_text(text):
    """Return project evidence for candidates whose strongest proof is project work."""
    if not text or not text.strip():
        return ""

    normalized = normalize_text_for_matching(text)
    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    lower_lines = [line.lower() for line in lines]
    start_idx = -1
    for idx, line in enumerate(lower_lines):
        stripped = line.strip(": -")
        if stripped == "projects" or stripped.startswith("projects "):
            start_idx = idx
            break

    if start_idx == -1:
        return ""

    end_keywords = [
        "skills", "technical skills", "certifications", "certificates",
        "references", "languages", "volunteer", "activities", "declaration",
        "education", "experience", "work experience",
    ]
    end_idx = len(lines)
    for idx in range(start_idx + 1, len(lines)):
        stripped = lower_lines[idx].strip(": -")
        if any(stripped == keyword or stripped.startswith(keyword + ":") for keyword in end_keywords):
            end_idx = idx
            break

    return "\n".join(lines[start_idx:end_idx])[:5000]


def parse_company_names_from_experience(text):
    """Extract company/organization names from experience section."""
    if not text or not text.strip():
        return ""
    companies = []
    lines = [ln.strip() for ln in re.split(r"[•\n–—;]", text) if ln.strip()]
    skip_words = {"the", "a", "an", "at", "as", "in", "to", "for", "of", "and", "or", "intern", "internship", "volunteer", "freelance", "contract"}
    for line in lines:
        orig = line
        line = re.sub(r"\d{4}\s*[-–—]\s*(?:Present|\d{4})", "", line).strip()
        line = re.sub(r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}", "", line, flags=re.IGNORECASE).strip()
        line = re.sub(r"\(.*?\)", "", line).strip()
        if len(line) < 4 or len(line) > 70:
            continue
        first_word = line.split()[0].lower() if line.split() else ""
        if first_word in skip_words:
            continue
        if re.match(r"^\d", line):
            continue
        if line[0].isupper() or (len(line) > 5 and not line.startswith("http")):
            if line not in companies and line not in [c.strip() for c in companies]:
                companies.append(line)
    return "; ".join(companies[:10]) if companies else ""


def parse_certification_names(text):
    """Extract course and certification names from certifications section."""
    if not text or not text.strip():
        return ""
    parts = re.split(r"[•\n;]", text)
    certs = []
    heading_only_re = re.compile(
        r"^(certifications?|certificates?|courses?|training|licen[cs]es?|professional development)\s*[:\-]?$",
        re.IGNORECASE
    )
    stop_heading_re = re.compile(
        r"^(references?|referees?|declaration|personal\s+skills?|soft\s+skills?|"
        r"education|experience|work\s+experience|projects?|activities|volunteer|membership|"
        r"skills?|technical\s+skills?|key\s+skills?|core\s+competencies|tools?)\s*[:\-]?",
        re.IGNORECASE
    )
    metadata_re = re.compile(
        r"^(languages?|provider|platform|credential\s+id|"
        r"credential\s+url|verify|verification)\s*[:\-]?",
        re.IGNORECASE
    )
    issuer_re = re.compile(r"^(institution|issued\s+by)\s*[:\-]?\s*(.+)$", re.IGNORECASE)
    for p in parts:
        p = p.strip().lstrip("-–—").strip()
        if heading_only_re.match(p):
            continue
        if stop_heading_re.match(p):
            break
        issuer_match = issuer_re.match(p)
        if issuer_match and certs:
            issuer = re.sub(r"\s+", " ", issuer_match.group(2)).strip()
            if issuer and issuer.lower() not in certs[-1].lower():
                certs[-1] = f"{certs[-1]} ({issuer})"
            continue
        if metadata_re.match(p):
            continue
        if len(p) > 4 and len(p) < 120:
            p = re.sub(r"\s+", " ", p)
            if p and p not in certs and not re.match(r"^\d+$", p):
                certs.append(p)
    return "; ".join(certs[:15]) if certs else ""


def parse_skills_list(text):
    """Return a clean, comma-separated skills list from a skills section."""
    if not text or not text.strip():
        return ""

    # FIX: removed hyphen from delimiters — "Problem-solving", "Full-stack" must not be split
    parts = re.split(r"[•\n,;/\u2013\u2014]", text)
    skills = []
    for p in parts:
        p = p.strip().lstrip("•‣◦⁃∙*").strip()
        if not p:
            continue
        # Skip very short or very long fragments
        if len(p) < 2 or len(p) > 80:
            continue
        # Normalise whitespace
        p = re.sub(r"\s+", " ", p)
        # Avoid pure numbers
        if re.fullmatch(r"\d+(\.\d+)?", p):
            continue
        if p not in skills:
            skills.append(p)

    return ", ".join(skills[:60]) if skills else ""


def clean_education_text(text):
    """Tidy PDF extraction artifacts that commonly appear in education sections."""
    if not text or not text.strip():
        return ""

    cleaned = str(text).replace("\u00a0", " ")
    cleaned = re.sub(r"(?m)^\s*[â€¢•*]\s*$\n?", "", cleaned)
    cleaned = re.sub(r"([A-Za-z])-\s*\n\s*([a-z])", r"\1\2", cleaned)
    cleaned = re.sub(r"\b([A-Za-z]{4,})(of|in|and)(?=[A-Z])", r"\1 \2 ", cleaned)
    cleaned = re.sub(r"\b([A-Za-z]{4,})(of|in|and)\s+(?=[A-Z])", r"\1 \2 ", cleaned)
    cleaned = re.sub(r"(\))\s*(in|of)\s*(?=[A-Z])", r"\1 \2 ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"(?<=[a-z])(?=(?:Systems|Science|Technology|Engineering|Management)\b)", " ", cleaned)
    cleaned = re.sub(r",(?=\S)", ", ", cleaned)
    cleaned = re.sub(r"(?<=[A-Za-z])\(", " (", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def rebuild_education_from_lines(raw_text):
    """Recover education when a two-column PDF interleaves work/project text."""
    if not raw_text:
        return ""

    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    rebuilt = []

    def add(value):
        value = re.sub(r"\s+", " ", value).strip(" -")
        if value and value not in rebuilt:
            rebuilt.append(value)

    if any("bachelor of commerce" in line.lower() for line in lines):
        def next_matching(start_idx, pattern, max_ahead=5):
            for look_idx in range(start_idx + 1, min(len(lines), start_idx + max_ahead + 1)):
                candidate = re.sub(r"\s+", " ", lines[look_idx]).strip()
                if re.search(pattern, candidate, re.IGNORECASE):
                    return candidate
            return ""

        def from_year_or_keyword(value, keyword_pattern):
            match = re.search(rf"((?:19|20)\d{{2}}.*?(?:{keyword_pattern}).*)", value, re.IGNORECASE)
            if match:
                return match.group(1)
            match = re.search(rf"((?:{keyword_pattern}).*)", value, re.IGNORECASE)
            return match.group(1) if match else value

        for idx, line in enumerate(lines):
            compact = re.sub(r"\s+", " ", line).strip()
            low = compact.lower()

            if "bachelor of commerce" in low:
                cleaned = compact[low.index("bachelor of commerce"):]
                next_line = next_matching(idx, r"\b(university|kelaniya)\b")
                if next_line:
                    next_clean = from_year_or_keyword(next_line, r"University|Kelaniya")
                    next_clean = re.sub(r"\b(\d{4})(?=[A-Za-z])", r"\1 ", next_clean)
                    cleaned = f"{cleaned} {next_clean}".strip()
                add(cleaned)
                continue

            if "professional in business analysis" in low:
                cleaned = compact[low.index("professional in business analysis"):]
                cleaned = re.sub(r"\s+(?:managing|prioritizing|conduct|collaborating)\b.*$", "", cleaned, flags=re.IGNORECASE)
                next_line = next_matching(idx, r"project management institute")
                if next_line:
                    cleaned = f"{cleaned} {from_year_or_keyword(next_line, r'Project Management Institute')}"
                add(cleaned)
                continue

            if "certificate level" in low:
                cleaned = compact[low.index("certificate level"):]
                next_line = next_matching(idx, r"\bbcs\b")
                if next_line:
                    cleaned = f"{cleaned} {from_year_or_keyword(next_line, r'BCS')}"
                add(cleaned)
                continue

            if "fundamentals of financial services" in low:
                cleaned = compact[low.index("fundamentals of financial services"):]
                next_line = next_matching(idx, r"\bcisi\b|institute for securities")
                if next_line:
                    cleaned = f"{cleaned} {from_year_or_keyword(next_line, r'CISI|Institute for Securities')}"
                add(cleaned)
                continue

            if "g.c.e" in low or "gce" in low:
                cleaned = compact[low.index("g"):]
                next_line = next_matching(idx, r"zahira|college")
                if next_line:
                    cleaned = f"{cleaned} {from_year_or_keyword(next_line, r'Zahira|College')}"
                add(cleaned)
                continue

        if len(rebuilt) >= 2:
            return "\n".join(rebuilt[:8])

    for idx, line in enumerate(lines):
        compact = re.sub(r"\s+", " ", line).strip()
        low = compact.lower()

        if "sliit" in low:
            if any(noise in low for noise in ["community", "women in foss", "volunteer", "content writer", "dev team"]):
                continue
            prev = lines[idx - 1].strip() if idx > 0 else ""
            date_match = re.match(r"^(\d{4}\s*[-\u2013\u2014]\s*(?:present|\d{4}))\b", prev, re.IGNORECASE)
            if date_match:
                add(date_match.group(1))
            add(re.sub(r"\bwork\s+with\b.*$", "", compact, flags=re.IGNORECASE))
            continue

        if re.search(r"\bb\.?\s*sc\b|bachelor|higher national diploma|secondary education|advance level|advanced level|ordinary level|combined mathematics", low):
            cleaned = compact
            start_match = re.search(
                r"\b(Bachelor|B\.?\s*Sc|Higher National Diploma|Diploma|G\.?\s*C\.?\s*E|Certificate\s+level)\b",
                cleaned,
                re.IGNORECASE,
            )
            if start_match:
                cleaned = cleaned[start_match.start():]
            cleaned = re.sub(r"\bh\s*senid\b.*$", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\balgorithm\b.*$", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\bweb\s+application\b.*$", "", cleaned, flags=re.IGNORECASE)
            add(cleaned)
            continue

        if re.search(r"\b(university|college|institute|bcs|cisi)\b", low):
            cleaned = compact
            start_match = re.search(
                r"\b((?:19|20)\d{2}\s*(?:University|College|Institute|BCS|CISI)|University|College|Institute|BCS|CISI)",
                cleaned,
                re.IGNORECASE,
            )
            if start_match:
                cleaned = cleaned[start_match.start():]
            cleaned = re.sub(r"\b(\d{4})(?=[A-Za-z])", r"\1 ", cleaned)
            cleaned = re.sub(r"\s+", " ", cleaned).strip(" -")
            if cleaned:
                add(cleaned)
            continue

        if rebuilt and re.search(r"\bb\.?\s*sc\b", rebuilt[-1], re.IGNORECASE) and "specialization" in low:
            rebuilt[-1] = f"{rebuilt[-1]} {compact}"
            continue

        if re.fullmatch(r"(?:vg(?:hs)?|vghs)", low):
            prev = lines[idx - 1].strip() if idx > 0 else ""
            date_match = re.match(r"^(\d{4}\s*[-\u2013\u2014]\s*\d{4})\b", prev, re.IGNORECASE)
            if date_match:
                add(date_match.group(1))
            add(compact)
            continue

        if rebuilt and rebuilt[-1].lower() == "higher national diploma in" and low == "information technology":
            rebuilt[-1] = "Higher National Diploma in Information Technology"
            continue

        if rebuilt and rebuilt[-1].lower() == "ordinary level" and re.fullmatch(r"\d+\s*[a-z]+", low, re.IGNORECASE):
            rebuilt[-1] = f"{rebuilt[-1]} {compact}"
            continue

    return "\n".join(rebuilt[:14])


def rebuild_education_by_keyword_window(education_text):
    """Keep likely education credentials when section text is interleaved with other columns."""
    if not education_text:
        return ""

    lines = [line.strip() for line in str(education_text).splitlines() if line.strip()]
    rebuilt = []

    credential_re = re.compile(
        r"(bachelor|b\.?\s*sc|bcs|certificate|fundamentals|cisi|g\.?\s*c\.?\s*e|"
        r"advanced level|ordinary level|diploma|degree|university|college|institute)",
        re.IGNORECASE,
    )
    noise_re = re.compile(
        r"(conduct market|industry trends|prioritizing|managing end-to-end|collaborating|"
        r"leading and mentoring|projects?|loyalty|customer lifetime|major telecom|"
        r"associate lead|requirement elicitation|languages)",
        re.IGNORECASE,
    )

    for line in lines:
        if not credential_re.search(line):
            continue

        cleaned = line
        cleaned = re.sub(r"^.*?\b(?=(Bachelor|B\.?\s*Sc|Certificate|Fundamentals|G\.?\s*C\.?\s*E|Higher National Diploma|Diploma|Degree))", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\b(?:conduct market|industry trends|prioritizing|managing end-to-end|collaborating|leading and mentoring|projects?|duclub|catalyst|associate lead|requirement elicitation|languages)\b.*$", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\b(\d{4})(?=[A-Za-z])", r"\1 ", cleaned)
        cleaned = re.sub(r"(?<=[a-z])(?=University|Institute|College|BCS|CISI)", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" -")
        if cleaned and not noise_re.fullmatch(cleaned) and cleaned not in rebuilt:
            rebuilt.append(cleaned)

    return "\n".join(rebuilt)


def extract_expertise_section(raw_text):
    """Extract technical skills from CVs that label the block as Expertise."""
    if not raw_text:
        return ""

    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    section = []
    in_expertise = False
    start_re = re.compile(r"^(expertise|technical\s+expertise|technical\s+skills?)$", re.IGNORECASE)
    end_re = re.compile(
        r"^(skills?|volunteering|academic\s+projects?|projects?|certificates?|certifications?|references?|"
        r"education|experience|language)$",
        re.IGNORECASE,
    )

    for line in lines:
        if start_re.match(line):
            in_expertise = True
            continue
        if in_expertise:
            if end_re.match(line):
                break
            section.append(line)
            if len(section) >= 35:
                break

    return "\n".join(section)



_GEMINI_SYSTEM = (
    "You are an experienced HR recruiter. Read CV text and intelligently extract key information. "
    "Text may be messy: PDF columns interleaved, spaced letters, icon words like 'Envelope' or 'in'. "
    "CRITICAL: For email, strip any leading icon word — e.g. 'Enveloperiyachandran2808@gmail.com' → 'priyachandran2808@gmail.com', 'Mailjohn@x.com' → 'john@x.com'. "
    "Look past formatting noise and fix merged words caused by PDF extraction (e.g. 'Universityof' → 'University of', 'Scienceand' → 'Science and'). "
    "Be flexible with terminology — different CVs use different words for the same thing: "
    "'Skills', 'Technical Skills', 'Core Competencies', 'Tools', 'Technologies', "
    "'Specialized Area', 'Other Tools & Technologies', 'Testing and Debugging', "
    "'Soft Skills', 'Personal Skills', 'Programming Languages', 'Frameworks', 'Databases', "
    "'DevOps', 'Cloud', 'Methodologies', 'Tools & Technologies' all mean skills — "
    "collect items from ALL such sub-sections and merge them into the skills array; "
    "'Work Experience', 'Employment', 'Career History', 'Internship' all mean experience; "
    "'Certifications', 'Courses', 'Training', 'Licences', 'Achievements' all mean certifications; "
    "'Education', 'Academic Background', 'Qualifications', 'Study' all mean education. "
    "Use your judgement — if it looks like it belongs in a category, put it there. "
    "IMPORTANT: Do NOT include section header words (like EDUCATION, SKILLS, CERTIFICATIONS, EXPERIENCE) inside the values — only include the actual content. "
    "Reply with a single valid JSON object only."
)

_GEMINI_USER = (
    "Extract from this CV:\n"
    "name (Title Case e.g. 'John Smith', never all-caps), "
    "email, phone, experience_years (real jobs only, not study), "
    "education (clean text, no section headers), "
    "skills (array — include items from ALL skill sub-sections such as 'Specialized Area', 'Other Tools & Technologies', 'Testing and Debugging', etc.; no section header words in values), "
    "certifications (array, no section headers), "
    "previous_companies (array).\n"
    "Use empty string or [] if not found. experience_years is a number.\n\n"
    "CV:\n"
)


def extract_candidate_features_with_gemini(raw_text, original_filename=None, job_role=""):
    """Use Gemini 2.5 Flash to intelligently parse CV fields from raw text."""
    from google.genai import types as _gtypes

    response = _gemini_client.models.generate_content(
        model="gemini-2.0-flash",
        contents=_GEMINI_USER + raw_text[:6000],
        config=_gtypes.GenerateContentConfig(
            system_instruction=_GEMINI_SYSTEM,
            temperature=0,
        ),
    )
    raw_json = response.text.strip()
    logger.info(f"[Gemini] Raw response (first 300): {raw_json[:300]}")
    lower_raw_text = (raw_text or "").lower()
    has_certification_evidence = any(
        kw in lower_raw_text
        for kw in [
            "certification", "certifications", "certificate", "certificates",
            "course", "courses", "training", "license", "licenses",
            "licence", "licences", "coursera", "udemy", "simplilearn",
            "great learning", "google cloud", "microsoft learn",
            "test automation university", "linkedin learning",
        ]
    )

    # Strip markdown code fences if present
    if raw_json.startswith("```"):
        raw_json = re.sub(r"^```[a-zA-Z]*\n?", "", raw_json)
        raw_json = re.sub(r"```$", "", raw_json).strip()

    parsed = json.loads(raw_json)

    name = parsed.get("name") or ""
    email = parsed.get("email") or ""
    logger.info(f"[Gemini] Extracted email (raw): {email!r}")
    phone = parsed.get("phone") or ""
    experience_years = parsed.get("experience_years") or 0
    education_text = parsed.get("education") or ""
    skills_list = parsed.get("skills") or []
    certs_list = parsed.get("certifications") or []
    prev_companies_list = parsed.get("previous_companies") or []

    # ── Post-process: clean up common Gemini slip-ups ─────────────────────
    # 0. Email: Gemini sometimes fuses PDF icon words (e.g. "Envelope") with the
    #    email address. Since pdfplumber extracts words with spaces between them,
    #    the raw text has "Envelope priyachandran2808@gmail.com" as separate tokens.
    #    Extract the email directly from raw_text first; fall back to stripping
    #    the icon prefix from Gemini's output if not found.
    _EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
    _ICON_PREFIX = re.compile(r'^(envelope|mail|email|in|linkedin|phone|tel|mobile)', re.IGNORECASE)
    if raw_text:
        _at_idx = raw_text.find('@')
        _snippet = raw_text[max(0, _at_idx-30):_at_idx+30] if _at_idx != -1 else 'NO @ FOUND'
        logger.info(f"[EmailFix] raw_text snippet around @: {_snippet!r}")
        _candidates = _EMAIL_RE.findall(raw_text)
        logger.info(f"[EmailFix] candidates from raw_text: {_candidates}")
        _clean = [c for c in _candidates if not _ICON_PREFIX.match(c)]
        if _clean:
            email = _clean[0]
        elif _candidates:
            email = _ICON_PREFIX.sub("", _candidates[0])
    elif email:
        email = _ICON_PREFIX.sub("", email)
    logger.info(f"[EmailFix] Final email after fix: {email!r}")

    # 1. Name: always Title Case (handles ALL-CAPS names like KAVILAKSHAN)
    inferred_name = infer_name_from_email_and_text(email, raw_text, original_filename)
    if (
        inferred_name
        and (
            not name
            or len(normalize_candidate_name(name).split()) < 2
            or re.fullmatch(r"(?:[A-Za-z]\s+){2,}[A-Za-z]", str(name).strip())
        )
    ):
        name = inferred_name
    elif name:
        name = normalize_candidate_name(name)

    # 2. Strip redundant section header words from the start of each text field
    _HDR = re.compile(
        r"^\s*(education|skills?|technical\s+skills?|certifications?|certificates?|"
        r"experience|work\s+experience|soft\s+skills?|core\s+competencies)\s*[:\-]?\s*",
        re.IGNORECASE
    )
    education_text = _HDR.sub("", education_text).strip()
    education_text = clean_education_text(education_text)

    # 3. Flatten list fields and strip headers from each item
    def _clean_list(lst):
        if isinstance(lst, list):
            return [_HDR.sub("", str(i)).strip() for i in lst if str(i).strip()]
        return []

    skills_list = _clean_list(skills_list)
    certs_list = _clean_list(certs_list)
    prev_companies_list = _clean_list(prev_companies_list)

    if not name and original_filename:
        name = normalize_candidate_name(os.path.splitext(original_filename)[0].replace("_", " "))

    skills_text = ", ".join(skills_list) if isinstance(skills_list, list) else str(skills_list)
    certs_text = ", ".join(certs_list) if isinstance(certs_list, list) else str(certs_list)
    prev_companies_text = ", ".join(prev_companies_list) if isinstance(prev_companies_list, list) else str(prev_companies_list)
    if certs_text and not has_certification_evidence:
        logger.info(
            f"[{original_filename or 'unknown CV'}] Ignoring Gemini certifications because no certification evidence was found in CV text."
        )
        certs_text = ""
    elif certs_text:
        certs_text = parse_certification_names(certs_text)

    try:
        exp_years_num = float(experience_years)
        exp_years_num = min(exp_years_num, 50)
    except (TypeError, ValueError):
        exp_years_num = 0

    exp_source = "gemini" if exp_years_num > 0 else "default"
    if exp_years_num == 0:
        exp_years_num = 3  # default fallback

    technologies_used = extract_technologies_from_text(
        prev_companies_text + " " + skills_text
    )
    experience_details = "\n".join(
        part for part in [
            extract_experience_evidence_from_text(raw_text),
            extract_project_evidence_from_text(raw_text),
        ]
        if part
    )

    return {
        "Name": name,
        "Email": email,
        "Age": 30,
        "Experience_Years": exp_years_num,
        "Education": education_text,
        "Skills": skills_text,
        "Previous_Companies": prev_companies_text,
        "Certifications": certs_text,
        "Job_Role_Applied": job_role or "",
        "Experience_Source": technologies_used,
        "Experience_Details": experience_details,
        "Project_Details": extract_project_evidence_from_text(raw_text),
        "Experience_Years_Output": str(round(exp_years_num, 1)) if exp_source == "gemini" else "N/A",
        "Certifications_Output": certs_text,
    }


def extract_experience_years_with_gemini(raw_text, original_filename=None):
    """Use Gemini only to estimate real professional experience years."""
    if not (_gemini_client and raw_text):
        return None

    try:
        from google.genai import types as _gtypes

        prompt = (
            "Read this CV text and return only one JSON object like "
            '{"experience_years": 2.0}. '
            "Calculate real professional work experience only. "
            "Do not count education, school, university dates, certifications, or project-only dates. "
            "If date ranges overlap, do not double count overlapping months. "
            "If a role says Present, use the current date. "
            "Round to the nearest 0.5 year. "
            "CV text:\n"
            f"{raw_text[:6000]}"
        )
        response = _gemini_client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config=_gtypes.GenerateContentConfig(
                temperature=0,
            ),
        )
        raw_json = (response.text or "").strip()
        if raw_json.startswith("```"):
            raw_json = re.sub(r"^```[a-zA-Z]*\n?", "", raw_json)
            raw_json = re.sub(r"```$", "", raw_json).strip()
        parsed = json.loads(raw_json)
        years = parsed.get("experience_years")
        if years is None or years == "":
            return None
        years = float(years)
        if 0 <= years <= 50:
            logger.info(f"[GeminiExperience] {original_filename or 'CV'} -> {years} years")
            return round_experience_to_half_year(years)
    except Exception as exc:
        logger.warning(f"[GeminiExperience] Failed for {original_filename or 'CV'}: {exc}")

    return None


def round_experience_to_half_year(years):
    """Round experience to the nearest 0.5 year using normal half-up rounding."""
    return int((float(years) * 2) + 0.5) / 2


def extract_candidate_features_from_pdf(pdf_path, original_filename=None, job_role=""):
    """
    Extract basic structured features from a candidate CV PDF so that the
    existing model (which expects Age, Experience_Years and text fields)
    can still be used.
    """
    raw_text = extract_job_text_from_pdf(pdf_path)

    # ── Gemini path ──────────────────────────────────────────────────────
    if USE_GEMINI and raw_text:
        try:
            logger.info(f"[Gemini] Parsing CV: {original_filename}")
            return extract_candidate_features_with_gemini(
                raw_text, original_filename=original_filename, job_role=job_role
            )
        except Exception as _gem_err:
            import traceback as _tb
            logger.warning(
                f"[Gemini] Failed for {original_filename}: {type(_gem_err).__name__}: {_gem_err}\n"
                + _tb.format_exc()
            )
    # ── Regex / heuristic path (fallback or USE_GEMINI=0) ────────────────
    # Save original (pre-transform) text for email extraction — CamelCase repair
    # splits letter+digit boundaries (e.g. "riyachandran2808" → "riyachandran 2808")
    # which causes the email regex to only capture the numeric suffix.
    _raw_pre_transform = raw_text

    # Fix no-space merging that still occurs in single-column PDFs with dense text.
    # Only split on lowercase→uppercase boundaries (CamelCase), not on known acronyms.
    # Protect terms like "PyTorch", "TensorFlow", "JavaScript", "GitHub", "MongoDB",
    # "FastAPI", "TypeScript", "OpenCV", "PySpark", "MySQL", "PostgreSQL", "NumPy",
    # "pandas" (already lower), "AWS", "GCP" — we do NOT want to split these.
    if raw_text:
        # Protect known compound tech terms before splitting
        _PROTECT = {
            "PyTorch": "__PYTORCH__",
            "TensorFlow": "__TENSORFLOW__",
            "JavaScript": "__JAVASCRIPT__",
            "TypeScript": "__TYPESCRIPT__",
            "GitHub": "__GITHUB__",
            "GitLab": "__GITLAB__",
            "MongoDB": "__MONGODB__",
            "FastAPI": "__FASTAPI__",
            "OpenCV": "__OPENCV__",
            "PySpark": "__PYSPARK__",
            "MySQL": "__MYSQL__",
            "PostgreSQL": "__POSTGRESQL__",
            "NumPy": "__NUMPY__",
            "PowerBI": "__POWERBI__",
            "DevOps": "__DEVOPS__",
            "LinkedIn": "__LINKEDIN__",
            "YouTube": "__YOUTUBE__",
            "ReactJS": "__REACTJS__",
            "NodeJS": "__NODEJS__",
            "NextJS": "__NEXTJS__",
            "ExpressJS": "__EXPRESSJS__",
            "GraphQL": "__GRAPHQL__",
            "SpringBoot": "__SPRINGBOOT__",
            "TailwindCSS": "__TAILWINDCSS__",
            "RestAPI": "__RESTAPI__",
            "SQLite": "__SQLITE__",
            "PostgreSQL": "__POSTGRESQL__",
        }
        for term, placeholder in _PROTECT.items():
            raw_text = raw_text.replace(term, placeholder)

        # Split CamelCase: "ProgrammingLanguages" → "Programming Languages"
        raw_text = re.sub(r"([a-z])([A-Z])", r"\1 \2", raw_text)
        # Space before digit after letters: "Feb2022" → "Feb 2022"
        raw_text = re.sub(r"([A-Za-z])(\d)", r"\1 \2", raw_text)
        raw_text = re.sub(r"(\d)([A-Za-z])", r"\1 \2", raw_text)

        # Restore protected terms
        for term, placeholder in _PROTECT.items():
            raw_text = raw_text.replace(placeholder, term)

    # Best-effort parsing of key fields from free‑form CV text
    name = None
    email = ""
    age = None
    experience_years = None
    age_source = "default"
    exp_source = "default"

    if raw_text:
        # Try to infer candidate name from the first non-empty, name‑like line
        try:
            lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]

            heading_keywords = {
                "curriculum vitae", "resume", "cv", "profile", "summary",
                "professional summary", "career objective", "summary statement",
                "ective", "objective",
                "personal statement", "about me", "contact", "references",
                "education", "experience", "skills", "certifications",
                "projects", "achievements", "declaration", "languages",
            }
            heading_keyword_compacts = {
                re.sub(r"[^a-z]", "", heading)
                for heading in heading_keywords
            }

            title_words = {
                "engineer", "developer", "designer", "analyst", "manager", "consultant",
                "architect", "specialist", "coordinator", "director", "officer", "lead",
                "intern", "undergraduate", "graduate", "fresher", "associate",
                "technology", "technologies", "information", "system", "systems",
                "photography", "management", "development", "application", "software",
                "web", "mobile", "data", "science", "computing",
            }

            def looks_like_name(line: str) -> bool:
                if len(line) < 3 or len(line) > 50:
                    return False
                lowered = line.lower().strip()
                # Reject contact/URL indicators
                if any(bad in lowered for bad in ["@", "http", "www", "linkedin", "github", "phone", "tel", "+", "gmail", "yahoo"]):
                    return False
                # Reject known section headings
                if lowered in heading_keywords:
                    return False
                if re.sub(r"[^a-z]", "", lowered) in heading_keyword_compacts:
                    return False
                # FIX: handle ALL-CAPS names by title-casing for checks
                check_line = line.title() if line.isupper() else line
                words = check_line.split()
                # Names are 2–4 words
                if not (2 <= len(words) <= 4):
                    return False
                # Reject known section headings (after title-casing)
                if check_line.lower() in heading_keywords:
                    return False
                # Reject lines containing job title / section words
                if any(w.lower() in title_words for w in words):
                    return False
                # Every word must start with a capital letter and contain only letters/hyphens/dots
                for w in words:
                    if not w[0].isupper():
                        return False
                    if not re.fullmatch(r"[A-Za-z][A-Za-z\-\.]*", w):
                        return False
                return True

            # Pass 1: check first 10 lines for a complete name on one line
            for ln in lines[:10]:
                if looks_like_name(ln):
                    name = ln
                    break
                name_prefix = re.split(
                    r"\s+(?:\+?\d|[A-Za-z0-9._%+\-]+@|github|linkedin|www\.|https?://)",
                    ln,
                    maxsplit=1,
                    flags=re.IGNORECASE,
                )[0].strip()
                if name_prefix and looks_like_name(name_prefix):
                    name = name_prefix
                    break

            # Pass 2 fallback: combine adjacent single-word capitalised lines
            # (handles split two-column headers like KAVILAKSHAN / VIJAYAKUMAR)
            if not name:
                for i in range(min(len(lines) - 1, 14)):
                    l1 = lines[i].strip()
                    l2 = lines[i + 1].strip()
                    # Both must be single alphabetic words
                    if (re.fullmatch(r"[A-Za-z]+", l1) and re.fullmatch(r"[A-Za-z]+", l2)
                            and l1.lower() not in heading_keywords
                            and l2.lower() not in heading_keywords):
                        combined = l1.title() + " " + l2.title()
                        if looks_like_name(combined):
                            name = combined
                            break
        except Exception as e:
            logger.warning(f"Could not infer candidate name from CV PDF: {str(e)}")

        try:
            _email_re = re.compile(r"\b[a-zA-Z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
            _icon_prefix_re = re.compile(r"^(envelope|mail|email|phone|tel|mobile|in|linkedin)\s*", re.IGNORECASE)
            _et = _raw_pre_transform or raw_text
            # Collect all email candidates; prefer one not starting with an icon word
            _all_matches = list(_email_re.finditer(_et[:800])) or list(_email_re.finditer(_et))
            _chosen = None
            for _m in _all_matches:
                _val = _m.group(0).strip()
                if not _icon_prefix_re.match(_val):
                    _chosen = _val
                    break
            if _chosen is None and _all_matches:
                # All start with icon word — strip it
                _chosen = _icon_prefix_re.sub("", _all_matches[0].group(0).strip())
            if _chosen:
                email = _chosen
        except Exception as e:
            logger.warning(f"Could not parse email from CV PDF: {str(e)}")

        # Parse age if explicitly mentioned
        try:
            age_match = re.search(r"\bAge[:\s]+(\d{2})\b", raw_text, re.IGNORECASE)
            if age_match:
                age = int(age_match.group(1))
                age_source = "parsed"
        except Exception as e:
            logger.warning(f"Could not parse age from CV PDF: {str(e)}")

        # Parse years of experience — explicit phrases first, then date ranges
        if USE_GEMINI_EXPERIENCE:
            gemini_years = extract_experience_years_with_gemini(raw_text, original_filename)
            if gemini_years is not None:
                experience_years = gemini_years
                exp_source = "gemini"

        try:
            month_patterns = [
                r"(\d+(?:\.\d+)?)\s*[- ]?\s*months?.{0,80}\b(?:experience|work|internship|intern)\b",
                r"(\d+(?:\.\d+)?)\s*[- ]?\s*month[a-zA-Z]*.{0,80}\b(?:experience|work|internship|intern)\b",
            ]
            for pat in month_patterns:
                m = re.search(pat, raw_text, re.IGNORECASE)
                if m:
                    months = min(float(m.group(1)), 600)
                    experience_years = min(round_experience_to_half_year(months / 12), 50)
                    exp_source = "parsed"
                    break
            if experience_years is None:
                compact_experience_text = re.sub(r"[^a-z0-9.]+", "", raw_text.lower())
                m = re.search(
                    r"(\d+(?:\.\d+)?)month.{0,120}(?:experience|work|internship|intern)",
                    compact_experience_text,
                    re.IGNORECASE,
                )
                if m:
                    months = min(float(m.group(1)), 600)
                    experience_years = min(round_experience_to_half_year(months / 12), 50)
                    exp_source = "parsed"

            exp_patterns = [
                r"(\d+)\+?\s+years?\s+of\s+(?:experience|work)",
                r"experience[:\s]+(\d+)\+?\s*years?",
                r"(\d+)\s*years?\s+(?:of\s+)?experience",
                r"(\d+)\+?\s+years?\s+experience",
                r"over\s+(\d+)\s+years",
                r"(\d+)\s+years?\s+in\s+(?:the\s+)?industry",
            ]
            if experience_years is None:
                for pat in exp_patterns:
                    m = re.search(pat, raw_text, re.IGNORECASE)
                    if m:
                        experience_years = min(int(m.group(1)), 50)
                        exp_source = "parsed"
                        break

            # FIX: fallback — calculate from date ranges e.g. "Mar 2025 – Aug 2025"
            if experience_years is None:
                _month_map = {
                    'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,
                    'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12
                }
                _now = datetime.now()
                _current_year, _current_month = _now.year, _now.month
                _date_re = re.compile(
                    r'(?P<sm>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?[a-z]*\.?[ \t]*(?P<sy>19\d{2}|20\d{2})'
                    r'[ \t]*(?:'
                    r'(?P<dash>[-\u2013\u2014])[ \t]*(?P<em1>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?[a-z]*\.?[ \t]*(?P<ey1>19\d{2}|20\d{2}|present)'
                    r'|[ \t]+(?P<em2>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?[a-z]*\.?[ \t]*(?P<ey2>19\d{2}|20\d{2}|present)'
                    r')',
                    re.IGNORECASE
                )
                work_section_re = re.search(
                    r"(?is)(?:^|\n)\s*(?:work\s+experience|professional\s+experience|employment\s+history|experience)\s*"
                    r"(?::|-)?\s*(.*?)"
                    r"(?=\n\s*(?:education|academic|skills?|technical\s+skills?|certifications?|projects?|additional\s+information|references?)\s*(?::|-)?|\Z)",
                    raw_text,
                )
                experience_text_for_dates = work_section_re.group(1) if work_section_re else ""
                if not experience_text_for_dates:
                    _experience_start_re = re.compile(
                        r"^(?:contact\s+)?(?:work\s+|professional\s+|employment\s+)?experience\b",
                        re.IGNORECASE,
                    )
                    _experience_end_re = re.compile(
                        r"^(?:education|academic|skills?|technical\s+skills?|certifications?|"
                        r"certificates?|projects?|academic\s+projects?|volunteering|references?|"
                        r"language|expertise)\b",
                        re.IGNORECASE,
                    )
                    section_lines = []
                    in_experience_section = False
                    for line in raw_text.splitlines():
                        stripped = line.strip()
                        if not stripped:
                            continue
                        if not in_experience_section and _experience_start_re.match(stripped):
                            in_experience_section = True
                            section_lines.append(stripped)
                            continue
                        if in_experience_section:
                            if _experience_end_re.match(stripped):
                                break
                            section_lines.append(stripped)
                    experience_text_for_dates = "\n".join(section_lines)
                if not experience_text_for_dates:
                    experience_text_for_dates = raw_text
                month_names = r"jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec"
                experience_text_for_dates = re.sub(
                    rf"\b(\d{{4}})\s+({month_names})[a-z]*\.?\s*[-\u2013\u2014]\s*(present)\b",
                    r"\2 \1 - \3",
                    experience_text_for_dates,
                    flags=re.IGNORECASE,
                )
                experience_text_for_dates = re.sub(
                    rf"\b(\d{{4}})\s+({month_names})[a-z]*\.?\s*[-\u2013\u2014]\s*(\d{{4}})\s+({month_names})[a-z]*\.?",
                    r"\2 \1 - \4 \3",
                    experience_text_for_dates,
                    flags=re.IGNORECASE,
                )
                experience_text_for_dates = re.sub(
                    rf"\b(\d{{4}})\s+({month_names})[a-z]*\.?\s*[-\u2013\u2014]\s*({month_names})[a-z]*\.?",
                    r"\2 \1 - \3 \1",
                    experience_text_for_dates,
                    flags=re.IGNORECASE,
                )
                date_ranges = []
                exp_context_keywords = [
                    "experience", "work", "employment", "intern", "internship",
                    "trainee", "associate", "developer", "engineer", "company",
                    "freelance", "contract", "quality assurance", "test engineer",
                ]
                for date_match in _date_re.finditer(experience_text_for_dates):
                    date_parts = date_match.groupdict()
                    sm = date_parts.get("sm")
                    sy = date_parts.get("sy")
                    em = date_parts.get("em1") or date_parts.get("em2")
                    ey = date_parts.get("ey1") or date_parts.get("ey2")
                    context_start = max(0, date_match.start() - 180)
                    context_end = min(len(experience_text_for_dates), date_match.end() + 180)
                    date_context = experience_text_for_dates[context_start:context_end].lower()
                    if not any(keyword in date_context for keyword in exp_context_keywords):
                        continue
                    try:
                        sy_i = int(sy)
                        sm_i = _month_map.get(sm[:3].lower(), 1) if sm else 1
                        if not ey or ey.lower() == 'present':
                            ey_i, em_i = _current_year, _current_month
                        else:
                            ey_i = int(ey)
                            em_i = _month_map.get(em[:3].lower(), sm_i) if em else sm_i
                        if 1990 <= sy_i <= _current_year and sy_i <= ey_i:
                            months = (ey_i - sy_i) * 12 + (em_i - sm_i)
                            if 0 < months <= 600:
                                date_ranges.append((sy_i * 12 + sm_i, ey_i * 12 + em_i))
                    except (ValueError, AttributeError):
                        continue
                merged_ranges = []
                for start_month, end_month in sorted(date_ranges):
                    if not merged_ranges:
                        merged_ranges = [(start_month, end_month)]
                        continue
                    last_start, last_end = merged_ranges[-1]
                    if start_month <= last_end:
                        merged_ranges[-1] = (last_start, max(last_end, end_month))
                    else:
                        merged_ranges.append((start_month, end_month))
                total_months = sum(end - start for start, end in merged_ranges) if date_ranges else 0
                if total_months > 0:
                    experience_years = min(round_experience_to_half_year(total_months / 12), 50)
                    exp_source = "parsed"
        except Exception as e:
            logger.warning(f"Could not parse experience from CV PDF: {str(e)}")

    # Fallbacks for model input if values could not be parsed
    cv_label = original_filename or "unknown CV"
    if age is None:
        age = 30
        logger.warning(f"[{cv_label}] Age not found in CV — defaulting to {age}. Score may be less accurate.")
    if experience_years is None:
        experience_years = 3
        logger.warning(f"[{cv_label}] Experience years not found in CV — defaulting to {experience_years}. Score may be less accurate.")

    # Derive a candidate name from filename if we could not read one from the CV
    inferred_name = infer_name_from_email_and_text(email, raw_text, original_filename)
    if (
        inferred_name
        and (
            not name
            or len(normalize_candidate_name(name).split()) < 2
            or re.fullmatch(r"(?:[A-Za-z]\s+){2,}[A-Za-z]", str(name).strip())
        )
    ):
        name = inferred_name
    elif name:
        name = normalize_candidate_name(name)
    elif original_filename:
        base_name = os.path.splitext(original_filename)[0]
        name = normalize_candidate_name(base_name.replace("_", " "))

    # Extract Education, Skills, Previous_Companies, Certifications from CV sections
    education_text = ""
    skills_text = ""
    prev_companies_text = ""
    certs_text = ""

    if raw_text:
        lower = raw_text.lower()
        has_certification_evidence = any(
            kw in lower
            for kw in [
                "certification", "certifications", "certificate", "certificates",
                "course", "courses", "training", "license", "licenses",
                "licence", "licences", "coursera", "udemy", "simplilearn",
                "great learning", "google cloud", "microsoft learn",
                "test automation university", "linkedin learning",
            ]
        )

        def _section_pat(kw):
            """Pattern that matches a section heading line for kw.
            Allows up to one short prefix word (KEY, CORE, TECHNICAL …) and
            requires the keyword to be followed by colon or end-of-line so
            mid-sentence occurrences (e.g. "problem-solving skills and…") do not
            trigger a false section start."""
            return re.compile(
                rf"(?:^|\n)\s*(?:[a-z]{{1,15}}\s+){{0,1}}{re.escape(kw)}\s*(?::|\r?\n|$)",
                re.IGNORECASE
            )

        def _find_section_start(lower_text, keywords):
            """Find the earliest heading-line match for any keyword.
            Two-pass: strict (keyword at end of line) then loose fallback
            (keyword at line-start, any suffix) for CVs where the heading
            and content share the same line e.g. 'EDUCATION B.Sc...'."""
            best = -1
            # Pass 1 — strict: keyword followed by colon / newline
            for kw in keywords:
                m = _section_pat(kw).search(lower_text)
                if m and (best == -1 or m.start() < best):
                    best = m.start()
            if best != -1:
                return best
            # Pass 2 — loose fallback: keyword at start of line, any suffix
            _loose_pat = lambda kw: re.compile(
                rf"(?:^|\n)\s*(?:[a-z]{{1,15}}\s+){{0,1}}{re.escape(kw)}\b",
                re.IGNORECASE
            )
            for kw in keywords:
                m = _loose_pat(kw).search(lower_text)
                if m and (best == -1 or m.start() < best):
                    best = m.start()
            return best

        def extract_section(start_keywords, end_keywords, strip_headings=None):
            start_idx = _find_section_start(lower, start_keywords)
            if start_idx == -1:
                return ""

            end_idx_candidates = []
            after = lower[start_idx + 1:]
            for kw in end_keywords:
                m = _section_pat(kw).search(after)
                if m:
                    end_idx_candidates.append(start_idx + 1 + m.start())
            end_idx = min(end_idx_candidates) if end_idx_candidates else len(raw_text)

            # FIX: raised cap — long Skills/Experience sections were truncated at 2000
            max_len = 3000 if end_idx_candidates else 2000
            if end_idx - start_idx > max_len:
                end_idx = start_idx + max_len

            section = raw_text[start_idx:end_idx].lstrip()
            if strip_headings:
                pat = "|".join(re.escape(k) for k in strip_headings)
                section = re.sub(rf"^({pat})[:\s\-]*", "", section, flags=re.IGNORECASE)
            else:
                section = re.sub(
                    r"^(education|academic background|skills?|technical skills|key skills|experience|work experience|certifications?|certificates?)[:\s\-]*",
                    "",
                    section,
                    flags=re.IGNORECASE,
                )
            section = re.sub(r"[ \t]+", " ", section)
            return section.strip()

        education_text = extract_section(
            ["education", "academic background", "academic qualifications"],
            ["experience", "work experience", "skills", "technical skills", "key skills",
             "projects", "certifications", "certificates", "soft skills", "personal skills",
             "tools", "references", "declaration", "languages", "membership", "activities",
             "volunteer", "volunteering", "profile", "summary", "about me"]
        )

        skills_text = extract_section(
            ["skills", "technical skills", "key skills", "core competencies"],
            ["experience", "work experience", "projects", "certifications", "certificates",
             "education", "soft skills", "personal skills", "references", "declaration",
             "languages", "tools & technologies", "membership", "activities", "volunteer", "volunteering",
             "profile", "summary", "about me", "referee", "referees"]
        )

        prev_companies_text = extract_section(
            ["work experience", "professional experience", "employment history", "experience"],
            ["education", "skills", "technical skills", "key skills", "certifications",
             "certificates", "projects", "references", "languages", "personal skills",
             "soft skills", "membership", "activities", "volunteer", "volunteering"]
        )

        certs_text = extract_section(
            ["certificates", "certifications", "certification", "licenses", "professional development"],
            ["education", "skills", "technical skills", "references", "projects", "experience",
             "declaration", "personal skills", "soft skills", "languages", "membership",
             "activities", "volunteer", "volunteering", "referee", "referees"]
        )

        # FALLBACK B: education — scan for degree / institution lines when
        # section extractor returned nothing (heading not detected).
        if not education_text:
            _edu_kws = [
                'b.sc', 'b.tech', 'bsc', 'btech', 'm.sc', 'msc', 'bachelor',
                'master', 'university', 'institute of information', 'institute of technology',
                'college', 'g.c.e', 'advanced level', 'ordinary level',
                'hons', 'degree', 'faculty', 'sliit', 'moratuwa', 'peradeniya',
                # 'undergraduate' intentionally excluded — appears in profile/summary sections
            ]
            edu_lines = []
            for line in raw_text.splitlines():
                low = line.lower().strip()
                if any(kw in low for kw in _edu_kws) and len(line.strip()) > 8:
                    edu_lines.append(line.strip())
                if len(edu_lines) >= 12:
                    break
            if edu_lines:
                education_text = '\n'.join(edu_lines)

        if education_text and re.search(
            r"\b(work with|test cases|jira|trainee software engineer|research project|deep learning|expertise|"
            r"conduct market|industry trends|prioritizing|customer lifetime|associate lead)\b",
            education_text,
            re.IGNORECASE,
        ):
            rebuilt_education = rebuild_education_from_lines(raw_text)
            if rebuilt_education and re.search(
                r"\b(conduct market|industry trends|prioritizing|customer lifetime|associate lead)\b",
                rebuilt_education,
                re.IGNORECASE,
            ):
                rebuilt_education = ""
            if not rebuilt_education:
                rebuilt_education = rebuild_education_by_keyword_window(education_text)
            if rebuilt_education:
                education_text = rebuilt_education

        # FALLBACK B: certifications — scan beyond cert-title keywords to also
        # catch lines with well-known certification bodies / platforms.
        if not certs_text:
            _cert_body_kws = [
                'certificate', 'certification', 'coursera', 'udemy', 'simplilearn',
                'great learning', 'google cloud', 'microsoft', 'aws certified',
                'postman', 'pieces', 'test automation university', 'deeplearning',
                'stanford', 'linkedin learning', 'pluralsight', 'edx', 'kaggle',
            ]
            cert_lines = []
            for line in raw_text.splitlines():
                low = line.lower().strip()
                if any(kw in low for kw in _cert_body_kws) and len(line.strip()) > 5:
                    cert_lines.append(line.strip())
            if cert_lines:
                certs_text = '\n'.join(cert_lines)

        # Fallback: if skills extraction returned only a section heading (< 50 chars, no
        # commas or colons indicating actual skill content), do a multi-line scan instead.
        _skills_heading_only = (
            not skills_text
            or (len(skills_text.strip()) < 60
                and "," not in skills_text
                and ":" not in skills_text)
        )
        if _skills_heading_only:
            skill_lines = []
            in_skills = False
            _skill_heading_re = re.compile(
                r'^(technical\s+skills?|skills?|key\s+skills?|core\s+competencies)\s*$',
                re.IGNORECASE
            )
            _skills_end_re = re.compile(
                r'^(personal\s+skills?|soft\s+skills?|work\s+experience|experience|'
                r'education|certifications?|certificates?|projects?|references?|'
                r'languages?|membership|activities|volunteer|volunteering|declaration|about\s+me|'
                r'summary|profile)\s*$',
                re.IGNORECASE
            )
            for line in raw_text.splitlines():
                stripped = line.strip()
                if _skill_heading_re.match(stripped):
                    in_skills = True
                    continue
                if in_skills:
                    if _skills_end_re.match(stripped):
                        break
                    if stripped and len(stripped) > 2:
                        skill_lines.append(stripped)
                    if len(skill_lines) >= 40:
                        break
            if skill_lines:
                skills_text = "\n".join(skill_lines)
            elif not skills_text:
                # Last resort: find any single line with 4+ comma-separated short tokens
                for line in raw_text.splitlines():
                    stripped = line.strip()
                    parts = [p.strip() for p in stripped.split(",") if p.strip()]
                    if len(parts) >= 4 and all(len(p) < 40 for p in parts):
                        skills_text = stripped
                        break

        expertise_text = extract_expertise_section(raw_text)
        if expertise_text:
            skills_text = "\n".join(part for part in [expertise_text, skills_text] if part)

        # Fallback: if certs is still empty, try finding a line with "certificate" or course names
        if not certs_text:
            cert_lines = []
            for line in raw_text.splitlines():
                low = line.lower().strip()
                if any(kw in low for kw in ["certificate", "certification", "coursera", "udemy", "linkedin learning", "simplilearn"]):
                    cert_lines.append(line.strip())
            if cert_lines:
                certs_text = "\n".join(cert_lines)

        if certs_text and not has_certification_evidence:
            logger.info(
                f"[{original_filename or 'unknown CV'}] Ignoring certifications extraction because no certification evidence was found in CV text."
            )
            certs_text = ""

    # Parse structured data for display/CSV
    education_text = clean_education_text(education_text)
    prev_companies_display = parse_company_names_from_experience(prev_companies_text) if prev_companies_text else ""
    certs_display = parse_certification_names(certs_text) if certs_text else ""
    skills_display = parse_skills_list(skills_text) if skills_text else ""
    project_details = extract_project_evidence_from_text(raw_text)
    experience_details = "\n".join(
        part for part in [
            extract_experience_evidence_from_text(prev_companies_text or raw_text),
            project_details,
        ]
        if part
    )
    technologies_used = extract_technologies_from_text(
        (experience_details or prev_companies_text or "") + " " + (skills_display or skills_text or "")
    )
    experience_years_display = "N/A" if exp_source == "default" else str(experience_years)

    # As a final fallback, use a compact version of the full CV text
    compact_text = ""
    if raw_text and not (education_text or skills_text):
        compact_text = re.sub(r"\s+", " ", raw_text).strip()

    candidate = {
        "Name": name or "",
        "Email": email,
        "Age": age,
        "Experience_Years": experience_years,
        "Education": education_text or compact_text,
        # Use a cleaned skills list for display and for model text
        "Skills": skills_display or skills_text or compact_text,
        "Previous_Companies": prev_companies_text,
        # Certifications column shows the parsed certificate / course names
        "Certifications": certs_display or certs_text,
        "Job_Role_Applied": job_role or "",
        # Experience_Source: technologies / tools the candidate has used
        "Experience_Source": technologies_used,
        "Experience_Details": experience_details,
        "Project_Details": project_details,
        # Output-only columns (for preview/CSV)
        "Experience_Years_Output": experience_years_display,
        "Certifications_Output": certs_display or certs_text,
    }

    return candidate

def candidate_to_text_format(candidate):
    skills = normalize_text_for_matching(candidate.get('Skills', ''))
    certs = normalize_text_for_matching(candidate.get('Certifications', ''))
    experience = normalize_text_for_matching(
        candidate.get('Experience_Details', '') or candidate.get('Previous_Companies', '')
    )
    projects = normalize_text_for_matching(candidate.get('Project_Details', ''))
    technologies = normalize_text_for_matching(candidate.get('Experience_Source', ''))
    # Skills repeated 3x and certifications 2x so that explicitly listed skills/certs
    # outweigh incidental mentions. Experience is repeated because real project
    # and work evidence should affect fit, not only extracted skill headings.
    return (f"{normalize_text_for_matching(candidate.get('Education', ''))} "
            f"{skills} {skills} {skills} "
            f"{certs} {certs} "
            f"{experience} {experience} "
            f"{projects} "
            f"{technologies}")


r'''
UNUSED legacy manual scoring helpers.
Current candidate fit scoring is handled by semantic_matching.score_candidates().

def _contains_term(text, term):
    compact_text = re.sub(r"[^a-z0-9+#]+", "", (text or "").lower())
    compact_term = re.sub(r"[^a-z0-9+#]+", "", (term or "").lower())
    return bool(compact_term and compact_term in compact_text)


def _weighted_term_score(text, weighted_terms):
    if not weighted_terms:
        return 0.0

    total_weight = sum(weighted_terms.values())
    matched_weight = sum(
        weight for term, weight in weighted_terms.items()
        if _contains_term(text, term)
    )
    return (matched_weight / total_weight) * 100 if total_weight else 0.0


def _get_job_weighted_terms(job_text):
    lower_job = (job_text or "").lower()
    weighted_terms = {}

    base_terms = {
        "python": 4.0, "java": 3.0, "javascript": 3.0, "typescript": 3.0,
        "react": 3.0, "node": 3.0, "html": 2.0, "css": 2.0,
        "sql": 2.5, "mongodb": 2.0, "mysql": 2.0, "aws": 2.5,
        "docker": 2.0, "git": 1.5, "figma": 4.0, "wireframing": 3.0,
        "prototype": 3.0, "user research": 4.0, "usability testing": 3.5,
        "machine learning": 5.0, "deep learning": 5.0, "nlp": 4.0,
        "natural language processing": 4.0, "computer vision": 4.0,
        "tensorflow": 4.0, "pytorch": 4.0, "scikit-learn": 3.5,
        "pandas": 3.0, "numpy": 3.0, "spark": 3.0, "pyspark": 3.0,
        "snowflake": 2.5, "data engineering": 3.0, "selenium": 1.5,
        "playwright": 1.5, "jmeter": 1.0, "jenkins": 1.5,
    }

    for term, weight in base_terms.items():
        if _contains_term(lower_job, term):
            weighted_terms[term] = max(weighted_terms.get(term, 0), weight)

    if any(token in lower_job for token in ["ai engineer", "machine learning", "deep learning", "nlp", "computer vision"]):
        weighted_terms.update({
            "python": 4.0, "machine learning": 5.0, "deep learning": 5.0,
            "nlp": 4.0, "computer vision": 4.0, "tensorflow": 4.0,
            "pytorch": 4.0, "scikit-learn": 3.5, "pandas": 3.0,
            "numpy": 3.0, "spark": 3.0, "pyspark": 3.0,
            "snowflake": 2.5, "sql": 2.5, "aws": 2.5, "docker": 2.0,
            "data engineering": 3.0, "selenium": 1.5, "playwright": 1.5,
            "jmeter": 1.0, "jenkins": 1.5,
        })

    if any(token in lower_job for token in ["ui/ux", "ui ux", "designer", "user experience", "user interface"]):
        weighted_terms.update({
            "figma": 5.0, "ui": 4.0, "ux": 4.0, "wireframing": 4.0,
            "prototype": 4.0, "user research": 5.0, "usability testing": 4.0,
            "html": 2.0, "css": 2.0, "canva": 2.0,
        })

    software_role_patterns = [
        r"\bsoftware\s+engineers?\b",
        r"\bsoftware\s+developers?\b",
        r"\bfull[-\s]?stack\b",
    ]
    if any(re.search(pattern, lower_job) for pattern in software_role_patterns):
        weighted_terms.update({
            "java": 3.5, "javascript": 3.5, "typescript": 3.0,
            "react": 3.5, "node": 3.5, "python": 3.0, "php": 2.5,
            "html": 2.5, "css": 2.5, "sql": 3.0, "mongodb": 2.5,
            "mysql": 2.5, "git": 2.0, "docker": 2.0,
        })

    return weighted_terms


def _is_software_engineering_job(job_text):
    lower_job = (job_text or "").lower()
    software_role_patterns = [
        r"\bsoftware\s+engineers?\b",
        r"\bsoftware\s+developers?\b",
        r"\bfull[-\s]?stack\b",
        r"\bbackend\s+developers?\b",
        r"\bfrontend\s+developers?\b",
        r"\bweb\s+developers?\b",
        r"\bapplication\s+developers?\b",
    ]
    return any(re.search(pattern, lower_job) for pattern in software_role_patterns)


def _is_data_ai_job(job_text):
    lower_job = (job_text or "").lower()
    return any(token in lower_job for token in [
        "data engineer", "data engineering", "machine learning", "ml engineer",
        "ai engineer", "data scientist", "analytics engineer", "etl", "elt",
        "snowflake", "pyspark", "spark", "airflow", "data pipeline",
        "data quality", "semantic search", "large language model", "llm",
    ])


def _data_ai_profile_score(candidate_text):
    terms = {
        "python": 4.0, "sql": 4.0, "pyspark": 5.0, "spark": 4.0,
        "snowflake": 5.0, "aws glue": 4.0, "aws": 3.0, "airflow": 4.0,
        "great expectations": 5.0, "data engineering": 5.0,
        "data quality": 4.5, "data pipeline": 4.5, "etl": 3.5, "elt": 3.5,
        "s3": 3.0, "ods": 2.5, "medallion": 3.5, "bronze": 2.0,
        "silver": 2.0, "gold": 2.0, "stored procedure": 3.0,
        "cte": 2.5, "schema consistency": 3.5, "data completeness": 3.5,
        "referential integrity": 3.5, "json": 2.0, "html": 1.5,
        "pandas": 3.0, "numpy": 3.0, "machine learning": 4.0,
        "deep learning": 4.0, "tensorflow": 3.5, "pytorch": 3.5,
        "natural language processing": 3.0, "nlp": 3.0,
        "computer vision": 3.0, "fastapi": 3.5, "flask": 2.5,
        "django": 2.5, "rest api": 3.0, "postgresql": 3.5,
        "pgvector": 4.0, "vector embeddings": 4.0, "semantic search": 4.0,
        "large language models": 3.5, "llm": 3.5, "docker": 3.0,
        "kubernetes": 3.0, "helm": 2.5, "jenkins": 2.5,
        "github actions": 2.5, "linux": 2.0,
    }

    profile_score = _weighted_term_score(candidate_text, terms)

    pipeline_hits = sum(_contains_term(candidate_text, term) for term in [
        "pyspark", "snowflake", "great expectations", "data quality",
        "data pipeline", "s3", "ods", "medallion",
    ])
    ml_hits = sum(_contains_term(candidate_text, term) for term in [
        "machine learning", "deep learning", "tensorflow", "pytorch",
        "natural language processing", "nlp", "computer vision",
    ])
    api_ai_hits = sum(_contains_term(candidate_text, term) for term in [
        "fastapi", "postgresql", "pgvector", "vector embeddings",
        "semantic search", "large language models", "llm",
    ])
    devops_hits = sum(_contains_term(candidate_text, term) for term in [
        "docker", "kubernetes", "helm", "jenkins", "github actions", "aws",
    ])

    if pipeline_hits >= 5:
        profile_score += 12
    elif pipeline_hits >= 3:
        profile_score += 7
    if ml_hits >= 4:
        profile_score += 8
    if api_ai_hits >= 4:
        profile_score += 8
    if devops_hits >= 3:
        profile_score += 5

    return max(0.0, min(100.0, profile_score))


def _software_engineering_profile_score(candidate_text):
    terms = {
        "mern": 7.0, "next.js": 5.5, "nextjs": 5.5, "react": 4.5,
        "node.js": 4.5, "node": 4.5, "express": 4.0,
        "django": 5.0, "spring boot": 5.0, "laravel": 4.5,
        "asp.net core": 5.0, "asp.net": 4.5, ".net": 3.5, "fastapi": 3.0,
        "java": 3.5, "javascript": 3.5, "typescript": 3.5,
        "python": 2.5, "php": 2.5, "c++": 2.0, "kotlin": 1.5,
        "postgresql": 4.0, "mongodb": 3.5, "mysql": 3.5,
        "oracle sql": 3.0, "sql server": 3.0, "mssql": 3.0, "sqlite": 2.0,
        "aws": 3.0, "docker": 2.5, "git": 2.0, "github": 2.0,
        "azure devops": 2.5, "jira": 1.5, "rest api": 4.5,
        "api integration": 3.5, "restful": 4.0, "jwt": 2.5,
        "agile": 2.0, "scrum": 1.5, "oop": 2.5,
        "data structures": 2.5, "algorithms": 2.5, "sdlc": 2.0,
        "full-stack": 5.0, "full stack": 5.0, "product engineering": 3.5,
        "internship": 3.0, "intern": 2.0, "software engineer intern": 5.0,
        "software engineer": 4.0, "developer": 3.0, "enterprise": 2.0,
    }

    profile_score = _weighted_term_score(candidate_text, terms)

    frontend_hits = sum(_contains_term(candidate_text, term) for term in ["mern", "react", "next.js", "nextjs", "html", "css", "tailwind"])
    backend_hits = sum(_contains_term(candidate_text, term) for term in ["node", "express", "django", "spring boot", "laravel", "asp.net", ".net", "java", "php"])
    database_hits = sum(_contains_term(candidate_text, term) for term in ["mongodb", "mysql", "postgresql", "oracle sql", "sql server", "mssql"])
    if frontend_hits >= 2 and backend_hits >= 2 and database_hits >= 1:
        profile_score += 16
    elif backend_hits >= 2 and database_hits >= 1:
        profile_score += 9

    if sum(_contains_term(candidate_text, term) for term in ["django", "spring boot", "laravel", "asp.net", "node", "express"]) >= 3:
        profile_score += 8

    if _contains_term(candidate_text, "mern") and any(_contains_term(candidate_text, term) for term in ["asp.net", ".net", "oracle sql", "enterprise"]):
        profile_score += 10

    if all(_contains_term(candidate_text, term) for term in ["react", "asp.net", "node", "mssql"]):
        profile_score += 10

    if _contains_term(candidate_text, "software engineer intern") and any(_contains_term(candidate_text, term) for term in ["api integration", "azure devops", "product engineering"]):
        profile_score += 8

    if sum(_contains_term(candidate_text, term) for term in ["jwt", "docker", "rest api", "role-based access", "security"]) >= 3:
        profile_score += 7

    qa_focus = sum(_contains_term(candidate_text, term) for term in ["qa", "quality assurance", "selenium", "playwright", "jmeter", "testing"])
    ui_focus = sum(_contains_term(candidate_text, term) for term in ["ui/ux", "ui ux", "user research", "figma", "wireframing", "prototype"])
    data_focus = sum(_contains_term(candidate_text, term) for term in ["machine learning", "data engineering", "tensorflow", "pytorch", "snowflake", "pyspark"])
    mobile_ai_tool_focus = sum(_contains_term(candidate_text, term) for term in ["flutter", "react native", "powerbi", "chatgpt", "gemini", "ai tools"])

    if qa_focus >= 3 and backend_hits < 2:
        profile_score -= 14
    if ui_focus >= 3 and backend_hits < 2:
        profile_score -= 16
    if data_focus >= 3 and frontend_hits < 2 and backend_hits < 2:
        profile_score -= 12
    if mobile_ai_tool_focus >= 3 and backend_hits < 3:
        profile_score -= 7

    return max(0.0, min(100.0, profile_score))
'''


def _parse_experience_years(value):
    """Return numeric experience years from CSV/PDF extracted values."""
    if value is None:
        return None

    if isinstance(value, (int, float)):
        if pd.isna(value):
            return None
        return max(0.0, float(value))

    text = str(value).strip()
    if not text or text.lower() in {"n/a", "na", "none", "nan", "not found"}:
        return None

    match = re.search(r"\d+(?:\.\d+)?", text)
    if not match:
        return None

    return max(0.0, float(match.group(0)))


def _extract_required_experience_years(job_text):
    """Extract minimum years requested by the job description, if available."""
    lower_job = (job_text or "").lower()
    patterns = [
        r"(\d+(?:\.\d+)?)\s*\+\s*years?",
        r"minimum\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*years?",
        r"at\s+least\s+(\d+(?:\.\d+)?)\s*years?",
        r"(\d+(?:\.\d+)?)\s*(?:or\s+more|plus)\s+years?",
    ]

    for pattern in patterns:
        match = re.search(pattern, lower_job)
        if match:
            return max(0.5, float(match.group(1)))

    return None


def _experience_score(years, required_years=None):
    """Score candidate experience from 0-100 for a small final-score bonus."""
    if years is None:
        return 0.0

    if required_years:
        return min(100.0, (years / required_years) * 100)

    # When the job description does not state a requirement, treat 5 years as
    # enough to receive full experience credit.
    return min(100.0, (years / 5.0) * 100)


def predict_fit_batch_from_dataframe(df, job_text):
    import numpy as _np

    candidate_texts = []
    experience_years = []
    for _, row in df.iterrows():
        candidate = {
            "Education": row.get("Education", ""),
            "Skills": row.get("Skills", ""),
            "Previous_Companies": row.get("Previous_Companies", ""),
            "Certifications": row.get("Certifications", ""),
            "Job_Role_Applied": row.get("Job_Role_Applied", ""),
            "Experience_Source": row.get("Experience_Source", ""),
            "Experience_Details": row.get("Experience_Details", ""),
            "Project_Details": row.get("Project_Details", "")
        }
        candidate_texts.append(candidate_to_text_format(candidate))
        experience_years.append(_parse_experience_years(row.get("Experience_Years", None)))

    normalized_job_text = normalize_text_for_matching(job_text)
    required_experience_years = _extract_required_experience_years(normalized_job_text)
    experience_scores = _np.array([
        _experience_score(years, required_experience_years)
        for years in experience_years
    ])
    scaled = _np.array(score_semantic_candidates(
        candidate_texts,
        normalized_job_text,
        experience_scores=experience_scores,
    ))

    df_result = df.copy()
    scaled = _np.clip(scaled, 0, 99)
    df_result["Fit_Percentage"] = [round(float(s), 2) for s in scaled]

    return df_result.sort_values("Fit_Percentage", ascending=False).reset_index(drop=True)

r'''
UNUSED legacy CSV preview endpoint.
The active CandidateFitPredictor frontend uses /api/batch-predict-pdfs-preview.

@app.route('/api/batch-predict-preview', methods=['POST', 'OPTIONS'])
def batch_predict_preview():
    # Handle preflight request
    if request.method == 'OPTIONS':
        return '', 200

    try:
        if 'csv_file' not in request.files:
            return jsonify({'success': False, 'error': 'No CSV file uploaded'}), 400

        csv_file = request.files['csv_file']
        job_text = request.form.get('job_text', '')

        if not job_text:
            return jsonify({'success': False, 'error': 'Job description text is required'}), 400

        # Save temporary file
        csv_filename = secure_filename(csv_file.filename)
        csv_path = os.path.join(app.config['UPLOAD_FOLDER'], f"preview_{uuid.uuid4().hex}_{csv_filename}")
        csv_file.save(csv_path)

        try:
            # Read CSV and perform prediction
            df = pd.read_csv(csv_path)
            result_df = predict_fit_batch_from_dataframe(df, job_text)
            preview_data = result_df.to_dict('records')

            return jsonify({
                'success': True,
                'preview': preview_data,
                'columns': list(result_df.columns),
                'total_rows': len(result_df),
                'summary': {
                    'average_fit': round(result_df['Fit_Percentage'].mean(), 2),
                    'max_fit': round(result_df['Fit_Percentage'].max(), 2),
                    'min_fit': round(result_df['Fit_Percentage'].min(), 2)
                }
            })

        finally:
            # Clean up temporary preview file
            if os.path.exists(csv_path):
                os.remove(csv_path)
                logger.info(f"Cleaned up preview file: {csv_path}")

    except Exception as e:
        logger.error(f"Preview error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500
'''


@app.route('/api/batch-predict-pdfs-preview', methods=['POST', 'OPTIONS'])
def batch_predict_pdfs_preview():
    """
    Preview endpoint for PDF-based bulk CV upload.
    Accepts:
      - job_pdf: single PDF with the job description
      - candidate_pdfs: one or more candidate CV PDFs
    Returns only a small preview of the computed scores and summary stats.
    """
    if request.method == 'OPTIONS':
        return '', 200

    global model, vectorizer
    temp_files = []

    try:
        # The current PDF matching path uses semantic similarity scoring and
        # does not require the legacy pickled sklearn model. Try loading it for
        # health visibility, but do not block predictions on version mismatch.
        if model is None or vectorizer is None:
            if not load_model_global():
                logger.warning(
                    "Legacy CV model is unavailable; continuing with semantic similarity scoring."
                )

        if 'job_pdf' not in request.files:
            return jsonify({'success': False, 'error': 'No job description PDF uploaded'}), 400

        candidate_files = request.files.getlist('candidate_pdfs')
        if not candidate_files:
            return jsonify({'success': False, 'error': 'No candidate CV PDFs uploaded'}), 400

        job_pdf = request.files['job_pdf']

        if job_pdf.filename == '':
            return jsonify({'success': False, 'error': 'No job description PDF selected'}), 400

        if not allowed_file(job_pdf.filename):
            return jsonify({'success': False, 'error': 'Please upload a PDF file for the job description'}), 400

        # Save job description PDF temporarily
        job_pdf_filename = secure_filename(job_pdf.filename)
        job_pdf_path = os.path.join(
            app.config['UPLOAD_FOLDER'],
            f"preview_job_{uuid.uuid4().hex}_{job_pdf_filename}"
        )
        job_pdf.save(job_pdf_path)
        temp_files.append(job_pdf_path)

        job_text = extract_job_text_from_pdf(job_pdf_path)
        if not job_text:
            return jsonify({
                'success': False,
                'error': 'Could not extract text from job description PDF. Please ensure the PDF contains selectable text.'
            }), 400

        job_role = extract_job_role_from_job_text(job_text)

        rows = []

        # Build candidate rows from all uploaded PDFs.
        for file in candidate_files:
            if file.filename == '':
                continue

            if not allowed_file(file.filename) or not file.filename.lower().endswith('.pdf'):
                return jsonify({'success': False, 'error': 'All candidate files must be PDFs'}), 400

            candidate_filename = secure_filename(file.filename)
            candidate_path = os.path.join(
                app.config['UPLOAD_FOLDER'],
                f"preview_candidate_{uuid.uuid4().hex}_{candidate_filename}"
            )
            file.save(candidate_path)
            temp_files.append(candidate_path)

            candidate_features = extract_candidate_features_from_pdf(
                candidate_path, original_filename=candidate_filename, job_role=job_role
            )
            rows.append(candidate_features)

        if not rows:
            return jsonify({'success': False, 'error': 'No valid candidate PDFs were provided'}), 400

        df = pd.DataFrame(rows)

        result_df = predict_fit_batch_from_dataframe(df, job_text)

        # Same professional columns as CSV output (use display/parsed values)
        out_cols = [c for c in OUTPUT_COLUMNS if c in result_df.columns]
        output_df = result_df[out_cols].copy()
        if "Experience_Years_Output" in result_df.columns:
            output_df["Experience_Years"] = result_df["Experience_Years_Output"]
        if "Certifications_Output" in result_df.columns:
            output_df["Certifications"] = result_df["Certifications_Output"]
        preview_df = output_df

        return jsonify({
            'success': True,
            'preview': preview_df.to_dict('records'),
            'columns': out_cols,
            'total_rows': len(result_df),
            'summary': {
                'average_fit': round(result_df['Fit_Percentage'].mean(), 2),
                'max_fit': round(result_df['Fit_Percentage'].max(), 2),
                'min_fit': round(result_df['Fit_Percentage'].min(), 2)
            }
        })

    except Exception as e:
        logger.error(f"PDF preview error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

    finally:
        # Always clean up temporary files
        try:
            for file_path in temp_files:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.info(f"Cleaned up preview temp file: {file_path}")
        except Exception as e:
            logger.error(f"Error cleaning up preview temp files: {str(e)}")

@app.route('/api/test', methods=['GET'])
def test():
    global model_load_error
    
    # Try loading models if not already loaded
    if not is_model_loaded() and not load_model_global():
        logger.warning(f"⚠ Could not load models: {model_load_error[:150] if model_load_error else 'Unknown error'}")
    
    # Run cleanup on test endpoint to keep it active
    cleanup_old_files()

    return jsonify({
        'status': 'success',
        'message': 'API is working correctly',
        'config': {
            'model_path': MODEL_PATH,
            'vectorizer_path': VECTORIZER_PATH,
            'model_exists': os.path.exists(MODEL_PATH),
            'vectorizer_exists': os.path.exists(VECTORIZER_PATH),
            'upload_folder': app.config['UPLOAD_FOLDER'],
            'results_folder': app.config['RESULTS_FOLDER']
        },
        'model_loaded': is_model_loaded(),
        'model_error': model_load_error,
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/health', methods=['GET'])
def health_check():
    if not is_model_loaded():
        load_model_global()

    return jsonify({
        'status': 'healthy' if is_model_loaded() else 'degraded',
        'model_loaded': is_model_loaded(),
        'model_error': model_load_error,
        'config': {
            'model_path': MODEL_PATH,
            'vectorizer_path': VECTORIZER_PATH,
            'model_exists': os.path.exists(MODEL_PATH),
            'vectorizer_exists': os.path.exists(VECTORIZER_PATH)
        },
        'timestamp': datetime.now().isoformat()
    })


r'''
UNUSED legacy CSV + job-PDF endpoint.
The active CandidateFitPredictor frontend uses /api/batch-predict-pdfs.

@app.route('/api/batch-predict-csv', methods=['POST', 'OPTIONS'])
def batch_predict_csv():
    # Handle preflight request
    if request.method == 'OPTIONS':
        return '', 200

    global model, vectorizer

    # Ensure results folder exists
    os.makedirs(app.config['RESULTS_FOLDER'], exist_ok=True)

    # Run cleanup occasionally
    if datetime.now().minute % 10 == 0:
        cleanup_old_files()

    # The active CSV matching path does not require the legacy pickled model.
    if model is None or vectorizer is None:
        if not load_model_global():
            logger.warning(
                "Legacy CV model is unavailable; continuing with semantic similarity scoring."
            )

    temp_files = []
    output_path = None

    try:
        # Check if files are present
        if 'csv_file' not in request.files:
            return jsonify({'success': False, 'error': 'No CSV file uploaded'}), 400

        if 'job_pdf' not in request.files:
            return jsonify({'success': False, 'error': 'No PDF file uploaded'}), 400

        csv_file = request.files['csv_file']
        pdf_file = request.files['job_pdf']

        if csv_file.filename == '':
            return jsonify({'success': False, 'error': 'No CSV file selected'}), 400

        if pdf_file.filename == '':
            return jsonify({'success': False, 'error': 'No PDF file selected'}), 400

        # Validate file types
        if not allowed_file(csv_file.filename) or not csv_file.filename.endswith('.csv'):
            return jsonify({'success': False, 'error': 'Please upload a CSV file'}), 400

        if not allowed_file(pdf_file.filename):
            return jsonify({'success': False, 'error': 'Please upload a PDF file'}), 400

        # Save uploaded files
        csv_filename = secure_filename(csv_file.filename)
        csv_path = os.path.join(app.config['UPLOAD_FOLDER'], f"input_{uuid.uuid4().hex}_{csv_filename}")
        csv_file.save(csv_path)
        temp_files.append(csv_path)

        pdf_filename = secure_filename(pdf_file.filename)
        pdf_path = os.path.join(app.config['UPLOAD_FOLDER'], f"job_{uuid.uuid4().hex}_{pdf_filename}")
        pdf_file.save(pdf_path)
        temp_files.append(pdf_path)

        # Extract text from PDF
        job_text = extract_job_text_from_pdf(pdf_path)

        if not job_text:
            return jsonify({
                'success': False,
                'error': 'Could not extract text from PDF. Please ensure the PDF contains selectable text.'
            }), 400

        # Read CSV file
        try:
            df = pd.read_csv(csv_path)
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Error reading CSV file: {str(e)}'
            }), 400

        # Validate required columns
        required_columns = ['Age', 'Experience_Years']
        missing_columns = [col for col in required_columns if col not in df.columns]

        if missing_columns:
            return jsonify({
                'success': False,
                'error': f'CSV missing required columns: {", ".join(missing_columns)}'
            }), 400

        # Perform prediction
        logger.info(f"Starting batch prediction for {len(df)} candidates...")
        result_df = predict_fit_batch_from_dataframe(df, job_text)

        # Save result file in results folder
        output_filename = f"results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        output_path = os.path.join(app.config['RESULTS_FOLDER'], output_filename)
        result_df.to_csv(output_path, index=False)

        # Verify file was saved
        if not os.path.exists(output_path):
            logger.error(f"Failed to save result file: {output_path}")
            return jsonify({'success': False, 'error': 'Failed to save result file'}), 500

        file_size = os.path.getsize(output_path)
        logger.info(f"Batch prediction completed. Results saved to {output_path} (size: {file_size} bytes)")

        # Prepare summary data
        summary = {
            'average_fit': round(result_df['Fit_Percentage'].mean(), 2),
            'max_fit': round(result_df['Fit_Percentage'].max(), 2),
            'min_fit': round(result_df['Fit_Percentage'].min(), 2)
        }

        # Add top candidates if Name column exists
        if 'Name' in result_df.columns:
            summary['top_candidates'] = result_df.nlargest(5, 'Fit_Percentage')[['Name', 'Fit_Percentage']].to_dict(
                'records')

        return jsonify({
            'success': True,
            'message': f'Successfully processed {len(df)} candidates',
            'result_file': output_filename,
            'download_url': f'/api/download/{output_filename}',
            'total_candidates': len(df),
            'summary': summary
        })

    except Exception as e:
        logger.error(f"Batch prediction error: {str(e)}")
        logger.error(traceback.format_exc())
        # If there was an error and we created the output file, clean it up
        if output_path and os.path.exists(output_path):
            try:
                os.remove(output_path)
                logger.info(f"Cleaned up output file due to error: {output_path}")
            except:
                pass
        return jsonify({'success': False, 'error': str(e)}), 500

    finally:
        # Clean up temporary input files only (PDF and input CSV)
        for file_path in temp_files:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.info(f"Cleaned up temporary file: {file_path}")
            except Exception as e:
                logger.error(f"Error cleaning up file {file_path}: {str(e)}")
'''


@app.route('/api/batch-predict-pdfs', methods=['POST', 'OPTIONS'])
def batch_predict_pdfs():
    """
    New endpoint to support uploading multiple candidate CV PDFs plus a
    single job description PDF instead of an employee CSV file.
    """
    if request.method == 'OPTIONS':
        return '', 200

    global model, vectorizer

    os.makedirs(app.config['RESULTS_FOLDER'], exist_ok=True)

    if model is None or vectorizer is None:
        if not load_model_global():
            logger.warning(
                "Legacy CV model is unavailable; continuing with semantic similarity scoring."
            )

    temp_files = []
    output_path = None

    try:
        if 'job_pdf' not in request.files:
            return jsonify({'success': False, 'error': 'No job description PDF uploaded'}), 400

        # Expect multiple candidate CV PDFs under the key "candidate_pdfs"
        candidate_files = request.files.getlist('candidate_pdfs')
        if not candidate_files:
            return jsonify({'success': False, 'error': 'No candidate CV PDFs uploaded'}), 400

        job_pdf = request.files['job_pdf']

        if job_pdf.filename == '':
            return jsonify({'success': False, 'error': 'No job description PDF selected'}), 400

        if not allowed_file(job_pdf.filename):
            return jsonify({'success': False, 'error': 'Please upload a PDF file for the job description'}), 400

        # Save job description PDF
        job_pdf_filename = secure_filename(job_pdf.filename)
        job_pdf_path = os.path.join(
            app.config['UPLOAD_FOLDER'],
            f"job_{uuid.uuid4().hex}_{job_pdf_filename}"
        )
        job_pdf.save(job_pdf_path)
        temp_files.append(job_pdf_path)

        job_text = extract_job_text_from_pdf(job_pdf_path)
        if not job_text:
            return jsonify({
                'success': False,
                'error': 'Could not extract text from job description PDF. Please ensure the PDF contains selectable text.'
            }), 400

        job_role = extract_job_role_from_job_text(job_text)

        rows = []

        for file in candidate_files:
            if file.filename == '':
                continue

            if not allowed_file(file.filename) or not file.filename.lower().endswith('.pdf'):
                return jsonify({'success': False, 'error': 'All candidate files must be PDFs'}), 400

            candidate_filename = secure_filename(file.filename)
            candidate_path = os.path.join(
                app.config['UPLOAD_FOLDER'],
                f"candidate_{uuid.uuid4().hex}_{candidate_filename}"
            )
            file.save(candidate_path)
            temp_files.append(candidate_path)

            candidate_features = extract_candidate_features_from_pdf(
                candidate_path, original_filename=candidate_filename, job_role=job_role
            )
            rows.append(candidate_features)

        if not rows:
            return jsonify({'success': False, 'error': 'No valid candidate PDFs were provided'}), 400

        df = pd.DataFrame(rows)

        logger.info(f"Starting batch prediction for {len(df)} candidates from PDF CVs...")
        result_df = predict_fit_batch_from_dataframe(df, job_text)

        # Build professional output: same columns as preview (use display/parsed values)
        out_cols = [c for c in OUTPUT_COLUMNS if c in result_df.columns]
        output_df = result_df[out_cols].copy()
        if "Experience_Years_Output" in result_df.columns:
            output_df["Experience_Years"] = result_df["Experience_Years_Output"]
        if "Certifications_Output" in result_df.columns:
            output_df["Certifications"] = result_df["Certifications_Output"]

        output_filename = f"results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        output_path = os.path.join(app.config['RESULTS_FOLDER'], output_filename)
        output_df.to_csv(output_path, index=False)

        if not os.path.exists(output_path):
            logger.error(f"Failed to save result file: {output_path}")
            return jsonify({'success': False, 'error': 'Failed to save result file'}), 500

        summary = {
            'average_fit': round(result_df['Fit_Percentage'].mean(), 2),
            'max_fit': round(result_df['Fit_Percentage'].max(), 2),
            'min_fit': round(result_df['Fit_Percentage'].min(), 2)
        }

        if 'Name' in result_df.columns:
            summary['top_candidates'] = result_df.nlargest(
                5, 'Fit_Percentage'
            )[['Name', 'Fit_Percentage']].to_dict('records')

        return jsonify({
            'success': True,
            'message': f'Successfully processed {len(df)} candidate CV PDFs',
            'result_file': output_filename,
            'download_url': f'/api/download/{output_filename}',
            'total_candidates': len(df),
            'summary': summary
        })

    except Exception as e:
        logger.error(f"Batch prediction from PDFs error: {str(e)}")
        logger.error(traceback.format_exc())
        if output_path and os.path.exists(output_path):
            try:
                os.remove(output_path)
                logger.info(f"Cleaned up output file due to error: {output_path}")
            except Exception:
                pass
        return jsonify({'success': False, 'error': str(e)}), 500

    finally:
        for file_path in temp_files:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.info(f"Cleaned up temporary file: {file_path}")
            except Exception as e:
                logger.error(f"Error cleaning up file {file_path}: {str(e)}")


@app.route('/api/download/<filename>', methods=['GET'])
def download_file(filename):
    try:
        # Sanitize the filename
        filename = secure_filename(filename)

        # Only allow downloading result files
        if not filename.startswith('results_') or not filename.endswith('.csv'):
            logger.error(f"Invalid filename requested: {filename}")
            return jsonify({'success': False, 'error': 'Invalid file request'}), 400

        # Get the results folder path from config
        results_folder = app.config['RESULTS_FOLDER']
        file_path = os.path.join(results_folder, filename)

        # Normalize the path
        file_path = os.path.normpath(file_path)

        logger.info(f"Looking for file: {file_path}")
        logger.info(f"Results folder exists: {os.path.exists(results_folder)}")

        if os.path.exists(results_folder):
            files_in_results = os.listdir(results_folder)
            logger.info(f"Files in results folder: {files_in_results}")

        # Check if file exists
        if not os.path.exists(file_path):
            logger.error(f"File not found: {file_path}")

            # Try the uploads folder as fallback (for backward compatibility)
            alt_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            if os.path.exists(alt_path):
                file_path = alt_path
                logger.info(f"Found file in uploads folder: {alt_path}")
            else:
                return jsonify({
                    'success': False,
                    'error': f'File {filename} not found. Please run batch prediction first.'
                }), 404

        # Verify it's a file
        if not os.path.isfile(file_path):
            logger.error(f"Path is not a file: {file_path}")
            return jsonify({'success': False, 'error': 'Invalid file path'}), 400

        # Get file size for logging
        file_size = os.path.getsize(file_path)
        logger.info(f"Sending file: {filename}, size: {file_size} bytes from {file_path}")

        # Send the file
        return send_file(
            file_path,
            as_attachment=True,
            download_name=filename,
            mimetype='text/csv'
        )

    except FileNotFoundError as e:
        logger.error(f"File not found error: {str(e)}")
        return jsonify({'success': False, 'error': f'File not found: {filename}'}), 404
    except Exception as e:
        logger.error(f"Download error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500


r'''
UNUSED optional admin endpoints.
The current frontend does not call manual cleanup or result listing.

@app.route('/api/cleanup', methods=['POST'])
def manual_cleanup():
    """
    Manual endpoint to trigger cleanup of old result files
    """
    try:
        cleanup_old_files()
        return jsonify({
            'success': True,
            'message': 'Cleanup completed successfully'
        })
    except Exception as e:
        logger.error(f"Manual cleanup error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/list-results', methods=['GET'])
# UNUSED by the current frontend.
# Optional admin/history endpoint; downloads work through /api/download/<filename>.
def list_results():
    """
    List all available result files
    """
    try:
        files = []
        for filename in os.listdir(app.config['RESULTS_FOLDER']):
            if filename.startswith('results_') and filename.endswith('.csv'):
                file_path = os.path.join(app.config['RESULTS_FOLDER'], filename)
                file_stats = os.stat(file_path)
                files.append({
                    'filename': filename,
                    'size': file_stats.st_size,
                    'created': datetime.fromtimestamp(file_stats.st_ctime).isoformat(),
                    'download_url': f'/api/download/{filename}'
                })

        # Sort by creation time, newest first
        files.sort(key=lambda x: x['created'], reverse=True)

        return jsonify({
            'success': True,
            'files': files,
            'total': len(files)
        })
    except Exception as e:
        logger.error(f"List results error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
'''


# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'success': False, 'error': 'Internal server error'}), 500


if __name__ == '__main__':
    logger.info("Starting Flask API server...")
    logger.info(f"Using model path: {Config.MODEL_SAVE_PATH}")
    logger.info(f"Using vectorizer path: {Config.VECTORIZER_SAVE_PATH}")
    logger.info(f"Upload folder: {app.config['UPLOAD_FOLDER']}")
    logger.info(f"Results folder: {app.config['RESULTS_FOLDER']}")

    # Run initial cleanup
    cleanup_old_files()

    if os.path.exists(Config.MODEL_SAVE_PATH) and os.path.exists(Config.VECTORIZER_SAVE_PATH):
        load_model_global()
    else:
        logger.warning("Model files not found. API will return errors until models are loaded.")
        logger.warning(f"Please ensure model exists at: {Config.MODEL_SAVE_PATH}")
        logger.warning(f"Please ensure vectorizer exists at: {Config.VECTORIZER_SAVE_PATH}")

    app.run(debug=True, host='0.0.0.0', port=5001)
