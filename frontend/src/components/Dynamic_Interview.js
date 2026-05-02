import React, { useContext, useEffect, useMemo, useState, useRef } from "react";
import { AuthContext } from "./AuthContext";
import FeaturePageHero from './common/FeaturePageHero';
import { semanticCss, semanticHex } from './common/semanticPalette';
import html2pdf from "html2pdf.js";
import Swal from "sweetalert2";

const API_BASE_URL = "http://localhost:5004";
const CANDIDATES_PAGE_SIZE = 10;

const DynamicInterview = () => {
  const { user } = useContext(AuthContext);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiStatus, setApiStatus] = useState(null);
  const [isCheckingApi, setIsCheckingApi] = useState(false);

  const [role, setRole] = useState("Backend Engineer");
  const [numQuestions, setNumQuestions] = useState(10);

  const [interviewId, setInterviewId] = useState("");
  const [interviewDetails, setInterviewDetails] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [copyStatus, setCopyStatus] = useState("");
  const [lookupInterviewId, setLookupInterviewId] = useState("");
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [isLoadingSubmission, setIsLoadingSubmission] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isGeneratingBulkPDF, setIsGeneratingBulkPDF] = useState(false);
  const [autoDownloadPdfId, setAutoDownloadPdfId] = useState("");
  const reportRef = useRef(null);
  const bulkReportRef = useRef(null);

  const [dashboardView, setDashboardView] = useState("interview");
  const [candidates, setCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidateRoleFilter, setCandidateRoleFilter] = useState("");
  const [candidateMinScore, setCandidateMinScore] = useState("");
  const [candidateMaxScore, setCandidateMaxScore] = useState("");
  const [openSubmissionId, setOpenSubmissionId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [candidatePage, setCandidatePage] = useState(1);

  const handleDownloadPDF = () => {
    if (!reportRef.current || !selectedSubmission) return;
    setIsGeneratingPDF(true);
    setToastMessage("Compiling PDF. Please wait...");

    const element = reportRef.current;
    const opt = {
      margin: [10, 10, 10, 10],
      filename: `${selectedSubmission.candidate_name.replace(/[^a-zA-Z0-9]/g, "_")}_HR_Report.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
        foreignObjectRendering: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: Math.ceil(element.scrollWidth),
        windowHeight: Math.ceil(element.scrollHeight),
      },
      pagebreak: { mode: ["css", "legacy"] },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    setTimeout(() => {
      html2pdf()
        .set(opt)
        .from(element)
        .save()
        .then(() => {
          setIsGeneratingPDF(false);
          setToastMessage("PDF downloaded successfully!");
          setTimeout(() => setToastMessage(""), 3000);
        })
        .catch((err) => {
          console.error("PDF Generation Error:", err);
          setIsGeneratingPDF(false);
          setToastMessage("Failed to compile PDF.");
          setTimeout(() => setToastMessage(""), 3000);
        });
    }, 100);
  };

  const handleBulkDownloadPDF = () => {
    if (!bulkReportRef.current || candidates.length === 0) return;
    setIsGeneratingBulkPDF(true);
    setToastMessage("Compiling Master Roster... This may take a moment.");

    const element = bulkReportRef.current;
    const opt = {
      margin: [12, 10, 12, 10],
      filename: `Interview_Candidates_Roster_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
        foreignObjectRendering: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: Math.ceil(element.scrollWidth),
        windowHeight: Math.ceil(element.scrollHeight),
      },
      pagebreak: { mode: ["css", "legacy"] },
      jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
    };

    setTimeout(() => {
      html2pdf()
        .set(opt)
        .from(element)
        .save()
        .then(() => {
          setIsGeneratingBulkPDF(false);
          setToastMessage("Roster exported successfully!");
          setTimeout(() => setToastMessage(""), 3000);
        })
        .catch((err) => {
          console.error("Bulk PDF Error:", err);
          setIsGeneratingBulkPDF(false);
          Swal.fire({
            title: "Export Failed",
            text: "Failed to compile the bulk PDF roster.",
            icon: "error",
            confirmButtonColor: "#4f46e5",
          });
        });
    }, 100);
  };

  const handleDownloadRowPDF = (c) => {
    setInterviewId(c.interview_id);
    setOpenSubmissionId(c.submission_id);
    setAutoDownloadPdfId(c.submission_id);
    setToastMessage(
      `Preparing ${c.candidate_name || "candidate"}'s details for PDF export...`,
    );
  };

  useEffect(() => {
    if (
      selectedSubmission &&
      autoDownloadPdfId &&
      selectedSubmission.submission_id === autoDownloadPdfId
    ) {
      setTimeout(() => {
        handleDownloadPDF();
        setAutoDownloadPdfId("");
      }, 150);
    }
  }, [selectedSubmission, autoDownloadPdfId]);

  const handleDeleteCandidate = async (
    targetInterviewId,
    targetSubmissionId,
    targetCandidateName,
  ) => {
    const interviewIdToUse = targetInterviewId || interviewId;
    const submissionIdToUse =
      targetSubmissionId ||
      (selectedSubmission ? selectedSubmission.submission_id : null);
    const candidateNameToUse =
      targetCandidateName ||
      (selectedSubmission
        ? selectedSubmission.candidate_name
        : "the candidate");

    if (!submissionIdToUse) return;

    const result = await Swal.fire({
      title: "Delete Candidate?",
      text: `Are you sure you want to delete ${candidateNameToUse}'s results? This action cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: semanticHex.danger,
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, delete it!",
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/interviews/${interviewIdToUse}/submissions/${submissionIdToUse}`,
        {
          method: "DELETE",
        },
      );
      const data = await res.json();

      if (res.ok && data.success) {
        setToastMessage(
          `${candidateNameToUse}'s details deleted successfully.`,
        );
        setTimeout(() => setToastMessage(""), 3000);

        if (
          selectedSubmission &&
          selectedSubmission.submission_id === submissionIdToUse
        ) {
          setSelectedSubmission(null);
          setSelectedSubmissionId("");
        }

        if (dashboardView === "candidates") {
          fetchCandidates();
        } else {
          fetchSubmissions(interviewId);
        }
      } else {
        throw new Error(data.error || "Failed to delete candidate");
      }
    } catch (err) {
      console.error("Error deleting candidate:", err);
      Swal.fire({
        title: "Error!",
        text: `Failed to delete candidate: ${err.message}`,
        icon: "error",
        confirmButtonColor: "#4f46e5",
      });
    }
  };

  const shareLink = useMemo(() => {
    if (!interviewId) return "";
    return `${window.location.origin}/candidate/interview/${interviewId}`;
  }, [interviewId]);

  useEffect(() => {
    checkApiHealth();
  }, []);

  useEffect(() => {
    if (!interviewId) return;
    fetchInterviewDetails(interviewId);
    fetchSubmissions(interviewId);
    setSelectedSubmission(null);
    setSelectedSubmissionId("");
  }, [interviewId]);

  useEffect(() => {
    if (interviewId && openSubmissionId) {
      fetchSubmissionDetails(interviewId, openSubmissionId);
      setOpenSubmissionId("");
    }
  }, [interviewId, openSubmissionId]);

  const ROLES = [
    "Backend Engineer",
    "Frontend Developer",
    "Mobile Developer",
    "BI Analyst",
    "ML Engineer",
    "Cloud Engineer",
    "Data Scientist",
    "DevOps Engineer",
    "HR Manager",
    "Cybersecurity Specialist",
  ];

  const fetchCandidates = async () => {
    setCandidatesLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (candidateRoleFilter) params.set("role", candidateRoleFilter);
      if (candidateMinScore !== "") params.set("min_score", candidateMinScore);
      if (candidateMaxScore !== "") params.set("max_score", candidateMaxScore);
      const res = await fetch(
        `${API_BASE_URL}/api/candidates?${params.toString()}`,
      );
      const data = await res.json();
      if (res.ok && data.success) setCandidates(data.candidates || []);
      else throw new Error(data.error || "Failed to load candidates");
    } catch (err) {
      setError(err.message || "Failed to load candidates");
      setCandidates([]);
    } finally {
      setCandidatesLoading(false);
    }
  };

  useEffect(() => {
    if (dashboardView === "candidates") fetchCandidates();
  }, [dashboardView]);

  useEffect(() => {
    setCandidatePage(1);
  }, [searchQuery, candidateRoleFilter, candidateMinScore, candidateMaxScore, candidates.length]);

  const checkApiHealth = async () => {
    setIsCheckingApi(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/test`);
      if (response.ok) {
        const data = await response.json();
        setApiStatus({
          status: "connected",
          message: ` API connected. Dataset loaded: ${data.dataset_loaded ? "Yes" : "No"}`,
          details: data,
        });
      } else {
        setApiStatus({
          status: "error",
          message: " API not responding properly",
        });
      }
    } catch (err) {
      setApiStatus({
        status: "error",
        message:
          " Cannot connect to API. Make sure Flask server is running on port 5004.",
      });
    } finally {
      setIsCheckingApi(false);
    }
  };

  const fetchInterviewDetails = async (id) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/interviews/${encodeURIComponent(id)}`,
      );
      const data = await res.json();
      if (res.ok && data.success) setInterviewDetails(data.interview);
    } catch {
      // ignore
    }
  };

  const fetchSubmissions = async (id) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/interviews/${encodeURIComponent(id)}/submissions`,
      );
      const data = await res.json();
      if (res.ok && data.success) setSubmissions(data.submissions || []);
    } catch {
      // ignore
    }
  };

  const fetchSubmissionDetails = async (id, submissionId) => {
    setIsLoadingSubmission(true);
    setError("");
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/interviews/${encodeURIComponent(id)}/submissions/${encodeURIComponent(submissionId)}`,
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load submission");
      }
      setSelectedSubmission(data.submission);
      setSelectedSubmissionId(submissionId);
    } catch (err) {
      setError(err.message || "Failed to load submission");
    } finally {
      setIsLoadingSubmission(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 70) return semanticHex.success;
    if (score >= 50) return semanticHex.warning;
    return semanticHex.danger;
  };

  const handleGenerateInterviewLink = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setCopyStatus("");
    setInterviewDetails(null);
    setSubmissions([]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/interviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          n_questions: numQuestions,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to generate interview link");
      }
      setInterviewId(data.interview_id);
    } catch (err) {
      setError(err.message || "Failed to generate interview link");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setToastMessage("Link copied to clipboard!");
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus(""), 2000);
      setTimeout(() => setToastMessage(""), 3000);
    } catch {
      setCopyStatus("Copy failed.");
      setTimeout(() => setCopyStatus(""), 2000);
    }
  };

  const handleLoadExistingInterview = async (e) => {
    e.preventDefault();
    const id = (lookupInterviewId || "").trim();
    if (!id) return;
    setLoading(true);
    setError("");
    setInterviewDetails(null);
    setSubmissions([]);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/interviews/${encodeURIComponent(id)}`,
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Interview not found");
      }
      setInterviewId(id);
      setInterviewDetails(data.interview);
      await fetchSubmissions(id);
    } catch (err) {
      setError(err.message || "Failed to load interview");
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="interview-container feature-page-shell">
        <FeaturePageHero
          badgeIcon="fas fa-user-lock"
          badgeText="Dynamic Interview System"
          titleLeading="Sign in to manage"
          titleHighlight="Dynamic Interviews"
          subtitle="Please log in to generate secure interview links and view candidate semantic scores."
          className="interview-hero"
        />
      </div>
    );
  }

  return (
    <div className="interview-container feature-page-shell">
      <FeaturePageHero
        badgeIcon="fas fa-comments"
        badgeText="Dynamic Interview System"
        titleLeading="AI-Powered"
        titleHighlight="Dynamic Interviews"
        subtitle="Create secure interview links, manage candidate submissions, and review semantic scoring insights through a streamlined hiring workspace."
        features={[
          { icon: 'fas fa-link', label: 'Shareable Interview Links' },
          { icon: 'fas fa-clipboard-check', label: 'Candidate Submissions' },
          { icon: 'fas fa-brain', label: 'Semantic Scoring' }
        ]}
        className="interview-hero"
      />

      {apiStatus && (
        <div className={`api-status ${apiStatus.status}`}>
          <i
            className={`fas fa-${apiStatus.status === "connected" ? "check-circle" : "exclamation-circle"}`}
          ></i>
          <span>{apiStatus.message}</span>
          <button
            onClick={checkApiHealth}
            className="refresh-status"
            disabled={isCheckingApi}
          >
            <i
              className={`fas fa-sync-alt ${isCheckingApi ? "fa-spin" : ""}`}
            ></i>
            {isCheckingApi ? "Checking..." : "Refresh"}
          </button>
        </div>
      )}

      <section className="productivity-input-switcher interview-view-switcher">
        <div className="productivity-input-switcher-header">
          <div>
            <h3>Choose Workspace View</h3>
            <p>Toggle between interview setup tools and candidate submission insights without showing both at once.</p>
          </div>
          <div className="productivity-input-toggle" role="tablist" aria-label="Dynamic interview views">
            <button
              type="button"
              role="tab"
              aria-selected={dashboardView === "interview"}
              className={`productivity-input-toggle-btn ${
                dashboardView === "interview" ? "active" : ""
              }`}
              onClick={() => setDashboardView("interview")}
            >
              <i className="fas fa-plus-circle"></i>
              <span>Interview Setup &amp; Link</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={dashboardView === "candidates"}
              className={`productivity-input-toggle-btn ${
                dashboardView === "candidates" ? "active" : ""
              }`}
              onClick={() => setDashboardView("candidates")}
            >
              <i className="fas fa-users"></i>
              <span>Candidates Details</span>
            </button>
          </div>
        </div>
      </section>


      {error && (
        <div className="error-message">
          <i className="fas fa-exclamation-circle"></i>
          <span>{error}</span>
          <button onClick={() => setError("")} className="dismiss-error">
            ×
          </button>
        </div>
      )}

      <div className="productivity-input-panel interview-view-panel" key={dashboardView}>
      {dashboardView === "candidates" &&
        (() => {
          const totalCandidates = candidates.length;
          const avgScore =
            totalCandidates > 0
              ? Math.round(
                  candidates.reduce(
                    (acc, c) => acc + (c.average_score || 0),
                    0,
                  ) / totalCandidates,
                )
              : 0;

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

          const candidateTotalPages = Math.max(
            1,
            Math.ceil(filteredCandidates.length / CANDIDATES_PAGE_SIZE),
          );
          const safeCandidatePage = Math.min(candidatePage, candidateTotalPages);
          const paginatedCandidates = filteredCandidates.slice(
            (safeCandidatePage - 1) * CANDIDATES_PAGE_SIZE,
            safeCandidatePage * CANDIDATES_PAGE_SIZE,
          );
          const showingFrom =
            filteredCandidates.length === 0
              ? 0
              : (safeCandidatePage - 1) * CANDIDATES_PAGE_SIZE + 1;
          const showingTo = Math.min(
            safeCandidatePage * CANDIDATES_PAGE_SIZE,
            filteredCandidates.length,
          );

          return (
            <div className="interview-section">
              <h3>Candidates Overview</h3>

              <div className="analytics-row">
                <div className="analytics-card">
                  <div className="icon">
                    <i className="fas fa-users" />
                  </div>
                  <div className="info">
                    <span>Total Candidates</span>
                    <strong>{totalCandidates}</strong>
                  </div>
                </div>
                <div className="analytics-card">
                  <div className="icon">
                    <i className="fas fa-star" style={{ color: semanticCss.warning }} />
                  </div>
                  <div className="info">
                    <span>Average Score</span>
                    <strong>
                      {totalCandidates > 0 ? `${avgScore}%` : "—"}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="filters-card" style={{ marginBottom: 24 }}>
                <div
                  className="form-row candidates-filters-row"
                  style={{
                    display: "flex",
                    gap: 16,
                    flexWrap: "wrap",
                    alignItems: "stretch",
                  }}
                >
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
                    <select
                      value={candidateRoleFilter}
                      onChange={(e) => setCandidateRoleFilter(e.target.value)}
                    >
                      <option value="">All roles</option>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ width: 100 }}>
                    <label>Min %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={candidateMinScore}
                      onChange={(e) => setCandidateMinScore(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="form-group" style={{ width: 100 }}>
                    <label>Max %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={candidateMaxScore}
                      onChange={(e) => setCandidateMaxScore(e.target.value)}
                      placeholder="100"
                    />
                  </div>
                  <div className="form-group candidates-filter-action">
                    <label style={{ visibility: "hidden" }}>Refresh</label>
                    <button
                      type="button"
                      className="evaluate-btn candidates-filter-refresh-btn"
                      onClick={fetchCandidates}
                      disabled={candidatesLoading}
                    >
                      <i
                        className={`fas fa-sync-alt ${candidatesLoading ? "fa-spin" : ""}`}
                      />
                      {candidatesLoading ? " Loading..." : " Refresh"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="results-list">
                {candidatesLoading ? (
                  <div style={{ marginTop: 24 }}>
                    <div className="skeleton-box skeleton-card"></div>
                    <div className="skeleton-box skeleton-card"></div>
                    <div className="skeleton-box skeleton-card"></div>
                  </div>
                ) : candidates.length === 0 ? (
                  <div className="empty-state-container">
                    <i className="fas fa-inbox empty-state-icon" />
                    <h4>No submissions yet</h4>
                    <p>
                      Generate an interview link from the "Interview Setup" tab
                      and share it. Candidate submissions will appear here.
                    </p>
                  </div>
                ) : filteredCandidates.length === 0 ? (
                  <div
                    className="empty-state-container"
                    style={{ padding: "32px 24px" }}
                  >
                    <i
                      className="fas fa-search empty-state-icon"
                      style={{ fontSize: "2.5rem" }}
                    />
                    <h4>No matches found</h4>
                    <p>Try adjusting your search query or filters.</p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                    }}
                  >
                    <div
                      style={{ display: "flex", justifyContent: "flex-end" }}
                    >
                      <button
                        type="button"
                        className="generate-btn"
                        style={{
                          padding: "8px 16px",
                          fontSize: "0.9rem",
                        }}
                        onClick={handleBulkDownloadPDF}
                        disabled={
                          isGeneratingBulkPDF || candidates.length === 0
                        }
                      >
                        <i
                          className={`fas ${isGeneratingBulkPDF ? "fa-spinner fa-spin" : "fa-file-pdf"}`}
                        />
                        {isGeneratingBulkPDF ? " Processing..." : " Export PDF"}
                      </button>
                    </div>
                    <div
                      style={{
                        color: "#64748b",
                        fontSize: "0.95rem",
                        fontWeight: 500,
                      }}
                    >
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
                              <td
                                className="candidates-table-cell-id"
                                style={{
                                  fontFamily: "monospace",
                                  fontSize: "0.85rem",
                                }}
                              >
                                {c.interview_id}
                              </td>
                              <td className="candidates-table-cell-score">
                                <span
                                  className="score-badge candidates-score-badge"
                                  style={{
                                    backgroundColor: getScoreColor(
                                      c.average_score,
                                    ),
                                    color: "#fff",
                                    padding: "4px 8px",
                                    borderRadius: 6,
                                    fontWeight: 600,
                                  }}
                                >
                                  {c.average_score}%
                                </span>
                              </td>
                              <td
                                className="candidates-table-cell-submitted"
                                style={{
                                  fontSize: "0.85rem",
                                  color: "#6b7280",
                                }}
                              >
                                {c.submitted_at
                                  ? new Date(c.submitted_at).toLocaleString()
                                  : "—"}
                              </td>
                              <td className="candidates-table-cell-actions">
                                <div className="candidates-table-actions">
                                  <button
                                    type="button"
                                    className="action-icon-btn primary"
                                    title="View Details"
                                    onClick={() => {
                                      setInterviewId(c.interview_id);
                                      setOpenSubmissionId(c.submission_id);
                                      setDashboardView("interview");
                                    }}
                                  >
                                    <i className="fas fa-eye"></i>
                                  </button>
                                  <button
                                    type="button"
                                    className="action-icon-btn success"
                                    title="Download PDF"
                                    onClick={() => handleDownloadRowPDF(c)}
                                  >
                                    <i
                                      className={`fas ${autoDownloadPdfId === c.submission_id ? "fa-spinner fa-spin" : "fa-file-pdf"}`}
                                    ></i>
                                  </button>
                                  <button
                                    type="button"
                                    className="action-icon-btn danger"
                                    title="Delete Candidate"
                                    onClick={() =>
                                      handleDeleteCandidate(
                                        c.interview_id,
                                        c.submission_id,
                                        c.candidate_name,
                                      )
                                    }
                                  >
                                    <i className="fas fa-trash-alt"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {filteredCandidates.length > CANDIDATES_PAGE_SIZE && (
                      <div className="preview-pagination">
                        <button
                          type="button"
                          className="preview-page-btn"
                          onClick={() =>
                            setCandidatePage((page) => Math.max(1, page - 1))
                          }
                          disabled={safeCandidatePage === 1}
                        >
                          Previous
                        </button>
                        <span className="preview-page-indicator">
                          Page {safeCandidatePage} of {candidateTotalPages}
                        </span>
                        <button
                          type="button"
                          className="preview-page-btn"
                          onClick={() =>
                            setCandidatePage((page) =>
                              Math.min(candidateTotalPages, page + 1),
                            )
                          }
                          disabled={safeCandidatePage === candidateTotalPages}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {dashboardView === "interview" && (
        <>
          <div className="interview-setup-card">
            <h3>Interview Setup</h3>
            <form onSubmit={handleGenerateInterviewLink}>
              <div className="form-row">
                <div className="form-group">
                  <label>Job Role *</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    required
                  >
                    <option value="">-- Select Job Role --</option>
                    <option value="Mobile Developer">Mobile Developer</option>
                    <option value="Frontend Developer">
                      Frontend Developer
                    </option>
                    <option value="Backend Engineer">Backend Engineer</option>
                    <option value="BI Analyst">BI Analyst</option>
                    <option value="ML Engineer">ML Engineer</option>
                    <option value="Cloud Engineer">Cloud Engineer</option>
                    <option value="Data Scientist">Data Scientist</option>
                    <option value="DevOps Engineer">DevOps Engineer</option>
                    <option value="HR Manager">HR Manager</option>
                    <option value="Cybersecurity Specialist">
                      Cybersecurity Specialist
                    </option>
                  </select>
                </div>

                <div className="form-group" style={{ display: "none" }}>
                  <label>Number of Questions</label>
                  <input
                    type="number"
                    value={numQuestions}
                    onChange={(e) =>
                      setNumQuestions(parseInt(e.target.value) || 10)
                    }
                    min="1"
                    max="10"
                  />
                </div>
              </div>

              <button type="submit" className="generate-btn" disabled={loading}>
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    Generating Link...
                  </>
                ) : (
                  <>
                    <i className="fas fa-magic"></i>
                    Generate Interview Link
                  </>
                )}
              </button>
            </form>

            <hr
              style={{
                margin: "18px 0",
                border: "none",
                borderTop: "1px dashed rgba(148, 163, 184, 0.6)",
              }}
            />

            <h4>Load existing interview</h4>
            <p style={{ fontSize: "0.85rem", color: "#6b7280" }}>
              Paste the interview ID from a previously shared link (the last
              part of the candidate URL) to view their scores again.
            </p>
            <form onSubmit={handleLoadExistingInterview}>
              <div className="form-row">
                <div className="form-group">
                  <label>Interview ID</label>
                  <input
                    type="text"
                    value={lookupInterviewId}
                    onChange={(e) => setLookupInterviewId(e.target.value)}
                    placeholder="e.g. add76c4c47f2"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="generate-btn"
                disabled={loading || !lookupInterviewId.trim()}
              >
                <i className="fas fa-search"></i>
                Load Interview
              </button>
            </form>
          </div>

          {interviewId && (
            <div className="interview-section">
              <h3>Shareable Candidate Link</h3>

              <div className="link-widget-container">
                <label
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    color: "#334155",
                  }}
                >
                  Candidate Link
                </label>
                <div className="link-input-group">
                  <input type="text" value={shareLink} readOnly />
                  <div className="link-actions">
                    <button
                      type="button"
                      className="btn-copy"
                      onClick={handleCopyLink}
                    >
                      <i className="fas fa-copy"></i> Copy
                    </button>
                    <a
                      className="btn-open"
                      href={shareLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <i className="fas fa-external-link-alt"></i> Open
                    </a>
                  </div>
                </div>
                {(copyStatus || interviewId) && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.8rem",
                      color: "#64748b",
                      marginTop: "2px",
                    }}
                  >
                    {copyStatus ? (
                      <span style={{ color: semanticCss.success, fontWeight: 500 }}>
                        <i
                          className="fas fa-check-circle"
                          style={{ marginRight: 4 }}
                        ></i>{" "}
                        {copyStatus}
                      </span>
                    ) : (
                      <span>Share this unique link with your candidate.</span>
                    )}
                    {interviewId && (
                      <span>
                        ID:{" "}
                        <code
                          style={{
                            background: "#f1f5f9",
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                        >
                          {interviewId}
                        </code>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {interviewDetails?.questions?.length > 0 && (
                <>
                  <h4 style={{ marginTop: 18 }}>Generated Questions</h4>
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "#64748b",
                      marginBottom: "12px",
                    }}
                  >
                    <i className="fas fa-lock" style={{ marginRight: 4 }} />{" "}
                    These questions are locked and ready for the candidate.
                  </p>
                  <div
                    className="compact-question-list"
                    style={{ userSelect: "auto", pointerEvents: "none" }}
                  >
                    {interviewDetails.questions.map((q, idx) => (
                      <div
                        key={idx}
                        className="compact-question-item"
                        style={{ background: "#f8fafc" }}
                      >
                        <span
                          className="q-number"
                          style={{ background: "#e2e8f0" }}
                        >
                          Q{idx + 1}
                        </span>
                        <p className="q-text" style={{ flex: 1, margin: 0 }}>
                          {q}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div
                className="action-buttons"
                style={{ justifyContent: "space-between" }}
              >
                <button
                  className="evaluate-btn"
                  type="button"
                  onClick={() => fetchSubmissions(interviewId)}
                  disabled={loading}
                >
                  <i className="fas fa-sync-alt"></i> Refresh Submissions
                </button>
              </div>

              <div className="results-list">
                <h4>Candidate Submissions (Semantic Scores)</h4>
                {submissions.length === 0 ? (
                  <div className="result-card">
                    <p style={{ margin: 0 }}>
                      No submissions yet. Share the link with a candidate and
                      refresh after they submit.
                    </p>
                  </div>
                ) : (
                  submissions.map((s) => (
                    <div key={s.submission_id} className="result-card">
                      <div className="result-header">
                        <span className="question-number">
                          {s.candidate_name || "Candidate"}
                        </span>
                        <span
                          className="score-badge"
                          style={{ backgroundColor: "#4facfe" }}
                        >
                          Avg: {s.average_score}%
                        </span>
                      </div>
                      <div className="question-text">
                        <span className="data-label">Email:</span>{" "}
                        <span style={{ color: "#1e293b" }}>
                          {s.candidate_email || "N/A"}
                        </span>
                      </div>
                      <div className="question-text">
                        <span className="data-label">Phone:</span>{" "}
                        <span style={{ color: "#1e293b" }}>
                          {s.candidate_phone || "N/A"}
                        </span>
                      </div>
                      <div className="question-text">
                        <span className="data-label">Submitted:</span>{" "}
                        <span style={{ color: "#1e293b" }}>
                          {s.submitted_at}
                        </span>
                      </div>
                      <div
                        className="question-text"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <span className="data-label">Performance:</span>
                        <span
                          style={{
                            background: semanticCss.successSoft,
                            color: semanticCss.successText,
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "0.85rem",
                            fontWeight: "600",
                            border: `1px solid ${semanticCss.successBorder}`,
                          }}
                        >
                          {s.strong_matches} Strong
                        </span>
                        <span
                          style={{
                            background: semanticCss.dangerSoft,
                            color: semanticCss.dangerText,
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "0.85rem",
                            fontWeight: "600",
                            border: `1px solid ${semanticCss.dangerBorder}`,
                          }}
                        >
                          {s.weak_matches} Weak
                        </span>
                      </div>
                      <div
                        className="action-buttons"
                        style={{ justifyContent: "flex-end", marginTop: 10 }}
                      >
                        <button
                          type="button"
                          className="evaluate-btn"
                          onClick={() =>
                            fetchSubmissionDetails(interviewId, s.submission_id)
                          }
                          disabled={isLoadingSubmission}
                          style={{
                            padding: "8px 12px",
                            fontSize: "0.85rem",
                            background:
                              selectedSubmissionId === s.submission_id
                                ? "#e0e7ff"
                                : undefined,
                          }}
                        >
                          <i className="fas fa-eye"></i>
                          {selectedSubmissionId === s.submission_id
                            ? " Viewing"
                            : " View details"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {selectedSubmission && (
                <div className="results-list" style={{ marginTop: 18 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "1rem",
                    }}
                    className="action-buttons no-print"
                  >
                    <h4 style={{ margin: 0 }}>Detailed Responses</h4>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        type="button"
                        className="evaluate-btn danger-btn"
                        style={{ padding: "8px 16px", fontSize: "0.9rem" }}
                        onClick={handleDeleteCandidate}
                      >
                        <i className="fas fa-trash-alt"></i> Delete Candidate
                      </button>
                      <button
                        type="button"
                        className="generate-btn"
                        style={{ padding: "8px 16px", fontSize: "0.9rem" }}
                        onClick={handleDownloadPDF}
                        disabled={isGeneratingPDF}
                      >
                        <i
                          className={`fas ${isGeneratingPDF ? "fa-spinner fa-spin" : "fa-file-pdf"}`}
                        ></i>
                        {isGeneratingPDF ? " Formatting..." : " Download PDF"}
                      </button>
                    </div>
                  </div>

                  <div className="pdf-visible-container">
                    <div className="result-card">
                      <div className="result-header">
                        <span className="question-number">
                          {selectedSubmission.candidate_name || "Candidate"}
                        </span>
                        <span
                          className="score-badge"
                          style={{ backgroundColor: "var(--color-accent)" }}
                        >
                          Avg: {selectedSubmission.average_score}%
                        </span>
                      </div>
                      <div className="question-text">
                        <span className="data-label">Email:</span>{" "}
                        <span style={{ color: "#1e293b" }}>
                          {selectedSubmission.candidate_email || "N/A"}
                        </span>
                      </div>
                      <div className="question-text">
                        <span className="data-label">Phone:</span>{" "}
                        <span style={{ color: "#1e293b" }}>
                          {selectedSubmission.candidate_phone || "N/A"}
                        </span>
                      </div>
                      <div className="question-text">
                        <span className="data-label">Submitted:</span>{" "}
                        <span style={{ color: "#1e293b" }}>
                          {selectedSubmission.submitted_at}
                        </span>
                      </div>
                    </div>

                    {(selectedSubmission.results || []).map((r) => (
                      <div key={r.question_number} className="result-card">
                        <div className="result-header">
                          <span className="question-number">
                            Question {r.question_number}
                          </span>
                          <span
                            className="score-badge"
                            style={{ backgroundColor: getScoreColor(r.score) }}
                          >
                            {r.score}%
                          </span>
                        </div>
                        <div className="question-text">
                          <span
                            className="data-label"
                            style={{ color: "var(--color-accent)" }}
                          >
                            Q:
                          </span>{" "}
                          {r.question}
                        </div>
                        <div className="answer-comparison">
                          <div className="candidate-answer">
                            <span
                              className="data-label"
                              style={{ display: "block", marginBottom: "6px" }}
                            >
                              Candidate Answer
                            </span>
                            <p>{r.candidate_answer || "No answer provided"}</p>
                          </div>
                          <div className="ideal-answer">
                            <span
                              className="data-label"
                              style={{ display: "block", marginBottom: "6px" }}
                            >
                              Ideal Answer
                            </span>
                            <p>{r.ideal_answer}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
      </div>

      <div style={{ position: "absolute", top: "-9999px", left: "-9999px" }}>
        <div
          ref={bulkReportRef}
          className="pdf-export-container pdf-export-landscape"
        >
          <h2
            style={{
              textAlign: "center",
              marginBottom: "8px",
              color: "#1e293b",
            }}
          >
            Candidate List
          </h2>
          <p
            style={{
              textAlign: "center",
              marginBottom: "20px",
              color: "#64748b",
              fontSize: "14px",
            }}
          >
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
                    if (
                      candidateMinScore &&
                      c.average_score < parseFloat(candidateMinScore)
                    )
                      match = false;
                    if (
                      candidateMaxScore &&
                      c.average_score > parseFloat(candidateMaxScore)
                    )
                      match = false;
                    return match;
                  })
                  .map((c) => (
                    <tr key={c.submission_id}>
                      <td style={{ fontWeight: 600 }}>
                        {c.candidate_name || "—"}
                      </td>
                      <td>{c.role || "—"}</td>
                      <td
                        style={{
                          color: getScoreColor(c.average_score),
                          fontWeight: "bold",
                        }}
                      >
                        {c.average_score}%
                      </td>
                      <td>
                        {c.submitted_at
                          ? new Date(c.submitted_at).toLocaleDateString()
                          : "—"}
                      </td>
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
                <span
                  className="question-number"
                  style={{ fontSize: "18px", fontWeight: "bold" }}
                >
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
                <span className="data-label">Email:</span>
                <span style={{ color: "#1e293b", fontWeight: "500" }}>
                  {selectedSubmission.candidate_email || "N/A"}
                </span>
              </div>
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
                  <span
                    className="question-number"
                    style={{ fontSize: "16px", fontWeight: "600" }}
                  >
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

      {toastMessage && (
        <div className="toast-container">
          <i className="fas fa-check-circle toast-icon"></i>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default DynamicInterview;
