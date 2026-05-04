import os
import re
import json
import random
import logging
import pandas as pd
import Config as CF

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# LOCAL DATASET CACHE
# ---------------------------------------------------------------------------
_LOCAL_QNA_CACHE: dict[str, list[dict]] = {}  # role → [{question, ideal_answer, skill}]

def _load_local_dataset() -> dict[str, list[dict]]:
    """Load the CSV once and index by normalised role name."""
    global _LOCAL_QNA_CACHE
    if _LOCAL_QNA_CACHE:
        return _LOCAL_QNA_CACHE

    path = CF.Config.DATA_PATH
    if not os.path.exists(path):
        logger.warning(f"interview_data.csv not found at {path}")
        return {}

    try:
        df = pd.read_csv(path)
        required = {"role", "question", "ideal_answer"}
        if not required.issubset(df.columns):
            logger.error("CSV missing required columns: %s", required - set(df.columns))
            return {}

        for _, row in df.iterrows():
            role_key = str(row.get("role", "")).strip().lower()
            question  = str(row.get("question", "")).strip()
            ideal     = str(row.get("ideal_answer", "")).strip()
            # Use 'feedback' column as skill tag if it starts with "Skill:"
            feedback = str(row.get("feedback", ""))
            skill_match = re.search(r"Skill:\s*(.+)", feedback, re.I)
            skill = skill_match.group(1).strip() if skill_match else "General"

            if not question or not ideal:
                continue

            _LOCAL_QNA_CACHE.setdefault(role_key, []).append({
                "question":     question,
                "ideal_answer": ideal,
                "skill":        skill,
            })

        total = sum(len(v) for v in _LOCAL_QNA_CACHE.values())
        logger.info(f"Local dataset loaded: {total} Q&A across {len(_LOCAL_QNA_CACHE)} roles.")
    except Exception as e:
        logger.error(f"Failed to load local dataset: {e}")

    return _LOCAL_QNA_CACHE


def _sample_local(role: str, n: int, exclude: set[str]) -> list[dict]:
    """Return up to n unique entries for role from the local CSV."""
    db = _load_local_dataset()
    role_key = role.strip().lower()

    # Try exact match first, then partial
    pool = db.get(role_key)
    if not pool:
        pool = []
        for key, items in db.items():
            if role_key in key or key in role_key:
                pool.extend(items)

    available = [
        item for item in pool
        if item["question"].lower().strip() not in exclude
    ]

    random.shuffle(available)
    return available[:n]


# ---------------------------------------------------------------------------
# OPENAI GENERATOR (unchanged logic, improved error logging)
# ---------------------------------------------------------------------------
def _openai_generate(role: str, previous_questions: list[str]) -> dict | None:
    """Call OpenAI to generate one unique Q&A triple. Returns None on any error."""
    import openai
    openai.api_key = os.getenv("OPENAI_API_KEY") or ""
    if not openai.api_key:
        logger.debug("OPENAI_API_KEY not set – skipping API call.")
        return None

    previous_block = "\n".join(f"- {q}" for q in previous_questions) if previous_questions else "None"

    prompt = f"""
Generate exactly 1 unique interview question for the role "{role}" and also provide a matching ideal answer and a primary skill tag.

Rules:
- Do not repeat or paraphrase any previous question
- Make the question role-specific
- Make it practical and interview-ready
- Provide a concise skill tag (e.g. "React", "Python", "SQL", "Soft Skills")
- Return ONLY valid JSON
- No markdown
- No explanation

Previous questions:
{previous_block}

Return exactly this format:
{{
  "question": "your question here",
  "ideal_answer": "ideal answer here",
  "skill": "skill tag here"
}}
"""

    try:
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY") or "")
        response = client.chat.completions.create(
            model=CF.Config.LLM_MODEL,
            messages=[
                {"role": "system", "content": "You generate unique interview questions, matching ideal answers, and primary skill tags in strict JSON."},
                {"role": "user",   "content": prompt}
            ],
            temperature=0.9,
            presence_penalty=0.8,
            frequency_penalty=0.8,
            max_tokens=300,
        )
        text = response.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"OpenAI call failed: {e}")
        return None

    text = text.replace("```json", "").replace("```", "").strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        logger.warning(f"OpenAI returned non-JSON: {e} — raw: {text[:120]}")
        return None

    question    = str(data.get("question", "")).strip()
    ideal_answer = str(data.get("ideal_answer", "")).strip()
    skill        = str(data.get("skill", "General")).strip()

    if not question or not ideal_answer:
        logger.warning("OpenAI returned empty question or ideal_answer.")
        return None

    return {"question": question, "ideal_answer": ideal_answer, "skill": skill}


