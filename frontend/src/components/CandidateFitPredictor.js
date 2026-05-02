
import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from './AuthContext';
import FeaturePageHero from './common/FeaturePageHero';
import { semanticHex } from './common/semanticPalette';



const API_BASE_URL = 'http://localhost:5001';

const getCandidateFileSummary = (fileNames) => {
  if (!fileNames.length) {
    return '';
  }

  if (fileNames.length === 1) {
    return fileNames[0];
  }

  return `${fileNames[0]} + ${fileNames.length - 1} more file${fileNames.length > 2 ? 's' : ''}`;
};

const getCandidateUploadDisplayText = (fileNames) => {
  if (!fileNames.length) {
    return 'No CVs uploaded';
  }

  return getCandidateFileSummary(fileNames);
};

const getCandidateFooterText = (count) => {
  if (!count) {
    return 'No CVs uploaded';
  }

  return `${count} CV file${count === 1 ? '' : 's'} selected`;
};

const getJobUploadDisplayText = (fileName) => fileName || 'No job description uploaded';

const getJobFooterText = (fileName) => fileName ? 'Job description selected' : 'No job description uploaded';

const HIDDEN_PREVIEW_COLUMNS = new Set(['Experience_Years', 'Job_Role_Applied']);

const getPreviewFitValue = (row) => Number(row?.Fit_Percentage || 0);

const getPreviewFitBucket = (fitValue) => {
  if (fitValue >= 80) {
    return 'Strong Match';
  }

  if (fitValue >= 60) {
    return 'Moderate Match';
  }

  return 'Needs Review';
};

