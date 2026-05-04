import React from 'react';

const InterviewSetup = ({ 
  role, 
  setRole, 
  numQuestions, 
  setNumQuestions, 
  onGenerateInterviewLink, 
  loading, 
  interviewId, 
  shareLink, 
  onCopyLink, 
  copyStatus, 
  lookupInterviewId, 
  setLookupInterviewId, 
  onLoadExistingInterview, 
  ROLES, 
  interviewDetails, 
  apiStatus, 
  isCheckingApi,
  submissions,
  fetchSubmissions,
  selectedSubmissionId,
  isLoadingSubmission,
  fetchSubmissionDetails,
  selectedSubmission,
  getScoreColor,
  getConsistencyColor,
  onDeleteCandidate,
  onDownloadPDF,
  isGeneratingPDF
}) => {
  return (
    <>
      <div className="interview-setup-card">
        <h3>Interview Setup</h3>
        <form onSubmit={onGenerateInterviewLink}>
          <div className="form-row">
            <div className="form-group">
              <label>Job Role *</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} required>
                <option value="">-- Select Job Role --</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Number of Questions (1-20)</label>
              <input 
                type="number" 
                value={numQuestions} 
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setNumQuestions(isNaN(val) ? "" : Math.min(20, Math.max(1, val)));
                }} 
                min="1" 
                max="20" 
                style={{ 
                  background: "rgba(255, 255, 255, 0.9)",
                  borderRadius: "12px",
                  border: "1px solid rgba(148, 163, 184, 0.3)",
                  padding: "10px 14px",
                  fontSize: "0.95rem",
                  color: "#1e293b",
                  width: "100%"
                }}
              />
            </div>
          </div>
          <button type="submit" className="generate-btn" disabled={loading}>
            {loading ? <><i className="fas fa-spinner fa-spin" /> Generating Link...</> : <><i className="fas fa-magic" /> Generate Interview Link</>}
          </button>
        </form>

        <hr style={{ margin: "18px 0", border: "none", borderTop: "1px dashed rgba(148, 163, 184, 0.6)" }} />

        <h4>Load existing interview</h4>
        <p style={{ fontSize: "0.85rem", color: "#6b7280" }}>Paste the interview ID from a previously shared link to view scores.</p>
        <form onSubmit={onLoadExistingInterview}>
          <div className="form-row">
            <div className="form-group">
              <label>Interview ID</label>
              <input type="text" value={lookupInterviewId} onChange={(e) => setLookupInterviewId(e.target.value)} placeholder="e.g. add76c4c47f2" />
            </div>
          </div>
          <button type="submit" className="generate-btn" disabled={loading || !lookupInterviewId.trim()}>
            <i className="fas fa-search" /> Load Interview
          </button>
        </form>
      </div>

      {interviewId && (
        <div className="interview-section">
          <h3>Shareable Candidate Link</h3>
          <div className="link-widget-container">
            <label style={{ fontSize: "0.9rem", fontWeight: 600, color: "#334155" }}>Candidate Link</label>
            <div className="link-input-group">
              <input type="text" value={shareLink} readOnly />
              <div className="link-actions">
                <button type="button" className="btn-copy" onClick={onCopyLink}><i className="fas fa-copy" /> Copy</button>
                <a className="btn-open" href={shareLink} target="_blank" rel="noreferrer"><i className="fas fa-external-link-alt" /> Open</a>
              </div>
            </div>
            {(copyStatus || interviewId) && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#64748b", marginTop: "2px" }}>
                {copyStatus ? <span style={{ color: '#22c55e', fontWeight: 500 }}><i className="fas fa-check-circle" style={{ marginRight: 4 }} /> {copyStatus}</span> : <span>Share this unique link with your candidate.</span>}
                {interviewId && <span>ID: <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>{interviewId}</code></span>}
              </div>
            )}
          </div>

          {interviewDetails?.questions?.length > 0 && (
            <>
              <h4 style={{ marginTop: 18 }}>Generated Questions</h4>
              <p style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "12px" }}>
                <i className="fas fa-lock" style={{ marginRight: 4 }} /> These questions are locked and ready for the candidate.
              </p>
              <div className="compact-question-list" style={{ userSelect: "auto", pointerEvents: "none" }}>
                {interviewDetails.questions.map((q, idx) => (
                  <div key={idx} className="compact-question-item" style={{ background: "#f8fafc" }}>
                    <span className="q-number" style={{ background: "#e2e8f0" }}>Q{idx + 1}</span>
                    <p className="q-text" style={{ flex: 1, margin: 0 }}>{q}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="action-buttons" style={{ justifyContent: "space-between", marginTop: 24 }}>
            <button className="evaluate-btn" type="button" onClick={() => fetchSubmissions(interviewId)} disabled={loading}>
              <i className="fas fa-sync-alt" /> Refresh Submissions
            </button>
          </div>

          <div className="results-list">
            <h4>Candidate Submissions (Semantic Scores)</h4>
            {submissions.length === 0 ? (
              <div className="result-card">
                <p style={{ margin: 0 }}>No submissions yet. Share the link with a candidate and refresh.</p>
              </div>
            ) : (
              submissions.map((s) => (
                <div key={s.submission_id} className="result-card">
                  <div className="result-header">
                    <span className="question-number">{s.candidate_name || "Candidate"}</span>
                    <span className="score-badge" style={{ backgroundColor: "#4facfe" }}>Avg: {s.average_score}%</span>
                  </div>
                  <div className="question-details" style={{ marginTop: 12 }}>
                    <div className="question-text"><span className="data-label">Email:</span> <span style={{ color: "#1e293b" }}>{s.candidate_email || "N/A"}</span></div>
                    <div className="question-text"><span className="data-label">Phone:</span> <span style={{ color: "#1e293b" }}>{s.candidate_phone || "N/A"}</span></div>
                    <div className="question-text"><span className="data-label">Submitted:</span> <span style={{ color: "#1e293b" }}>{s.submitted_at}</span></div>
                    <div className="question-text" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className="data-label">Performance:</span>
                      <span style={{ background: "#f0fdf4", color: "#166534", padding: "2px 8px", borderRadius: "4px", fontSize: "0.85rem", fontWeight: "600", border: '1px solid #bbf7d0' }}>{s.strong_matches} Strong</span>
                      <span style={{ background: "#fef2f2", color: "#991b1b", padding: "2px 8px", borderRadius: "4px", fontSize: "0.85rem", fontWeight: "600", border: '1px solid #fecaca' }}>{s.weak_matches} Weak</span>
                    </div>
                  </div>
                  <div className="action-buttons" style={{ justifyContent: "flex-end", marginTop: 10 }}>
                    <button type="button" className="evaluate-btn" onClick={() => fetchSubmissionDetails(interviewId, s.submission_id)} disabled={isLoadingSubmission} style={{ padding: "8px 12px", fontSize: "0.85rem", background: selectedSubmissionId === s.submission_id ? "#e0e7ff" : undefined }}>
                      <i className="fas fa-eye" />
                      {selectedSubmissionId === s.submission_id ? " Viewing" : " View details"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default InterviewSetup;
