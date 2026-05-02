from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import joblib
import pandas as pd
from scipy.sparse import hstack
import pdfplumber
import os
import sys
import warnings
from werkzeug.utils import secure_filename
import logging
from datetime import datetime
import json
import traceback
import tempfile
import time
import re
import uuid

# Import your existing working modules
from Setup_File import logger
from config import Config
from Train import train_model

# ──────────────────────────────────────────────────────────────────────
# Gemini toggle  →  1 = use Gemini 2.0 Flash (needs internet + API key)
#                   0 = use local regex extraction only
USE_GEMINI = 1
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "AIzaSyDNAGWa709_DJX1kHZW_wg1VvaH4lq7U7U")

if USE_GEMINI:
    try:
        from google import genai as _genai_mod
        if GEMINI_API_KEY:
            _gemini_client = _genai_mod.Client(api_key=GEMINI_API_KEY)
        else:
            import logging as _lg
            _lg.getLogger(__name__).warning(
                "USE_GEMINI=1 but GEMINI_API_KEY env var is not set — Gemini disabled")
            USE_GEMINI = 0
            _gemini_client = None
    except ImportError:
        import logging as _lg
        _lg.getLogger(__name__).warning(
            "google-genai not installed — Gemini disabled. "
            "Run: pip install google-genai")
        USE_GEMINI = 0
        _gemini_client = None
else:
    _gemini_client = None
# ──────────────────────────────────────────────────────────────────────

# Get absolute paths and override Config paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)  # Add current dir to path
MODEL_PATH = os.path.join(BASE_DIR, "CV Models", "cv_job_fit_model.pkl")
VECTORIZER_PATH = os.path.join(BASE_DIR, "CV Models", "cv_job_fit_vectorizer.pkl")

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
                    import importlib
                    import sklearn
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

    is_two_column = (
        len(right_words) > 5
        and len(centre_words) < max(len(left_words), len(right_words)) * 0.25
    )

    # FIX: strip leading bullet/special chars from word text so "•Python" → "Python"
    _BULLET_STRIP = re.compile(r'^[•‣◦⁃∙•\-\*]+\s*')

    def _clean_word(text):
        return _BULLET_STRIP.sub('', text).strip()

    if is_two_column:
        # FIX: use non-overlapping halves so split_x is always inside the gap
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
    """Extract the job title/position from job description text."""
    if not job_text or not job_text.strip():
        return ""
    lines = [ln.strip() for ln in job_text.splitlines() if ln.strip()]
    # Common patterns: "Job Title:", "Position:", "Role:", "Job:", first substantial line
    patterns = [
        r"(?:job\s*title|position|role|job\s*type)[:\s\-]+(.+?)(?:\n|$)",
        r"(?:we\s+are\s+looking\s+for|seeking|hiring)\s+(?:a|an)?\s*(.+?)(?:\s+to|\s+who|\.|$)",
        r"^([A-Z][A-Za-z\s&\-\/]+(?:Engineer|Analyst|Developer|Manager|Specialist|Lead|Consultant))(?:\s|$|,|\.)",
    ]
    for pat in patterns:
        m = re.search(pat, job_text, re.IGNORECASE | re.MULTILINE)
        if m:
            role = m.group(1).strip()
            if len(role) > 3 and len(role) < 80:
                return role
    if lines:
        first = lines[0]
        if len(first) > 3 and len(first) < 80 and not first.startswith(("http", "www", "©")):
            return first
    return ""


