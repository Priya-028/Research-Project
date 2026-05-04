import React from 'react';

const PDFExportTemplates = React.forwardRef(({ 
  candidates, 
  searchQuery, 
  candidateRoleFilter, 
  candidateMinScore, 
  candidateMaxScore, 
  dashboardView, 
  selectedSubmission, 
  interviewDetails, 
  getScoreColor, 
  getConsistencyColor 
}, ref) => {
  const { bulkReportRef, reportRef } = ref;

  return (
    <>
      <div style={{ position: "absolute", top: "-9999px", left: "-9999px" }}>
        <div
          ref={bulkReportRef}
          className="pdf-export-container pdf-export-landscape"
        >
          <h2 style={{ textAlign: "center", marginBottom: "8px", color: "#1e293b" }}>
            Candidate List
          </h2>
          <p style={{ textAlign: "center", marginBottom: "20px", color: "#64748b", fontSize: "14px" }}>
            Exported on {new Date().toLocaleDateString()}
          </p>

          <table className="bulk-report-table">
            <thead>
              <tr>
                <th>Candidate Name</th>
                <th>Role</th>
                <th>Avg Score</th>
                <th>Date Submitted</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {dashboardView === "candidates" &&
                candidates
                  .filter((c) => {
                    if (!searchQuery) return true;
                    const term = searchQuery.toLowerCase();
                    return (
                      (c.candidate_name?.toLowerCase() || "").includes(term) ||
                      (c.candidate_email?.toLowerCase() || "").includes(term) ||
                      (c.role?.toLowerCase() || "").includes(term) ||
                      (c.interview_id?.toLowerCase() || "").includes(term)
                    );
                  })
                  .filter((c) => {
                    let match = true;
                    if (candidateRoleFilter && c.role !== candidateRoleFilter)
                      match = false;
                    if (candidateMinScore && c.average_score < parseFloat(candidateMinScore))
                      match = false;
                    if (candidateMaxScore && c.average_score > parseFloat(candidateMaxScore))
                      match = false;
                    return match;
                  })
                  .map((c) => (
                    <tr key={c.submission_id}>
                      <td style={{ fontWeight: 600 }}>{c.candidate_name || "—"}</td>
                      <td>{c.role || "—"}</td>
                      <td style={{ color: getScoreColor(c.average_score), fontWeight: "bold" }}>
                        {c.average_score}%
                      </td>
                      <td>{c.submitted_at ? new Date(c.submitted_at).toLocaleDateString() : "—"}</td>
                      <td>{c.candidate_email || "—"}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSubmission && (
        <div style={{ position: "absolute", top: "-9999px", left: "-9999px" }}>
          <div
            ref={reportRef}
            className="pdf-export-container pdf-export-portrait"
          >
            <h2>Candidate Interview Report</h2>

            <div className="pdf-header-card">
              <div
                className="result-header"
                style={{
                  marginBottom: "15px",
                  paddingBottom: "15px",
                  borderBottom: "1px dashed #cbd5e1",
                }}
              >
                <span className="question-number" style={{ fontSize: "18px", fontWeight: "bold" }}>
                  {selectedSubmission.candidate_name || "Candidate"}
                </span>
                <span
                  className="score-badge"
                  style={{
                    backgroundColor: "#4f46e5",
                    color: "#fff",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "14px",
                    fontWeight: "bold",
                  }}
                >
                  Overall Match: {selectedSubmission.average_score}%
                </span>
              </div>
              <div className="question-text">
                <span className="data-label">Role:</span>
                <span style={{ color: "#1e293b", fontWeight: "500" }}>
                  {interviewDetails?.role || "Global Candidate"}
                </span>
              </div>
              
              {/* PDF NEW: Communication & Consistency Section */}
              <div style={{ marginTop: '20px', display: 'flex', gap: '15px' }}>
                 <div style={{ flex: 1, padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Style Analysis</div>
                    <div style={{ fontWeight: 'bold', color: getConsistencyColor(selectedSubmission.anti_cheat?.score || 1) }}>
                      {selectedSubmission.anti_cheat?.message || "High Consistency"}
                    </div>
                 </div>
                 <div style={{ flex: 1, padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Fluency</div>
                    <div style={{ fontWeight: 'bold' }}>
                      {Math.round(selectedSubmission.audio_metrics?.responses?.reduce((acc, r) => acc + (r.wpm || 0), 0) / (selectedSubmission.audio_metrics?.responses?.length || 1)) || 0} WPM
                    </div>
                 </div>
                 <div style={{ flex: 1, padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Confidence</div>
                    <div style={{ fontWeight: 'bold' }}>
                      {Math.round(selectedSubmission.audio_metrics?.responses?.reduce((acc, r) => acc + (r.confidence || 0), 0) / (selectedSubmission.audio_metrics?.responses?.length || 1)) || 0}%
                    </div>
                 </div>
              </div>

              {/* PDF NEW: Skills Matrix breakdown */}
              {selectedSubmission.skills_matrix && (
                <div style={{ marginTop: '25px' }}>
                   <h4 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '5px', marginBottom: '10px' }}>Technical Skills Matrix</h4>
                   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                      {selectedSubmission.skills_matrix.map((sm, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                           <div style={{ flex: 1, fontSize: '13px' }}>{sm.skill}</div>
                           <div style={{ flex: 2, height: '6px', background: '#e2e8f0', borderRadius: '3px', position: 'relative' }}>
                              <div style={{ position: 'absolute', height: '100%', width: `${sm.score}%`, background: getScoreColor(sm.score), borderRadius: '3px' }} />
                           </div>
                           <div style={{ fontSize: '12px', fontWeight: 'bold', width: '30px' }}>{sm.score}%</div>
                        </div>
                      ))}
                   </div>
                </div>
              )}

              <div className="question-text">
                <span className="data-label">Phone:</span>
                <span style={{ color: "#1e293b", fontWeight: "500" }}>
                  {selectedSubmission.candidate_phone || "N/A"}
                </span>
              </div>
              <div className="question-text">
                <span className="data-label">Submitted:</span>
                <span style={{ color: "#1e293b", fontWeight: "500" }}>
                  {selectedSubmission.submitted_at}
                </span>
              </div>
            </div>

            {(selectedSubmission.results || []).map((r) => (
              <div key={r.question_number} className="pdf-question-card">
                <div className="result-header">
                  <span className="question-number" style={{ fontSize: "16px", fontWeight: "600" }}>
                    Question {r.question_number}
                  </span>
                  <span
                    className="score-badge"
                    style={{
                      backgroundColor: getScoreColor(r.score),
                      color: "#fff",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "13px",
                      fontWeight: "bold",
                    }}
                  >
                    Score: {r.score}%
                  </span>
                </div>
                <div className="question-text">{r.question}</div>
                <div className="pdf-answer-section">
                  <div className="pdf-answer-block candidate">
                    <span className="pdf-answer-label">Candidate Answer</span>
                    <p className="pdf-answer-text">
                      {r.candidate_answer || "No answer provided"}
                    </p>
                  </div>
                  <div className="pdf-answer-block ideal">
                    <span className="pdf-answer-label">
                      Ideal Answer Requirement
                    </span>
                    <p className="pdf-answer-text">{r.ideal_answer}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
});

export default PDFExportTemplates;
