from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
from datetime import datetime
import traceback
import sys
import os
import re
import json
import uuid
import threading
import math

# Load .env so OPENAI_API_KEY is set before QuestionGenerator/Config are imported
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
                        if _k:
                            os.environ[_k] = _v
            return
_load_dotenv()

import openai
openai.api_key = os.getenv("OPENAI_API_KEY") or ""

from InterviewDataProcessor import InterviewDataProcessor
from QuestionGenerator import QuestionGenerator
from PredictModel import predict_similarity
import Config as CF


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("interview_api.log")
    ]
)
logger = logging.getLogger("InterviewAPI")

# Log whether OpenAI key is available (so you see it when API starts)
_key = os.getenv("OPENAI_API_KEY") or ""
if _key and len(_key) > 20:
    logger.info("OPENAI_API_KEY is set (source: env or .env). Questions will use OpenAI when valid.")
else:
    logger.warning("OPENAI_API_KEY is missing or too short. Create Dynamic_Interview/.env with: OPENAI_API_KEY=sk-your-key")

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

data_processor = None

_STORE_LOCK = threading.Lock()
_STORE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "interviews_store.json")


def _load_store():
    if not os.path.exists(_STORE_PATH):
        return {"interviews": {}}

    try:
        with open(_STORE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, dict):
            return {"interviews": {}}

        if "interviews" not in data or not isinstance(data["interviews"], dict):
            data["interviews"] = {}

        return data
    except Exception:
        return {"interviews": {}}


def _save_store(store):
    tmp_path = _STORE_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, _STORE_PATH)


def _normalize_role(role: str) -> str:
    return (role or "").strip()


def _pick_questions_with_ideal_answers(role: str, n_questions: int):
    """
    Generate unique questions + matching ideal answers using OpenAI.
    Falls back to predefined unique pairs if generation fails.
    """
    _load_dotenv()
    openai.api_key = os.getenv("OPENAI_API_KEY") or ""
    role = _normalize_role(role)
    n_questions = int(n_questions) if n_questions else 10
    n_questions = max(1, min(10, n_questions))

    questions = []
    ideal_answers = []
    skills = []
    previous_questions = []
    seen = set()
    openai_success_count = 0

    for _ in range(n_questions):
        try:
            item = QuestionGenerator.generate_question_with_ideal_answer(
                role=role,
                previous_questions=previous_questions
            )

            q = str(item.get("question", "")).strip()
            a = str(item.get("ideal_answer", "")).strip()
            s = str(item.get("skill", "General")).strip() or "General"

            if not q or not a:
                logger.warning("OpenAI returned empty question or ideal answer")
                continue

            q_key = q.lower()
            if q_key in seen:
                logger.warning(f"Duplicate OpenAI question skipped: {q}")
                continue

            questions.append(q)
            ideal_answers.append(a)
            skills.append(s)
            previous_questions.append(q)
            seen.add(q_key)
            openai_success_count += 1

        except Exception as e:
            logger.warning(f"OpenAI generation failed for role '{role}': {e}")

    fallback_pairs = [
        (
            f"What experience do you have as a {role}?",
            f"A strong answer should explain relevant experience as a {role}, the main tools or technologies used, challenges handled, and measurable outcomes.",
            "Experience"
        ),
        (
            f"Describe a challenging project you handled as a {role}.",
            f"A strong answer should describe the project context, responsibilities, technical challenges, actions taken, and the final result.",
            "Project Delivery"
        ),
        (
            f"What are the most important skills for a {role}?",
            f"A strong answer should mention core technical skills, problem-solving ability, communication, collaboration, and role-specific best practices.",
            "Core Skills"
        ),
        (
            f"How do you approach problem-solving in a {role} position?",
            f"A strong answer should explain a structured approach such as understanding the issue, analyzing options, implementing a solution, testing, and learning from results.",
            "Problem Solving"
        ),
        (
            f"How do you stay updated with trends and tools related to {role}?",
            f"A strong answer should mention continuous learning through documentation, courses, community discussions, practical experimentation, and applying new knowledge appropriately.",
            "Continuous Learning"
        ),
        (
            f"How do you measure success in a {role} role?",
            f"A strong answer should explain measurable outcomes, KPIs, quality of work, stakeholder value, and continuous improvement.",
            "Impact Measurement"
        ),
        (
            f"How do you communicate technical findings as a {role} to non-technical stakeholders?",
            f"A strong answer should explain simplifying complex ideas, using visuals or examples, focusing on business impact, and adapting communication to the audience.",
            "Communication"
        ),
        (
            f"What tools and techniques do you use most often as a {role}?",
            f"A strong answer should mention role-specific tools, why they are used, how they improve efficiency, and examples of practical use.",
            "Tools and Techniques"
        ),
        (
            f"Describe a time when you improved a process in your {role} work.",
            f"A strong answer should describe the original process, the problem identified, the improvement made, and the measurable impact.",
            "Process Improvement"
        ),
        (
            f"What challenges are common in a {role} position, and how do you handle them?",
            f"A strong answer should identify realistic role challenges, explain a practical strategy to address them, and show problem-solving ability.",
            "Risk Handling"
        ),
    ]

    for fq, fa, fs in fallback_pairs:
        if len(questions) >= n_questions:
            break

        fq_key = fq.lower()
        if fq_key not in seen:
            questions.append(fq)
            ideal_answers.append(fa)
            skills.append(fs)
            previous_questions.append(fq)
            seen.add(fq_key)

    logger.info(
        f"_pick_questions_with_ideal_answers: role={role}, OpenAI success count={openai_success_count}, total returned={len(questions)}"
    )

    return questions[:n_questions], ideal_answers[:n_questions], skills[:n_questions], (
        "openai" if openai_success_count > 0 else "fallback"
    )