def extract_technologies_from_text(text):
    """Extract programming languages and tools from experience/skills text."""
    if not text or not text.strip():
        return ""
    lower = text.lower()
    found = set()
    techs = [
        "python", "java", "javascript", "typescript", "sql", "r", "c++", "c#", "scala", "go", "kotlin", "swift", "php", "ruby", "matlab", "sas",
        "power bi", "powerbi", "excel", "tableau", "spark", "hadoop", "tensorflow", "pytorch", "scikit-learn", "pandas", "numpy",
        "nlp", "machine learning", "data visualization", "etl", "aws", "azure", "gcp", "docker", "kubernetes", "git", "jira", "agile",
        "figma", "react", "node", "vue", "django", "flask", "html", "css", "mongodb", "postgresql", "mysql", "jupyter"
    ]
    for t in techs:
        if t.replace(" ", "") in lower.replace(" ", "") or t in lower:
            label = "Power BI" if t in ("power bi", "powerbi") else (t.title() if " " not in t or t in ("power bi", "powerbi") else t.title())
            found.add(label)
    return ", ".join(sorted(found)) if found else ""


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
    parts = re.split(r"[•\-\–\—\n;]", text)
    certs = []
    for p in parts:
        p = p.strip()
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
    if name:
        name = name.title()

    # 2. Strip redundant section header words from the start of each text field
    _HDR = re.compile(
        r"^\s*(education|skills?|technical\s+skills?|certifications?|certificates?|"
        r"experience|work\s+experience|soft\s+skills?|core\s+competencies)\s*[:\-]?\s*",
        re.IGNORECASE
    )
    education_text = _HDR.sub("", education_text).strip()

    # 3. Flatten list fields and strip headers from each item
    def _clean_list(lst):
        if isinstance(lst, list):
            return [_HDR.sub("", str(i)).strip() for i in lst if str(i).strip()]
        return []

    skills_list = _clean_list(skills_list)
    certs_list = _clean_list(certs_list)
    prev_companies_list = _clean_list(prev_companies_list)

    if not name and original_filename:
        name = os.path.splitext(original_filename)[0].replace("_", " ").title()

    skills_text = ", ".join(skills_list) if isinstance(skills_list, list) else str(skills_list)
    certs_text = ", ".join(certs_list) if isinstance(certs_list, list) else str(certs_list)
    prev_companies_text = ", ".join(prev_companies_list) if isinstance(prev_companies_list, list) else str(prev_companies_list)

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
        "Experience_Years_Output": str(round(exp_years_num, 1)) if exp_source == "gemini" else "N/A",
        "Certifications_Output": certs_text,
    }

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
            "PostgreSQL": "__POSTGRESQL2__",
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
        try:
            exp_patterns = [
                r"(\d+)\+?\s+years?\s+of\s+(?:experience|work)",
                r"experience[:\s]+(\d+)\+?\s*years?",
                r"(\d+)\s*years?\s+(?:of\s+)?experience",
                r"(\d+)\+?\s+years?\s+experience",
                r"over\s+(\d+)\s+years",
                r"(\d+)\s+years?\s+in\s+(?:the\s+)?industry",
            ]
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
                _current_year, _current_month = 2026, 4
                _date_re = re.compile(
                    r'(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(\d{4})' +
                    r'\s*[-\u2013\u2014]\s*' +
                    r'(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(\d{4}|present)',
                    re.IGNORECASE
                )
                total_months = 0
                for sm, sy, em, ey in _date_re.findall(raw_text):
                    try:
                        sy_i = int(sy)
                        sm_i = _month_map.get(sm[:3].lower(), 1) if sm else 1
                        if ey.lower() == 'present':
                            ey_i, em_i = _current_year, _current_month
                        else:
                            ey_i = int(ey)
                            em_i = _month_map.get(em[:3].lower(), 12) if em else 12
                        if 1990 <= sy_i <= _current_year and sy_i <= ey_i:
                            months = (ey_i - sy_i) * 12 + (em_i - sm_i)
                            if 0 < months <= 600:
                                total_months += months
                    except (ValueError, AttributeError):
                        continue
                if total_months > 0:
                    experience_years = min(round(total_months / 12 * 2) / 2, 50)
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
    if not name and original_filename:
        base_name = os.path.splitext(original_filename)[0]
        name = base_name.replace("_", " ")

    # Extract Education, Skills, Previous_Companies, Certifications from CV sections
    education_text = ""
    skills_text = ""
    prev_companies_text = ""
    certs_text = ""

    if raw_text:
        lower = raw_text.lower()

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

            section = raw_text[start_idx:end_idx]
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
             "volunteer", "profile", "summary", "about me"]
        )

        skills_text = extract_section(
            ["skills", "technical skills", "key skills", "core competencies"],
            ["experience", "work experience", "projects", "certifications", "certificates",
             "education", "soft skills", "personal skills", "references", "declaration",
             "languages", "tools & technologies", "membership", "activities", "volunteer",
             "profile", "summary", "about me", "referee", "referees"]
        )

        prev_companies_text = extract_section(
            ["work experience", "professional experience", "employment history", "experience"],
            ["education", "skills", "technical skills", "key skills", "certifications",
             "certificates", "projects", "references", "languages", "personal skills",
             "soft skills", "membership", "activities", "volunteer"]
        )

        certs_text = extract_section(
            ["certificates", "certifications", "certification", "licenses", "professional development"],
            ["education", "skills", "technical skills", "references", "projects", "experience",
             "declaration", "personal skills", "soft skills", "languages", "membership",
             "activities", "volunteer", "referee", "referees"]
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
                r'languages?|membership|activities|volunteer|declaration|about\s+me|'
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

        # Fallback: if certs is still empty, try finding a line with "certificate" or course names
        if not certs_text:
            cert_lines = []
            for line in raw_text.splitlines():
                low = line.lower().strip()
                if any(kw in low for kw in ["certificate", "certification", "coursera", "udemy", "linkedin learning", "simplilearn"]):
                    cert_lines.append(line.strip())
            if cert_lines:
                certs_text = "\n".join(cert_lines)

    # Parse structured data for display/CSV
    prev_companies_display = parse_company_names_from_experience(prev_companies_text) if prev_companies_text else ""
    certs_display = parse_certification_names(certs_text) if certs_text else ""
    skills_display = parse_skills_list(skills_text) if skills_text else ""
    technologies_used = extract_technologies_from_text(
        (prev_companies_text or "") + " " + (skills_display or skills_text or "")
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
        # Output-only columns (for preview/CSV)
        "Experience_Years_Output": experience_years_display,
        "Certifications_Output": certs_display or certs_text,
    }

    return candidate

def candidate_to_text_format(candidate):
    skills = candidate.get('Skills', '')
    certs  = candidate.get('Certifications', '')
    # Skills repeated 3x and certifications 2x so that explicitly listed skills/certs
    # outweigh incidental mentions of a technology inside project descriptions.
    return (f"{candidate.get('Education', '')} "
            f"{skills} {skills} {skills} "
            f"{certs} {certs} "
            f"{candidate.get('Previous_Companies', '')} "
            f"{candidate.get('Job_Role_Applied', '')}")


def predict_fit_batch_from_dataframe(df, job_text):
    import numpy as _np
    from sklearn.feature_extraction.text import TfidfVectorizer as _TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity as _cosine_similarity

    candidate_texts = []
    for _, row in df.iterrows():
        candidate = {
            "Education": row.get("Education", ""),
            "Skills": row.get("Skills", ""),
            "Previous_Companies": row.get("Previous_Companies", ""),
            "Certifications": row.get("Certifications", ""),
            "Job_Role_Applied": row.get("Job_Role_Applied", "")
        }
        candidate_texts.append(candidate_to_text_format(candidate))

    all_texts = candidate_texts + [job_text]
    tfidf = _TfidfVectorizer(stop_words="english", max_features=500, ngram_range=(1, 2))
    tfidf_matrix = tfidf.fit_transform(all_texts)

    job_vector = tfidf_matrix[-1]
    candidate_vectors = tfidf_matrix[:-1]
    raw_sim = _cosine_similarity(candidate_vectors, job_vector).flatten()

    # Scale scores to a meaningful 0–100 range.
    # Map: raw 0 → 10 (minimum baseline), raw max → 95 (best possible).
    # This keeps relative ranking intact while producing readable percentages.
    sim_min = raw_sim.min()
    sim_max = raw_sim.max()
    if sim_max > sim_min:
        scaled = 10 + (raw_sim - sim_min) / (sim_max - sim_min) * 85
    else:
        scaled = _np.full_like(raw_sim, 50.0)

    df_result = df.copy()
    df_result["Fit_Percentage"] = [round(float(s), 2) for s in scaled]

    return df_result.sort_values("Fit_Percentage", ascending=False).reset_index(drop=True)


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
            preview_data = result_df.head(10).to_dict('records')

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
        # Ensure model is ready
        if model is None or vectorizer is None:
            if not load_model_global():
                return jsonify({
                    'success': False,
                    'error': model_load_error or 'Model not loaded. Please check server logs.',
                    'details': {
                        'model_exists': os.path.exists(Config.MODEL_SAVE_PATH),
                        'vectorizer_exists': os.path.exists(Config.VECTORIZER_SAVE_PATH),
                        'model_error': model_load_error
                    }
                }), 500

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

        # Build candidate rows from PDFs (limit preview to first 20 candidates for performance)
        for idx, file in enumerate(candidate_files):
            if idx >= 20:
                break

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
        preview_df = output_df.head(10)

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

    # Check if model is loaded
    if model is None or vectorizer is None:
        if not load_model_global():
            return jsonify({
                'success': False,
                'error': model_load_error or 'Model not loaded. Please check server logs.',
                'details': {
                    'model_exists': os.path.exists(Config.MODEL_SAVE_PATH),
                    'vectorizer_exists': os.path.exists(Config.VECTORIZER_SAVE_PATH),
                    'model_error': model_load_error
                }
            }), 500

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
            return jsonify({
                'success': False,
                'error': 'Model not loaded. Please check server logs.',
                'details': {
                    'model_exists': os.path.exists(Config.MODEL_SAVE_PATH),
                    'vectorizer_exists': os.path.exists(Config.VECTORIZER_SAVE_PATH)
                }
            }), 500

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