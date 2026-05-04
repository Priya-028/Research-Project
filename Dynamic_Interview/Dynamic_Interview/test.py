from InterviewDataProcessor import InterviewDataProcessor
from QuestionGenerator import QuestionGenerator
from PredictModel import predict_similarity
import Config as CF

def main():
    print("=== DYNAMIC INTERVIEW TEST ===\n")

    # Candidate Info
    role = "Backend Engineer"
    candidate_answers = [
        "I have 5 years of experience working with Python and Django. I developed APIs and managed databases.",
        "I handled deployment on AWS and ensured server scalability."
    ]

    ideal_answers = [
        "The candidate should demonstrate strong knowledge in Python, Django framework, and API development.",
        "Experience with AWS deployment and scalable backend architecture is expected."
    ]


    # Generate Sample Questions
    print(f"\nGenerating sample questions for role: {role}")
    try:
        generated_questions = QuestionGenerator.generate_questions(role, n_questions=3)
        print(generated_questions)
    except Exception as e:
        print(f"Question generation failed: {str(e)}")


    # Load Model & Evaluate Candidate

    print("\nEvaluating candidate answers...\n")
    for i, (cand, ideal) in enumerate(zip(candidate_answers, ideal_answers), 1):
        score = predict_similarity(cand, ideal)
        print(f"Question {i}:")
        print(f"Candidate Answer: {cand}")
        print(f"Ideal Answer: {ideal}")
        print(f"Semantic Similarity Score: {score}%")
        print("Result:", "Strong Match " if score > 70 else "Weak Match ️")
        print("-" * 50)




    try:
        processor = InterviewDataProcessor(file_path=CF.Config.DATA_PATH)
        info = processor.get_dataset_info()
        print(f"\nLoaded dataset info: Rows={info['rows']}, Columns={info['columns']}, Roles={info['roles']}")
    except Exception as e:
        print(f"Dataset loading failed: {str(e)}")

if __name__ == "__main__":
    main()