def initialize_data_processor():
    global data_processor
    try:
        if os.path.exists(CF.Config.DATA_PATH):
            data_processor = InterviewDataProcessor(file_path=CF.Config.DATA_PATH)
            info = data_processor.get_dataset_info()
            logger.info(
                f"Dataset loaded: Rows={info['rows']}, Columns={info['columns']}, Roles={info['roles']}"
            )
            return True
        else:
            logger.warning(f"Dataset not found at {CF.Config.DATA_PATH}")
            return False
    except Exception as e:
        logger.error(f"Failed to load dataset: {str(e)}\n{traceback.format_exc()}")
        return False


def parse_questions_from_string(questions_text, n_questions=10):
    questions_array = []

    if isinstance(questions_text, str):
        lines = questions_text.strip().split("\n")
        for line in lines:
            line = line.strip()
            if not line or line.startswith("===") or line.startswith("---"):
                continue

            cleaned = re.sub(r"^\d+[\.\)]\s*", "", line)
            if cleaned:
                questions_array.append(cleaned)

    return questions_array[:n_questions]


@app.route("/api/test", methods=["GET"])
def test():
    return jsonify({
        "status": "success",
        "message": "Dynamic Interview API is running",
        "dataset_loaded": data_processor is not None,
        "dataset_path": CF.Config.DATA_PATH,
        "timestamp": datetime.now().isoformat()
    })


@app.route("/api/interviews", methods=["POST", "OPTIONS"])
def create_interview():
    if request.method == "OPTIONS":
        return "", 200

    try:
        data = request.get_json() or {}
        role = data.get("role", "")
        n_questions = data.get("n_questions", 10)

        if not role.strip():
            return jsonify({"success": False, "error": "Job role is required"}), 400

        questions, ideal_answers, skills, source = _pick_questions_with_ideal_answers(role, n_questions)
        interview_id = uuid.uuid4().hex[:12]
        now = datetime.now().isoformat()

        with _STORE_LOCK:
            store = _load_store()
            store["interviews"][interview_id] = {
                "id": interview_id,
                "role": _normalize_role(role),
                "created_at": now,
                "questions": questions,
                "ideal_answers": ideal_answers,
                "skills": skills,
                "source": source,
                "submissions": []
            }
            _save_store(store)

        return jsonify({
            "success": True,
            "interview_id": interview_id,
            "role": _normalize_role(role),
            "count": len(questions),
            "source": source
        })

    except Exception as e:
        logger.error(f"Create interview error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/interviews/<interview_id>", methods=["GET"])
