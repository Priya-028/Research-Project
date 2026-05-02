import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

const API_BASE_URL = 'http://localhost:5004';

const CandidateInterview = () => {
  const { interviewId } = useParams();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [interview, setInterview] = useState(null);
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [candidatePhone, setCandidatePhone] = useState('');
  const [answers, setAnswers] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [evaluation, setEvaluation] = useState(null);

  const canSubmit = useMemo(() => {
    if (!interview || !Array.isArray(interview.questions)) return false;
    if (!candidateName.trim() || !candidateEmail.trim() || !candidatePhone.trim()) return false;
    return answers.some((a) => a && a.trim() !== '');
  }, [answers, candidateName, candidateEmail, candidatePhone, interview]);

  useEffect(() => {
    const load = async () => {
      if (!interviewId) return;
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE_URL}/api/interviews/${encodeURIComponent(interviewId)}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to load interview');
        }
        setInterview(data.interview);
        setAnswers((data.interview.questions || []).map(() => ''));
      } catch (e) {
        setError(e.message || 'Failed to load interview');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [interviewId]);

  const handleAnswerChange = (index, value) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/interviews/${encodeURIComponent(interviewId)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_name: candidateName,
          candidate_email: candidateEmail,
          candidate_phone: candidatePhone,
          answers
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Submission failed');
      }
      setEvaluation(data);
      setSubmitted(true);
    } catch (e) {
      setError(e.message || 'Submission failed');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="candidate-page">
      <div className="candidate-shell">
        <header className="candidate-header">
          <div>
            <div className="candidate-title">Answer the Questions</div>
            <div className="candidate-subtitle">
              Please answer honestly and in your own words. After you submit, you’ll see the ideal answers for each question.
            </div>
          </div>
          <div className="candidate-badge"><i className="fas fa-lock" style={{ marginRight: 6 }} /> Secure link</div>
        </header>

        <main className="candidate-body">
          {error && (
            <div className="candidate-alert candidate-alert-error">
              <i className="fas fa-exclamation-circle" />
              <div>
                <strong>Something went wrong</strong>
                <p>{error}</p>
              </div>
            </div>
          )}

          {!interview && !loading && !error && (
            <div className="candidate-card">
              <h3>Interview not found</h3>
              <p>Please check that you copied the full link from the recruiter and try again.</p>
            </div>
          )}

          {loading && !interview && (
            <div className="candidate-card candidate-loading">
              <div className="candidate-spinner" />
              <h3>Loading your interview</h3>
              <p>Preparing your questions…</p>
            </div>
          )}

          {interview && !submitted && (
            <>
              <div className="candidate-meta">
                <span><i className="fas fa-briefcase" /> {interview.role}</span>
                <span><i className="fas fa-list-ol" /> {(interview.questions || []).length} questions</span>
              </div>

              <section className="candidate-card candidate-info-card">
                <h3>Contact information</h3>
                <p className="candidate-card-hint">Required so the hiring team can identify your submission.</p>

                <div className="candidate-form-grid">
                  <div className="candidate-form-field">
                    <label htmlFor="candidate-name">Full name <span className="required">*</span></label>
                    <input
                      id="candidate-name"
                      type="text"
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      placeholder="e.g. Jane Smith"
                      autoComplete="name"
                    />
                  </div>
                  <div className="candidate-form-field">
                    <label htmlFor="candidate-email">Email <span className="required">*</span></label>
                    <input
                      id="candidate-email"
                      type="email"
                      value={candidateEmail}
                      onChange={(e) => setCandidateEmail(e.target.value)}
                      placeholder="jane.smith@example.com"
                      autoComplete="email"
                    />
                  </div>
                  <div className="candidate-form-field">
                    <label htmlFor="candidate-phone">Phone number <span className="required">*</span></label>
                    <input
                      id="candidate-phone"
                      type="tel"
                      value={candidatePhone}
                      onChange={(e) => setCandidatePhone(e.target.value)}
                      placeholder="e.g. +1 234 567 8900"
                      autoComplete="tel"
                    />
                  </div>
                </div>
              </section>

              <section>
                {(interview.questions || []).map((question, idx) => (
                  <article key={idx} className="candidate-question">
                    <div className="candidate-question-header">
                      <div className="candidate-question-pill">Question {idx + 1}</div>
                      <div className="candidate-question-count">
                        {idx + 1} of {(interview.questions || []).length}
                      </div>
                    </div>
                    <div className="candidate-question-text">
                      {question}
                    </div>
                    <div className="candidate-answer-area">
                      <label>Your answer</label>
                      <textarea
                        value={answers[idx] || ''}
                        onChange={(e) => handleAnswerChange(idx, e.target.value)}
                        placeholder="Type your answer here…"
                        rows="4"
                      />
                    </div>
                  </article>
                ))}
              </section>

              <div className="candidate-actions">
                <button
                  type="button"
                  className="candidate-submit-btn"
                  onClick={handleSubmit}
                  disabled={loading || !canSubmit}
                >
                  {loading ? (
                    <>
                      <i className="fas fa-spinner fa-spin" />
                      Submitting…
                    </>
                  ) : (
                    <>
                      <i className="fas fa-paper-plane" />
                      Submit answers
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {submitted && evaluation && (
            <section className="candidate-results">
              <div className="candidate-card">
                <h3>Thank you for completing your interview</h3>
                <p>
                  Below you can review your answers alongside the ideal reference answers.
                  Your overall score is only visible to the interviewer.
                </p>
              </div>

              <div>
                {(evaluation.results || []).map((result, idx) => (
                  <article key={idx} className="candidate-result-item">
                    <div className="candidate-question-header">
                      <div className="candidate-question-pill">Question {result.question_number}</div>
                    </div>
                    <div className="candidate-question-text">
                      <span className="data-label">Question:</span> {result.question}
                    </div>

                    <div className="candidate-result-columns">
                      <div>
                        <h4>Your answer</h4>
                        <p>{result.candidate_answer || 'No answer provided'}</p>
                      </div>
                      <div>
                        <h4>Ideal answer</h4>
                        <p>{result.ideal_answer}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default CandidateInterview;

