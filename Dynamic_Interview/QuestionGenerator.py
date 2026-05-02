import os
import json
import openai
import Config as CF


class QuestionGenerator:
    @staticmethod
    def generate_question_with_ideal_answer(role: str, previous_questions=None):
        # Set key on every call so it works when API is run via MasterAPI/reloader
        openai.api_key = os.getenv("OPENAI_API_KEY") or ""
        if previous_questions is None:
            previous_questions = []

        previous_questions = [str(q).strip() for q in previous_questions if str(q).strip()]
        previous_block = "\n".join([f"- {q}" for q in previous_questions]) if previous_questions else "None"

        prompt = f"""
Generate exactly 1 unique interview question for the role "{role}" and also provide a matching ideal answer.

Rules:
- Do not repeat or paraphrase any previous question
- Make the question role-specific
- Make it practical and interview-ready
- Return ONLY valid JSON
- No markdown
- No explanation

Previous questions:
{previous_block}

Return exactly this format:
{{
  "question": "your question here",
  "ideal_answer": "ideal answer here"
}}
"""

        try:
            # Modern OpenAI API (>= 1.0.0)
            from openai import OpenAI
            client = OpenAI(api_key=os.getenv("OPENAI_API_KEY") or "")
            
            response = client.chat.completions.create(
                model=CF.Config.LLM_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "You generate unique interview questions and matching ideal answers in strict JSON."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.9,
                presence_penalty=0.8,
                frequency_penalty=0.8,
                max_tokens=300
            )
            text = response.choices[0].message.content.strip()

        except ImportError:
            # Legacy OpenAI API (< 1.0.0)
            openai.api_key = os.getenv("OPENAI_API_KEY") or ""
            response = openai.ChatCompletion.create(
                model=CF.Config.LLM_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "You generate unique interview questions and matching ideal answers in strict JSON."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.9,
                presence_penalty=0.8,
                frequency_penalty=0.8,
                max_tokens=300
            )
            text = response["choices"][0]["message"]["content"].strip()

        # Remove markdown code fences if the model returns them
        text = text.replace("```json", "").replace("```", "").strip()

        data = json.loads(text)

        question = str(data.get("question", "")).strip()
        ideal_answer = str(data.get("ideal_answer", "")).strip()

        if not question or not ideal_answer:
            raise ValueError("OpenAI returned empty question or ideal_answer")

        return {
            "question": question,
            "ideal_answer": ideal_answer
        }

    @staticmethod
    def generate_questions(role: str, n_questions: int = 5):
        n_questions = int(n_questions) if n_questions else 5
        n_questions = max(1, min(10, n_questions))

        questions = []
        previous_questions = []
        seen = set()

        for _ in range(n_questions):
            item = QuestionGenerator.generate_question_with_ideal_answer(
                role=role,
                previous_questions=previous_questions
            )

            q = str(item.get("question", "")).strip()
            if not q:
                continue

            q_key = q.lower()
            if q_key in seen:
                continue

            questions.append(q)
            previous_questions.append(q)
            seen.add(q_key)

        return questions


if __name__ == "__main__":
    try:
        result = QuestionGenerator.generate_question_with_ideal_answer("BI Analyst", [])
        print("SUCCESS:")
        print(result)
    except Exception as e:
        print("ERROR:")
        print(e)