def get_interview(interview_id):
    try:
        with _STORE_LOCK:
            store = _load_store()
            interview = store.get("interviews", {}).get(interview_id)

        if not interview:
            return jsonify({"success": False, "error": "Interview not found"}), 404

        return jsonify({
            "success": True,
            "interview": {
                "id": interview["id"],
                "role": interview["role"],
                "created_at": interview.get("created_at"),
                "questions": interview.get("questions", []),
                "count": len(interview.get("questions", []))
            }
        })

    except Exception as e:
        logger.error(f"Get interview error: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500




@app.route("/api/interviews/<interview_id>/submit", methods=["POST", "OPTIONS"])
def submit_interview(interview_id):
    if request.method == "OPTIONS":
        return "", 200

    try:
        payload = request.get_json() or {}
        candidate_name = (payload.get("candidate_name") or "").strip()
        candidate_email = (payload.get("candidate_email") or "").strip()
        candidate_phone = (payload.get("candidate_phone") or payload.get("phone") or "").strip()
        answers = payload.get("answers") or []
        audio_metrics = payload.get("audio_metrics") or {}
        proctoring_logs = payload.get("proctoring_logs") or []
        logger.info(f"Submit interview: name={candidate_name!r}, email={candidate_email!r}, phone={candidate_phone!r}")

        with _STORE_LOCK:
            store = _load_store()
            interview = store.get("interviews", {}).get(interview_id)

        if not interview:
            return jsonify({"success": False, "error": "Interview not found"}), 404

        questions = interview.get("questions", [])
        ideal_answers = interview.get("ideal_answers", [])
        skills_tags = interview.get("skills", [])
        if not isinstance(skills_tags, list):
            skills_tags = []
        if len(skills_tags) < len(questions):
            skills_tags = skills_tags + ["General"] * (len(questions) - len(skills_tags))
        skills_tags = skills_tags[:len(questions)]

        if not isinstance(answers, list):
            return jsonify({"success": False, "error": "answers must be a list"}), 400
        if not isinstance(audio_metrics, dict):
            audio_metrics = {}
        if not isinstance(proctoring_logs, list):
            proctoring_logs = []

        if len(answers) < len(questions):
            answers = answers + [""] * (len(questions) - len(answers))
        answers = answers[:len(questions)]

        results = []
        total_score = 0.0
        skill_totals = {}
        skill_details = {}

        for i, (cand, ideal, skill) in enumerate(zip(answers, ideal_answers, skills_tags), 1):
            cand_text = str(cand or "").strip()
            ideal_text = str(ideal or "").strip()
            skill_name = str(skill or "General").strip() or "General"

            try:
                score = predict_similarity(cand_text, ideal_text)
                if score <= 1:
                    score_percentage = round(math.sqrt(max(0.0, min(1.0, score))) * 100, 2)
                else:
                    score_percentage = round(score, 2)
            except Exception as e:
                logger.error(f"Error evaluating answer {i}: {str(e)}")
                score_percentage = 0.0

            is_strong = score_percentage > 70
            results.append({
                "question_number": i,
                "question": questions[i - 1] if i - 1 < len(questions) else "",
                "skill": skill_name,
                "candidate_answer": cand_text,
                "ideal_answer": ideal_text,
                "score": score_percentage,
                "is_strong_match": is_strong,
                "result_label": "Strong Match" if is_strong else "Weak Match"
            })
            total_score += score_percentage
            skill_totals.setdefault(skill_name, []).append(score_percentage)
            skill_details.setdefault(skill_name, []).append({
                "question_number": i,
                "score": score_percentage
            })

        skills_matrix = [
            {
                "skill": skill,
                "score": round(sum(scores) / len(scores), 2),
                "details": skill_details.get(skill, [])
            }
            for skill, scores in skill_totals.items()
        ]

        average_score = round((total_score / len(results)) if results else 0.0, 2)
        submission_id = uuid.uuid4().hex[:12]
        submitted_at = datetime.now().isoformat()

        submission_summary = {
            "submission_id": submission_id,
            "candidate_name": candidate_name,
            "candidate_email": candidate_email,
            "candidate_phone": candidate_phone,
            "submitted_at": submitted_at,
            "average_score": average_score,
            "strong_matches": sum(1 for r in results if r.get("is_strong_match")),
            "weak_matches": sum(1 for r in results if not r.get("is_strong_match")),
            "skills_matrix": skills_matrix,
            "audio_metrics": audio_metrics,
            "proctoring_logs": proctoring_logs,
        }

        with _STORE_LOCK:
            store = _load_store()
            interview = store.get("interviews", {}).get(interview_id)
            if not interview:
                return jsonify({"success": False, "error": "Interview not found"}), 404

            record = {
                "submission_id": submission_id,
                "candidate_name": candidate_name,
                "candidate_email": candidate_email,
                "candidate_phone": candidate_phone,
                "submitted_at": submitted_at,
                "average_score": average_score,
                "strong_matches": submission_summary["strong_matches"],
                "weak_matches": submission_summary["weak_matches"],
                "results": results,
                "skills_matrix": skills_matrix,
                "audio_metrics": audio_metrics,
                "proctoring_logs": proctoring_logs,
            }
            interview.setdefault("submissions", []).append(record)
            store["interviews"][interview_id] = interview
            _save_store(store)

        return jsonify({
            "success": True,
            "interview_id": interview_id,
            "submission_id": submission_id,
            "results": results,
            "summary": {
                "total_questions": len(results),
                "average_score": average_score,
                "strong_matches": submission_summary["strong_matches"],
                "weak_matches": submission_summary["weak_matches"],
                "overall_assessment": "Strong Candidate" if average_score > 70 else "Needs Improvement"
            }
        })

    except Exception as e:
        logger.error(f"Submit interview error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/interviews/<interview_id>/submissions", methods=["GET"])
def list_submissions(interview_id):
    try:
        with _STORE_LOCK:
            store = _load_store()
            interview = store.get("interviews", {}).get(interview_id)

        if not interview:
            return jsonify({"success": False, "error": "Interview not found"}), 404

        submissions = interview.get("submissions", []) or []
        summaries = [
            {
                k: s.get(k)
                for k in [
                    "submission_id",
                    "candidate_name",
                    "candidate_email",
                    "candidate_phone",
                    "submitted_at",
                    "average_score",
                    "strong_matches",
                    "weak_matches",
                    "skills_matrix",
                    "audio_metrics",
                    "proctoring_logs",
                ]
            }
            for s in submissions
        ]
        summaries.sort(key=lambda x: x.get("submitted_at") or "", reverse=True)

        return jsonify({
            "success": True,
            "interview_id": interview_id,
            "role": interview.get("role"),
            "submissions": summaries,
            "count": len(summaries)
        })

    except Exception as e:
        logger.error(f"List submissions error: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/interviews/<interview_id>/submissions/<submission_id>", methods=["GET"])
def get_submission_details(interview_id, submission_id):
    try:
        with _STORE_LOCK:
            store = _load_store()
            interview = store.get("interviews", {}).get(interview_id)

        if not interview:
            return jsonify({"success": False, "error": "Interview not found"}), 404

        submissions = interview.get("submissions", []) or []
        submission = next((s for s in submissions if s.get("submission_id") == submission_id), None)

        if not submission:
            return jsonify({"success": False, "error": "Submission not found"}), 404

        return jsonify({
            "success": True,
            "interview_id": interview_id,
            "role": interview.get("role"),
            "submission": {
                "submission_id": submission.get("submission_id"),
                "candidate_name": submission.get("candidate_name"),
                "candidate_email": submission.get("candidate_email"),
                "candidate_phone": submission.get("candidate_phone"),
                "submitted_at": submission.get("submitted_at"),
                "average_score": submission.get("average_score"),
                "strong_matches": submission.get("strong_matches"),
                "weak_matches": submission.get("weak_matches"),
                "results": submission.get("results", []),
                "skills_matrix": submission.get("skills_matrix"),
                "audio_metrics": submission.get("audio_metrics") or {},
                "proctoring_logs": submission.get("proctoring_logs") or []
            }
        })

    except Exception as e:
        logger.error(f"Get submission details error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/interviews/<interview_id>/submissions/<submission_id>", methods=["DELETE"])
def delete_submission(interview_id, submission_id):
    try:
        with _STORE_LOCK:
            store = _load_store()
            interview = store.get("interviews", {}).get(interview_id)
            
            if not interview:
                return jsonify({"success": False, "error": "Interview not found"}), 404

            submissions = interview.get("submissions", [])
            initial_count = len(submissions)
            
            # Filter out the submission to delete
            interview["submissions"] = [s for s in submissions if s.get("submission_id") != submission_id]
            
            if len(interview["submissions"]) == initial_count:
                return jsonify({"success": False, "error": "Submission not found"}), 404

            store["interviews"][interview_id] = interview
            _save_store(store)

            logger.info(f"Deleted submission {submission_id} from interview {interview_id}")

        return jsonify({"success": True, "message": "Candidate details deleted successfully"})

    except Exception as e:
        logger.error(f"Delete submission error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/candidates", methods=["GET"])
def list_all_candidates():
    """
    Return all candidates across all interviews for the Candidates Details dashboard.
    Query params: role (filter by job role), min_score, max_score (filter by average score).
    """
    try:
        role_filter = (request.args.get("role") or "").strip()
        min_score = request.args.get("min_score", type=float)
        max_score = request.args.get("max_score", type=float)

        with _STORE_LOCK:
            store = _load_store()

        candidates = []
        for iid, interview in (store.get("interviews") or {}).items():
            inv_role = (interview.get("role") or "").strip()
            for sub in (interview.get("submissions") or []):
                avg = sub.get("average_score")
                if avg is None:
                    try:
                        results = sub.get("results") or []
                        if results:
                            avg = round(sum(r.get("score", 0) for r in results) / len(results), 2)
                        else:
                            avg = 0.0
                    except Exception:
                        avg = 0.0
                candidates.append({
                    "submission_id": sub.get("submission_id"),
                    "interview_id": iid,
                    "candidate_name": sub.get("candidate_name") or "",
                    "candidate_email": sub.get("candidate_email") or "",
                    "candidate_phone": sub.get("candidate_phone") or "",
                    "role": inv_role,
                    "average_score": round(float(avg), 2),
                    "submitted_at": sub.get("submitted_at") or "",
                })

        if role_filter:
            role_lower = role_filter.lower()
            candidates = [c for c in candidates if (c.get("role") or "").lower() == role_lower]
        if min_score is not None:
            candidates = [c for c in candidates if c.get("average_score", 0) >= min_score]
        if max_score is not None:
            candidates = [c for c in candidates if c.get("average_score", 0) <= max_score]

        # Default: latest submissions first (by submitted_at). When any filter applied: sort by score (highest first).
        has_filter = bool(role_filter or min_score is not None or max_score is not None)
        if has_filter:
            candidates.sort(
                key=lambda x: ((x.get("average_score") or 0), (x.get("submitted_at") or "")),
                reverse=True,
            )
        else:
            candidates.sort(key=lambda x: x.get("submitted_at") or "", reverse=True)

        return jsonify({
            "success": True,
            "candidates": candidates,
            "count": len(candidates)
        })

    except Exception as e:
        logger.error(f"List candidates error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "dataset_loaded": data_processor is not None,
        "timestamp": datetime.now().isoformat()
    })