const downloadCandidatePreviewRows = (rows, columns) => {
  if (!rows.length || !columns.length) {
    return;
  }

  const csvContent = [columns, ...rows.map((row) => columns.map((column) => row?.[column] ?? ''))]
    .map((cells) => cells.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = 'candidate_fit_preview.csv';
  link.click();
  window.URL.revokeObjectURL(objectUrl);
};

const CandidateFitPredictor = () => {
  const { user } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('single');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [apiStatus, setApiStatus] = useState(null);
  const [isCheckingApi, setIsCheckingApi] = useState(false);
  const [candidateFiles, setCandidateFiles] = useState([]);
  const [candidateFileNames, setCandidateFileNames] = useState([]);
  const [jobPdfFile, setJobPdfFile] = useState(null);
  const [jobPdfFileName, setJobPdfFileName] = useState('');
  const [batchResult, setBatchResult] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewFilter, setPreviewFilter] = useState('All');
  const [previewSortBy, setPreviewSortBy] = useState('fit-desc');


  useEffect(() => {
    checkApiHealth();
  }, []);

  const checkApiHealth = async () => {
    setIsCheckingApi(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/test`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        setApiStatus({
          status: 'connected',
          message: `API connected. Model loaded: ${data.model_loaded ? 'Yes' : 'No'}`,
          details: data
        });
        setError('');
      } else {
        setApiStatus({
          status: 'error',
          message: `API returned status ${response.status}`
        });
      }
    } catch (err) {
      setApiStatus({
        status: 'error',
        message: `Cannot connect to API at ${API_BASE_URL}. Make sure Flask server is running.`
      });
    } finally {
      setIsCheckingApi(false);
    }
  };

  const handleCandidateFilesChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const invalid = files.filter(
      (file) =>
        file.type !== 'application/pdf' &&
        !file.name.toLowerCase().endsWith('.pdf')
    );

    if (invalid.length > 0) {
      setError('Please upload only PDF files for candidate CVs');
      return;
    }

    setCandidateFiles(files);
    setCandidateFileNames(files.map((file) => file.name));
    setError('');
  };

  const handleJobPdfFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        setError('Please upload a PDF file');
        return;
      }
      setJobPdfFile(file);
      setJobPdfFileName(file.name);
      setError('');
    }
  };

  const handleBatchPredict = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setBatchResult(null);

    try {
      if (!candidateFiles.length) {
        throw new Error('Please upload at least one candidate CV PDF');
      }

      if (!jobPdfFile) {
        throw new Error('Please upload a job description PDF');
      }

      const formData = new FormData();
      candidateFiles.forEach((file) => {
        formData.append('candidate_pdfs', file);
      });
      formData.append('job_pdf', jobPdfFile);

      const response = await fetch(`${API_BASE_URL}/api/batch-predict-pdfs`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server error:', errorText);
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setBatchResult(data);
      } else {
        throw new Error(data.error || 'Batch prediction failed');
      }
    } catch (err) {
      console.error('Batch prediction error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    setLoading(true);
    setError('');
    setPreviewData(null);

    try {
      if (!candidateFiles.length) {
        throw new Error('Please upload at least one candidate CV PDF');
      }

      if (!jobPdfFile) {
        throw new Error('Please upload a job description PDF');
      }

      const formData = new FormData();
      candidateFiles.forEach((file) => {
        formData.append('candidate_pdfs', file);
      });
      formData.append('job_pdf', jobPdfFile);

      const response = await fetch(`${API_BASE_URL}/api/batch-predict-pdfs-preview`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setPreviewData(data);
        setPreviewSearch('');
        setPreviewFilter('All');
        setPreviewSortBy('fit-desc');
      } else {
        throw new Error(data.error || 'Preview failed');
      }
    } catch (err) {
      console.error('Preview error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadResults = () => {
    if (batchResult?.download_url) {
      window.open(`${API_BASE_URL}${batchResult.download_url}`, '_blank');
    }
  };

  if (!user) {
    return (
      <div className="predictor-container feature-page-shell">
        <div className="login-message">
          <h2>Please log in to access the Candidate Fit Predictor</h2>
          <p>This tool helps you predict how well candidates match job descriptions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="predictor-container feature-page-shell">
      <FeaturePageHero
        badgeIcon="fas fa-brain"
        badgeText="AI-Powered Talent Matching"
        titleLeading="Candidate-Job Fit"
        titleHighlight="Predictor"
        subtitle="Analyze candidate profiles against job descriptions using advanced machine learning algorithms to identify the best-fit talent instantly."
        features={[
          { icon: 'fas fa-robot', label: 'Smart Matching' },
          { icon: 'fas fa-chart-line', label: 'Data-Driven Insights' },
          { icon: 'fas fa-bolt', label: 'Fast Processing' }
        ]}
      />
      
      {/* API Status Indicator */}
      {apiStatus && (
        <div className={`api-status ${apiStatus.status}`}>
          <i className={`fas fa-${apiStatus.status === 'connected' ? 'check-circle' : 'exclamation-circle'}`}></i>
          <span>{apiStatus.message}</span>
          <button
            onClick={checkApiHealth}
            className="refresh-status"
            disabled={isCheckingApi}
          >
            <i className={`fas fa-sync-alt ${isCheckingApi ? 'fa-spin' : ''}`}></i>
            {isCheckingApi ? 'Checking...' : 'Refresh'}
          </button>
        </div>
      )}

      {error && (
        <div className="error-message">
          <i className="fas fa-exclamation-circle"></i>
          <span>{error}</span>
          <button onClick={() => setError('')} className="dismiss-error">×</button>
        </div>
      )}

      {/* Batch CSV Upload Section */}
      <div className="batch-csv-section">
        <form onSubmit={handleBatchPredict} className="predictor-form">
          <div className="form-section">

            <div className="candidate-fit-upload-grid">
              <div className="candidate-fit-upload-card">
                <div className="candidate-fit-upload-body">
                  <div className="candidate-fit-upload-icon">
                    <i className="fa-solid fa-cloud-arrow-up"></i>
                  </div>
                  <h4>Candidate CV PDFs</h4>
                  <label className="candidate-fit-upload-button">
                    <i className="fas fa-cloud-upload-alt"></i>
                    {candidateFileNames.length ? 'Upload More CVs' : 'Upload CVs'}
                    <input
                      type="file"
                      accept=".pdf"
                      multiple
                      onChange={handleCandidateFilesChange}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <p
                    className="candidate-fit-upload-note"
                    title={candidateFileNames.length ? candidateFileNames.join(', ') : undefined}
                  >
                    {getCandidateUploadDisplayText(candidateFileNames)}
                  </p>
                </div>

                <div className="candidate-fit-upload-footer">
                  <div className="candidate-fit-upload-status">
                    <i className="fas fa-check-circle"></i>
                    <span>{getCandidateFooterText(candidateFiles.length)}</span>
                  </div>
                </div>
              </div>

              <div className="candidate-fit-upload-card">
                <div className="candidate-fit-upload-body">
                  <div className="candidate-fit-upload-icon">
                  <i className="fa-solid fa-cloud-arrow-up"></i>
                </div>
                  <h4>Job Description PDF</h4>
                  <label className="candidate-fit-upload-button">
                    <i className="fas fa-cloud-upload-alt"></i>
                    {jobPdfFileName ? 'Upload Job Description' : 'Upload Job Description'}
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handleJobPdfFileChange}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <p
                    className="candidate-fit-upload-note"
                    title={jobPdfFileName || undefined}
                  >
                    {getJobUploadDisplayText(jobPdfFileName)}
                  </p>
                </div>

                <div className="candidate-fit-upload-footer">
                  <div className="candidate-fit-upload-status">
                    <i className="fas fa-check-circle"></i>
                    <span>{getJobFooterText(jobPdfFileName)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="candidate-fit-action-buttons">
              <button
                type="submit"
                className="candidate-fit-action-button candidate-fit-action-button-primary"
                disabled={loading || !candidateFiles.length || !jobPdfFile || apiStatus?.status !== 'connected'}
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    Processing...
                  </>
                ) : (
                  <>
                    <i className="fas fa-play"></i>
                    Run Batch Prediction
                  </>
                )}
              </button>

              <button
                type="button"
                className="candidate-fit-action-button candidate-fit-action-button-secondary"
                onClick={handlePreview}
                disabled={loading || !candidateFiles.length || !jobPdfFile || apiStatus?.status !== 'connected'}
              >
                <i className="fas fa-eye"></i>
                Preview Data
              </button>
            </div>
          </div>
        </form>

        {/* Preview Results */}
        {previewData && (() => {
          const visibleCols = (previewData.columns || []).filter((column) => !HIDDEN_PREVIEW_COLUMNS.has(column));
          const previewRows = Array.isArray(previewData.preview) ? previewData.preview : [];
          const filteredPreviewRows = previewRows
            .filter((row) => {
              if (!previewSearch.trim()) {
                return true;
              }

              return visibleCols.some((column) => String(row?.[column] ?? '').toLowerCase().includes(previewSearch.trim().toLowerCase()));
            })
            .filter((row) => {
              if (previewFilter === 'All') {
                return true;
              }

              return getPreviewFitBucket(getPreviewFitValue(row)) === previewFilter;
            })
            .sort((left, right) => {
              switch (previewSortBy) {
                case 'fit-asc':
                  return getPreviewFitValue(left) - getPreviewFitValue(right);
                case 'experience-desc':
                  return Number(right?.Experience_Years || 0) - Number(left?.Experience_Years || 0);
                case 'name-asc':
                  return String(left?.Name || '').localeCompare(String(right?.Name || ''), undefined, { sensitivity: 'base' });
                case 'fit-desc':
                default:
                  return getPreviewFitValue(right) - getPreviewFitValue(left);
              }
            });

          return (
            <div className="candidate-fit-preview-section">
              <div className="candidate-fit-preview-card">
                <div className="candidate-fit-preview-header">
                  <h3>
                    <i className="fas fa-table"></i>
                    Data Preview
                  </h3>
                  <p>
                    Showing {filteredPreviewRows.length} preview rows from {previewData.total_rows} predicted candidates
                  </p>
                </div>

                <div className="candidate-fit-preview-toolbar">
                  <label className="candidate-fit-preview-searchbar" aria-label="Search candidate preview rows">
                    <i className="fas fa-search"></i>
                    <input
                      type="text"
                      value={previewSearch}
                      onChange={(event) => setPreviewSearch(event.target.value)}
                      placeholder="Search a candidate"
                    />
                  </label>

                  <div className="candidate-fit-preview-toolbar-actions">
                    <label className="candidate-fit-inline-select">
                      <span>Filter by</span>
                      <select value={previewFilter} onChange={(event) => setPreviewFilter(event.target.value)}>
                        <option value="All">All candidates</option>
                        <option value="Strong Match">Strong Match</option>
                        <option value="Moderate Match">Moderate Match</option>
                        <option value="Needs Review">Needs Review</option>
                      </select>
                    </label>

                    <label className="candidate-fit-inline-select">
                      <span>Sort by</span>
                      <select value={previewSortBy} onChange={(event) => setPreviewSortBy(event.target.value)}>
                        <option value="fit-desc">Fit High-Low</option>
                        <option value="fit-asc">Fit Low-High</option>
                        <option value="experience-desc">Experience High-Low</option>
                        <option value="name-asc">Name A-Z</option>
                      </select>
                    </label>

                    <button
                      type="button"
                      className="candidate-fit-preview-download"
                      onClick={() => downloadCandidatePreviewRows(filteredPreviewRows, visibleCols)}
                      title="Download preview"
                      aria-label="Download preview"
                      disabled={!filteredPreviewRows.length}
                    >
                      <i className="fas fa-download"></i>
                    </button>
                  </div>
                </div>

                <div className="candidate-fit-table-shell">
                  <table className="candidate-fit-preview-table">
                    <thead>
                      <tr>
                        {visibleCols.map((col) => (
                          <th key={col}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPreviewRows.map((row, idx) => (
                        <tr key={`${row?.Name || 'candidate'}-${idx}`}>
                          {visibleCols.map((col) => {
                            const value = row[col];
                            const display = formatPreviewCell(value, col, row);
                            const isLongTextCol = ['Education', 'Skills', 'Previous_Companies', 'Certifications'].includes(col);

                            if (col === 'Fit_Percentage') {
                              return (
                                <td key={col}>
                                  <span className={`candidate-fit-table-pill ${getPreviewFitBucket(getPreviewFitValue(row)).toLowerCase().replace(/\s+/g, '-')}`}>
                                    {display}%
                                  </span>
                                </td>
                              );
                            }

                            return (
                              <td
                                key={col}
                                title={isLongTextCol && value ? String(value) : undefined}
                              >
                                {display}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="candidate-fit-preview-footer">
                  <div className="candidate-fit-preview-page-info">
                    {filteredPreviewRows.length === 0 ? '0 rows' : `1 - ${filteredPreviewRows.length} of ${filteredPreviewRows.length}`}
                  </div>
                </div>

                {previewData.total_rows > previewRows.length && (
                  <p className="candidate-fit-preview-note">Showing the first {previewRows.length} preview rows returned by the API out of {previewData.total_rows} total candidates.</p>
                )}
              </div>
            </div>
          );
        })()}

        {/* Batch Results */}
        {batchResult && (
          <div className="batch-results">
            <h3>Batch Processing Complete</h3>
            <div className="result-summary">
              <div className="result-stat">
                <i className="fas fa-users"></i>
                <div>
                  <span className="stat-label">Processed</span>
                  <span className="stat-value">{batchResult.total_candidates} Candidates</span>
                </div>
              </div>

              {batchResult.summary && (
                <>
                  <div className="result-stat">
                    <i className="fas fa-chart-line"></i>
                    <div>
                      <span className="stat-label">Average Fit</span>
                      <span className="stat-value">{batchResult.summary.average_fit}%</span>
                    </div>
                  </div>

                  <div className="result-stat">
                    <i className="fas fa-trophy"></i>
                    <div>
                      <span className="stat-label">Top Score</span>
                      <span className="stat-value">{batchResult.summary.max_fit}%</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {batchResult.summary?.top_candidates?.length > 0 && (
              <div className="top-candidates">
                <h4>🏆 Top 5 Candidates</h4>
                <div className="top-candidates-list">
                  {batchResult.summary.top_candidates.map((candidate, idx) => (
                    <div key={idx} className="top-candidate-item">
                      <span className="rank">#{idx + 1}</span>
                      <span className="name">{candidate.Name || `Candidate ${idx + 1}`}</span>
                      <span className="score" style={{ color: getScoreColor(candidate.Fit_Percentage) }}>
                        {candidate.Fit_Percentage}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const getScoreColor = (score) => {
  if (score >= 80) return semanticHex.success;
  if (score >= 60) return semanticHex.warning;
  return semanticHex.danger;
};

const formatPreviewCell = (value, column, row) => {
  if (value === null || value === undefined || value === '') return '—';

  // Show full numbers without truncation
  if (typeof value === 'number') {
    if (column === 'Fit_Percentage') {
      return value.toFixed(2);
    }
    return value;
  }

  let str = String(value);

  if (column === 'Education') {
    str = str.replace(/^Education\s*[:\-]?\s*/i, '');
  }

  const MAX_LEN = column === 'Skills' ? 1200 : 280;
  if (str.length > MAX_LEN) {
    return `${str.slice(0, MAX_LEN)}…`;
  }
  return str;
};

export default CandidateFitPredictor;