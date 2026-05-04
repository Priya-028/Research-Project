import React, { useContext, useEffect, useMemo, useState, useRef } from "react";
import { AuthContext } from "./AuthContext";
import FeaturePageHero from './common/FeaturePageHero';
import { semanticCss, semanticHex } from './common/semanticPalette';
import html2pdf from "html2pdf.js";
import Swal from "sweetalert2";

// Sub-components for modular architecture
import CandidatesOverview from './DynamicInterview/CandidatesOverview';
import InterviewSetup from './DynamicInterview/InterviewSetup';
import SubmissionAnalytics from './DynamicInterview/SubmissionAnalytics';
import SkillsMatrix from './DynamicInterview/SkillsMatrix';
import ResponseDetails from './DynamicInterview/ResponseDetails';
import PDFExportTemplates from './DynamicInterview/PDFExportTemplates';

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
    "Product Manager",
    "Software Architect",
    "Data Engineer",
    "QA Engineer",
    "Technical Lead",
    "SRE",
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

  const getConsistencyColor = (score) => {
    if (score >= 0.8) return semanticHex.success;
    if (score >= 0.6) return semanticHex.warning;
    return semanticHex.danger;
  };

  const handleGenerateInterviewLink = async (e) => {
    if (e) e.preventDefault();
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
    if (e) e.preventDefault();
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
          <i className={`fas fa-${apiStatus.status === "connected" ? "check-circle" : "exclamation-circle"}`} />
          <span>{apiStatus.message}</span>
          <button onClick={checkApiHealth} className="refresh-status" disabled={isCheckingApi}>
            <i className={`fas fa-sync-alt ${isCheckingApi ? "fa-spin" : ""}`} />
            {isCheckingApi ? "Checking..." : "Refresh"}
          </button>
        </div>
      )}

      <section className="productivity-input-switcher interview-view-switcher">
        <div className="productivity-input-switcher-header">
          <div>
            <h3>Choose Workspace View</h3>
            <p>Toggle between interview setup tools and candidate submission insights.</p>
          </div>
          <div className="productivity-input-toggle" role="tablist" aria-label="Dynamic interview views">
            <button
              type="button"
              className={`productivity-input-toggle-btn ${dashboardView === "interview" ? "active" : ""}`}
              onClick={() => setDashboardView("interview")}
            >
              <i className="fas fa-plus-circle" />
              <span>Interview Setup & Link</span>
            </button>
            <button
              type="button"
              className={`productivity-input-toggle-btn ${dashboardView === "candidates" ? "active" : ""}`}
              onClick={() => setDashboardView("candidates")}
            >
              <i className="fas fa-users" />
              <span>Candidates Details</span>
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="error-message">
          <i className="fas fa-exclamation-circle" />
          <span>{error}</span>
          <button onClick={() => setError("")} className="dismiss-error">×</button>
        </div>
      )}

      <div className="productivity-input-panel interview-view-panel" key={dashboardView}>
        {dashboardView === "candidates" ? (
          <CandidatesOverview 
            candidates={candidates}
            loading={candidatesLoading}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            candidateRoleFilter={candidateRoleFilter}
            setCandidateRoleFilter={setCandidateRoleFilter}
            candidateMinScore={candidateMinScore}
            setCandidateMinScore={setCandidateMinScore}
            candidateMaxScore={candidateMaxScore}
            setCandidateMaxScore={setCandidateMaxScore}
            candidatePage={candidatePage}
            setCandidatePage={setCandidatePage}
            pageSize={CANDIDATES_PAGE_SIZE}
            ROLES={ROLES}
            onViewDetails={(iid, sid) => {
              setInterviewId(iid);
              setOpenSubmissionId(sid);
              setDashboardView("interview");
            }}
            onDeleteCandidate={handleDeleteCandidate}
            onDownloadRowPDF={handleDownloadRowPDF}
            getScoreColor={getScoreColor}
            semanticCss={semanticCss}
            fetchCandidates={fetchCandidates}
            isGeneratingBulkPDF={isGeneratingBulkPDF}
            onBulkDownload={handleBulkDownloadPDF}
            autoDownloadPdfId={autoDownloadPdfId}
          />
        ) : (
          <>
            <InterviewSetup 
              role={role}
              setRole={setRole}
              numQuestions={numQuestions}
              setNumQuestions={setNumQuestions}
              onGenerateInterviewLink={handleGenerateInterviewLink}
              loading={loading}
              interviewId={interviewId}
              shareLink={shareLink}
              onCopyLink={handleCopyLink}
              copyStatus={copyStatus}
              lookupInterviewId={lookupInterviewId}
              setLookupInterviewId={setLookupInterviewId}
              onLoadExistingInterview={handleLoadExistingInterview}
              ROLES={ROLES}
              interviewDetails={interviewDetails}
              apiStatus={apiStatus}
              isCheckingApi={isCheckingApi}
              submissions={submissions}
              fetchSubmissions={fetchSubmissions}
              selectedSubmissionId={selectedSubmissionId}
              isLoadingSubmission={isLoadingSubmission}
              fetchSubmissionDetails={fetchSubmissionDetails}
              selectedSubmission={selectedSubmission}
              getScoreColor={getScoreColor}
              getConsistencyColor={getConsistencyColor}
              onDeleteCandidate={handleDeleteCandidate}
              onDownloadPDF={handleDownloadPDF}
              isGeneratingPDF={isGeneratingPDF}
            />

            {selectedSubmission && interviewId && (
              <div className="results-list" style={{ marginTop: 32 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }} className="action-buttons no-print">
                  <h4 style={{ margin: 0 }}>Detailed Analysis</h4>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button type="button" className="evaluate-btn danger-btn" onClick={() => handleDeleteCandidate()}>
                      <i className="fas fa-trash-alt" /> Delete Results
                    </button>
                    <button type="button" className="generate-btn" onClick={handleDownloadPDF} disabled={isGeneratingPDF}>
                      <i className={`fas ${isGeneratingPDF ? "fa-spinner fa-spin" : "fa-file-pdf"}`} />
                      {isGeneratingPDF ? " Formatting..." : " Download PDF"}
                    </button>
                  </div>
                </div>

                <div className="pdf-visible-container">
                  <div className="result-card" style={{ marginBottom: 32 }}>
                    <div className="result-header">
                      <span className="question-number">{selectedSubmission.candidate_name}</span>
                      <span className="score-badge" style={{ backgroundColor: "var(--color-accent)" }}>
                        Master Score: {selectedSubmission.average_score}%
                      </span>
                    </div>
                    <div className="candidate-id-meta" style={{ display: 'flex', gap: '24px', padding: '16px 0', borderBottom: '1px solid #f1f5f9', marginBottom: '24px' }}>
                       <div style={{ fontSize: '0.85rem' }}><span style={{ color: '#94a3b8' }}>EMAIL:</span> <span style={{ color: '#1e293b', fontWeight: 600 }}>{selectedSubmission.candidate_email}</span></div>
                       <div style={{ fontSize: '0.85rem' }}><span style={{ color: '#94a3b8' }}>PHONE:</span> <span style={{ color: '#1e293b', fontWeight: 600 }}>{selectedSubmission.candidate_phone || 'N/A'}</span></div>
                       <div style={{ fontSize: '0.85rem' }}><span style={{ color: '#94a3b8' }}>SUBMITTED:</span> <span style={{ color: '#1e293b', fontWeight: 600 }}>{selectedSubmission.submitted_at}</span></div>
                    </div>

                    <SubmissionAnalytics 
                      selectedSubmission={selectedSubmission}
                      getConsistencyColor={getConsistencyColor}
                      getScoreColor={getScoreColor}
                    />

                    <SkillsMatrix 
                      skills={selectedSubmission.skills_matrix}
                      results={selectedSubmission.results}
                      getScoreColor={getScoreColor}
                    />

                    <ResponseDetails 
                      results={selectedSubmission.results}
                      getScoreColor={getScoreColor}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <PDFExportTemplates 
        ref={{ bulkReportRef, reportRef }}
        candidates={candidates}
        searchQuery={searchQuery}
        candidateRoleFilter={candidateRoleFilter}
        candidateMinScore={candidateMinScore}
        candidateMaxScore={candidateMaxScore}
        dashboardView={dashboardView}
        selectedSubmission={selectedSubmission}
        interviewDetails={interviewDetails}
        getScoreColor={getScoreColor}
        getConsistencyColor={getConsistencyColor}
      />

      {toastMessage && (
        <div className="toast-container">
          <i className="fas fa-check-circle toast-icon" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default DynamicInterview;