@app.route("/api/generate-questions", methods=["POST", "OPTIONS"])
def generate_questions():
    if request.method == "OPTIONS":
        return "", 200

    try:
        data = request.get_json()

        if not data:
            return jsonify({"success": False, "error": "No data provided"}), 400

        role = data.get("role", "")
        n_questions = data.get("n_questions", 10)

        if not role.strip():
            return jsonify({"success": False, "error": "Job role is required"}), 400

        logger.info(f"Generating {n_questions} questions for role: {role}")

        questions, ideal_answers, _skills, source = _pick_questions_with_ideal_answers(role, n_questions)

        return jsonify({
            "success": True,
            "role": role,
            "questions": questions,
            "ideal_answers": ideal_answers,
            "count": len(questions),
            "source": source
        })

    except Exception as e:
        logger.error(f"Generate questions error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/evaluate-answers", methods=["POST", "OPTIONS"])
def evaluate_answers():
    if request.method == "OPTIONS":
        return "", 200

    try:
        data = request.get_json()

        if not data:
            return jsonify({"success": False, "error": "No data provided"}), 400

        candidate_answers = data.get("candidate_answers", [])
        ideal_answers = data.get("ideal_answers", [])

        if not candidate_answers or not ideal_answers:
            return jsonify({
                "success": False,
                "error": "Both candidate and ideal answers are required"
            }), 400

        if len(candidate_answers) != len(ideal_answers):
            return jsonify({
                "success": False,
                "error": f"Number of candidate answers ({len(candidate_answers)}) does not match number of ideal answers ({len(ideal_answers)})"
            }), 400

        results = []
        total_score = 0.0

        for i, (cand, ideal) in enumerate(zip(candidate_answers, ideal_answers), 1):
            try:
                score = predict_similarity(str(cand or ""), str(ideal or ""))
                score_percentage = round(score * 100, 2) if score <= 1 else round(score, 2)

                result = {
                    "question_number": i,
                    "candidate_answer": cand,
                    "ideal_answer": ideal,
                    "score": score_percentage,
                    "is_strong_match": score_percentage > 70,
                    "result_label": "Strong Match" if score_percentage > 70 else "Weak Match"
                }
                results.append(result)
                total_score += score_percentage

            except Exception as e:
                logger.error(f"Error evaluating answer {i}: {str(e)}")
                results.append({
                    "question_number": i,
                    "candidate_answer": cand,
                    "ideal_answer": ideal,
                    "score": 0,
                    "is_strong_match": False,
                    "result_label": "Error",
                    "error": str(e)
                })

        average_score = total_score / len(results) if results else 0.0

        return jsonify({
            "success": True,
            "results": results,
            "summary": {
                "total_questions": len(results),
                "average_score": round(average_score, 2),
                "strong_matches": sum(1 for r in results if r.get("is_strong_match", False)),
                "weak_matches": sum(1 for r in results if not r.get("is_strong_match", False)),
                "overall_assessment": "Strong Candidate" if average_score > 70 else "Needs Improvement"
            }
        })

    except Exception as e:
        logger.error(f"Evaluate answers error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/full-interview", methods=["POST", "OPTIONS"])
