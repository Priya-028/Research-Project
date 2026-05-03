
import React, { useState, useContext, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { AuthContext } from './AuthContext';
import EmployeeProductivityFormModal from './common/EmployeeProductivityFormModal';
import FeaturePageHero from './common/FeaturePageHero';
import { chartHex, semanticHex } from './common/semanticPalette';


const resolveApiBaseUrl = (envValue, fallbackPort) => {
  if (envValue) {
    return envValue;
  }

  if (typeof window !== 'undefined' && window.location?.hostname) {
    const hostname = window.location.hostname;

    // Windows browsers often resolve `localhost` to IPv6 (::1). Flask dev server
    // typically binds IPv4 (0.0.0.0/127.0.0.1), so prefer IPv4 loopback.
    const normalizedHostname = hostname === 'localhost' ? '127.0.0.1' : hostname;
    const formattedHostname = normalizedHostname.includes(':')
      ? `[${normalizedHostname}]`
      : normalizedHostname;

    return `http://${formattedHostname}:${fallbackPort}`;
  }

  return `http://127.0.0.1:${fallbackPort}`;
};

const API_BASE_URL = resolveApiBaseUrl(process.env.REACT_APP_PRODUCTIVITY_API_URL, 5002);
const EMPLOYEE_API_BASE_URL = resolveApiBaseUrl(process.env.REACT_APP_EMPLOYEE_API_URL, 5000);
const API_HEALTH_RETRY_COUNT = 4;
const API_HEALTH_RETRY_DELAY_MS = 1000;
const PREVIEW_PAGE_SIZE = 10;
const EMPLOYEE_TABLE_COLUMNS = [
  'Employee_ID',
  'role_level',
  'position',
  'age',
  'experience_years',
  'avg_task_completion',
  'attendance_rate',
  'projects_handled',
  'overtime_hours',
  'training_hours',
  'FeedBack',
];
const EMPLOYEE_ACTIONS_COLUMN = 'Actions';

const DEFAULT_EXPORT_FILE_NAME = 'Newupload_employee.csv';
const DEFAULT_REPORT_FILE_NAME = 'employee_productivity_report.pdf';
const REPORT_BRAND_NAME = 'AI HCM';
const REPORT_BRAND_SUBTITLE = 'AI HCM System';
const REPORT_BRAND_TAGLINE = 'Human Capital Intelligence Platform';
const REPORT_LOGO_PATH = `${process.env.PUBLIC_URL || ''}/static/Assets/images/logo.png`;

const EmployeeProductivity = () => {
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [apiStatus, setApiStatus] = useState(null);
  const [isCheckingApi, setIsCheckingApi] = useState(false);

  // Single employee prediction state
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [singleLoading, setSingleLoading] = useState(false);
  const [employeeSaveMessage, setEmployeeSaveMessage] = useState('');
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState('');
  const [inputMode, setInputMode] = useState('bulk');

  // Batch processing state
  const [csvFile, setCsvFile] = useState(null);
  const [csvFileName, setCsvFileName] = useState('');
  const [batchResult, setBatchResult] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [resultRows, setResultRows] = useState([]);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewSearchTerm, setPreviewSearchTerm] = useState('');
  const [previewRiskFilter, setPreviewRiskFilter] = useState('All');
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesPage, setEmployeesPage] = useState(1);
  const [reportLoading, setReportLoading] = useState(false);

  const resetPredictionViews = () => {
    setPreviewData(null);
    setBatchResult(null);
    setAnalyticsData(null);
    setResultRows([]);
    setPreviewPage(1);
    setPreviewSearchTerm('');
    setPreviewRiskFilter('All');
  };

  useEffect(() => {
    checkApiHealth();
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchEmployees();
  }, [user]);

  const sleep = (duration) => new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });

  const checkApiHealth = async () => {
    setIsCheckingApi(true);

    try {
      let lastError = null;

      for (let attempt = 0; attempt <= API_HEALTH_RETRY_COUNT; attempt += 1) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/test`);

          if (response.ok) {
            const data = await response.json();
            const modelsLoaded = Boolean(data?.models_loaded ?? data?.model_loaded);
            setError('');
            setApiStatus({
              status: 'connected',
              message: `API connected. Model loaded: ${modelsLoaded ? 'Yes' : 'No'}`,
              details: data
            });
            return;
          }

          setApiStatus({
            status: 'error',
            message: `Productivity API returned HTTP ${response.status}`
          });
          return;
        } catch (attemptError) {
          lastError = attemptError;

          if (attempt < API_HEALTH_RETRY_COUNT) {
            await sleep(API_HEALTH_RETRY_DELAY_MS);
          }
        }
      }

      setApiStatus({
        status: 'error',
        message: lastError?.message
          ? 'Productivity API is not reachable yet. Open the Flask server on port 5002, then click Refresh.'
          : 'Productivity API is not reachable yet. Click Refresh to try again.'
      });
    } finally {
      setIsCheckingApi(false);
    }
  };

  const handleCsvFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        setError('Please upload a CSV file');
        return;
      }
      setCsvFile(file);
      setCsvFileName(file.name);
      setError('');
    }
  };

  const fetchEmployees = async () => {
    setEmployeesLoading(true);

    try {
      const response = await fetch(`${EMPLOYEE_API_BASE_URL}/api/employees`, {
        headers: {
          'Accept': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || `Fetch employees failed (HTTP ${response.status})`);
      }

      setEmployees(Array.isArray(data?.employees) ? data.employees : []);
      setEmployeesPage(1);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setEmployeesLoading(false);
    }
  };

  const getEmployeeFormValues = (employee) => ({
    Employee_ID: String(employee?.Employee_ID || employee?.employee_id || ''),
    role_level: String(employee?.role_level || ''),
    position: String(employee?.position || ''),
    age: employee?.age !== undefined && employee?.age !== null ? String(employee.age) : '',
    experience_years: employee?.experience_years !== undefined && employee?.experience_years !== null ? String(employee.experience_years) : '',
    avg_task_completion: employee?.avg_task_completion !== undefined && employee?.avg_task_completion !== null ? String(employee.avg_task_completion) : '',
    attendance_rate: employee?.attendance_rate !== undefined && employee?.attendance_rate !== null ? String(employee.attendance_rate) : '',
    projects_handled: employee?.projects_handled !== undefined && employee?.projects_handled !== null ? String(employee.projects_handled) : '',
    overtime_hours: employee?.overtime_hours !== undefined && employee?.overtime_hours !== null ? String(employee.overtime_hours) : '',
    training_hours: employee?.training_hours !== undefined && employee?.training_hours !== null ? String(employee.training_hours) : '',
    FeedBack: employee?.FeedBack !== undefined && employee?.FeedBack !== null ? String(employee.FeedBack) : '',
  });

  const escapeCsvValue = (value) => {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);
    if (!/[",\n\r]/.test(stringValue)) {
      return stringValue;
    }

    return `"${stringValue.replace(/"/g, '""')}"`;
  };

  const buildEmployeesCsvContent = (rows) => {
    const headers = EMPLOYEE_TABLE_COLUMNS.join(',');
    const csvRows = rows.map((employee) => (
      EMPLOYEE_TABLE_COLUMNS.map((column) => escapeCsvValue(employee[column] ?? '')).join(',')
    ));

    return [headers, ...csvRows].join('\r\n');
  };

  const runBatchPredictionRequest = async (formData) => {
    const response = await fetch(`${API_BASE_URL}/api/predict/batch`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Batch prediction failed');
    }

    setBatchResult(data);

    if (data.download_url) {
      try {
        const resultCsvResponse = await fetch(`${API_BASE_URL}${data.download_url}`);

        if (!resultCsvResponse.ok) {
          throw new Error('Unable to load result details for analytics cards');
        }

        const resultCsvText = await resultCsvResponse.text();
        const parsedResultRows = parseCsvText(resultCsvText);
        setResultRows(parsedResultRows);
        setAnalyticsData(buildAnalyticsFromRows(parsedResultRows));
      } catch (analyticsError) {
        console.error(analyticsError);
      }
    }
  };

  const handleExportEmployeesCsv = () => {
    if (employees.length === 0) {
      setError('No employees found in the database to export.');
      return;
    }

    const csvContent = buildEmployeesCsvContent(employees);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const exportFileName = csvFileName || DEFAULT_EXPORT_FILE_NAME;

    link.href = downloadUrl;
    link.setAttribute('download', exportFileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  };

  const handlePredictFromDatabase = async () => {
    setLoading(true);
    setError('');
    setEmployeeSaveMessage('');
    setBatchResult(null);
    setAnalyticsData(null);
    setResultRows([]);
    setPreviewPage(1);

    try {
      if (employees.length === 0) {
        throw new Error('No employees found in the database to predict.');
      }

      const exportFileName = csvFileName || DEFAULT_EXPORT_FILE_NAME;
      const csvContent = buildEmployeesCsvContent(employees);
      const csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const csvUploadFile = new File([csvBlob], exportFileName, { type: 'text/csv' });
      const formData = new FormData();

      formData.append('csv_file', csvUploadFile);
      setCsvFileName(exportFileName);
      await runBatchPredictionRequest(formData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchPredict = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setEmployeeSaveMessage('');
    setBatchResult(null);
    setAnalyticsData(null);
    setResultRows([]);
    setPreviewPage(1);

    try {
      if (!csvFile) {
        throw new Error('Please upload a CSV file');
      }

      const formData = new FormData();
      formData.append('csv_file', csvFile);
      await runBatchPredictionRequest(formData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    setLoading(true);
    setError('');
    setEmployeeSaveMessage('');
    setPreviewData(null);
    setPreviewPage(1);
    setPreviewRiskFilter('All');

    try {
      let sourceRows = [];

      if (inputMode === 'manual') {
        if (employees.length === 0) {
          throw new Error('No employees found in the database to preview.');
        }
        sourceRows = [...employees];
      } else {
        if (!csvFile) {
          throw new Error('Please upload a CSV file');
        }

        const csvText = await csvFile.text();
        sourceRows = parseCsvText(csvText);
      }

      setPreviewData({
        success: true,
        preview: sourceRows,
        columns: sourceRows[0] ? Object.keys(sourceRows[0]) : [],
        total_rows: sourceRows.length,
      });
    } catch (err) {
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

  const downloadResultsExcel = () => {
    if (batchResult?.download_excel_url) {
      window.open(`${API_BASE_URL}${batchResult.download_excel_url}`, '_blank');
    }
  };

  const buildReportFileName = () => {
    const baseName = (csvFileName || DEFAULT_EXPORT_FILE_NAME).replace(/\.csv$/i, '');
    const safeBaseName = baseName.replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '');
    return `${safeBaseName || 'employee_productivity'}_report.pdf`;
  };

  const triggerFileDownload = (blob, fileName) => {
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => {
      window.URL.revokeObjectURL(downloadUrl);
    }, 30000);
  };

  const openPdfPreview = (blob) => {
    const previewUrl = window.URL.createObjectURL(blob);
    const previewWindow = window.open(previewUrl, '_blank', 'noopener,noreferrer');

    window.setTimeout(() => {
      window.URL.revokeObjectURL(previewUrl);
    }, 60000);

    return Boolean(previewWindow);
  };

  const loadImageDataUrl = (imagePath) => new Promise((resolve, reject) => {
    const image = new Image();

    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error('Canvas context unavailable');
        }

        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        context.drawImage(image, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (canvasError) {
        reject(canvasError);
      }
    };
    image.onerror = () => reject(new Error(`Unable to load image asset: ${imagePath}`));
    image.src = imagePath;
  });

  const handleExportReport = async () => {
    if (!batchResult) {
      setError('Run a prediction before exporting the report.');
      return;
    }
    setReportLoading(true);
    setError('');

    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;
      const contentWidth = pageWidth - (margin * 2);
      let reportLogoDataUrl = null;
      const generatedAt = new Date().toLocaleString();
      const summary = batchResult?.summary || {};
      const averageProductivity = Number(summary?.average_feedback_percentage ?? summary?.average_productivity_percentage ?? summary?.average_productivity ?? 0).toFixed(1);
      const maxProductivity = Number(summary?.max_feedback_percentage ?? summary?.max_productivity_percentage ?? summary?.max_productivity ?? 0).toFixed(1);
      const minProductivity = Number(summary?.min_feedback_percentage ?? summary?.min_productivity_percentage ?? summary?.min_productivity ?? 0).toFixed(1);
      const averageAttendance = Number(analyticsData?.averageAttendanceRate || 0).toFixed(2);
      const classDistribution = summary?.productivity_class_distribution || summary?.class_distribution || {};
      const riskDistribution = summary?.risk_distribution || {};
      const reportHighRiskEmployees = Number(riskDistribution?.High ?? riskDistribution?.['High Risk - Immediate Attention Required'] ?? 0);
      const reportTopPerformers = Array.isArray(batchResult?.top_performers) ? batchResult.top_performers : [];
      const reportPredictionGraphs = Array.isArray(predictionGraphCards) ? predictionGraphCards : [];
      const reportOutputSummaries = Array.isArray(outputSummaryRows) ? outputSummaryRows : [];
      const pdfTheme = {
        primary: [77, 47, 178],
        primaryDeep: [55, 32, 128],
        secondary: [110, 80, 219],
        tertiary: [159, 140, 243],
        quaternary: [194, 179, 251],
        surface: [251, 249, 255],
        surfaceAlt: [245, 239, 255],
        border: [219, 209, 248],
        grid: [234, 227, 252],
        text: [47, 36, 84],
        textSoft: [116, 103, 159],
        white: [255, 255, 255],
      };
      const pdfAttendancePalette = {
        'Rating 1': pdfTheme.quaternary,
        'Rating 2': [177, 159, 247],
        'Rating 3': pdfTheme.tertiary,
        'Rating 4': pdfTheme.secondary,
        'Rating 5': pdfTheme.primary,
      };
      let cursorY = margin;

      try {
        reportLogoDataUrl = await loadImageDataUrl(REPORT_LOGO_PATH);
      } catch (logoError) {
        console.error(logoError);
      }

      const ensurePageSpace = (heightNeeded = 60) => {
        if (cursorY + heightNeeded <= pageHeight - margin) {
          return;
        }

        doc.addPage();
        cursorY = margin;
      };

      const addSectionTitle = (title, subtitle) => {
        ensurePageSpace(70);
        doc.setFillColor(...pdfTheme.surfaceAlt);
        doc.roundedRect(margin, cursorY - 4, contentWidth, 52, 14, 14, 'F');
        doc.setFillColor(...pdfTheme.primary);
        doc.roundedRect(margin + 14, cursorY + 10, 6, 22, 3, 3, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(...pdfTheme.text);
        doc.text(title, margin + 32, cursorY + 12);
        cursorY += 18;

        if (subtitle) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(...pdfTheme.textSoft);
          const wrappedSubtitle = doc.splitTextToSize(subtitle, contentWidth - 48);
          doc.text(wrappedSubtitle, margin + 32, cursorY + 6);
          cursorY += wrappedSubtitle.length * 12;
        }

        cursorY += 18;
      };

      const drawSimpleTable = (title, subtitle, columns, rows, options = {}) => {
        addSectionTitle(title, subtitle);

        if (!rows.length) {
          ensurePageSpace(30);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(...pdfTheme.textSoft);
          doc.text('No data available.', margin, cursorY);
          cursorY += 24;
          return;
        }

        const columnWeights = options.columnWeights || columns.map(() => 1);
        const totalWeight = columnWeights.reduce((sum, weight) => sum + weight, 0);
        const columnWidths = columnWeights.map((weight) => (contentWidth * weight) / totalWeight);
        const fontSize = options.fontSize || 8;
        const lineHeight = options.lineHeight || 10;
        const cellPaddingX = 6;
        const cellPaddingY = 6;

        const drawHeader = () => {
          ensurePageSpace(30);
          let currentX = margin;
          doc.setFillColor(...(options.headerFillColor || pdfTheme.primary));
          doc.roundedRect(margin, cursorY, contentWidth, 26, 10, 10, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(...pdfTheme.white);
          columns.forEach((column, index) => {
            doc.text(String(column), currentX + cellPaddingX, cursorY + 16);
            currentX += columnWidths[index];
          });
          cursorY += 28;
        };

        drawHeader();

        rows.forEach((row, rowIndex) => {
          const cellLines = row.map((cell, index) => doc.splitTextToSize(String(cell ?? ''), columnWidths[index] - (cellPaddingX * 2)));
          const rowHeight = Math.max(...cellLines.map((lines) => lines.length * lineHeight), lineHeight) + (cellPaddingY * 2);

          if (cursorY + rowHeight > pageHeight - margin) {
            doc.addPage();
            cursorY = margin;
            drawHeader();
          }

          let currentX = margin;
          if (rowIndex % 2 === 0) {
            doc.setFillColor(...pdfTheme.surfaceAlt);
            doc.roundedRect(margin, cursorY, contentWidth, rowHeight, 8, 8, 'F');
          }

          doc.setDrawColor(...pdfTheme.border);
          doc.roundedRect(margin, cursorY, contentWidth, rowHeight, 8, 8);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(fontSize);
          doc.setTextColor(...pdfTheme.text);

          cellLines.forEach((lines, index) => {
            doc.text(lines, currentX + cellPaddingX, cursorY + cellPaddingY + 8);
            if (index < cellLines.length - 1) {
              doc.setDrawColor(...pdfTheme.grid);
              doc.line(currentX + columnWidths[index], cursorY, currentX + columnWidths[index], cursorY + rowHeight);
            }
            currentX += columnWidths[index];
          });

          cursorY += rowHeight;
        });

        cursorY += 18;
      };
      const drawSummaryCard = (x, y, width, height, label, value, note) => {
        doc.setFillColor(...pdfTheme.surface);
        doc.setDrawColor(...pdfTheme.border);
        doc.roundedRect(x, y, width, height, 12, 12, 'FD');
        doc.setFillColor(...pdfTheme.primary);
        doc.roundedRect(x, y, width, 8, 12, 12, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...pdfTheme.textSoft);
        doc.text(String(label).toUpperCase(), x + 14, y + 24);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(...pdfTheme.primary);
        doc.text(String(value), x + 14, y + 50);

        if (note) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(...pdfTheme.textSoft);
          const wrappedNote = doc.splitTextToSize(note, width - 28);
          doc.text(wrappedNote, x + 14, y + 66);
        }
      };

      const drawBarRows = (title, subtitle, rows, options = {}) => {
        const blockHeight = Math.max(120, 72 + (rows.length * 22));
        ensurePageSpace(blockHeight);

        doc.setFillColor(...pdfTheme.surface);
        doc.setDrawColor(...pdfTheme.border);
        doc.roundedRect(margin, cursorY, contentWidth, blockHeight, 14, 14, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(...pdfTheme.text);
        doc.text(title, margin + 16, cursorY + 22);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...pdfTheme.textSoft);
        doc.text(subtitle, margin + 16, cursorY + 38);

        let rowY = cursorY + 60;
        rows.forEach((row) => {
          const labelWidth = 140;
          const valueWidth = 90;
          const trackX = margin + 16 + labelWidth;
          const trackWidth = contentWidth - labelWidth - valueWidth - 48;
          const safePercent = Math.max(0, Math.min(100, Number(row.percent) || 0));

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(...pdfTheme.text);
          doc.text(String(row.label), margin + 16, rowY + 8);

          doc.setFillColor(...pdfTheme.grid);
          doc.roundedRect(trackX, rowY, trackWidth, 10, 5, 5, 'F');
          doc.setFillColor(...row.color);
          doc.roundedRect(trackX, rowY, Math.max((trackWidth * safePercent) / 100, safePercent > 0 ? 8 : 0), 10, 5, 5, 'F');

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...pdfTheme.textSoft);
          doc.text(String(row.value), trackX + trackWidth + 10, rowY + 8);
          rowY += 22;
        });

        cursorY += blockHeight + 18;
      };

      const drawImagePanel = (title, subtitle, imageDataUrl) => {
        const panelPadding = 14;
        const imageFrameHeight = 220;
        const panelHeight = panelPadding + 40 + imageFrameHeight + panelPadding;

        ensurePageSpace(panelHeight + 14);
        doc.setFillColor(...pdfTheme.surface);
        doc.setDrawColor(...pdfTheme.border);
        doc.roundedRect(margin, cursorY, contentWidth, panelHeight, 14, 14, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...pdfTheme.text);
        doc.text(String(title || 'Prediction Graph'), margin + panelPadding, cursorY + 22);

        if (subtitle) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(...pdfTheme.textSoft);
          doc.text(doc.splitTextToSize(String(subtitle), contentWidth - (panelPadding * 2)), margin + panelPadding, cursorY + 36);
        }

        const frameX = margin + panelPadding;
        const frameY = cursorY + panelPadding + 40;
        const frameWidth = contentWidth - (panelPadding * 2);

        doc.setFillColor(...pdfTheme.white);
        doc.setDrawColor(...pdfTheme.grid);
        doc.roundedRect(frameX, frameY, frameWidth, imageFrameHeight, 10, 10, 'FD');

        if (imageDataUrl) {
          try {
            const imageProps = doc.getImageProperties(imageDataUrl);
            const imageRatio = imageProps.width / imageProps.height;
            let drawWidth = frameWidth - 12;
            let drawHeight = drawWidth / imageRatio;

            if (drawHeight > imageFrameHeight - 12) {
              drawHeight = imageFrameHeight - 12;
              drawWidth = drawHeight * imageRatio;
            }

            const imageX = frameX + ((frameWidth - drawWidth) / 2);
            const imageY = frameY + ((imageFrameHeight - drawHeight) / 2);
            doc.addImage(imageDataUrl, 'PNG', imageX, imageY, drawWidth, drawHeight);
          } catch (graphEmbedError) {
            console.error(graphEmbedError);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(...pdfTheme.textSoft);
            doc.text('Graph image could not be embedded in this report.', frameX + 12, frameY + 22);
          }
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(...pdfTheme.textSoft);
          doc.text('Graph image not available.', frameX + 12, frameY + 22);
        }

        cursorY += panelHeight + 18;
      };

      doc.setFillColor(...pdfTheme.primaryDeep);
      doc.roundedRect(margin, cursorY, contentWidth, 112, 18, 18, 'F');
      doc.setFillColor(...pdfTheme.tertiary);
      doc.circle(pageWidth - 90, cursorY + 34, 28, 'F');
      doc.setFillColor(...pdfTheme.white);
      doc.roundedRect(margin + 18, cursorY + 18, 68, 68, 16, 16, 'F');
      doc.setFillColor(...pdfTheme.secondary);
      doc.circle(pageWidth - 62, cursorY + 82, 16, 'F');

      let logoEmbedded = false;

      if (reportLogoDataUrl) {
        try {
          doc.addImage(reportLogoDataUrl, 'PNG', margin + 26, cursorY + 26, 52, 52);
          logoEmbedded = true;
        } catch (imageEmbedError) {
          console.error(imageEmbedError);
        }
      }

      if (!logoEmbedded) {
        doc.setFillColor(...pdfTheme.primary);
        doc.circle(margin + 52, cursorY + 52, 20, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(...pdfTheme.white);
        doc.text('AI', margin + 40, cursorY + 58);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...pdfTheme.quaternary);
      doc.text(REPORT_BRAND_SUBTITLE, margin + 104, cursorY + 24);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(...pdfTheme.white);
      doc.text(`${REPORT_BRAND_NAME}  |  Productivity Report`, margin + 104, cursorY + 48);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...pdfTheme.surfaceAlt);
      doc.text(REPORT_BRAND_TAGLINE, margin + 104, cursorY + 64);
      doc.text(`Generated: ${generatedAt}`, margin + 104, cursorY + 82);
      doc.text(`Dataset: ${csvFileName || DEFAULT_EXPORT_FILE_NAME}`, margin + 104, cursorY + 96);
      doc.text(`Total result rows: ${batchResult.total_employees || 0}`, pageWidth - 188, cursorY + 96);
      cursorY += 134;

      addSectionTitle('Executive Summary', 'Overview of the processed employee productivity results and key performance indicators.');
      ensurePageSpace(180);
      const cardGap = 12;
      const cardWidth = (contentWidth - cardGap) / 2;
      const cardHeight = 76;
      drawSummaryCard(margin, cursorY, cardWidth, cardHeight, 'Total Employees', batchResult.total_employees, 'Employees processed in this prediction batch');
      drawSummaryCard(margin + cardWidth + cardGap, cursorY, cardWidth, cardHeight, 'Average Productivity', `${averageProductivity}%`, 'Mean Productivity_Score across all rows');
      drawSummaryCard(margin, cursorY + cardHeight + 12, cardWidth, cardHeight, 'Max Productivity', `${maxProductivity}%`, 'Highest predicted productivity percentage in this batch');
      drawSummaryCard(margin + cardWidth + cardGap, cursorY + cardHeight + 12, cardWidth, cardHeight, 'Min Productivity', `${minProductivity}%`, 'Lowest predicted productivity percentage in this batch');
      drawSummaryCard(margin, cursorY + (cardHeight * 2) + 24, cardWidth, cardHeight, 'High Risk Employees', String(reportHighRiskEmployees), 'Employees categorized as high risk in this batch');
      drawSummaryCard(margin + cardWidth + cardGap, cursorY + (cardHeight * 2) + 24, cardWidth, cardHeight, 'Average Attendance Rate', averageAttendance, 'Computed from valid attendance_rate values');
      cursorY += (cardHeight * 3) + 40;

      addSectionTitle('Visual Analytics', 'Chart summaries derived from the current result set.');
      if (positionChartData.length > 0) {
        drawBarRows(
          'Employees By Position',
          topPositionShare ? `${positionChartData[0].position} has the largest share at ${topPositionShare}% of employees.` : 'Distribution across the current result set.',
          positionChartData.map((item) => ({
            label: item.position,
            percent: positionChartPeak ? (item.count / positionChartPeak) * 100 : 0,
            value: `${item.count} employees`,
            color: pdfTheme.primary,
          }))
        );
      }

      if (attendanceSegments.some((segment) => segment.count > 0)) {
        drawBarRows(
          'Attendance Overview',
          'Attendance rating distribution on a 1 to 5 scale based on attendance_rate values.',
          attendanceSegments.map((segment) => ({
            label: segment.key,
            percent: attendanceTotal ? (segment.count / attendanceTotal) * 100 : 0,
            value: `${segment.count} employees`,
            color: pdfAttendancePalette[segment.key] || pdfTheme.primary,
          }))
        );
      }

      drawSimpleTable(
        'Class Distribution',
        'Predicted productivity class breakdown from the model output.',
        ['Class', 'Employees', 'Share'],
        Object.entries(classDistribution).map(([className, classCount]) => {
          const count = Number(classCount || 0);
          const percent = batchResult.total_employees > 0
            ? `${((count / batchResult.total_employees) * 100).toFixed(1)}%`
            : '0.0%';
          const normalizedClassName = /^\d+$/.test(String(className)) ? `C${className}` : String(className || 'Unknown');
          return [normalizedClassName, String(count), percent];
        }),
        { columnWeights: [0.9, 1, 1.1], headerFillColor: pdfTheme.primary }
      );

      drawSimpleTable(
        'Risk Distribution',
        'Risk categories across the current prediction output.',
        ['Risk Level', 'Employees', 'Share'],
        Object.entries(riskDistribution).map(([risk, count]) => {
          const safeCount = Number(count || 0);
          const percent = batchResult.total_employees > 0
            ? `${((safeCount / batchResult.total_employees) * 100).toFixed(1)}%`
            : '0.0%';
          return [risk, String(safeCount), percent];
        }),
        { columnWeights: [1.4, 0.8, 0.8], headerFillColor: pdfTheme.secondary }
      );

      if (reportTopPerformers.length > 0) {
        drawSimpleTable(
          'Top Performers',
          `Top ${Math.min(reportTopPerformers.length, 10)} employees ranked by predicted productivity.`,
          ['Employee ID', 'Position', 'Role', 'Productivity', 'Risk'],
          reportTopPerformers.slice(0, 10).map((performer, index) => {
            const productivityValue = Number(
              performer?.Predicted_Productivity_Percentage
              ?? performer?.Predicted_Feedback_Percentage
              ?? performer?.predicted_feedback_percentage
              ?? 0
            );
            const riskLevel = String(
              performer?.Predicted_Productivity_Risk
              ?? performer?.Risk_Level
              ?? performer?.risk_level
              ?? 'N/A'
            ).split(' - ')[0].trim();

            return [
              String(performer?.Employee_ID || performer?.employee_id || `EMP-${index + 1}`),
              String(performer?.position || 'N/A'),
              String(performer?.role_level || 'N/A'),
              Number.isFinite(productivityValue) ? `${productivityValue.toFixed(1)}%` : 'N/A',
              riskLevel || 'N/A',
            ];
          }),
          { columnWeights: [1, 1.1, 1.1, 0.9, 0.9], headerFillColor: pdfTheme.primaryDeep }
        );
      }

      if (reportPredictionGraphs.length > 0) {
        addSectionTitle('Employee Output Comparison Graphs', 'Model-generated charts from the current prediction run.');

        for (const graphCard of reportPredictionGraphs) {
          let graphDataUrl = null;

          try {
            graphDataUrl = await loadImageDataUrl(`${API_BASE_URL}${graphCard.url}`);
          } catch (graphLoadError) {
            console.error(graphLoadError);
          }

          drawImagePanel(graphCard.title, graphCard.description, graphDataUrl);
        }
      }

      if (reportOutputSummaries.length > 0) {
        drawSimpleTable(
          'Employee Output Summary',
          `Narrative summary for ${Math.min(reportOutputSummaries.length, 15)} employees in the current batch.`,
          ['Employee', 'Productivity', 'Class', 'Risk', 'Output Summary'],
          reportOutputSummaries.slice(0, 15).map((item) => [
            String(item.employeeId || 'N/A'),
            item.productivityPercentage !== null ? `${item.productivityPercentage}%` : 'N/A',
            String(item.productivityClass || 'N/A'),
            String(item.riskLevel || 'N/A').split(' - ')[0].trim() || 'N/A',
            String(item.outputSummary || item.recommendations || 'N/A'),
          ]),
          {
            columnWeights: [0.9, 0.8, 0.8, 0.9, 2.6],
            headerFillColor: pdfTheme.secondary,
            fontSize: 7.8,
            lineHeight: 9.6,
          }
        );
      }

      const pageCount = doc.getNumberOfPages();
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        doc.setPage(pageNumber);
        doc.setDrawColor(...pdfTheme.border);
        doc.line(margin, pageHeight - 28, pageWidth - margin, pageHeight - 28);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...pdfTheme.textSoft);
        doc.text(
          `Employee Performance & Productivity Predictor  |  Page ${pageNumber} of ${pageCount}`,
          margin,
          pageHeight - 18
        );
      }

      const pdfBlob = doc.output('blob');
      openPdfPreview(pdfBlob);
      triggerFileDownload(pdfBlob, buildReportFileName() || DEFAULT_REPORT_FILE_NAME);
    } catch (reportError) {
      console.error(reportError);
      setError('Unable to export the PDF report.');
    } finally {
      setReportLoading(false);
    }
  };

  const handleAddEmployee = async (employeePayload) => {
    setSingleLoading(true);
    setError('');
    setEmployeeSaveMessage('');

    try {
      const response = await fetch(`${EMPLOYEE_API_BASE_URL}/api/employees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(employeePayload),
      });

      const data = await response.json();

      if (!response.ok) {
        const validationMessage = data?.errors
          ? Object.values(data.errors).join(' ')
          : '';
        throw new Error(validationMessage || data?.message || `Add employee failed (HTTP ${response.status})`);
      }

      setEmployeeSaveMessage(data?.message || 'Employee added successfully');
      setShowAddEmployee(false);
      fetchEmployees();
    } catch (err) {
      setError(err.message);
    } finally {
      setSingleLoading(false);
    }
  };

  const handleEditEmployee = async (employeePayload) => {
    if (!editingEmployee?.Employee_ID) {
      setError('Employee details are unavailable for editing.');
      return;
    }

    setSingleLoading(true);
    setError('');
    setEmployeeSaveMessage('');

    try {
      const response = await fetch(`${EMPLOYEE_API_BASE_URL}/api/employees/${encodeURIComponent(editingEmployee.Employee_ID)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(employeePayload),
      });

      const data = await response.json();

      if (!response.ok) {
        const validationMessage = data?.errors
          ? Object.values(data.errors).join(' ')
          : '';
        throw new Error(validationMessage || data?.message || `Update employee failed (HTTP ${response.status})`);
      }

      setEmployeeSaveMessage(data?.message || 'Employee updated successfully');
      setEditingEmployee(null);
      setShowAddEmployee(false);
      fetchEmployees();
    } catch (err) {
      setError(err.message);
    } finally {
      setSingleLoading(false);
    }
  };

  const handleDeleteEmployee = async (employeeId) => {
    if (!employeeId) {
      setError('Employee ID is required to delete a record.');
      return;
    }

    const confirmed = window.confirm(`Delete employee ${employeeId}?`);
    if (!confirmed) {
      return;
    }

    setDeletingEmployeeId(employeeId);
    setError('');
    setEmployeeSaveMessage('');

    try {
      const response = await fetch(`${EMPLOYEE_API_BASE_URL}/api/employees/${encodeURIComponent(employeeId)}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || `Delete employee failed (HTTP ${response.status})`);
      }

      setEmployeeSaveMessage(data?.message || 'Employee deleted successfully');
      fetchEmployees();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingEmployeeId('');
    }
  };

  const getRiskColor = (riskLevel) => {
    const normalizedRiskLevel = String(riskLevel || '').trim().toLowerCase();

    if (normalizedRiskLevel.includes('excellent')) return semanticHex.success;
    if (normalizedRiskLevel.includes('good')) return '#0f9f77';
    if (normalizedRiskLevel.includes('average') || normalizedRiskLevel.includes('moderate') || normalizedRiskLevel.includes('medium')) return semanticHex.warning;
    if (normalizedRiskLevel.includes('high') || normalizedRiskLevel.includes('risk')) return semanticHex.danger;
    if (normalizedRiskLevel.includes('low')) return semanticHex.success;
    return '#6c757d';
  };

  const getRiskBadgeStyle = (riskLevel) => {
    const riskColor = getRiskColor(riskLevel);

    return {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '6px 10px',
      borderRadius: '999px',
      fontWeight: 700,
      fontSize: '0.82rem',
      lineHeight: 1,
      background: `${riskColor}20`,
      color: riskColor,
      border: `1px solid ${riskColor}35`,
      whiteSpace: 'nowrap'
    };
  };

  const parseCsvLine = (line) => {
    const values = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      const nextCharacter = line[index + 1];

      if (character === '"') {
        if (insideQuotes && nextCharacter === '"') {
          currentValue += '"';
          index += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (character === ',' && !insideQuotes) {
        values.push(currentValue);
        currentValue = '';
      } else {
        currentValue += character;
      }
    }

    values.push(currentValue);
    return values;
  };

  const parseCsvText = (csvText) => {
    const lines = csvText
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
      return [];
    }

    const headers = parseCsvLine(lines[0]).map((header) => header.trim());

    return lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      return headers.reduce((row, header, index) => {
        row[header] = values[index] ?? '';
        return row;
      }, {});
    });
  };

  const buildAnalyticsFromRows = (rows) => {
    const positionDistribution = rows.reduce((distribution, row) => {
      const rawPosition = typeof row.position === 'string' ? row.position.trim() : '';
      const position = rawPosition || 'Unknown';
      distribution[position] = (distribution[position] || 0) + 1;
      return distribution;
    }, {});

    const attendanceOverview = {
      'Rating 1': 0,
      'Rating 2': 0,
      'Rating 3': 0,
      'Rating 4': 0,
      'Rating 5': 0,
    };

    const attendanceValues = rows
      .map((row) => Number.parseFloat(row.attendance_rate))
      .filter((value) => Number.isFinite(value));

    attendanceValues.forEach((value) => {
      const normalizedRating = Math.min(5, Math.max(1, Math.round(value)));
      attendanceOverview[`Rating ${normalizedRating}`] += 1;
    });

    const averageAttendanceRate = attendanceValues.length
      ? attendanceValues.reduce((sum, value) => sum + value, 0) / attendanceValues.length
      : 0;

    return {
      positionDistribution,
      attendanceOverview,
      averageAttendanceRate,
    };
  };

  const getPositionChartData = (positionDistribution = {}) => {
    return Object.entries(positionDistribution)
      .map(([position, count]) => ({
        position: String(position || 'Unknown').trim() || 'Unknown',
        count: Number(count) || 0,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  };

  const positionChartData = getPositionChartData(
    analyticsData?.positionDistribution || batchResult?.summary?.position_distribution
  );
  const positionChartPeak = positionChartData[0]?.count || 0;
  const summaryData = batchResult?.summary || {};
  const riskDistribution = summaryData.risk_distribution || {};
  const productivityClassDistribution = summaryData.productivity_class_distribution || summaryData.class_distribution || {};
  const classDistributionEntries = Object.entries(productivityClassDistribution)
    .map(([className, classCount]) => ({
      className: String(className || 'Unknown'),
      count: Number(classCount) || 0,
    }))
    .filter((item) => item.count > 0);
  const classDistributionTotal = classDistributionEntries.reduce((sum, item) => sum + item.count, 0);
  const predictionGraphCards = [
    {
      key: 'employee_productivity_comparison',
      title: 'Employee Productivity Comparison',
      description: 'X-axis: Employee_ID | Y-axis: Predicted_Productivity_Percentage',
    },
    {
      key: 'top_10_productivity',
      title: 'Top 10 Employees by Predicted Productivity',
      description: 'Top ten employees ranked by predicted productivity percentage.',
    },
    {
      key: 'productivity_risk_distribution',
      title: 'Employee Productivity Risk Distribution',
      description: 'Distribution of Low, Medium, and High risk employee counts.',
    },
  ]
    .map((item) => ({
      ...item,
      url: batchResult?.graph_urls?.[item.key] || null,
    }))
    .filter((item) => Boolean(item.url));
  const normalizeSummarySentence = (text) => String(text || '').replace(
    /Employee feedback score is predicted to be/gi,
    'Employee productivity percentage is predicted to be'
  );
  const normalizeOutputSummaryRows = (rows = []) => rows
    .map((row, index) => {
      const productivityValue = Number(
        row?.Predicted_Feedback_Percentage
        ?? row?.predicted_feedback_percentage
        ?? row?.Predicted_Productivity_Percentage
      );

      return {
        employeeId: String(row?.Employee_ID || row?.employee_id || `EMP-${index + 1}`).trim(),
        position: String(row?.position || '').trim(),
        roleLevel: String(row?.role_level || '').trim(),
        productivityPercentage: Number.isFinite(productivityValue) ? productivityValue.toFixed(1) : null,
        productivityClass: String(row?.Productivity_Class || row?.Predicted_Class || '').trim(),
        riskLevel: String(row?.Predicted_Productivity_Risk || row?.Risk_Level || row?.risk_level || '').trim(),
        recommendations: String(row?.Recommendations || '').trim(),
        outputSummary: normalizeSummarySentence(String(row?.Output_Summary || '').trim()),
      };
    })
    .filter((item) => (item.outputSummary?.length || 0) > 0 || item.productivityPercentage !== null)
    .sort((left, right) => Number(right.productivityPercentage || 0) - Number(left.productivityPercentage || 0));

  const outputSummaryRowsFromApi = normalizeOutputSummaryRows(batchResult?.output_summaries || []);
  const outputSummaryRowsFromCsv = normalizeOutputSummaryRows(resultRows);
  const outputSummaryRows = (outputSummaryRowsFromApi.length > 0 ? outputSummaryRowsFromApi : outputSummaryRowsFromCsv).slice(0, 20);
  const summaryAverageProductivity = Number(summaryData.average_feedback_percentage ?? summaryData.average_productivity_percentage ?? summaryData.average_productivity);
  const summaryMaxProductivity = Number(summaryData.max_feedback_percentage ?? summaryData.max_productivity_percentage ?? summaryData.max_productivity);
  const summaryMinProductivity = Number(summaryData.min_feedback_percentage ?? summaryData.min_productivity_percentage ?? summaryData.min_productivity);
  const averageProductivityDisplay = Number.isFinite(summaryAverageProductivity)
    ? summaryAverageProductivity.toFixed(1)
    : '0.0';
  const maxProductivityDisplay = Number.isFinite(summaryMaxProductivity)
    ? summaryMaxProductivity.toFixed(1)
    : '0.0';
  const minProductivityDisplay = Number.isFinite(summaryMinProductivity)
    ? summaryMinProductivity.toFixed(1)
    : '0.0';
  const topPositionShare = batchResult?.total_employees && positionChartPeak
    ? ((positionChartPeak / batchResult.total_employees) * 100).toFixed(1)
    : null;
  const highRiskEmployeeCount = Number(riskDistribution.High ?? riskDistribution['High Risk - Immediate Attention Required']) || 0;

  const attendanceOverview = analyticsData?.attendanceOverview || batchResult?.summary?.attendance_overview || {};
  const performancePalette = {
    light: '#b7a8ff',
    soft: '#9f8df7',
    medium: '#7f68e6',
    deep: '#6248cb',
    darkest: '#4a2ea9',
  };
  const attendanceConfig = [
    { key: 'Rating 1', color: performancePalette.light },
    { key: 'Rating 2', color: performancePalette.soft },
    { key: 'Rating 3', color: performancePalette.medium },
    { key: 'Rating 4', color: performancePalette.deep },
    { key: 'Rating 5', color: performancePalette.darkest },
  ];
  const attendanceSegments = attendanceConfig.map((item) => ({
    ...item,
    count: Number(attendanceOverview[item.key]) || 0,
  }));
  const attendanceTotal = attendanceSegments.reduce((sum, item) => sum + item.count, 0);
  const getPreviewEmployeeId = (row) => String(row.employee_id || row.Employee_ID || '').trim();
  const getPreviewRiskLevel = (row) => String(row.Predicted_Productivity_Risk || row.Risk_Level || row.risk_level || 'Unknown').trim();

  const getSimplifiedRiskLevel = (fullRiskLevel) => {
    return String(fullRiskLevel || '').split(' - ')[0].trim() || 'Unknown';
  };
  const getPreviewProductivityValue = (row) => {
    const baseScore = Number(row.Productivity_Score);
    return Number.isFinite(baseScore) ? baseScore : 0;
  };
  const getPreviewRiskRank = (riskLevel) => {
    const normalized = String(riskLevel || '').toLowerCase();

    if (normalized.includes('high')) return 3;
    if (normalized.includes('moderate') || normalized.includes('medium')) return 2;
    if (normalized.includes('low')) return 1;
    return 0;
  };
  // Preview table behavior:
  // 1) Before prediction: show uploaded input rows.
  // 2) After prediction: show model output rows in the same preview table.
  const hasPredictedPreview = resultRows.length > 0;
  const previewSourceRows = hasPredictedPreview ? resultRows : (previewData?.preview || []);
  const previewSourceColumns = hasPredictedPreview
    ? (previewSourceRows[0] ? Object.keys(previewSourceRows[0]) : [])
    : (previewData?.columns || (previewSourceRows[0] ? Object.keys(previewSourceRows[0]) : []));
  const previewTotalRows = previewSourceRows.length;
  const previewHasRiskData = previewSourceColumns.some(
    (column) => column === 'Predicted_Productivity_Risk' || column === 'Risk_Level' || column === 'risk_level'
  );
  const previewRiskOptions = previewHasRiskData
    ? ['All', ...new Set(previewSourceRows.map((row) => getSimplifiedRiskLevel(getPreviewRiskLevel(row))).filter(Boolean))]
    : ['All'];
  const filteredPreviewRows = [...previewSourceRows]
    .filter((row) => {
      const searchNeedle = previewSearchTerm.trim().toLowerCase();
      if (!searchNeedle) {
        return true;
      }

      const searchText = [
        getPreviewEmployeeId(row),
        row.position,
        row.role_level,
        previewHasRiskData ? getPreviewRiskLevel(row) : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchText.includes(searchNeedle);
    })
    .filter((row) => {
      if (!previewHasRiskData || previewRiskFilter === 'All') {
        return true;
      }
      return getSimplifiedRiskLevel(getPreviewRiskLevel(row)) === previewRiskFilter;
    })
    .sort((leftRow, rightRow) => {
      if (!previewHasRiskData) {
        return 0;
      }
      return getPreviewRiskRank(getPreviewRiskLevel(rightRow)) - getPreviewRiskRank(getPreviewRiskLevel(leftRow));
    });
  const previewFilteredTotalRows = filteredPreviewRows.length;
  const previewEffectivePageSize = PREVIEW_PAGE_SIZE;
  const previewTotalPages = Math.max(1, Math.ceil(previewFilteredTotalRows / PREVIEW_PAGE_SIZE));
  const previewPageForUi = previewPage;
  const safePreviewPage = Math.min(previewPageForUi, previewTotalPages);
  const paginatedPreviewRows = filteredPreviewRows.slice(
    (safePreviewPage - 1) * PREVIEW_PAGE_SIZE,
    safePreviewPage * PREVIEW_PAGE_SIZE
  );

  useEffect(() => {
    if (previewPage !== safePreviewPage) {
      setPreviewPage(safePreviewPage);
    }
  }, [previewPage, safePreviewPage]);

  const employeeTotalPages = Math.max(1, Math.ceil(employees.length / PREVIEW_PAGE_SIZE));
  const safeEmployeesPage = Math.min(employeesPage, employeeTotalPages);
  const paginatedEmployees = employees.slice(
    (safeEmployeesPage - 1) * PREVIEW_PAGE_SIZE,
    safeEmployeesPage * PREVIEW_PAGE_SIZE
  );

  useEffect(() => {
    if (employeesPage !== safeEmployeesPage) {
      setEmployeesPage(safeEmployeesPage);
    }
  }, [employeesPage, safeEmployeesPage]);

  if (!user) {
    return (
      <div className="productivity-container feature-page-shell">
        <div className="login-message">
          <h2>Please log in to access Employee Productivity Predictor</h2>
          <p>Batch process employee CSV files to predict productivity levels and risk assessment</p>
        </div>
      </div>
    );
  }

  return (
    <div className="productivity-container feature-page-shell">
      <EmployeeProductivityFormModal
        isOpen={showAddEmployee}
        title={editingEmployee ? 'Edit Employee' : 'Add Employee'}
        initialValues={editingEmployee ? getEmployeeFormValues(editingEmployee) : undefined}
        submitting={singleLoading}
        submitLabel={editingEmployee ? 'Update Employee' : 'Save Employee'}
        submittingLabel={editingEmployee ? 'Updating...' : 'Saving...'}
        readOnlyEmployeeId={Boolean(editingEmployee)}
        onClose={() => {
          setShowAddEmployee(false);
          setEditingEmployee(null);
        }}
        onSubmit={editingEmployee ? handleEditEmployee : handleAddEmployee}
      />

      <FeaturePageHero
        badgeIcon="fas fa-chart-bar"
        badgeText="AI-Powered Analytics"
        titleLeading="Employee Performance &"
        titleHighlight="Productivity Predictor"
        subtitle="Analyze employee performance data in bulk and generate productivity insights using intelligent machine learning models."
        features={[
          { icon: 'fas fa-database', label: 'Bulk Processing' },
          { icon: 'fas fa-chart-line', label: 'Performance Insights' },
          { icon: 'fas fa-cogs', label: 'Automated Analysis' }
        ]}
      />


      {/* API Status */}
      {apiStatus && (
        <div className={`api-status ${apiStatus.status}`}>
          <i className={`fas fa-${apiStatus.status === 'connected' ? 'check-circle' : 'exclamation-circle'}`}></i>
          <span>{apiStatus.message}</span>
          <button onClick={checkApiHealth} className="refresh-status" disabled={isCheckingApi}>
            <i className={`fas fa-sync-alt ${isCheckingApi ? 'fa-spin' : ''}`}></i>
            {isCheckingApi ? 'Checking...' : 'Refresh'}
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <i className="fas fa-exclamation-circle"></i>
          <span>{error}</span>
          <button onClick={() => setError('')} className="dismiss-error">×</button>
        </div>
      )}

      {employeeSaveMessage && (
        <div className="api-status connected">
          <i className="fas fa-check-circle"></i>
          <span>{employeeSaveMessage}</span>
          <button onClick={() => setEmployeeSaveMessage('')} className="refresh-status">
            Dismiss
          </button>
        </div>
      )}

      <section className="productivity-input-switcher" aria-label="Choose employee input method">
        <div className="productivity-input-switcher-header">
          <div>
            <h3>Choose Input Method</h3>
            <p>Switch between bulk CSV processing and one-by-one employee management without crowding the page.</p>
          </div>
          <div className="productivity-input-toggle" role="tablist" aria-label="Productivity input methods">
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'bulk'}
              className={`productivity-input-toggle-btn ${inputMode === 'bulk' ? 'active' : ''}`}
              onClick={() => {
                setInputMode('bulk');
                resetPredictionViews();
              }}
            >
              <i className="fas fa-cloud-upload-alt"></i>
              <span>Bulk Upload</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'manual'}
              className={`productivity-input-toggle-btn ${inputMode === 'manual' ? 'active' : ''}`}
              onClick={() => {
                setInputMode('manual');
                resetPredictionViews();
              }}
            >
              <i className="fas fa-user-edit"></i>
              <span>Manual Entry</span>
            </button>
          </div>
        </div>

        <div className="productivity-input-panel" key={inputMode}>
          {inputMode === 'bulk' ? (
            <div className="batch-processing-section productivity-input-content">
              <div className="upload-card-modern">

                <div className="ucm-icon-wrap">
                  <i className="fas fa-cloud-upload-alt"></i>
                </div>

                <h3 className="ucm-title">Upload Employee Data</h3>
                <p className="ucm-subtitle">
                  Drag and drop your CSV file here, or click to browse.
                </p>

                {csvFileName && (
                  <p className="ucm-selected">
                    <i className="fas fa-file-csv"></i>
                    Selected: <strong>{csvFileName}</strong>
                  </p>
                )}

                <div className="ucm-actions ucm-row-secondary">
                  <label className="ucm-btn ucm-btn-outline ucm-half">
                    <i className="fas fa-folder-open"></i>
                    Select CSV File
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCsvFileChange}
                      style={{ display: 'none' }}
                    />
                  </label>

                  <button
                    className="ucm-btn ucm-btn-outline ucm-half"
                    onClick={handlePreview}
                    disabled={loading || !csvFile}
                  >
                    <i className="fas fa-eye"></i>
                    Preview Data
                  </button>
                </div>

                <button
                  className="ucm-btn ucm-btn-primary ucm-full"
                  onClick={handleBatchPredict}
                  disabled={loading || !csvFile}
                >
                  {loading ? (
                    <><i className="fas fa-spinner fa-spin"></i> Processing...</>
                  ) : (
                    <><i className="fas fa-bolt"></i> Run Prediction</>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="preview-section productivity-input-content">
              <div className="database-table-header">
                <div>
                  <h3>Employee Database Table</h3>
                  <p>
                    Total saved employees: {employees.length}
                    {employees.length > 0 && ` | Showing ${((safeEmployeesPage - 1) * PREVIEW_PAGE_SIZE) + 1}-${Math.min(safeEmployeesPage * PREVIEW_PAGE_SIZE, employees.length)}`}
                  </p>
                </div>
                <div className="database-table-actions">
                  <button
                    className="table-primary-action-btn"
                    type="button"
                    onClick={() => {
                      setEditingEmployee(null);
                      setShowAddEmployee(true);
                    }}
                    disabled={singleLoading}
                  >
                    <i className="fas fa-user-plus"></i>
                    Add Employee
                  </button>
                  {/* <button
                    type="button"
                    className="preview-page-btn"
                    onClick={handlePreview}
                    disabled={loading || employeesLoading || employees.length === 0}
                  >
                    {loading ? 'Previewing...' : 'Preview Database'}
                  </button> */}
                  <button
                    type="button"
                    className="preview-page-btn"
                    onClick={handlePredictFromDatabase}
                    disabled={loading || employeesLoading || employees.length === 0}
                  >
                    {loading ? 'Predicting...' : 'Predict From Database'}
                  </button>
                  <button
                    type="button"
                    className="table-download-icon-btn"
                    onClick={handleExportEmployeesCsv}
                    disabled={employeesLoading || employees.length === 0}
                    title="Export CSV"
                    aria-label="Export CSV"
                  >
                    <i className="fas fa-download"></i>
                  </button>
                </div>
              </div>

              <div className="preview-table">
                <table>
                  <thead>
                    <tr>
                      {EMPLOYEE_TABLE_COLUMNS.map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                      <th>{EMPLOYEE_ACTIONS_COLUMN}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeesLoading ? (
                      <tr>
                        <td colSpan={EMPLOYEE_TABLE_COLUMNS.length + 1}>Loading employees...</td>
                      </tr>
                    ) : paginatedEmployees.length > 0 ? (
                      paginatedEmployees.map((row) => (
                        <tr key={row._id || row.Employee_ID}>
                          {EMPLOYEE_TABLE_COLUMNS.map((col) => (
                            <td key={col}>{row[col] ?? '—'}</td>
                          ))}
                          <td>
                            <div className="database-row-actions">
                              <button
                                type="button"
                                className="table-icon-action-btn table-icon-action-btn-edit"
                                onClick={() => {
                                  setEditingEmployee(row);
                                  setShowAddEmployee(true);
                                }}
                                disabled={singleLoading || deletingEmployeeId === row.Employee_ID}
                                aria-label={`Edit ${row.Employee_ID}`}
                                title="Edit"
                              >
                                <i className="fas fa-pen"></i>
                              </button>
                              <button
                                type="button"
                                className="table-icon-action-btn table-icon-action-btn-delete"
                                onClick={() => handleDeleteEmployee(row.Employee_ID)}
                                disabled={Boolean(deletingEmployeeId) || singleLoading}
                                aria-label={`Delete ${row.Employee_ID}`}
                                title={deletingEmployeeId === row.Employee_ID ? 'Deleting...' : 'Delete'}
                              >
                                {deletingEmployeeId === row.Employee_ID ? (
                                  <i className="fas fa-spinner fa-spin"></i>
                                ) : (
                                  <i className="fas fa-trash-alt"></i>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={EMPLOYEE_TABLE_COLUMNS.length + 1}>No employees found in the database.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {employees.length > PREVIEW_PAGE_SIZE && (
                <div className="preview-pagination">
                  <button
                    type="button"
                    className="preview-page-btn"
                    onClick={() => setEmployeesPage((page) => Math.max(1, page - 1))}
                    disabled={safeEmployeesPage === 1 || employeesLoading}
                  >
                    Previous
                  </button>
                  <span className="preview-page-indicator">
                    Page {safeEmployeesPage} of {employeeTotalPages}
                  </span>
                  <button
                    type="button"
                    className="preview-page-btn"
                    onClick={() => setEmployeesPage((page) => Math.min(employeeTotalPages, page + 1))}
                    disabled={safeEmployeesPage === employeeTotalPages || employeesLoading}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Preview Results */}
      {(previewData || hasPredictedPreview) && (() => {
        const PREVIEW_COLUMNS = hasPredictedPreview
          ? [
            'employee_id',
            'Employee_ID',
            'role_level',
            'position',
            'Predicted_Feedback_Percentage',
            'Predicted Productivity',
            'Predicted_Productivity',
            'Predicted_Productivity_Percentage',
            'Productivity_Prediction',
            'Predicted_Productivity_Risk',
            'Risk_Level',
            'Output_Summary',
          ]
          : [
            'employee_id',
            ...EMPLOYEE_TABLE_COLUMNS,
          ];
        const orderedColumns = PREVIEW_COLUMNS.filter((col) => previewSourceColumns.includes(col));
        const visibleCols = orderedColumns.length > 0 ? orderedColumns : previewSourceColumns;
        const columnDisplayNames = {
          Employee_ID: 'Employee ID',
          role_level: 'Role Level',
          experience_years: 'Experience Years',
          avg_task_completion: 'Avg Task Completion',
          attendance_rate: 'Attendance Rate',
          projects_handled: 'Projects Handled',
          overtime_hours: 'Overtime Hours',
          training_hours: 'Training Hours',
          Predicted_Productivity_Percentage: 'Productivity Prediction',
          Predicted_Feedback_Percentage: 'Productivity Prediction',
          'Predicted Productivity': 'Productivity Prediction',
          'Predicted_Productivity': 'Productivity Prediction',
          Productivity_Prediction: 'Productivity Prediction',
          Predicted_Productivity_Risk: 'Risk Level',
          Productivity_Class: 'Productivity Class',
          Predicted_Class: 'Productivity Class',
          Output_Summary: 'Output Summary',
        };
        const getColumnDisplayName = (col) => columnDisplayNames[col] || col;
        const showingFrom = previewTotalRows === 0 ? 0 : ((safePreviewPage - 1) * previewEffectivePageSize) + 1;
        const showingTo = previewTotalRows === 0
          ? 0
          : Math.min(showingFrom + Math.max(0, paginatedPreviewRows.length - 1), previewTotalRows);

        return (
          <div className="preview-section">
            <div className="results-preview-header">
              <div>
                <h3>{hasPredictedPreview ? 'Prediction Output Preview' : 'Data Preview'}</h3>
                <p>
                  {hasPredictedPreview ? 'Predicted output rows.' : 'Input rows only.'} Total rows: {previewTotalRows} | Showing {showingFrom}-{showingTo}
                </p>
              </div>
            </div>

            <div className="results-toolbar">
              <label className="results-searchbar" aria-label="Search employee">
                <i className="fas fa-search"></i>
                <input
                  type="text"
                  value={previewSearchTerm}
                  onChange={(e) => {
                    setPreviewSearchTerm(e.target.value);
                    setPreviewPage(1);
                  }}
                  placeholder="Search an employee"
                />
              </label>

              <div className="results-toolbar-actions">
                {previewHasRiskData && (
                  <label className="results-inline-select">
                    <span>Filter by</span>
                    <select
                      value={previewRiskFilter}
                      onChange={(e) => {
                        setPreviewRiskFilter(e.target.value);
                        setPreviewPage(1);
                      }}
                    >
                      {previewRiskOptions.map((option) => (
                        <option key={option} value={option}>{option === 'All' ? 'All risk levels' : option}</option>
                      ))}
                    </select>
                  </label>
                )}

                <button
                  type="button"
                  className="results-toolbar-download"
                  onClick={downloadResults}
                  title="Download full results CSV"
                  aria-label="Download full results CSV"
                  disabled={!batchResult?.download_url}
                >
                  <i className="fas fa-download"></i>
                </button>

                <button
                  type="button"
                  className="results-toolbar-download"
                  onClick={downloadResultsExcel}
                  title="Download full results Excel"
                  aria-label="Download full results Excel"
                  disabled={!batchResult?.download_excel_url}
                >
                  <i className="fas fa-file-excel"></i>
                </button>
              </div>
            </div>

            <div className="preview-table">
              <table>
                <thead>
                  <tr>
                    {visibleCols.map((col) => (
                      <th key={col}>{getColumnDisplayName(col)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedPreviewRows.length > 0 ? paginatedPreviewRows.map((row, idx) => (
                    <tr key={idx}>
                      {visibleCols.map((col) => {
                        const cellValue = row[col];
                        const isRiskColumn = col === 'Predicted_Productivity_Risk' || col === 'Risk_Level' || col === 'risk_level';
                        const isOutputSummaryColumn = col === 'Output_Summary';
                        const displayValue = isRiskColumn
                          ? String(cellValue || '').split(' - ')[0].trim()
                          : isOutputSummaryColumn
                            ? normalizeSummarySentence(cellValue)
                            : cellValue;

                        return (
                          <td key={col}>
                            {isRiskColumn ? (
                              <span style={getRiskBadgeStyle(displayValue)}>
                                {displayValue || '—'}
                              </span>
                            ) : isOutputSummaryColumn ? (
                              <div className="preview-output-summary">{String(displayValue || '—')}</div>
                            ) : typeof cellValue === 'number' ? cellValue.toFixed(2) : (cellValue ?? '—')}
                          </td>
                        );
                      })}
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={Math.max(visibleCols.length, 1)}>No rows available for preview.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {previewFilteredTotalRows > PREVIEW_PAGE_SIZE && (
              <div className="preview-pagination">
                <button
                  type="button"
                  className="preview-page-btn"
                  onClick={() => setPreviewPage((page) => Math.max(1, page - 1))}
                  disabled={safePreviewPage === 1 || loading}
                >
                  Previous
                </button>
                <span className="preview-page-indicator">
                  Page {safePreviewPage} of {previewTotalPages}
                </span>
                <button
                  type="button"
                  className="preview-page-btn"
                  onClick={() => setPreviewPage((page) => Math.min(previewTotalPages, page + 1))}
                  disabled={safePreviewPage === previewTotalPages || loading}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Batch Results */}
      {batchResult && (
        <div className="batch-results">
          <h3>Batch Processing Complete</h3>

          <div className="summary-stats">
            <div className="stat-card">
              <i className="fas fa-users"></i>
              <div>
                <span className="stat-label">Total Employees</span>
                <span className="stat-value">{batchResult.total_employees}</span>
              </div>
            </div>



            <div className="stat-card">
              <i className="fas fa-tachometer-alt"></i>
              <div>
                <span className="stat-label">Max Productivity</span>
                <span className="stat-value">{maxProductivityDisplay}%</span>
              </div>
            </div>

            <div className="stat-card">
              <i className="fas fa-chart-area"></i>
              <div>
                <span className="stat-label">Min Productivity</span>
                <span className="stat-value">{minProductivityDisplay}%</span>
              </div>
            </div>

            <div className="stat-card">
              <i className="fas fa-shield-alt"></i>
              <div>
                <span className="stat-label">High Risk Employees</span>
                <span className="stat-value">{highRiskEmployeeCount}</span>
              </div>
            </div>
          </div>

          {(positionChartData.length > 0 || attendanceTotal > 0) && (
            <div className="analytics-overview-grid">
              {positionChartData.length > 0 && (
                <div className="employee-position-card">
                  <div className="employee-position-header">
                    <div>
                      <h4>Employees By Position</h4>
                      <p>Distribution across the current uploaded dataset</p>
                    </div>
                  </div>

                  <div className="employee-position-chart">
                    {positionChartData.map((item) => {
                      const width = positionChartPeak ? (item.count / positionChartPeak) * 100 : 0;

                      return (
                        <div key={item.position} className="employee-position-row">
                          <span className="employee-position-label">{item.position}</span>
                          <div className="employee-position-bar-track">
                            <div
                              className="employee-position-bar-fill"
                              style={{
                                width: `${Math.max(width, 8)}%`,
                                background: 'var(--gradient-chart-primary)',
                                boxShadow: '0 10px 22px rgba(93, 60, 201, 0.22)'
                              }}
                              title={`${item.position}: ${item.count} employees`}
                            ></div>
                          </div>
                          <span className="employee-position-value">{item.count}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="employee-position-axis">
                    <span className="employee-position-axis-spacer"></span>
                    {[0, 0.25, 0.5, 0.75, 1].map((step) => (
                      <span key={step}>{Math.round(positionChartPeak * step)}</span>
                    ))}
                    <span className="employee-position-axis-spacer"></span>
                  </div>

                  <div className="employee-position-footnote">
                    <span className="employee-position-dot"></span>
                    <span>
                      {positionChartData[0].position} has the largest share at {topPositionShare}% of uploaded employees.
                    </span>
                  </div>
                </div>
              )}

              {attendanceTotal > 0 && (() => {
                const gaugeRadius = 88;
                const centerX = 120;
                const centerY = 138;
                const strokeWidth = 38;
                const totalAngle = 240;
                const startAngle = 150;
                const gapAngle = 8;
                const drawableAngle = totalAngle - (attendanceSegments.length - 1) * gapAngle;
                let currentAngle = startAngle;

                const polarToPoint = (angleDeg, radius) => {
                  const rad = (angleDeg * Math.PI) / 180;
                  return {
                    x: centerX + radius * Math.cos(rad),
                    y: centerY + radius * Math.sin(rad),
                  };
                };

                const describeArc = (arcStart, arcSweep) => {
                  const start = polarToPoint(arcStart, gaugeRadius);
                  const end = polarToPoint(arcStart + arcSweep, gaugeRadius);
                  const largeArc = arcSweep > 180 ? 1 : 0;
                  return `M ${start.x} ${start.y} A ${gaugeRadius} ${gaugeRadius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
                };

                const gaugeSegments = attendanceSegments.map((segment) => {
                  const ratio = attendanceTotal ? segment.count / attendanceTotal : 0;
                  const segmentAngle = Math.max(ratio * drawableAngle, ratio > 0 ? 12 : 0);
                  const path = segmentAngle > 0 ? describeArc(currentAngle, segmentAngle) : null;
                  currentAngle += segmentAngle + gapAngle;

                  return {
                    ...segment,
                    path,
                    percent: attendanceTotal ? ((segment.count / attendanceTotal) * 100).toFixed(0) : '0',
                  };
                });

                return (
                  <div className="attendance-overview-card">
                    <div className="attendance-overview-header">
                      <div>
                        <h4>Attendance Overview</h4>
                        <p>Built directly from attendance_rate values on a 1 to 5 scale</p>
                      </div>
                    </div>

                    <div className="attendance-gauge-wrap">
                      <svg width="240" height="220" viewBox="0 0 240 220" className="attendance-gauge-svg">
                        <path
                          d={describeArc(startAngle, totalAngle)}
                          fill="none"
                          stroke="var(--chart-track)"
                          strokeWidth={strokeWidth}
                          strokeLinecap="round"
                        />
                        {gaugeSegments.map((segment) => (
                          segment.path ? (
                            <path
                              key={segment.key}
                              d={segment.path}
                              fill="none"
                              stroke={segment.color}
                              strokeWidth={strokeWidth}
                              strokeLinecap="round"
                            >
                              <title>{`${segment.key}: ${segment.count} employees (${segment.percent}%)`}</title>
                            </path>
                          ) : null
                        ))}
                        <text x={centerX} y={126} textAnchor="middle" fontSize="12" fontWeight="600" fill={chartHex.textMuted}>
                          Total Rated Employees
                        </text>
                        <text x={centerX} y={154} textAnchor="middle" fontSize="28" fontWeight="800" fill={chartHex.text}>
                          {attendanceTotal}
                        </text>
                      </svg>
                    </div>

                    <div className="attendance-status-title">Status Ratings</div>
                    <div className="attendance-status-list">
                      {gaugeSegments.map((segment) => (
                        <div key={segment.key} className="attendance-status-item">
                          <div className="attendance-status-name-wrap">
                            <span className="attendance-status-dot" style={{ background: segment.color }}></span>
                            <span className="attendance-status-name">{segment.key}</span>
                          </div>
                          <div className="attendance-status-metrics">
                            <span className="attendance-status-percent">{segment.percent}%</span>
                            <span className="attendance-status-count">{segment.count}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>
                );
              })()}
            </div>
          )}

          {(() => {
            const getRiskSliceTheme = (riskLabel) => {
              const normalizedRisk = String(riskLabel || '').toLowerCase();

              if (normalizedRisk.includes('high')) {
                return { color: performancePalette.darkest, glow: `${performancePalette.darkest}55` };
              }

              if (normalizedRisk.includes('moderate') || normalizedRisk.includes('medium')) {
                return { color: performancePalette.deep, glow: `${performancePalette.deep}55` };
              }

              if (normalizedRisk.includes('low') || normalizedRisk.includes('excellent') || normalizedRisk.includes('good')) {
                return { color: performancePalette.medium, glow: `${performancePalette.medium}55` };
              }

              return { color: performancePalette.soft, glow: `${performancePalette.soft}55` };
            };

            const riskEntries = Object.entries(riskDistribution);
            if (riskEntries.length === 0) {
              return null;
            }
            const total = riskEntries.reduce((s, [, c]) => s + (Number(c) || 0), 0);
            const R = 70;
            const CX = 90; const CY = 90;
            const STROKE = 28;
            let cumulativeAngle = -90;

            const slices = riskEntries.map(([risk, count]) => {
              const safeCount = Number(count) || 0;
              const pct = total > 0 ? safeCount / total : 0;
              const angle = pct * 360;
              const startAngle = cumulativeAngle;
              cumulativeAngle += angle;
              const config = getRiskSliceTheme(risk);
              return { risk, count: safeCount, pct, startAngle, angle, ...config };
            });

            const polarToXY = (angleDeg, r) => {
              const rad = (angleDeg * Math.PI) / 180;
              return {
                x: CX + r * Math.cos(rad),
                y: CY + r * Math.sin(rad),
              };
            };

            const describeArc = (startDeg, angleDeg) => {
              if (angleDeg >= 360) angleDeg = 359.99;
              const start = polarToXY(startDeg, R);
              const end = polarToXY(startDeg + angleDeg, R);
              const large = angleDeg > 180 ? 1 : 0;
              return `M ${start.x} ${start.y} A ${R} ${R} 0 ${large} 1 ${end.x} ${end.y}`;
            };

            return (
              <div className="risk-pie-section">
                <div className="risk-pie-header">
                  <h4>Risk Distribution</h4>
                </div>

                <div className="risk-pie-layout">
                  <div className="risk-pie-chart-wrap">
                    <svg width="180" height="180" viewBox="0 0 180 180">
                      <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--chart-track)" strokeWidth={STROKE} />
                      {slices.map((s, i) => (
                        <path
                          key={i}
                          d={describeArc(s.startAngle, s.angle)}
                          fill="none"
                          stroke={s.color}
                          strokeWidth={STROKE}
                          strokeLinecap="butt"
                          style={{ filter: `drop-shadow(0 0 4px ${s.glow})` }}
                        >
                          <title>{`${s.risk}: ${s.count} employees (${(s.pct * 100).toFixed(1)}%)`}</title>
                        </path>
                      ))}
                      {slices.map((s, i) => {
                        if (s.angle < 20) return null;
                        const midAngle = s.startAngle + s.angle / 2;
                        const midRad = (midAngle * Math.PI) / 180;
                        const lx = CX + R * Math.cos(midRad);
                        const ly = CY + R * Math.sin(midRad);
                        return (
                          <text
                            key={`lbl-${i}`}
                            x={lx}
                            y={ly + 4}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="800"
                            fill="#ffffff"
                            style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
                          >
                            {s.count}
                          </text>
                        );
                      })}
                      <text x={CX} y={CY - 8} textAnchor="middle" fontSize="24" fontWeight="800" fill={chartHex.text}>{total}</text>
                      <text x={CX} y={CY + 12} textAnchor="middle" fontSize="10" fill={chartHex.textMuted} fontWeight="600" letterSpacing="1">TOTAL</text>
                    </svg>
                  </div>

                  <div className="risk-pie-legend">
                    {slices.map((s, i) => (
                      <div key={i} className="risk-legend-item">
                        <span className="risk-legend-dot" style={{ background: s.color, boxShadow: `0 0 6px ${s.glow}` }}></span>
                        <div className="risk-legend-info">
                          <span className="risk-legend-name">{s.risk}</span>
                          <div className="risk-legend-bar-wrap">
                            <div className="risk-legend-bar-fill" style={{ width: `${(s.pct * 100).toFixed(1)}%`, background: s.color, boxShadow: `0 8px 20px ${s.glow}` }} title={`${s.risk}: ${s.count} employees`}></div>
                          </div>
                        </div>
                        <div className="risk-legend-stats">
                          <span className="risk-legend-count" style={{ color: s.color }}>{s.count}</span>
                          <span className="risk-legend-pct">{(s.pct * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {classDistributionEntries.length > 0 && (
            <div className="risk-pie-section">
              <div className="risk-pie-header">
                <h4>Productivity Class Distribution</h4>
              </div>

              <div className="risk-pie-legend">
                {classDistributionEntries.map((entry, idx) => {
                  const classTheme = (() => {
                    const normalizedClass = String(entry.className || '').toLowerCase();

                    if (normalizedClass.includes('high') || normalizedClass.includes('5') || normalizedClass.includes('4')) {
                      return { color: performancePalette.darkest, glow: `${performancePalette.darkest}55` };
                    }

                    if (normalizedClass.includes('medium') || normalizedClass.includes('3')) {
                      return { color: performancePalette.deep, glow: `${performancePalette.deep}55` };
                    }

                    return { color: performancePalette.medium, glow: `${performancePalette.medium}55` };
                  })();

                  const classPercent = classDistributionTotal > 0
                    ? (entry.count / classDistributionTotal) * 100
                    : 0;

                  return (
                    <div key={`${entry.className}-${idx}`} className="risk-legend-item">
                      <span className="risk-legend-dot" style={{ background: classTheme.color, boxShadow: `0 0 6px ${classTheme.glow}` }}></span>
                      <div className="risk-legend-info">
                        <span className="risk-legend-name">{entry.className}</span>
                        <div className="risk-legend-bar-wrap">
                          <div className="risk-legend-bar-fill" style={{ width: `${classPercent.toFixed(1)}%`, background: classTheme.color, boxShadow: `0 8px 20px ${classTheme.glow}` }} title={`${entry.className}: ${entry.count} employees`}></div>
                        </div>
                      </div>
                      <div className="risk-legend-stats">
                        <span className="risk-legend-count" style={{ color: classTheme.color }}>{entry.count}</span>
                        <span className="risk-legend-pct">{classPercent.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {predictionGraphCards.length > 0 && (
            <div className="risk-pie-section" style={{ background: 'linear-gradient(135deg, #f8f9ff 0%, #f1f4ff 100%)', padding: '32px', borderRadius: '24px', border: 'none', marginTop: '32px' }}>
              <div className="risk-pie-header" style={{ borderBottom: 'none', paddingBottom: '0', marginBottom: '24px' }}>
                <h4 style={{ color: '#1e1b4b', fontSize: '1.5rem', fontWeight: '700', letterSpacing: '-0.02em', margin: 0 }}>Employee Output Comparison Graphs</h4>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '24px',
                }}
              >
                {predictionGraphCards.map((graphCard) => (
                  <article
                    key={graphCard.key}
                    style={{
                      background: '#ffffff',
                      borderRadius: '20px',
                      padding: '24px',
                      boxShadow: '0 10px 40px -10px rgba(77, 47, 178, 0.08)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                      cursor: 'default',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 14px 45px -10px rgba(77, 47, 178, 0.12)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 10px 40px -10px rgba(77, 47, 178, 0.08)';
                    }}
                  >
                    <div>
                      <h5 style={{ margin: '0 0 12px 0', color: '#312e81', fontSize: '1.15rem', fontWeight: '600', lineHeight: '1.3' }}>{graphCard.title}</h5>
                      <p style={{ margin: '0 0 24px 0', color: '#6366f1', fontSize: '0.95rem', lineHeight: '1.5', opacity: '0.8' }}>{graphCard.description}</p>
                    </div>
                    <img
                      src={`${API_BASE_URL}${graphCard.url}`}
                      alt={graphCard.title}
                      style={{ width: '100%', height: 'auto', borderRadius: '12px', border: '1px solid #f1f5f9', objectFit: 'contain' }}
                      loading="lazy"
                    />
                  </article>
                ))}
              </div>
            </div>
          )}

          {outputSummaryRows.length > 0 && (
            <div className="risk-pie-section">
              <div className="risk-pie-header">
                <h4>Employee Output Summary</h4>
              </div>

              <div className="output-summary-list">
                {outputSummaryRows.map((item, index) => (
                  <article key={`${item.employeeId}-${index}`} className="output-summary-item">
                    <span className="output-summary-id">{item.employeeId || `EMP-${index + 1}`}</span>

                    <div className="output-summary-meta">
                      {item.productivityPercentage !== null && <span className="output-summary-chip">Productivity {item.productivityPercentage}%</span>}
                      {item.productivityClass && <span className="output-summary-chip">Class {item.productivityClass}</span>}
                      {item.riskLevel && <span className="output-summary-chip">Risk {item.riskLevel}</span>}
                    </div>

                    {(item.position || item.roleLevel) && (
                      <p className="output-summary-subtext">
                        {item.position || 'N/A'}{item.position && item.roleLevel ? ' | ' : ''}{item.roleLevel || ''}
                      </p>
                    )}

                    {item.recommendations && (
                      <p className="output-summary-recommendation">
                        <strong>Recommendation:</strong> {item.recommendations}
                      </p>
                    )}

                    {item.outputSummary && <p className="output-summary-text">{item.outputSummary}</p>}
                  </article>
                ))}
              </div>
            </div>
          )}

          {batchResult.top_performers && batchResult.top_performers.length > 0 && (
            <div className="top-performers">
              <h4>Top 5 Performers</h4>
              <div className="top-performers-table-wrap">
                <table className="top-performers-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Employee</th>
                      <th>Position</th>
                      <th>Role</th>
                      <th>Productivity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchResult.top_performers.map((performer, idx) => {
                      const productivityValue = Number(
                        performer.Predicted_Feedback_Percentage
                        ?? performer.predicted_feedback_percentage
                        ?? performer.Predicted_Productivity_Percentage
                        ?? 0
                      ).toFixed(1);
                      const riskValue = String(
                        performer.Predicted_Productivity_Risk
                        || performer.Risk_Level
                        || performer.risk_level
                        || 'N/A'
                      ).split(' - ')[0].trim();

                      return (
                        <tr key={idx}>
                          <td>{String(idx + 1).padStart(2, '0')}</td>
                          <td>{performer.Employee_ID || performer.employee_id || `EMP-${idx + 1}`}</td>
                          <td>{performer.position || 'N/A'}</td>
                          <td>{performer.role_level || 'N/A'}</td>
                          <td>{productivityValue}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button className="download-btn report-download-btn" onClick={handleExportReport} disabled={reportLoading}>
            <i className={`fas ${reportLoading ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`}></i>
            {reportLoading ? 'Generating PDF Report...' : 'Export Full Report PDF'}
          </button>
        </div>
      )}

      <style>{`
        .preview-section {
          margin-top: 22px;
          padding: 24px 22px 18px;
          border-radius: 24px;
          background: linear-gradient(180deg, #f8f8fd 0%, #f3f4fb 100%);
          border: 1px solid #e1e5f0;
          box-shadow: 0 20px 40px rgba(60, 72, 105, 0.08);
        }

        .database-table-header,
        .results-preview-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }

        .database-table-header h3,
        .results-preview-header h3 {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0;
          color: #4b5878;
          font-size: 1.08rem;
          font-weight: 800;
          letter-spacing: 0.01em;
        }

        .database-table-header p,
        .results-preview-header p {
          margin: 10px 0 0;
          color: #6e7894;
          font-size: 0.98rem;
          line-height: 1.5;
        }

        .preview-table {
          overflow-x: auto;
          border-radius: 18px;
          border: 1px solid #dfe4ee;
          background: #ffffff;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
        }

        .preview-table table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          min-width: 980px;
        }

        .preview-output-summary {
          max-width: 420px;
          white-space: normal;
          line-height: 1.45;
          color: #4a5675;
          font-size: 0.86rem;
        }

        .output-summary-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
          gap: 12px;
          margin-top: 8px;
        }

        .output-summary-item {
          border: 1px solid var(--chart-border);
          background: var(--chart-surface);
          border-radius: 12px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .output-summary-meta {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .output-summary-chip {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid var(--chart-border);
          background: #f5f2ff;
          color: #4e3d96;
          font-size: 0.75rem;
          font-weight: 700;
        }

        .output-summary-id {
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          color: var(--chart-text-muted);
        }

        .output-summary-text {
          margin: 0;
          color: var(--chart-text);
          line-height: 1.5;
          font-size: 0.9rem;
        }

        .output-summary-subtext {
          margin: 0;
          color: var(--chart-text-muted);
          font-size: 0.82rem;
        }

        .output-summary-recommendation {
          margin: 0;
          color: var(--chart-text);
          font-size: 0.86rem;
        }

        .summary-stats {
          display: flex;
          gap: 14px;
          align-items: stretch;
          margin: 12px 0 18px;
          flex-wrap: wrap;
        }

        .stat-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 18px;
          min-width: 180px;
          border-radius: 14px;
          background: linear-gradient(180deg, #ffffff 0%, #fbfbff 100%);
          border: 1px solid rgba(98,72,203,0.08);
          box-shadow: 0 12px 28px rgba(72,54,142,0.06);
        }

        .stat-card i {
          width: 56px;
          height: 56px;
          min-width: 56px;
          border-radius: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          color: #fff;
          background: linear-gradient(180deg, #bfa7ff 0%, #7f68e6 100%);
          box-shadow: 0 8px 18px rgba(127,104,230,0.18);
        }

        .stat-card .stat-label {
          display: block;
          color: #65708e;
          font-size: 0.85rem;
          font-weight: 800;
          letter-spacing: 0.02em;
        }

        .stat-card .stat-value {
          display: block;
          color: #5a3fb2;
          font-size: 1.6rem;
          font-weight: 900;
          margin-top: 6px;
        }

        /* make stat cards responsive */
        @media (max-width: 900px) {
          .summary-stats {
            gap: 10px;
          }

          .stat-card {
            padding: 12px;
            min-width: 140px;
          }

          .stat-card i {
            width: 48px;
            height: 48px;
            min-width: 48px;
            font-size: 18px;
            border-radius: 12px;
          }
        }

        .top-performers {
          margin-top: 14px;
          border: 1px solid var(--chart-border);
          border-radius: 14px;
          background: var(--chart-surface);
          padding: 12px;
        }

        .top-performers h4 {
          margin: 0 0 10px;
          color: var(--chart-text);
          font-size: 1rem;
        }

        .top-performers-table-wrap {
          width: 100%;
          overflow-x: auto;
          border: 1px solid var(--chart-border);
          border-radius: 10px;
          background: #ffffff;
        }

        .top-performers-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 760px;
        }

        .top-performers-table th,
        .top-performers-table td {
          padding: 10px 12px;
          text-align: left;
          border-bottom: 1px solid #ebeff5;
          color: #39445f;
          white-space: nowrap;
          font-size: 0.9rem;
        }

        .top-performers-table th {
          background: #f1f4fb;
          color: #667393;
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }

        .top-performers-table tbody tr:last-child td {
          border-bottom: none;
        }

        .top-performers-table tbody tr:hover td {
          background: #fbfcff;
        }

        .preview-table thead th {
          padding: 18px 16px;
          background: #dfe2ea;
          color: #667393;
          font-size: 0.78rem;
          font-weight: 800;
          text-align: left;
          white-space: nowrap;
          letter-spacing: 0.02em;
        }

        .preview-table thead th:first-child {
          border-top-left-radius: 16px;
        }

        .preview-table thead th:last-child {
          border-top-right-radius: 16px;
        }

        .preview-table tbody td {
          padding: 18px 16px;
          border-top: 1px solid #ebeff5;
          color: #39445f;
          font-size: 0.96rem;
          white-space: nowrap;
          background: #ffffff;
        }

        .preview-table tbody tr:hover td {
          background: #fbfcff;
        }

        .preview-table tbody td[colspan] {
          text-align: center;
          color: #6b7280;
          font-weight: 700;
        }

        .results-csv-btn {
          min-width: 0;
          width: auto;
          max-width: 320px;
          padding: 0 18px;
          min-height: 48px;
          font-size: 0.95rem;
          border-radius: 14px;
          justify-content: center;
          box-shadow: none;
        }

        .results-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 16px;
          margin-bottom: 16px;
          border: 1px solid #dce2ed;
          border-radius: 22px;
          background: #fdfdff;
        }

        .results-searchbar,
        .results-inline-select {
          min-height: 52px;
          border-radius: 14px;
          border: 1px solid #d6dceb;
          background: #f4f5fb;
          color: #4c5878;
        }

        .results-searchbar {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          max-width: 430px;
          padding: 0 16px;
        }

        .results-searchbar i {
          color: #99a5c2;
          font-size: 1rem;
        }

        .results-searchbar input {
          flex: 1;
          min-height: 52px;
          border: none;
          background: transparent;
          color: #4c5878;
          font-size: 0.98rem;
          outline: none;
        }

        .results-searchbar input::placeholder {
          color: #8a94af;
        }

        .results-toolbar-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          flex-wrap: wrap;
        }

        .results-inline-select {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 220px;
          padding: 0 16px;
        }

        .results-inline-select span {
          color: #5f6c8d;
          font-size: 0.98rem;
          font-weight: 800;
          white-space: nowrap;
        }

        .results-inline-select select {
          min-width: 0;
          width: 100%;
          min-height: 52px;
          border: none;
          background: transparent;
          color: #55617f;
          font-size: 0.98rem;
          outline: none;
          padding: 0;
        }

        .results-toolbar-download,
        .table-download-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          min-width: 44px;
          height: 44px;
          border-radius: 12px;
          border: 1px solid #d6dceb;
          background: #f4f5fb;
          color: #7a88e8;
          cursor: pointer;
          transition: all 0.2s ease;
          padding: 0;
        }

        .results-toolbar-download:hover:not(:disabled),
        .table-download-icon-btn:hover:not(:disabled) {
          background: #eef1ff;
          border-color: #cad4fb;
          color: #5f72dd;
          transform: translateY(-1px);
        }

        .results-toolbar-download:disabled,
        .table-download-icon-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }

        .report-download-btn {
          background: linear-gradient(135deg, #0f766e 0%, #0ea5a4 100%);
          box-shadow: 0 14px 28px rgba(15, 118, 110, 0.25);
          font-size: var(--font-size-button);
        }

        .analytics-overview-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
          gap: 24px;
          align-items: stretch;
          margin-top: 24px;
        }

        .employee-position-card {
          padding: 22px;
          border-radius: 20px;
          background: var(--gradient-chart-surface);
          border: 1px solid var(--chart-grid);
          box-shadow: var(--shadow-chart);
        }

        .employee-position-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
        }

        .employee-position-header h4 {
          margin: 0;
          color: var(--chart-text);
          font-size: 1.1rem;
          font-weight: 700;
        }

        .employee-position-header p {
          margin: 6px 0 0;
          color: var(--chart-text-muted);
          font-size: 0.92rem;
        }

        .employee-position-chart {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .employee-position-row {
          display: grid;
          grid-template-columns: minmax(96px, 148px) minmax(0, 1fr) 36px;
          align-items: center;
          gap: 14px;
          padding: 10px 12px;
          border-radius: 16px;
          transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
        }

        .employee-position-row:hover {
          background: rgba(123, 97, 232, 0.06);
          box-shadow: inset 0 0 0 1px rgba(123, 97, 232, 0.08);
          transform: translateY(-1px);
        }

        .employee-position-label {
          color: var(--chart-text);
          font-size: 0.93rem;
          font-weight: 600;
        }

        .preview-pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 16px;
          padding: 0 2px;
        }

        .preview-page-btn {
          border: 1px solid #d6dceb;
          background: #f4f5fb;
          color: #56627f;
          border-radius: var(--button-radius-md);
          min-height: var(--button-height-md);
          padding: 0 var(--button-padding-x);
          font-size: var(--font-size-button);
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .preview-page-btn:hover:not(:disabled) {
          background: #eef1ff;
          border-color: #cad4fb;
          color: #4f60b6;
          transform: translateY(-1px);
        }

        .preview-page-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .preview-page-indicator {
          color: #68748f;
          font-size: 0.94rem;
          font-weight: 700;
        }

        .database-row-actions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 2px 0;
        }

        .table-icon-action-btn {
          width: 40px;
          height: 40px;
          border: 1px solid #d6dceb;
          background: #f4f5fb;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, color 0.18s ease;
          box-shadow: 0 6px 14px rgba(15, 23, 42, 0.06);
          padding: 0;
        }

        .table-icon-action-btn i {
          font-size: 14px;
        }

        .table-icon-action-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(15, 23, 42, 0.10);
        }

        .table-icon-action-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          box-shadow: none;
        }

        .table-icon-action-btn-edit {
          color: #60a5fa;
        }

        .table-icon-action-btn-edit:hover:not(:disabled) {
          border-color: #bfdbfe;
          background: #eff6ff;
          color: #3b82f6;
        }

        .table-icon-action-btn-delete {
          color: #f08b7d;
        }

        .table-icon-action-btn-delete:hover:not(:disabled) {
          border-color: #fecaca;
          background: #fef2f2;
          color: ${semanticHex.danger};
        }

        .database-table-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }

        .table-primary-action-btn {
          border: 1px solid #d6dceb;
          background: #ffffff;
          color: #5167d8;
          border-radius: 14px;
          min-height: 48px;
          padding: 0 20px;
          font-size: 0.95rem;
          font-weight: 800;
          letter-spacing: 0.02em;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          cursor: pointer;
          transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
          white-space: nowrap;
        }

        .table-primary-action-btn:hover:not(:disabled) {
          background: #eef1ff;
          border-color: #cad4fb;
          box-shadow: 0 10px 24px rgba(95, 114, 221, 0.14);
          transform: translateY(-1px);
        }

        .table-primary-action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .employee-position-bar-track {
          position: relative;
          height: 12px;
          border-radius: 999px;
          background: linear-gradient(180deg, #f5f1ff 0%, var(--chart-track) 100%);
          overflow: hidden;
        }

        .employee-position-bar-fill {
          height: 100%;
          border-radius: inherit;
          background: var(--gradient-chart-primary);
          box-shadow: 0 4px 12px rgba(93, 60, 201, 0.22);
          transition: width 0.35s ease, filter 0.2s ease;
        }

        .employee-position-row:hover .employee-position-bar-fill {
          filter: brightness(1.04);
        }

        .employee-position-value {
          color: var(--chart-text);
          font-size: 0.88rem;
          font-weight: 700;
          text-align: right;
        }

        .employee-position-axis {
          display: grid;
          grid-template-columns: minmax(96px, 148px) repeat(5, 1fr) 36px;
          margin-top: 14px;
          color: var(--chart-text-muted);
          font-size: 0.76rem;
          font-weight: 600;
          gap: 14px;
        }

        .employee-position-axis span {
          text-align: left;
        }

        .employee-position-axis-spacer {
          display: block;
        }

        .employee-position-axis span:last-child {
          text-align: right;
        }

        .employee-position-footnote {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 18px;
          color: var(--chart-text-muted);
          font-size: 0.9rem;
          font-weight: 500;
        }

        .employee-position-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--chart-primary);
          flex: 0 0 auto;
          box-shadow: 0 0 0 4px rgba(123, 97, 232, 0.12);
        }

        .attendance-overview-card {
          padding: 18px 22px 20px;
          border-radius: 20px;
          background: var(--gradient-chart-surface);
          border: 1px solid var(--chart-grid);
          box-shadow: var(--shadow-chart);
          display: flex;
          flex-direction: column;
        }

        .attendance-overview-header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          margin-bottom: 8px;
        }

        .attendance-overview-header h4 {
          margin: 0;
          color: var(--chart-text);
          font-size: 1.1rem;
          font-weight: 700;
        }

        .attendance-overview-header p {
          margin: 6px 0 0;
          color: var(--chart-text-muted);
          font-size: 0.9rem;
        }

        .attendance-gauge-wrap {
          display: flex;
          justify-content: center;
          margin: 6px 0 8px;
          padding: 10px 0 4px;
          border-radius: 24px;
          background: radial-gradient(circle at top, rgba(123, 97, 232, 0.1), transparent 58%);
        }

        .attendance-gauge-svg {
          max-width: 100%;
          height: auto;
        }

        .attendance-status-title {
          color: var(--chart-text);
          font-size: 1rem;
          font-weight: 700;
          margin-bottom: 10px;
        }

        .attendance-status-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .attendance-status-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 10px 12px;
          border-radius: 14px;
          transition: background 0.2s ease, transform 0.2s ease;
        }

        .attendance-status-item:hover {
          background: rgba(123, 97, 232, 0.06);
          transform: translateY(-1px);
        }

        .attendance-status-name-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .attendance-status-dot {
          width: 12px;
          height: 12px;
          border-radius: 999px;
          flex: 0 0 auto;
          box-shadow: 0 0 0 5px rgba(123, 97, 232, 0.08);
        }

        .attendance-status-name {
          color: var(--chart-text);
          font-size: 0.96rem;
          font-weight: 600;
        }

        .attendance-status-metrics {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 0 0 auto;
        }

        .attendance-status-percent {
          color: var(--chart-text);
          font-size: 0.95rem;
          font-weight: 700;
          min-width: 38px;
          text-align: right;
        }

        .attendance-status-count {
          color: var(--chart-text-muted);
          font-size: 0.92rem;
          font-weight: 700;
          min-width: 24px;
          text-align: right;
        }

        @media (max-width: 768px) {
          .results-preview-header {
            flex-direction: column;
            align-items: stretch;
          }

          .analytics-overview-grid {
            grid-template-columns: 1fr;
          }

          .results-toolbar {
            flex-direction: column;
            align-items: stretch;
          }

          .results-searchbar {
            max-width: none;
          }

          .results-toolbar-actions {
            justify-content: stretch;
          }

          .results-inline-select,
          .results-toolbar-download {
            width: 100%;
          }

          .employee-position-header {
            flex-direction: column;
            align-items: stretch;
          }

          .employee-position-row {
            grid-template-columns: 1fr;
            gap: 8px;
          }

          .employee-position-value {
            text-align: left;
          }

          .preview-pagination {
            justify-content: space-between;
          }

          .top-performers {
            padding: 10px;
          }

          .add-employee-action-row {
            margin-top: 18px;
          }

          .add-employee-action-btn {
            width: 100%;
          }

          .employee-position-axis {
            grid-template-columns: repeat(5, 1fr);
            gap: 10px;
          }

          .employee-position-axis-spacer {
            display: none;
          }

          .attendance-overview-header {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>
    </div>
  );
};

export default EmployeeProductivity;