# ---------------------------------------------------------------------------
# PUBLIC INTERFACE
# ---------------------------------------------------------------------------
class QuestionGenerator:
    """
    Generates interview questions using a LOCAL-FIRST strategy:
      1. Pull from the local CSV (free, instant, pre-vetted)
      2. Fill remaining slots with OpenAI (if API key is configured)
    """

    @staticmethod
    def generate_questions_with_answers(
        role: str,
        n_questions: int = 10,
        previous_questions: list[str] | None = None,
    ) -> list[dict]:
        """
        Return up to n_questions dicts: {question, ideal_answer, skill}.
        Strategy:
          - Try to satisfy the request entirely from the local CSV.
          - If not enough local entries exist, supplement with OpenAI.
        """
        n_questions = max(1, min(20, int(n_questions or 10)))
        previous_questions = [str(q).strip() for q in (previous_questions or []) if str(q).strip()]
        seen   = {q.lower() for q in previous_questions}
        result = []

        # ── Phase 1: Local CSV ──────────────────────────────────────────────
        local_hits = _sample_local(role, n_questions, seen)
        for item in local_hits:
            result.append(item)
            seen.add(item["question"].lower().strip())
            if len(result) >= n_questions:
                break

        logger.info(f"Local dataset provided {len(result)}/{n_questions} questions for '{role}'.")

        # ── Phase 2: OpenAI top-up ──────────────────────────────────────────
        remaining = n_questions - len(result)
        openai_success = 0
        if remaining > 0:
            logger.info(f"Requesting {remaining} more from OpenAI…")
            prev_qs_for_api = previous_questions + [r["question"] for r in result]
            for _ in range(remaining * 2):  # allow extra attempts
                if len(result) >= n_questions:
                    break
                item = _openai_generate(role, prev_qs_for_api)
                if not item:
                    break
                if item["question"].lower().strip() in seen:
                    continue
                result.append(item)
                seen.add(item["question"].lower().strip())
                prev_qs_for_api.append(item["question"])
                openai_success += 1

        logger.info(f"OpenAI contributed {openai_success} questions.")
        return result[:n_questions]

    @staticmethod
    def generate_question_with_ideal_answer(
        role: str,
        previous_questions: list[str] | None = None,
    ) -> dict:
        """
        Legacy single-question interface.  Returns {question, ideal_answer, skill}.
        Raises ValueError if nothing could be generated.
        """
        items = QuestionGenerator.generate_questions_with_answers(
            role=role,
            n_questions=1,
            previous_questions=previous_questions,
        )
        if not items:
            raise ValueError(f"Could not generate any question for role: {role!r}")
        return items[0]

    @staticmethod
    def generate_questions(role: str, n_questions: int = 5) -> list[str]:
        """Legacy interface returning only question strings (no answers)."""
        items = QuestionGenerator.generate_questions_with_answers(role, n_questions)
        return [item["question"] for item in items]


if __name__ == "__main__":
    import pprint
    results = QuestionGenerator.generate_questions_with_answers("Backend Engineer", n_questions=5)
    print(f"\n=== Generated {len(results)} questions ===\n")
    for i, r in enumerate(results, 1):
        print(f"Q{i} [{r['skill']}]: {r['question']}")
        print(f"   A: {r['ideal_answer'][:90]}…\n")