def full_interview():
    if request.method == "OPTIONS":
        return "", 200

    try:
        data = request.get_json()

        if not data:
            return jsonify({"success": False, "error": "No data provided"}), 400

        role = data.get("role", "")
        candidate_answers = data.get("candidate_answers", [])
        n_questions = data.get("n_questions", len(candidate_answers))

        if not role.strip():
            return jsonify({"success": False, "error": "Job role is required"}), 400

        if not candidate_answers:
            return jsonify({"success": False, "error": "Candidate answers are required"}), 400

        questions, ideal_answers, _skills, source = _pick_questions_with_ideal_answers(role, n_questions)

        while len(questions) < len(candidate_answers):
            questions.append(f"Tell me about your experience with {role}.")
            ideal_answers.append(
                f"A strong answer should explain relevant {role} experience, tools used, challenges solved, and outcomes."
            )

        results = []
        total_score = 0.0

        for i, (cand, question, ideal) in enumerate(zip(candidate_answers, questions, ideal_answers), 1):
            try:
                score = predict_similarity(str(cand or ""), str(ideal or ""))
                score_percentage = round(score * 100, 2) if score <= 1 else round(score, 2)

                result = {
                    "question_number": i,
                    "question": question,
                    "candidate_answer": cand,
                    "ideal_answer": ideal,
                    "score": score_percentage,
                    "is_strong_match": score_percentage > 70,
                    "result_label": "Strong Match" if score_percentage > 70 else "Weak Match"
                }
                results.append(result)
                total_score += score_percentage

            except Exception as e:
                logger.error(f"Error evaluating answer {i}: {str(e)}")
                results.append({
                    "question_number": i,
                    "question": question,
                    "candidate_answer": cand,
                    "ideal_answer": ideal,
                    "score": 0,
                    "is_strong_match": False,
                    "result_label": "Error",
                    "error": str(e)
                })

        average_score = total_score / len(results) if results else 0.0

        return jsonify({
            "success": True,
            "role": role,
            "questions": questions,
            "ideal_answers": ideal_answers,
            "source": source,
            "results": results,
            "summary": {
                "total_questions": len(results),
                "average_score": round(average_score, 2),
                "strong_matches": sum(1 for r in results if r.get("is_strong_match", False)),
                "weak_matches": sum(1 for r in results if not r.get("is_strong_match", False)),
                "overall_assessment": "Strong Candidate" if average_score > 70 else "Needs Improvement"
            }
        })

    except Exception as e:
        logger.error(f"Full interview error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/dataset-info", methods=["GET"])
def dataset_info():
    global data_processor

    if data_processor is None:
        if not initialize_data_processor():
            return jsonify({
                "success": False,
                "error": "Dataset not loaded",
                "dataset_path": CF.Config.DATA_PATH,
                "file_exists": os.path.exists(CF.Config.DATA_PATH)
            }), 404

    try:
        info = data_processor.get_dataset_info()
        return jsonify({
            "success": True,
            "dataset_info": info
        })
    except Exception as e:
        logger.error(f"Dataset info error: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.errorhandler(404)
def not_found(error):
    return jsonify({"success": False, "error": "Endpoint not found"}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({"success": False, "error": "Internal server error"}), 500


if __name__ == "__main__":
    logger.info("Starting Dynamic Interview API...")
    logger.info(f"Dataset path: {CF.Config.DATA_PATH}")

    initialize_data_processor()

    app.run(debug=True, host="0.0.0.0", port=5004)
