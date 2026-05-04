"""
expand_dataset_local.py
=======================
Expands interview_data.csv using:
  1. A large hand-crafted Q&A bank (Static)
  2. GPT-3.5/4 Assisted Expansion (via OpenAI API)
  3. Automatic Deduplication and Audit Reporting

Run this script to build a robust local question library:
    python expand_dataset_local.py
"""

import os
import re
import csv
import json
import random
import logging
import Config as CF

# Path to the dataset
CSV_PATH = os.path.join(os.path.dirname(__file__), "interview_data.csv")

# ---------------------------------------------------------------------------
# HAND-CRAFTED Q&A BANK (Static high-quality rows)
# ---------------------------------------------------------------------------
EXTRA_QNA = [
    # --- Backend Engineer ---
    ("Backend Engineer", "API Gateway", "How does an API Gateway improve backend architecture?", "An API gateway centralises routing; authentication; rate limiting; and load balancing across multiple microservices; reducing cross-cutting concerns in individual services."),
    ("Backend Engineer", "CQRS", "Explain the CQRS pattern.", "CQRS separates read and write operations into distinct models; allowing each side to be scaled; optimised; and secured independently."),
    ("Backend Engineer", "Connection Pooling", "Why is connection pooling important?", "Connection pooling reduces latency and resource usage by reusing existing DB connections instead of opening a new connection per request."),
    ("Backend Engineer", "Message Queues", "When would you use RabbitMQ or Kafka?", "Use message queues for async communication; decoupling producers and consumers; and handling traffic spikes."),
    ("Backend Engineer", "Rate Limiting", "Describe strategies to implement rate limiting.", "Use token bucket or sliding window algorithms; storage in Redis; and return 429 Retry-After headers."),
    ("Backend Engineer", "Database Indexing", "What are the trade-offs of using many indexes?", "Indexes speed up read queries but slow down write operations (INSERT/UPDATE) because the index must also be updated; they also occupy extra disk space."),

    # --- Frontend Developer ---
    ("Frontend Developer", "Virtual DOM", "How does the React Virtual DOM stay efficient?", "React keeps a lightweight in-memory copy of the DOM; diffs it against the new render; and only applies the minimum real DOM updates."),
    ("Frontend Developer", "Web Accessibility", "What are the POUR principles of WCAG?", "Perceivable; Operable; Understandable; Robust—using semantic HTML; ARIA; keyboard nav; and high contrast."),
    ("Frontend Developer", "Code Splitting", "How does code splitting help performance?", "It breaks JS bundles into smaller chunks loaded on demand; reducing initial load time and TTI."),
    ("Frontend Developer", "SSR vs CSR", "What are the trade-offs of SSR?", "SSR improves SEO and FMP at the cost of higher server load and complexity compared to CSR."),
    ("Frontend Developer", "TypeScript", "Why use TypeScript in Large Apps?", "It adds static typing for early error detection; better IDE support; and safer refactoring across teams."),
    ("Frontend Developer", "State Management", "When is Redux/Context necessary?", "Use them for global state needed by distant components; avoiding 'prop drilling' in complex component trees."),

    # --- Mobile Developer ---
    ("Mobile Developer", "App Launch Time", "How do you minimize app launch time?", "Reduce startup libraries; defer non-critical work; use lazy initialization; and compress assets."),
    ("Mobile Developer", "Deep Linking", "Explain deep linking.", "Deep links allow URLs or notifications to navigate users directly to specific screens inside the app."),
    ("Mobile Developer", "Background Tasks", "Handling background tasks in iOS/Android?", "Use BGTaskScheduler (iOS) or WorkManager (Android) to respect OS battery and resource constraints."),
    ("Mobile Developer", "App Signing", "Describe the mobile distribution process.", "Sign release builds with certificates/keystores and upload to Google Play or App Store for review."),
    ("Mobile Developer", "Crash Analytics", "Tracking production crashes?", "Use Firebase Crashlytics or Sentry; analyze stack traces; and prioritize by impact/user base."),

    # --- Data Engineer ---
    ("Data Engineer", "ETL Pipelines", "Describe a modern data orchestration tool.", "Tools like Apache Airflow or Prefect manage complex DAGs; ensuring tasks run in sequence; handle retries; and provide visibility into pipeline health."),
    ("Data Engineer", "Data Warehousing", "What is Snowflake's architecture?", "Snowflake uses a multi-cluster shared data architecture; separating storage (S3/Azure Blob) from compute (Virtual Warehouses) for independent scaling."),
    ("Data Engineer", "Spark Optimization", "How do you handle 'data skew' in Apache Spark?", "Use salting (adding random keys to distribute data); broadcast joins for small tables; or increasing partitions to balance the workload across executors."),
    ("Data Engineer", "Data Modeling", "Difference between Star and Snowflake schemas?", "Star schemas have de-normalized dimension tables for query speed; Snowflake schemas are normalized for storage efficiency but require more joins."),
    ("Data Engineer", "Streaming", "Kafka vs Pulsar for real-time data?", "Kafka is the industry standard with high throughput; Pulsar offers native multi-tenancy and decoupled storage/compute tiers."),

    # --- QA Engineer ---
    ("QA Engineer", "Automation", "When do you choose Selenium vs Playwright?", "Selenium is mature with broad browser support; Playwright is modern; faster; more reliable (auto-waiting); and better for single-page apps."),
    ("QA Engineer", "Testing Pyramid", "Explain the testing pyramid concept.", "The base is many unit tests (fast/cheap); followed by fewer integration tests; and a small cap of E2E/Manual tests at the top."),
    ("QA Engineer", "Regression", "What is regression testing?", "Testing existing functionality after a code change to ensure that new updates haven't 'regressed' or broken previously working parts."),
    ("QA Engineer", "Bug Reports", "What makes a good bug report?", "Clear title; steps to reproduce; expected vs actual results; environment info; and logs or screenshots."),
    ("QA Engineer", "CI/CD", "How does QA fit into a CI/CD pipeline?", "Automated tests run on every PR/commit; blocking builds that fail quality checks to ensure continuous delivery safely."),

    # --- Product Manager ---
    ("Product Manager", "Prioritization", "How do you use the RICE framework?", "Evaluate by Reach; Impact; Confidence; and Effort (RICE) to derive a score for objective feature prioritization."),
    ("Product Manager", "User Discovery", "How do you handle conflicting user feedback?", "Synthesize data from multiple sources (analytics; interviews); look for patterns; and align with the product's core value proposition and North Star metric."),
    ("Product Manager", "Agile", "Difference between Scrum and Kanban?", "Scrum uses time-boxed Sprints; Kanban is flow-based with Work-In-Progress (WIP) limits; Scrum is better for predictability; Kanban for continuous support."),
    ("Product Manager", "Market Fit", "How do you measure Product-Market Fit (PMF)?", "The Sean Ellis survey (would 40%+ of users be 'very disappointed' without the product) and high retention/organic growth rates."),

    # --- Technical Lead / Software Architect ---
    ("Technical Lead", "Technical Debt", "How do you persuade stakeholders to pay down tech debt?", "Translate debt into business risks: slower feature delivery; higher production incidents; and developer burnout—showing ROI on remediation."),
    ("Technical Lead", "Mentorship", "How do you handle a low-performing engineer?", "Identify root causes (knowledge gap; motivation; personal); set clear goals; provide frequent feedback; and offer pairing/learning resources."),
    ("Software Architect", "Microservices", "When is Microservices better than a Monolith?", "When you have independent scaling needs; large across-functional teams; or need to use different tech stacks for specific services—accepting the trade-off of network latency and complexity."),
    ("Software Architect", "Distributed Systems", "Explain the CAP Theorem.", "In a network partition; a system can only provide either Consistency or Availability; not both at the same time."),

    # --- Cybersecurity / SRE ---
    ("Cybersecurity Specialist", "Zero Trust", "Zero Trust model principles?", "Never trust; always verify. Require identity validation for every access request; regardless of whether it's internal or external to the network."),
    ("SRE", "Observability", "The Three Pillars of Observability?", "Metrics (counters/gauges); Logs (discrete events); and Traces (request path through services)."),
    ("SRE", "SLO/SLA", "Difference between SLO and SLA?", "SLO (Service Level Objective) is the internal target; SLA (Service Level Agreement) is the external contract with financial penalties for failure."),
]

