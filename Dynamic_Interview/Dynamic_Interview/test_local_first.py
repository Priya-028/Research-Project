import os
import logging
from QuestionGenerator import QuestionGenerator

# Setup basic logging to see the "Local dataset provided X/Y questions" messages
logging.basicConfig(level=logging.INFO)

def test_local_priority():
    print("\n" + "="*50)
    print("TESTING LOCAL-FIRST QUESTION GENERATION")
    print("="*50)
    
    # 1. Test existing role in CSV
    role = "Backend Engineer"
    print(f"\n1. Testing for role: {role}")
    results = QuestionGenerator.generate_questions_with_answers(role, n_questions=3)
    
    for i, r in enumerate(results, 1):
        print(f"   [{i}] Q: {r['question']}")
        print(f"       Skill: {r['skill']}")
    
    found_gateway = any("API Gateway" in r['question'] for r in results)
    found_sql = any("SQL and NoSQL" in r['question'] for r in results)
    
    # In my manual dump, SQL vs NoSQL is ID 1. API Gateway is ID 51.
    print(f"\n   Verification: Found local-only questions? {'YES' if (found_gateway or found_sql) else 'NO'}")

    # 2. Test fallback (Role not in CSV)
    # This might fail or call OpenAI. To test ONLY local, we can check a nonsense role.
    role_none = "Underwater Basket Weaver"
    print(f"\n2. Testing for non-existent role: {role_none}")
    results_none = QuestionGenerator.generate_questions_with_answers(role_none, n_questions=2)
    print(f"   Generated {len(results_none)} questions for unknown role.")

if __name__ == "__main__":
    test_local_priority()
