import React from 'react';

const CandidatesOverview = ({ 
  candidates, 
  loading, 
  searchQuery, 
  setSearchQuery, 
  candidateRoleFilter, 
  setCandidateRoleFilter, 
  candidateMinScore, 
  setCandidateMinScore, 
  candidateMaxScore, 
  setCandidateMaxScore, 
  candidatePage, 
  setCandidatePage, 
  pageSize, 
  ROLES, 
  onViewDetails, 
  onDeleteCandidate, 
  onDownloadRowPDF, 
  getScoreColor,
  fetchCandidates,
  isGeneratingBulkPDF,
  onBulkDownload,
  autoDownloadPdfId
}) => {
  const filteredCandidates = candidates.filter((c) => {
    if (!searchQuery) return true;
    const term = searchQuery.toLowerCase();
    return (
      (c.candidate_name?.toLowerCase() || "").includes(term) ||
      (c.candidate_email?.toLowerCase() || "").includes(term) ||
      (c.role?.toLowerCase() || "").includes(term) ||
      (c.interview_id?.toLowerCase() || "").includes(term)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / pageSize));
  const safePage = Math.min(candidatePage, totalPages);
  const paginatedCandidates = filteredCandidates.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );
  
  const showingFrom = filteredCandidates.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const showingTo = Math.min(safePage * pageSize, filteredCandidates.length);

  const avgScore = candidates.length > 0
    ? Math.round(candidates.reduce((acc, c) => acc + (c.average_score || 0), 0) / candidates.length)
    : 0;

  return (
    <div className="interview-section">
      <h3>Candidates Overview</h3>

      <div className="analytics-row">
        <div className="analytics-card">
          <div className="icon"><i className="fas fa-users" /></div>
          <div className="info">
            <span>Total Candidates</span>
            <strong>{candidates.length}</strong>
          </div>
        </div>
        <div className="analytics-card">
          <div className="icon">
            <i className="fas fa-star" style={{ color: '#eab308' }} />
          </div>
          <div className="info">
            <span>Average Score</span>
            <strong>{candidates.length > 0 ? `${avgScore}%` : "—"}</strong>
          </div>
        </div>
      </div>

      <div className="filters-card" style={{ marginBottom: 24 }}>
        <div className="form-row candidates-filters-row" style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch" }}>
          <div className="form-group live-search-wrapper">
            <label style={{ visibility: "hidden" }}>Search</label>
            <div className="live-search-container">
              <i className="fas fa-search" />
              <input
                type="text"
                className="live-search-input"
                placeholder="Search name, email, role, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ minWidth: 160 }}>
            <label>Role</label>
            <select value={candidateRoleFilter} onChange={(e) => setCandidateRoleFilter(e.target.value)}>
              <option value="">All roles</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          
          <div className="form-group" style={{ width: 100 }}>
            <label>Min %</label>
            <input type="number" min="0" max="100" value={candidateMinScore} onChange={(e) => setCandidateMinScore(e.target.value)} placeholder="0" />
          </div>
          <div className="form-group" style={{ width: 100 }}>
            <label>Max %</label>
            <input type="number" min="0" max="100" value={candidateMaxScore} onChange={(e) => setCandidateMaxScore(e.target.value)} placeholder="100" />
          </div>
          
          <div className="form-group candidates-filter-action">
            <label style={{ visibility: "hidden" }}>Refresh</label>
            <button type="button" className="evaluate-btn candidates-filter-refresh-btn" onClick={fetchCandidates} disabled={loading}>
              <i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} />
              {loading ? " Loading..." : " Refresh"}
            </button>
          </div>
        </div>
      </div>

      <div className="results-list">
        {loading ? (
          <div style={{ marginTop: 24 }}>
            <div className="skeleton-box skeleton-card"></div>
            <div className="skeleton-box skeleton-card"></div>
            <div className="skeleton-box skeleton-card"></div>
          </div>
        ) : candidates.length === 0 ? (
          <div className="empty-state-container">
            <i className="fas fa-inbox empty-state-icon" />
            <h4>No submissions yet</h4>
            <p>Generate an interview link from the "Interview Setup" tab and share it.</p>
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="empty-state-container" style={{ padding: "32px 24px" }}>
            <i className="fas fa-search empty-state-icon" style={{ fontSize: "2.5rem" }} />
            <h4>No matches found</h4>
            <p>Try adjusting your search query or filters.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="generate-btn" style={{ padding: "8px 16px", fontSize: "0.9rem" }} onClick={onBulkDownload} disabled={isGeneratingBulkPDF || candidates.length === 0}>
                <i className={`fas ${isGeneratingBulkPDF ? "fa-spinner fa-spin" : "fa-file-pdf"}`} />
                {isGeneratingBulkPDF ? " Processing..." : " Export PDF"}
              </button>
            </div>
            
            <div style={{ color: "#64748b", fontSize: "0.95rem", fontWeight: 500 }}>
              Total rows: {filteredCandidates.length} | Showing {showingFrom}-{showingTo}
            </div>

            <div className="candidates-table-wrap">
              <table className="candidates-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Interview ID</th>
                    <th className="candidates-table-cell-score">Avg Score</th>
                    <th>Submitted</th>
                    <th className="candidates-table-cell-actions">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCandidates.map((c) => (
                    <tr key={`${c.interview_id}-${c.submission_id}`}>
                      <td>{c.candidate_name || "—"}</td>
                      <td>{c.candidate_email || "—"}</td>
                      <td>{c.candidate_phone || "—"}</td>
                      <td>{c.role || "—"}</td>
                      <td className="candidates-table-cell-id" style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{c.interview_id}</td>
                      <td className="candidates-table-cell-score">
                        <span className="score-badge candidates-score-badge" style={{ backgroundColor: getScoreColor(c.average_score), color: "#fff", padding: "4px 8px", borderRadius: 6, fontWeight: 600 }}>
                          {c.average_score}%
                        </span>
                      </td>
                      <td className="candidates-table-cell-submitted" style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                        {c.submitted_at ? new Date(c.submitted_at).toLocaleString() : "—"}
                      </td>
                      <td className="candidates-table-cell-actions">
                        <div className="candidates-table-actions">
                          <button type="button" className="action-icon-btn primary" title="View Details" onClick={() => onViewDetails(c.interview_id, c.submission_id)}>
                            <i className="fas fa-eye" />
                          </button>
                          <button type="button" className="action-icon-btn success" title="Download PDF" onClick={() => onDownloadRowPDF(c)}>
                            <i className={`fas ${autoDownloadPdfId === c.submission_id ? "fa-spinner fa-spin" : "fa-file-pdf"}`} />
                          </button>
                          <button type="button" className="action-icon-btn danger" title="Delete Candidate" onClick={() => onDeleteCandidate(c.interview_id, c.submission_id, c.candidate_name)}>
                            <i className="fas fa-trash-alt" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredCandidates.length > pageSize && (
              <div className="preview-pagination">
                <button type="button" className="preview-page-btn" onClick={() => setCandidatePage(Math.max(1, safePage - 1))} disabled={safePage === 1}>Previous</button>
                <span className="preview-page-indicator">Page {safePage} of {totalPages}</span>
                <button type="button" className="preview-page-btn" onClick={() => setCandidatePage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages}>Next</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CandidatesOverview;