# ---------------------------------------------------------------------------
# GPT-Assisted Expansion (OpenAI Bridge)
# ---------------------------------------------------------------------------
def generate_gpt_rows(role, count=5, existing_questions=None):
    """Calls GPT to generate unique batch of Q&A."""
    from openai import OpenAI
    
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY") or "")
    if not client.api_key:
        print(f"  [Skip GPT] No API key for {role}")
        return []

    previous_block = "\n".join(f"- {q}" for q in (existing_questions or []))[:2000]
    
    prompt = f"""
Generate exactly {count} unique, high-quality interview questions for the role "{role}".
For each question, provide a detailed ideal answer and a primary skill tag.

Rules:
1. DO NOT repeat or paraphrase these existing questions:
{previous_block}

2. Ensure variety (mix of behavioral, technical, and architectural).
3. Return ONLY a valid JSON list of objects. No markdown, no intro.

Format:
[
  {{"question": "...", "ideal_answer": "...", "skill": "..."}},
  ...
]
"""

    print(f"  Generating {count} GPT questions for '{role}'...")
    try:
        response = client.chat.completions.create(
            model=CF.Config.LLM_MODEL,
            messages=[
                {"role": "system", "content": "You are an expert HR Interviewer generating professional Q&A for a hiring bank."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.8
        )
        text = response.choices[0].message.content.strip()
        text = text.replace("```json", "").replace("```", "").strip()
        data = json.loads(text)
        return data
    except Exception as e:
        print(f"  [GPT Error] {e}")
        return []

# ---------------------------------------------------------------------------
# CSV Helpers
# ---------------------------------------------------------------------------
def load_existing(path):
    if not os.path.exists(path):
        return [], 0
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    max_id = max((int(r.get("id", 0) or 0) for r in rows), default=0)
    return rows, max_id

def rewrite_existing(path, rows):
    fieldnames = ["id", "role", "question", "ideal_answer", "candidate_answer", "score", "feedback"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"  ✅  Saved dataset with {len(rows)} rows.")

def audit_dataset(rows):
    """Prints a report of questions per role."""
    from collections import Counter
    counts = Counter(r.get("role", "Unknown") for r in rows)
    print("\n" + "="*45)
    print("  DATASET AUDIT REPORT")
    print("="*45)
    for role, count in sorted(counts.items()):
        print(f"  {role:<35} | {count} questions")
    print("="*45)
    print(f"  TOTAL: {len(rows)} questions\n")

# ---------------------------------------------------------------------------
# Main Logic
# ---------------------------------------------------------------------------
def main(gpt_expansion_count=10):
    print("=" * 60)
    print("  HR Dataset Manager — Expanded Library Builder")
    print("=" * 60)

    # 1. Load and Deduplicate Existing
    existing_rows, _ = load_existing(CSV_PATH)
    unique_rows = {}
    duplicates_found = 0
    for r in existing_rows:
        q_key = r.get("question", "").lower().strip()
        if not q_key: continue
        if q_key in unique_rows:
            duplicates_found += 1
            # Keep the longer answer
            if len(r.get("ideal_answer", "")) > len(unique_rows[q_key].get("ideal_answer", "")):
                unique_rows[q_key] = r
        else:
            unique_rows[q_key] = r
            
    if duplicates_found > 0:
        print(f"  [Cleanup] Merged {duplicates_found} duplicate questions.")
        existing_rows = list(unique_rows.values())

    existing_questions = {r.get("question", "").lower().strip() for r in existing_rows}
    print(f"  Initial database: {len(existing_rows)} rows.")

    # 2. Add Hand-crafted EXTRA_QNA
    new_static_candidates = [
        (role, skill, q, a)
        for role, skill, q, a in EXTRA_QNA
        if q.lower().strip() not in existing_questions
    ]
    
    if new_static_candidates:
        print(f"  Adding {len(new_static_candidates)} new hand-crafted rows.")
        for role, skill, q, a in new_static_candidates:
            existing_rows.append({
                "id": 0, "role": role, "question": q, "ideal_answer": a,
                "candidate_answer": "", "score": 0, "feedback": f"Skill: {skill}"
            })
            existing_questions.add(q.lower().strip())

    # 3. GPT Top-up
    if gpt_expansion_count > 0:
        # Determine roles that need expanding (we want at least 20 per role)
        roles = sorted(list({r["role"] for r in existing_rows}))
        print(f"\n  Checking roles for GPT expansion (Target: 20 per role)...")
        
        for role in roles:
            role_count = sum(1 for r in existing_rows if r["role"] == role)
            needed = 20 - role_count
            
            if needed > 0:
                # Fetch only what's needed
                batch_size = min(needed, gpt_expansion_count)
                new_gpt_data = generate_gpt_rows(role, batch_size, list(existing_questions))
                
                for item in new_gpt_data:
                    q = str(item.get("question", "")).strip()
                    a = str(item.get("ideal_answer", "")).strip()
                    if not q or not a or q.lower().strip() in existing_questions:
                        continue
                    existing_rows.append({
                        "id": 0, "role": role, "question": q, "ideal_answer": a,
                        "candidate_answer": "", "score": 0, "feedback": f"Skill: {item.get('skill', 'General')}"
                    })
                    existing_questions.add(q.lower().strip())

    # 4. Final sequence and write
    for i, r in enumerate(existing_rows):
        r["id"] = i + 1
    
    rewrite_existing(CSV_PATH, existing_rows)
    audit_dataset(existing_rows)
    print("Done!")

if __name__ == "__main__":
    # Run with GPT expansion
    main(gpt_expansion_count=10)
