import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from './AuthContext';
import FeaturePageHero from './common/FeaturePageHero';
import { chartHex, semanticCss, semanticHex } from './common/semanticPalette';

const API_BASE_URL = 'http://localhost:5003';
const ATTRITION_RESULT_STORAGE_KEY = 'employeeAttritionPredictionResult';
const ATTRITION_HISTORY_STORAGE_KEY = 'employeeAttritionBatchHistory';
const SINGLE_EMPLOYEE_JOB_LEVEL_OPTIONS = [
  { value: '1', label: 'Intern' },
  { value: '2', label: 'Trainee' },
  { value: '3', label: 'Associate' },
  { value: '4', label: 'Senior Associate' },
  { value: '5', label: 'Lead / Manager' }
];
const RATING_OPTIONS = [
  { value: '1', label: '1 - Low' },
  { value: '2', label: '2 - Medium' },
  { value: '3', label: '3 - High' },
  { value: '4', label: '4 - Very High' }
];
const STOCK_OPTION_OPTIONS = [
  { value: '0', label: '0 - None' },
  { value: '1', label: '1 - Low' },
  { value: '2', label: '2 - Medium' },
  { value: '3', label: '3 - High' }
];
const SINGLE_EMPLOYEE_JOB_ROLE_OPTIONS = [
  'Software Engineer',
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'QA Engineer',
  'DevOps Engineer',
  'Data Analyst',
  'Data Engineer',
  'IT Support Specialist',
  'System Administrator',
  'Network Engineer',
  'Cybersecurity Analyst',
  'Cloud Engineer',
  'Product Manager',
  'UI/UX Designer'
];
const SINGLE_EMPLOYEE_BUSINESS_TRAVEL_OPTIONS = ['Travel_Rarely', 'Travel_Frequently', 'Non-Travel'];
const SINGLE_EMPLOYEE_OVERTIME_OPTIONS = ['Yes', 'No'];
const SINGLE_EMPLOYEE_DEPARTMENT_OPTIONS = ['Research & Development', 'Sales', 'Human Resources'];
const SINGLE_EMPLOYEE_MARITAL_STATUS_OPTIONS = ['Married', 'Single', 'Divorced'];



const EmployeeAttrition = () => {
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [apiStatus, setApiStatus] = useState(null);
  const [isCheckingApi, setIsCheckingApi] = useState(false);

  // Batch processing state
  const [csvFile, setCsvFile] = useState(null);
  const [csvFileName, setCsvFileName] = useState('');
  const [batchResult, setBatchResult] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [resultRiskFilter, setResultRiskFilter] = useState('All');
  const [resultTravelFilter, setResultTravelFilter] = useState('All');
  const [resultOvertimeFilter, setResultOvertimeFilter] = useState('All');
  const [resultSortBy, setResultSortBy] = useState('risk-desc');
  const [resultEmployeeIdSearch, setResultEmployeeIdSearch] = useState('');
  const [resultRowsPerPage, setResultRowsPerPage] = useState(4);
  const [resultPage, setResultPage] = useState(1);
  const [batchHistory, setBatchHistory] = useState([]);
  const [singlePredictionLoading, setSinglePredictionLoading] = useState(false);
  const [singlePredictionErrors, setSinglePredictionErrors] = useState({});
  const [singlePredictionResult, setSinglePredictionResult] = useState(null);
  const [inputMode, setInputMode] = useState('bulk');
  const [singleEmployeeForm, setSingleEmployeeForm] = useState({
    Age: '',
    MonthlyIncome: '',
    JobRole: '',
    JobLevel: '',
    BusinessTravel: '',
    OverTime: '',
    JobSatisfaction: '3',
    WorkLifeBalance: '3',
    EnvironmentSatisfaction: '3',
    RelationshipSatisfaction: '3',
    YearsAtCompany: '2',
    YearsSinceLastPromotion: '0',
    YearsWithCurrManager: '2',
    YearsInCurrentRole: '2',
    TotalWorkingYears: '5',
    PercentSalaryHike: '12',
    JobInvolvement: '3',
    PerformanceRating: '3',
    StockOptionLevel: '1',
    DistanceFromHome: '5',
    NumCompaniesWorked: '1',
    Department: 'Research & Development',
    MaritalStatus: 'Married'
  });

  // Live reload state
  const [showLivePopup, setShowLivePopup] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveData, setLiveData] = useState(null);
  const [highRiskEmployees, setHighRiskEmployees] = useState([]);
  const [lastReloadTime, setLastReloadTime] = useState(null);

  // Selected employee for recommendations
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showRecommendations, setShowRecommendations] = useState(false);

  // Check API health on mount
  useEffect(() => {
    checkApiHealth();
    restoreStoredPredictionResult();
    restoreStoredBatchHistory();
  }, []);

  const restoreStoredPredictionResult = () => {
    try {
      const storedResult = window.localStorage.getItem(ATTRITION_RESULT_STORAGE_KEY);

      if (!storedResult) {
        return;
      }

      const parsedResult = JSON.parse(storedResult);

      if (parsedResult?.batchResult) {
        setBatchResult(parsedResult.batchResult);
      }

      if (parsedResult?.csvFileName) {
        setCsvFileName(parsedResult.csvFileName);
      }
    } catch (storageError) {
      console.error('Failed to restore stored attrition result:', storageError);
      window.localStorage.removeItem(ATTRITION_RESULT_STORAGE_KEY);
    }
  };

  const persistPredictionResult = (nextBatchResult, nextCsvFileName) => {
    try {
      window.localStorage.setItem(
        ATTRITION_RESULT_STORAGE_KEY,
        JSON.stringify({
          batchResult: nextBatchResult,
          csvFileName: nextCsvFileName,
          savedAt: new Date().toISOString()
        })
      );
    } catch (storageError) {
      console.error('Failed to persist attrition result:', storageError);
    }
  };

  const restoreStoredBatchHistory = () => {
    try {
      const storedHistory = window.localStorage.getItem(ATTRITION_HISTORY_STORAGE_KEY);

      if (!storedHistory) {
        return;
      }

      const parsedHistory = JSON.parse(storedHistory);
      setBatchHistory(Array.isArray(parsedHistory) ? parsedHistory : []);
    } catch (storageError) {
      console.error('Failed to restore attrition batch history:', storageError);
      window.localStorage.removeItem(ATTRITION_HISTORY_STORAGE_KEY);
    }
  };

  const persistBatchHistory = (nextHistory) => {
    try {
      window.localStorage.setItem(ATTRITION_HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));
      setBatchHistory(nextHistory);
    } catch (storageError) {
      console.error('Failed to persist attrition batch history:', storageError);
    }
  };

  const clearStoredPredictionResult = () => {
    window.localStorage.removeItem(ATTRITION_RESULT_STORAGE_KEY);
    setBatchResult(null);
    setPreviewData(null);
    setCsvFileName('');
    setCsvFile(null);
    setResultRiskFilter('All');
    setResultTravelFilter('All');
    setResultOvertimeFilter('All');
    setResultSortBy('risk-desc');
    setResultEmployeeIdSearch('');
    setResultRowsPerPage(4);
    setResultPage(1);
  };

  const checkApiHealth = async () => {
    setIsCheckingApi(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/test`);
      if (response.ok) {
        const data = await response.json();
        setApiStatus({
          status: 'connected',
          message: `API connected. Model exists: ${data.model_exists ? 'Yes' : 'No'}`,
          details: data
        });
      } else {
        setApiStatus({ status: 'error', message: 'API not responding properly' });
      }
    } catch (err) {
      setApiStatus({
        status: 'error',
        message: 'Cannot connect to API. Make sure Flask server is running on port 5003.'
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
      setResultRiskFilter('All');
      setResultTravelFilter('All');
      setResultOvertimeFilter('All');
      setResultSortBy('risk-desc');
      setResultEmployeeIdSearch('');
      setResultRowsPerPage(4);
      setResultPage(1);
      setError('');
    }
  };

  const handleBatchPredict = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setBatchResult(null);

    try {
      if (!csvFile) {
        throw new Error('Please upload a CSV file');
      }

      const formData = new FormData();
      formData.append('csv_file', csvFile);

      const response = await fetch(`${API_BASE_URL}/api/predict/batch`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        const normalizedBatchResult = {
          ...data,
          preview: normalizeRiskRows(data.preview)
        };
        const nextHistoryEntry = buildBatchHistoryEntry(normalizedBatchResult, csvFileName);
        const nextBatchHistory = [nextHistoryEntry, ...batchHistory].slice(0, 12);

        setBatchResult(normalizedBatchResult);
        persistPredictionResult(normalizedBatchResult, csvFileName);
        persistBatchHistory(nextBatchHistory);
        setResultRiskFilter('All');
        setResultTravelFilter('All');
        setResultOvertimeFilter('All');
        setResultSortBy('risk-desc');
        setResultEmployeeIdSearch('');
        setResultRowsPerPage(4);
        setResultPage(1);
      } else {
        throw new Error(data.error || 'Batch prediction failed');
      }
    } catch (err) {
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
      if (!csvFile) {
        throw new Error('Please upload a CSV file');
      }

      const formData = new FormData();
      formData.append('csv_file', csvFile);

      const response = await fetch(`${API_BASE_URL}/api/predict/preview`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        setPreviewData({
          ...data,
          preview: normalizeRiskRows(data.preview)
        });
      } else {
        throw new Error(data.error || 'Preview failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSingleEmployeeFieldChange = (field, value) => {
    setSingleEmployeeForm((currentForm) => ({
      ...currentForm,
      [field]: value
    }));

    setSinglePredictionErrors((currentErrors) => ({
      ...currentErrors,
      [field]: ''
    }));
  };

  const validateSingleEmployeeForm = () => {
    const nextErrors = {};

    Object.entries(singleEmployeeForm).forEach(([field, value]) => {
      if (!value) {
        nextErrors[field] = 'This field is required';
      }
    });

    setSinglePredictionErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSingleEmployeePrediction = async (event) => {
    event.preventDefault();
    setSinglePredictionResult(null);

    if (!validateSingleEmployeeForm()) {
      return;
    }

    setSinglePredictionLoading(true);

    const payload = {
      Age: Number(singleEmployeeForm.Age),
      MonthlyIncome: Number(singleEmployeeForm.MonthlyIncome),
      JobRole: singleEmployeeForm.JobRole,
      JobLevel: Number(singleEmployeeForm.JobLevel),
      BusinessTravel: singleEmployeeForm.BusinessTravel,
      OverTime: singleEmployeeForm.OverTime,
      JobSatisfaction: Number(singleEmployeeForm.JobSatisfaction),
      WorkLifeBalance: Number(singleEmployeeForm.WorkLifeBalance),
      EnvironmentSatisfaction: Number(singleEmployeeForm.EnvironmentSatisfaction),
      RelationshipSatisfaction: Number(singleEmployeeForm.RelationshipSatisfaction),
      YearsAtCompany: Number(singleEmployeeForm.YearsAtCompany),
      YearsSinceLastPromotion: Number(singleEmployeeForm.YearsSinceLastPromotion),
      YearsWithCurrManager: Number(singleEmployeeForm.YearsWithCurrManager),
      YearsInCurrentRole: Number(singleEmployeeForm.YearsInCurrentRole),
      TotalWorkingYears: Number(singleEmployeeForm.TotalWorkingYears),
      PercentSalaryHike: Number(singleEmployeeForm.PercentSalaryHike),
      JobInvolvement: Number(singleEmployeeForm.JobInvolvement),
      PerformanceRating: Number(singleEmployeeForm.PerformanceRating),
      StockOptionLevel: Number(singleEmployeeForm.StockOptionLevel),
      DistanceFromHome: Number(singleEmployeeForm.DistanceFromHome),
      NumCompaniesWorked: Number(singleEmployeeForm.NumCompaniesWorked),
      Department: singleEmployeeForm.Department,
      MaritalStatus: singleEmployeeForm.MaritalStatus
    };

    console.log('DEBUG: Sending single prediction payload:', payload);

    try {
      const response = await fetch(`${API_BASE_URL}/api/predict/single`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      console.log('DEBUG: Received single prediction response:', data);

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Single prediction failed');
      }

      const normalizedRiskScore = parseFloat(data.risk_score || 0);
      const normalizedRiskLabel = getFrontendRiskLabel(normalizedRiskScore, data.risk_label || '');

      setSinglePredictionResult({
        ...data,
        risk_score: normalizedRiskScore,
        risk_label: normalizedRiskLabel,
        top_factors: data.top_factors || [],
        recommendations: generateRecommendations({
          ...singleEmployeeForm,
          Risk_Score: normalizedRiskScore,
          Risk_Label: normalizedRiskLabel,
          Top_Factors: data.top_factors || []
        })
      });
    } catch (singlePredictionError) {
      setSinglePredictionErrors({
        form: singlePredictionError.message
      });
    } finally {
      setSinglePredictionLoading(false);
    }
  };

  // Function to generate retention recommendations based on employee data
  const generateRecommendations = (employee) => {
    const riskScore = parseFloat(employee.Risk_Score || employee.risk_score || 0);
    const age = parseInt(employee.Age) || 0;
    const jobRole = employee.JobRole || employee.job_role || '';
    const jobLevel = parseInt(employee.JobLevel || employee.job_level) || 0;
    const monthlyIncome = parseFloat(employee.MonthlyIncome || employee.monthly_income) || 0;
    const overTime = employee.OverTime || employee.over_time || '';
    const businessTravel = employee.BusinessTravel || employee.business_travel || '';
    const jobSatisfaction = parseInt(employee.JobSatisfaction || employee.job_satisfaction) || 3;
    const workLifeBalance = parseInt(employee.WorkLifeBalance || employee.work_life_balance) || 3;
    const stockOptionLevel = parseInt(employee.StockOptionLevel || employee.stock_option_level) || 0;
    const yearsAtCompany = parseInt(employee.YearsAtCompany || employee.years_at_company) || 0;

    const recommendations = [];

    // High risk recommendations
    if (riskScore >= 0.65) {
      recommendations.push({
        priority: 'Critical',
        icon: '🔴',
        category: 'Immediate Action',
        suggestions: [
          'Schedule an urgent one-on-one meeting within 24 hours',
          'Conduct immediate stay interview',
          'Evaluate flight risk impact on the team',
          'Develop a retention roadmap or succession plan'
        ]
      });
    }

    // Low satisfaction recommendations
    if (jobSatisfaction <= 2) {
      recommendations.push({
        priority: 'High',
        icon: '😩',
        category: 'Job Engagement',
        suggestions: [
          'Review current responsibilities for better alignment',
          'Discuss day-to-day pain points in work environment',
          'Identify opportunities for more meaningful tasks',
          'Review physical/digital work space comfort'
        ]
      });
    }

    // Work-life balance recommendations
    if (workLifeBalance <= 2) {
      recommendations.push({
        priority: 'High',
        icon: '⚖️',
        category: 'Well-being',
        suggestions: [
          'Review and adjust project deadlines',
          'Establish clear boundaries between work and personal time',
          'Encourage usage of accumulated leave',
          'Monitor team workload to prevent burnout'
        ]
      });
    }

    // Stock option / Financial vesting
    if (stockOptionLevel === 0 && yearsAtCompany > 2) {
      recommendations.push({
        priority: 'Medium',
        icon: '💎',
        category: 'Retention Incentives',
        suggestions: [
          'Review eligibility for stock option grants',
          'Discuss long-term financial vesting plans',
          'Offer performance-based equity incentives'
        ]
      });
    }

    // Overtime related recommendations
    if (overTime === 'Yes' || overTime === 'Yes') {
      recommendations.push({
        priority: 'High',
        icon: '⏰',
        category: 'Work-Life Balance',
        suggestions: [
          'Review workload distribution',
          'Consider hiring additional support for the team',
          'Implement flexible working hours',
          'Ensure overtime is compensated properly',
          'Set boundaries for after-hours communication'
        ]
      });
    }

    // Job level and career growth recommendations
    if (jobLevel < 3) {
      recommendations.push({
        priority: 'Medium',
        icon: '📈',
        category: 'Career Development',
        suggestions: [
          'Create a clear career progression path',
          'Offer skill development training programs',
          'Assign stretch projects to build experience',
          'Provide mentorship from senior staff',
          'Discuss promotion opportunities in next review'
        ]
      });
    }

    // Age-related recommendations
    if (age < 30) {
      recommendations.push({
        priority: 'Medium',
        icon: '🌱',
        category: 'Early Career Retention',
        suggestions: [
          'Offer continuous learning opportunities',
          'Provide regular feedback and recognition',
          'Create peer networking opportunities',
          'Assign challenging projects to maintain engagement',
          'Consider student loan repayment assistance'
        ]
      });
    } else if (age > 45) {
      recommendations.push({
        priority: 'Medium',
        icon: '🌟',
        category: 'Experienced Employee Retention',
        suggestions: [
          'Offer flexible retirement options',
          'Provide mentoring opportunities',
          'Consider phased retirement plans',
          'Offer enhanced health benefits',
          'Create knowledge transfer programs'
        ]
      });
    }

    // Income-related recommendations
    if (monthlyIncome < 50000) {
      recommendations.push({
        priority: 'High',
        icon: '💰',
        category: 'Compensation Review',
        suggestions: [
          'Conduct market rate analysis for role',
          'Consider salary adjustment',
          'Review bonus structure',
          'Add performance-based incentives',
          'Explore non-monetary benefits (extra leave, flexible hours)'
        ]
      });
    }

    // Business travel recommendations
    if (businessTravel === 'Travel_Frequently' || businessTravel === 'Frequent Traveler') {
      recommendations.push({
        priority: 'Medium',
        icon: '✈️',
        category: 'Travel Management',
        suggestions: [
          'Review travel frequency and necessity',
          'Offer additional compensation for travel',
          'Provide better travel accommodations',
          'Allow remote work days between travel',
          'Consider virtual meeting alternatives'
        ]
      });
    }

    // Job role specific recommendations
    if (jobRole.includes('Sales')) {
      recommendations.push({
        priority: 'High',
        icon: '🎯',
        category: 'Sales Team Retention',
        suggestions: [
          'Review sales targets and quotas',
          'Enhance commission structure',
          'Provide advanced sales training',
          'Recognize top performers publicly',
          'Create sales career advancement path'
        ]
      });
    } else if (jobRole.includes('Research') || jobRole.includes('Scientist')) {
      recommendations.push({
        priority: 'Medium',
        icon: '🔬',
        category: 'R&D Retention',
        suggestions: [
          'Provide research budget and resources',
          'Support conference attendance',
          'Allow publication opportunities',
          'Offer patent filing support',
          'Create innovation time (20% projects)'
        ]
      });
    } else if (jobRole.includes('Manager') || jobRole.includes('Director')) {
      recommendations.push({
        priority: 'High',
        icon: '👔',
        category: 'Management Retention',
        suggestions: [
          'Provide leadership development programs',
          'Offer executive coaching',
          'Review decision-making authority',
          'Create succession planning opportunities',
          'Enhance performance bonuses'
        ]
      });
    }

    // Add general recommendations if none specific
    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'Standard',
        icon: '📋',
        category: 'General Retention',
        suggestions: [
          'Schedule regular check-ins',
          'Recognize achievements publicly',
          'Provide professional development budget',
          'Ensure competitive benefits package',
          'Create positive team culture'
        ]
      });
    }

    // NEW: Promotion Stagnation Logic
    if (employee.YearsSinceLastPromotion > 3 && employee.YearsAtCompany > 3) {
      recommendations.push({
        priority: 'High',
        icon: '🏆',
        category: 'Career Stagnation',
        suggestions: [
          'Immediate career development discussion',
          'Identify barriers to promotion',
          'Assign a high-visibility stretch project',
          'Review if role still aligns with skills'
        ]
      });
    }

    // NEW: Management Risk Logic
    if (employee.YearsWithCurrManager > 5) {
      recommendations.push({
        priority: 'Medium',
        icon: '🤝',
        category: 'Rotation Opportunity',
        suggestions: [
          'Consider lateral move to fresh team',
          'New management exposure',
          'Team leadership rotation opportunity'
        ]
      });
    }

    // NEW: Factor-Specific Dynamic Recommendations (Reacting to SHAP output)
    if (employee.Top_Factors && employee.Top_Factors.length > 0) {
      const topFactor = employee.Top_Factors[0]; // Primary driver
      
      if (topFactor.includes('Salary') || topFactor.includes('Income')) {
        recommendations.push({
          priority: 'Critical',
          icon: '💹',
          category: 'Compensation Gap',
          suggestions: [
            'Immediate salary market adjustment review',
            'Performance-linked retention bonus',
            'Review benefit package competitiveness'
          ]
        });
      } else if (topFactor.includes('Over Time') || topFactor.includes('Overtime')) {
        recommendations.push({
          priority: 'High',
          icon: '⏰',
          category: 'Burnout Risk',
          suggestions: [
            'Mandatory workload review',
            'Temporary project offloading',
            'Discuss overtime fatigue in next 1-on-1'
          ]
        });
      } else if (topFactor.includes('Promotion') || topFactor.includes('Job Level')) {
        recommendations.push({
          priority: 'High',
          icon: '📈',
          category: 'Stagnation Alert',
          suggestions: [
            'Define clear 12-month promotion path',
            'Assign a senior mentor',
            'Lateral move for fresh skill development'
          ]
        });
      } else if (topFactor.includes('Satisfaction') || topFactor.includes('Environment')) {
        recommendations.push({
          priority: 'Medium',
          icon: '😊',
          category: 'Cultural Alignment',
          suggestions: [
            'Anonymous engagement feedback session',
            'Improve physical/digital work-space',
            'Team building activity'
          ]
        });
      }
    }

    return recommendations;
  };

  // Handle viewing recommendations for an employee
  const handleViewRecommendations = (employee) => {
    const enrichedEmployee = {
      ...employee,
      recommendations: generateRecommendations(employee)
    };
    setSelectedEmployee(enrichedEmployee);
    setShowRecommendations(true);
  };

  // Live reload uses the active prediction/preview rows first, then falls back to employee.csv
  const handleLiveReload = async () => {
    setLiveLoading(true);
    setError('');

    try {
      const activeLiveSource = batchResult || previewData;
      const liveSnapshot = buildLiveReloadSnapshot(activeLiveSource);

      if (liveSnapshot) {
        const highRisk = liveSnapshot.preview.filter((employee) => extractRiskScore(employee) > 0.20);

        setLiveData(liveSnapshot);
        setHighRiskEmployees(highRisk);
        setLastReloadTime(new Date());
        setShowLivePopup(true);
        return;
      }

      // Try multiple possible paths for the CSV file
      let response;
      const possiblePaths = [
        '/employee.csv',
        './employee.csv',
        `${window.location.origin}/employee.csv`,
        '/public/employee.csv'
      ];

      let csvContent = null;

      for (const path of possiblePaths) {
        try {
          console.log(`Trying to fetch from: ${path}`);
          response = await fetch(path);
          if (response.ok) {
            csvContent = await response.text();
            console.log(`✅ Successfully loaded from: ${path}`);
            break;
          }
        } catch (err) {
          console.log(`❌ Failed to load from: ${path}`);
        }
      }

      if (!csvContent) {
        throw new Error('No active prediction data found and employee.csv could not be loaded from the public folder.');
      }

      console.log('CSV content loaded, length:', csvContent.length);

      // Validate CSV format
      const lines = csvContent.trim().split('\n');
      if (lines.length < 2) {
        throw new Error('CSV file is empty or has no data rows');
      }

      const headerCount = lines[0].split(',').length;

      // Check each line for correct number of fields
      for (let i = 1; i < Math.min(lines.length, 20); i++) {
        if (lines[i].trim() === '') continue;
        const fieldCount = lines[i].split(',').length;
        if (fieldCount !== headerCount) {
          throw new Error(`CSV format error at line ${i + 1}`);
        }
      }

      // Create file and send to API
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const file = new File([blob], 'employee.csv', { type: 'text/csv' });

      const formData = new FormData();
      formData.append('csv_file', file);

      console.log('Sending to API for batch prediction...');
      const apiResponse = await fetch(`${API_BASE_URL}/api/predict/batch`, {
        method: 'POST',
        body: formData
      });

      const data = await apiResponse.json();
      console.log('API Response:', data);

      if (data.success) {
        const normalizedPreview = normalizeRiskRows(data.preview);

        // Get all employees from preview
        let allEmployees = normalizedPreview || [];

        // Filter employees with risk score >= 0.45 (High & Critical Risk)
        const highRisk = allEmployees.filter(emp => {
          const riskScore = extractRiskScore(emp);
          return riskScore >= 0.45;
        });

        console.log(`Found ${highRisk.length} high-risk employees in live reload`);

        setLiveData({
          ...data,
          preview: normalizedPreview
        });
        setHighRiskEmployees(highRisk);
        setLastReloadTime(new Date());
        setShowLivePopup(true);

        if (highRisk.length > 0) {
          console.log(`🔔 ${highRisk.length} high-risk employees detected`);
        }
      } else {
        throw new Error(data.error || 'Live reload failed');
      }
    } catch (err) {
      console.error('Live reload error:', err);
      setError(`Live reload failed: ${err.message}`);
    } finally {
      setLiveLoading(false);
    }
  };



  const downloadResults = () => {
    if (batchResult?.download_url) {
      window.open(`${API_BASE_URL}${batchResult.download_url}`, '_blank');
    }
  };

  const extractRiskScore = (employee) => parseFloat(employee?.Risk_Score || employee?.risk_score || 0);

  const getFrontendRiskLabel = (riskScore, fallbackLabel = '') => {
    if (riskScore >= 0.70) return 'Critical Risk';
    if (riskScore >= 0.45) return 'High Risk';
    if (riskScore >= 0.25) return 'Medium Risk';
    if (riskScore >= 0.10) return 'Low Risk';
    
    if (fallbackLabel) return fallbackLabel;
    return 'Minimal Risk';
  };

  const normalizeRiskRows = (rows = []) =>
    rows.map((row) => {
      const riskScore = extractRiskScore(row);
      const normalizedRiskLabel = getFrontendRiskLabel(riskScore, row.Risk_Label || row.risk_label || '');

      return {
        ...row,
        Risk_Label: normalizedRiskLabel,
        risk_label: normalizedRiskLabel
      };
    });




  const generateQuickRecommendations = (employee) => {
    const riskScore = extractRiskScore(employee);
    const overTime = employee.OverTime || employee.over_time || '';
    const jobLevel = parseInt(employee.JobLevel || employee.job_level) || 0;
    const monthlyIncome = parseFloat(employee.MonthlyIncome || employee.monthly_income) || 0;

    const quick = [];

    if (riskScore >= 0.40) {
      quick.push("Immediate HR check-in meeting");
    }

    if (overTime === "Yes") {
      quick.push("Reduce overtime / adjust workload");
    }

    if (jobLevel < 3) {
      quick.push("Discuss career progression plan");
    }

    if (monthlyIncome < 50000) {
      quick.push("Review salary & compensation");
    }

    if (quick.length === 0) {
      quick.push("Schedule employee engagement discussion");
    }

    return quick;
  };


  const getRiskScoreColor = (score) => {
    if (score > 0.20) return semanticHex.danger;
    if (score > 0.10) return semanticHex.warning;
    return semanticHex.success;
  };

  const formatScorePercent = (score) => `${(parseFloat(score || 0) * 100).toFixed(1)}%`;

  const buildRiskInsights = (result) => {
    if (!result) {
      return null;
    }

    const previewRows = Array.isArray(result.preview) ? result.preview : [];
    const totalEmployees = previewRows.length;
    const classifiedRows = previewRows.map((row) => {
      const riskScore = extractRiskScore(row);

      return {
        ...row,
        normalizedRiskLabel: getFrontendRiskLabel(
          riskScore,
          row.Risk_Label || row.risk_label || ''
        ),
        normalizedRiskScore: riskScore
      };
    });

    const riskCounts = classifiedRows.reduce(
      (accumulator, row) => {
        const label = row.normalizedRiskLabel;
        if (label === 'Critical Risk') accumulator.critical += 1;
        else if (label === 'High Risk') accumulator.high += 1;
        else if (label === 'Medium Risk') accumulator.medium += 1;
        else if (label === 'Low Risk') accumulator.low += 1;
        else accumulator.minimal += 1;

        accumulator.totalScore += row.normalizedRiskScore;
        return accumulator;
      },
      { critical: 0, high: 0, medium: 0, low: 0, minimal: 0, totalScore: 0 }
    );

    const averageRiskScore = totalEmployees ? riskCounts.totalScore / totalEmployees : 0;

    const distribution = [
      {
        key: 'minimal',
        label: 'Minimal',
        count: riskCounts.minimal,
        color: '#2e7d32' // Emerald Green
      },
      {
        key: 'low',
        label: 'Low',
        count: riskCounts.low,
        color: '#fbc02d' // Yellow
      },
      {
        key: 'medium',
        label: 'Medium',
        count: riskCounts.medium,
        color: '#f57c00' // Orange
      },
      {
        key: 'high',
        label: 'High',
        count: riskCounts.high,
        color: '#c62828' // Red
      },
      {
        key: 'critical',
        label: 'Critical',
        count: riskCounts.critical,
        color: '#4a148c' // Deep Purple/Wine
      }
    ].map((item) => ({
      ...item,
      percent: totalEmployees ? Math.round((item.count / totalEmployees) * 100) : 0
    }));

    const roleAccumulator = classifiedRows.reduce((accumulator, row) => {
      const role = row.JobRole || row.job_role || row.Job_Role || 'Unknown Role';
      const riskScore = row.normalizedRiskScore;

      if (!accumulator[role]) {
        accumulator[role] = {
          role,
          totalScore: 0,
          employees: 0
        };
      }

      accumulator[role].totalScore += Number.isFinite(riskScore) ? riskScore : 0;
      accumulator[role].employees += 1;

      return accumulator;
    }, {});

    const rolePalette = [chartHex.primaryDeep, chartHex.primary, chartHex.secondary, chartHex.tertiary];
    const roleInsights = Object.values(roleAccumulator)
      .map((item, index) => ({
        ...item,
        percentage: item.employees ? Math.round((item.totalScore / item.employees) * 100) : 0,
        color: rolePalette[index % rolePalette.length]
      }))
      .sort((left, right) => right.percentage - left.percentage)
      .slice(0, 4);

    const maxRolePercentage = roleInsights.reduce(
      (maximum, role) => Math.max(maximum, role.percentage),
      0
    );

    return {
      totalEmployees,
      criticalRiskCount: riskCounts.critical,
      highRiskCount: riskCounts.high,
      mediumRiskCount: riskCounts.medium,
      lowRiskCount: riskCounts.low,
      minimalRiskCount: riskCounts.minimal,
      averageRiskScore,
      distribution,
      roleInsights: roleInsights.map((role) => ({
        ...role,
        barWidth: maxRolePercentage ? Math.max((role.percentage / maxRolePercentage) * 100, 12) : 0
      }))
    };
  };

  const riskInsights = buildRiskInsights(batchResult);

  const formatTravelLabel = (value) => {
    if (!value) {
      return 'N/A';
    }

    return value.toString().replace(/_/g, ' ');
  };

  const formatBatchHistoryDate = (timestamp) => {
    if (!timestamp) {
      return 'Unknown';
    }

    const date = new Date(timestamp);
    const today = new Date();

    if (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    ) {
      return 'Today';
    }

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const buildBatchHistoryEntry = (result, fileName) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName: fileName || 'employee.csv',
    createdAt: new Date().toISOString(),
    totalEmployees: result?.total_employees || 0,
    averageRiskScore: result?.summary?.average_risk_score || 0,
    resultStatus: 'Completed',
    downloadUrl: result?.download_url || '',
    resultFile: result?.result_file || ''
  });

  const buildLiveReloadSnapshot = (source) => {
    const previewRows = Array.isArray(source?.preview) ? normalizeRiskRows(source.preview) : [];

    if (previewRows.length === 0) {
      return null;
    }

    const riskCounts = previewRows.reduce(
      (accumulator, row) => {
        const riskScore = extractRiskScore(row);
        const riskLabel = getFrontendRiskLabel(riskScore, row.Risk_Label || row.risk_label || '');

        if (riskLabel === 'Critical Risk') accumulator.critical += 1;
        else if (riskLabel === 'High Risk') accumulator.high += 1;
        else if (riskLabel === 'Medium Risk') accumulator.medium += 1;
        else if (riskLabel === 'Low Risk') accumulator.low += 1;
        else accumulator.minimal += 1;

        accumulator.totalScore += riskScore;
        return accumulator;
      },
      { critical: 0, high: 0, medium: 0, low: 0, minimal: 0, totalScore: 0 }
    );

    return {
      success: true,
      source: source === batchResult ? 'prediction' : 'preview',
      total_employees: source?.total_employees || source?.total_rows || previewRows.length,
      preview: previewRows,
      download_url: source?.download_url || '',
      summary: {
        critical_risk_count: riskCounts.critical,
        high_risk_count: riskCounts.high,
        medium_risk_count: riskCounts.medium,
        low_risk_count: riskCounts.low,
        minimal_risk_count: riskCounts.minimal,
        average_risk_score: previewRows.length ? riskCounts.totalScore / previewRows.length : 0
      }
    };
  };

  const getResultRowLabelClass = (riskLabel) => {
    switch (riskLabel) {
      case 'Critical Risk':
        return 'critical';
      case 'High Risk':
        return 'high';
      case 'Medium Risk':
        return 'medium';
      case 'Low Risk':
        return 'low';
      case 'Minimal Risk':
        return 'minimal';
      default:
        return 'neutral';
    }
  };

  const buildResultsTableRows = (source) => {
    const rows = Array.isArray(source?.preview) ? normalizeRiskRows(source.preview) : [];

    return rows.map((row, index) => {
      const riskScore = extractRiskScore(row);
      const riskLabel = getFrontendRiskLabel(riskScore, row.Risk_Label || row.risk_label || '');

      return {
        key: `${row.EmployeeID || row.EmployeeId || row.employee_id || row.EmployeeNumber || index}`,
        employeeId: row.EmployeeID || row.EmployeeId || row.employee_id || row.EmployeeNumber || row.EmpID || index + 1,
        age: row.Age || row.age || 'N/A',
        businessTravel: formatTravelLabel(row.BusinessTravel || row.business_travel || row.Business_Travel),
        jobRole: row.JobRole || row.job_role || row.Job_Role || 'N/A',
        jobLevel: row.JobLevel || row.job_level || 'N/A',
        monthlyIncome: row.MonthlyIncome || row.monthly_income || 'N/A',
        overTime: row.OverTime || row.over_time || 'N/A',
        riskScore,
        riskScoreText: `${(riskScore * 100).toFixed(0)}%`,
        riskLabel,
        riskTone: getResultRowLabelClass(riskLabel),
        topFactors: row.Top_Factors || row.top_factors || []
      };
    });
  };

  const activePreviewSource = batchResult || previewData;
  const resultsTableRows = buildResultsTableRows(activePreviewSource);

  const filteredResultsTableRows = resultsTableRows
    .filter((row) => {
      if (!resultEmployeeIdSearch.trim()) {
        return true;
      }

      return row.employeeId.toString().toLowerCase().includes(resultEmployeeIdSearch.trim().toLowerCase());
    })
    .filter((row) => (resultRiskFilter === 'All' ? true : row.riskLabel === resultRiskFilter))
    .filter((row) => (resultTravelFilter === 'All' ? true : row.businessTravel === resultTravelFilter))
    .filter((row) => {
      if (resultOvertimeFilter === 'All') {
        return true;
      }

      return row.overTime === resultOvertimeFilter;
    })
    .sort((left, right) => {
      switch (resultSortBy) {
        case 'risk-asc':
          return left.riskScore - right.riskScore;
        case 'income-desc':
          return Number(right.monthlyIncome) - Number(left.monthlyIncome);
        case 'age-desc':
          return Number(right.age) - Number(left.age);
        case 'risk-desc':
        default:
          return right.riskScore - left.riskScore;
      }
    });

  const resultsStartIndex = filteredResultsTableRows.length === 0 ? 0 : (resultPage - 1) * resultRowsPerPage;
  const paginatedResultsRows = filteredResultsTableRows.slice(
    resultsStartIndex,
    resultsStartIndex + resultRowsPerPage
  );
  const totalResultPages = Math.max(1, Math.ceil(filteredResultsTableRows.length / resultRowsPerPage));
  const visibleResultStart = filteredResultsTableRows.length === 0 ? 0 : resultsStartIndex + 1;
  const visibleResultEnd = Math.min(resultsStartIndex + resultRowsPerPage, filteredResultsTableRows.length);

  const downloadPreviewTableResults = () => {
    if (batchResult?.download_url) {
      window.open(`${API_BASE_URL}${batchResult.download_url}`, '_blank');
      return;
    }

    if (!filteredResultsTableRows.length) {
      return;
    }

    const headers = [
      'Employee ID',
      'Age',
      'BusinessTravel',
      'JobRole',
      'JobLevel',
      'MonthlyIncome',
      'OverTime',
      'Risk Score',
      'Risk Level',
      'Top Factors'
    ];

    const csvRows = filteredResultsTableRows.map((row) => [
      row.employeeId,
      row.age,
      row.businessTravel,
      row.jobRole,
      row.jobLevel,
      row.monthlyIncome,
      row.overTime,
      row.riskScoreText,
      row.riskLabel,
      (row.topFactors || []).join('; ')
    ]);

    const csvContent = [headers, ...csvRows]
      .map((columns) => columns.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'employee_attrition_preview.csv';
    link.click();
    window.URL.revokeObjectURL(objectUrl);
  };

  if (!user) {
    return (
      <div className="attrition-container feature-page-shell">
        <div className="login-message">
          <h2>Please log in to access Employee Attrition Predictor</h2>
          <p>Batch process employee CSV files to predict attrition risk</p>
        </div>
      </div>
    );
  }

  return (
    <div className="attrition-container feature-page-shell">
      <FeaturePageHero
        badgeIcon="fas fa-wave-square"
        badgeText="AI-Powered Analytics"
        titleLeading="Employee Retention"
        titleHighlight="Dashboard"
        subtitle="Analyze employee attrition signals in bulk and generate targeted retention insights using intelligent machine learning models."
        features={[
          { icon: 'fas fa-users', label: 'Bulk Processing' },
          { icon: 'fas fa-chart-line', label: 'Retention Insights' },
          { icon: 'fas fa-user-shield', label: 'Automated Analysis' }
        ]}
      />

      {/* Live Reload Bell Button */}
      <div className="live-reload-container">
        <button
          className={`live-reload-btn ${liveLoading ? 'loading' : ''} ${highRiskEmployees.length > 0 && !showLivePopup ? 'has-alerts' : ''}`}
          onClick={handleLiveReload}
          disabled={liveLoading}
          title="Refresh live risk view from current prediction data or fallback CSV"
        >
          <i className={`fas fa-bell ${liveLoading ? 'fa-ring' : ''}`}></i>
          <span className="reload-text">
            {liveLoading ? 'Loading...' : 'Reload Live'}
          </span>
          {highRiskEmployees.length > 0 && !showLivePopup && (
            <span className="notification-badge">{highRiskEmployees.length}</span>
          )}
        </button>
        {lastReloadTime && (
          <span className="last-reload">
            Last: {lastReloadTime.toLocaleTimeString()}
          </span>
        )}

        {/* Debug button - shows CSV content */}

      </div>

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

      {/* Recommendations Modal */}
      {showRecommendations && selectedEmployee && (
        <div className="recommendations-modal-overlay">
          <div className="recommendations-modal">
            <div className="modal-header">
              <h3>
                <i className="fas fa-hand-holding-heart"></i>
                Retention Recommendations for {selectedEmployee.Name || selectedEmployee.name}
              </h3>
              <button className="close-btn" onClick={() => setShowRecommendations(false)}>×</button>
            </div>

            <div className="modal-content">
              <div className="employee-summary">
                <div className="summary-card">
                  <div className="summary-row">
                    <span className="label">Risk Score:</span>
                    <span className="value" style={{
                      color: getRiskScoreColor(parseFloat(selectedEmployee.Risk_Score || selectedEmployee.risk_score || 0)),
                      fontWeight: 'bold'
                    }}>
                      {((parseFloat(selectedEmployee.Risk_Score || selectedEmployee.risk_score || 0)) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Job Role:</span>
                    <span className="value">{selectedEmployee.JobRole || selectedEmployee.job_role || 'N/A'}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Job Level:</span>
                    <span className="value">{selectedEmployee.JobLevel || selectedEmployee.job_level || 'N/A'}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Age:</span>
                    <span className="value">{selectedEmployee.Age || selectedEmployee.age || 'N/A'}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Overtime:</span>
                    <span className="value">{selectedEmployee.OverTime || selectedEmployee.over_time || 'N/A'}</span>
                  </div>
                </div>
                {selectedEmployee.Top_Factors && selectedEmployee.Top_Factors.length > 0 && (
                  <div style={{ marginTop: '16px', background: '#fef2f2', padding: '12px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fas fa-exclamation-triangle"></i>
                      Top Risk Factors
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {selectedEmployee.Top_Factors.map((factor, idx) => (
                        <span key={idx} style={{ 
                          fontSize: '0.8rem', 
                          fontWeight: '600',
                          color: '#b91c1c', 
                          background: 'white',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          border: '1px solid #fee2e2'
                        }}>
                          {factor}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="recommendations-list">
                {selectedEmployee.recommendations && selectedEmployee.recommendations.map((rec, idx) => (
                  <div key={idx} className={`recommendation-card priority-${rec.priority.toLowerCase()}`}>
                    <div className="recommendation-header">
                      <span className="priority-icon">{rec.icon}</span>
                      <span className="priority-badge">{rec.priority} Priority</span>
                      <span className="category">{rec.category}</span>
                    </div>
                    <ul className="suggestions-list">
                      {rec.suggestions.map((suggestion, sIdx) => (
                        <li key={sIdx}>
                          <i className="fas fa-check-circle"></i>
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="retention-tips">
                <h4>💡 Quick Retention Tips</h4>
                <div className="tips-grid">
                  <div className="tip-item">
                    <i className="fas fa-comments"></i>
                    <span>Regular check-ins</span>
                  </div>
                  <div className="tip-item">
                    <i className="fas fa-trophy"></i>
                    <span>Recognition programs</span>
                  </div>
                  <div className="tip-item">
                    <i className="fas fa-chart-line"></i>
                    <span>Career progression</span>
                  </div>
                  <div className="tip-item">
                    <i className="fas fa-balance-scale"></i>
                    <span>Work-life balance</span>
                  </div>
                  <div className="tip-item">
                    <i className="fas fa-graduation-cap"></i>
                    <span>Learning opportunities</span>
                  </div>
                  <div className="tip-item">
                    <i className="fas fa-heart"></i>
                    <span>Wellness programs</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="download-pdf-btn" onClick={() => {
                // Here you could implement PDF download
                alert('Download recommendations as PDF - feature coming soon!');
              }}>
                <i className="fas fa-file-pdf"></i>
                Download Recommendations
              </button>
              <button className="close-btn" onClick={() => setShowRecommendations(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Reload Popup */}
      {showLivePopup && liveData && (
        <div className="live-popup-overlay">
          <div className="live-popup">
            <div className="popup-header">
              <div className="popup-header-copy">
                <div className="popup-header-badge">
                  <i className="fas fa-bell"></i>
                  Live Monitoring
                </div>
                <h3>Live Reload Results</h3>
                <p>Latest retention screening pulled from the active prediction data when available, with employee.csv used only as a fallback.</p>
              </div>
              <button
                type="button"
                className="close-btn live-popup-header-close"
                aria-label="Close live reload results"
                onClick={() => setShowLivePopup(false)}
              >
                <i className="fas fa-times" aria-hidden="true"></i>
              </button>
            </div>

            <div className="popup-content">
              <div className="popup-summary-cards">
                <div className="popup-summary-card neutral">
                  <span className="popup-card-label">Total Employees</span>
                  <span className="popup-card-value">{liveData.total_employees || 0}</span>
                </div>
                <div className="popup-summary-card critical">
                  <span className="popup-card-label">Critical</span>
                  <span className="popup-card-value">{liveData.summary?.critical_risk_count || 0}</span>
                </div>
                <div className="popup-summary-card high">
                  <span className="popup-card-label">High</span>
                  <span className="popup-card-value">{highRiskEmployees.length}</span>
                </div>
                <div className="popup-summary-card medium">
                  <span className="popup-card-label">Medium</span>
                  <span className="popup-card-value">{liveData.summary?.medium_risk_count || 0}</span>
                </div>
                <div className="popup-summary-card low">
                  <span className="popup-card-label">Low</span>
                  <span className="popup-card-value">{liveData.summary?.low_risk_count || 0}</span>
                </div>
                <div className="popup-summary-card minimal">
                  <span className="popup-card-label">Minimal</span>
                  <span className="popup-card-value">{liveData.summary?.minimal_risk_count || 0}</span>
                </div>
                <div className="popup-summary-card average">
                  <span className="popup-card-label">Avg. Risk</span>
                  <span className="popup-card-value">
                    {liveData.summary?.average_risk_score
                      ? (liveData.summary.average_risk_score * 100).toFixed(1) + '%'
                      : '0%'}
                  </span>
                </div>
                <div className="popup-summary-card time">
                  <span className="popup-card-label">Last Reload</span>
                  <span className="popup-card-value small">{lastReloadTime ? lastReloadTime.toLocaleTimeString() : 'Just now'}</span>
                </div>
              </div>

              {/* High Risk Employees Section */}
              <div className="high-risk-section">
                <div className="high-risk-header">
                  <div>
                    <h4>
                      <i className="fas fa-exclamation-triangle"></i>
                      Priority Intervention List
                    </h4>
                    <p>Employees currently flagged as high or critical risk in the live reload snapshot.</p>
                  </div>
                  <span className="high-risk-count">{highRiskEmployees.length}</span>
                </div>

                {highRiskEmployees.length > 0 ? (
                  <div className="high-risk-table">
                    <table>
                      <colgroup>
                        <col className="high-risk-col-name" />
                        <col className="high-risk-col-role" />
                        <col className="high-risk-col-score" />
                        <col className="high-risk-col-label" />
                        <col className="high-risk-col-action" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Job Role</th>
                          <th>Risk Score</th>
                          <th>Risk Label</th>
                          <th>Recommended Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {highRiskEmployees.map((emp, idx) => (
                          <tr key={idx}>
                            <td>{emp.Name || emp.name || `Employee ${idx + 1}`}</td>
                            <td>{emp.JobRole || emp.job_role || emp.Job_Role || 'N/A'}</td>
                            <td style={{
                              color: getRiskScoreColor(extractRiskScore(emp)),
                              fontWeight: 'bold'
                            }}>
                              {(extractRiskScore(emp) * 100).toFixed(1)}%
                            </td>
                            <td>
                              <span className={`risk-badge ${getFrontendRiskLabel(extractRiskScore(emp), emp.Risk_Label || emp.risk_label || '').toLowerCase().replace(' ', '-')}`}>
                                {getFrontendRiskLabel(extractRiskScore(emp), emp.Risk_Label || emp.risk_label || 'Unknown')}
                              </span>
                            </td>

                            <td>
                              <div className="quick-recommend-pills">
                                {generateQuickRecommendations(emp).slice(0, 2).map((rec, i) => (
                                  <span key={i} className="quick-recommend-pill">{rec}</span>
                                ))}
                              </div>
                            </td>



                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="no-risk-state">
                    <i className="fas fa-check-circle"></i>
                    <p>No employees in the current live reload are flagged as high risk.</p>
                  </div>
                )}
              </div>

              {/* Quick Stats */}
              <div className="popup-stats">
                <div className="stat-box">
                  <span className="stat-label">High Risk</span>
                  <span className="stat-value" style={{ color: semanticCss.danger }}>
                    {liveData.summary?.high_risk_count || 0}
                  </span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Medium Risk</span>
                  <span className="stat-value" style={{ color: semanticCss.warning }}>
                    {liveData.summary?.medium_risk_count || 0}
                  </span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Low Risk</span>
                  <span className="stat-value" style={{ color: semanticCss.success }}>
                    {liveData.summary?.low_risk_count || 0}
                  </span>
                </div>
              </div>
            </div>

            <div className="popup-footer">
              <button
                className="download-btn small live-popup-download"
                onClick={() => window.open(`${API_BASE_URL}${liveData.download_url}`, '_blank')}
              >
                <i className="fas fa-download"></i>
                Download Full Results
              </button>
              <button className="close-btn live-popup-close" onClick={() => setShowLivePopup(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="productivity-input-switcher attrition-input-switcher" aria-label="Choose attrition input method">
        <div className="productivity-input-switcher-header">
          <div>
            <h3>Choose Input Method</h3>
            <p>Switch between bulk CSV screening and a single employee risk check to keep the page focused.</p>
          </div>
          <div className="productivity-input-toggle" role="tablist" aria-label="Attrition input methods">
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'bulk'}
              className={`productivity-input-toggle-btn ${inputMode === 'bulk' ? 'active' : ''}`}
              onClick={() => setInputMode('bulk')}
            >
              <i className="fas fa-cloud-upload-alt"></i>
              <span>Bulk Upload</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'single'}
              className={`productivity-input-toggle-btn ${inputMode === 'single' ? 'active' : ''}`}
              onClick={() => setInputMode('single')}
            >
              <i className="fas fa-user-check"></i>
              <span>One Employee Input</span>
            </button>
          </div>
        </div>

        <div className="productivity-input-panel" key={inputMode}>
          {inputMode === 'single' ? (
            <div className="single-predictor-section productivity-input-content">
              <div className="single-predictor-card">
                <div className="single-predictor-header">
                  <div>
                    <div className="single-predictor-badge">
                      <i className="fas fa-user-check"></i>
                      Individual Employee Risk Predictor
                    </div>
                    <h3>Check Attrition Risk For One Employee</h3>
                    <p>
                      Select the employee attributes below to calculate an individual attrition risk score without uploading a CSV.
                    </p>
                  </div>
                </div>

                <form className="single-predictor-form" onSubmit={handleSingleEmployeePrediction}>
                  <label className="single-field">
                    <span>Age</span>
                    <input
                      type="number"
                      min="18"
                      max="60"
                      value={singleEmployeeForm.Age}
                      onChange={(event) => handleSingleEmployeeFieldChange('Age', event.target.value)}
                      placeholder="Enter age"
                    />
                    {singlePredictionErrors.Age && <small>{singlePredictionErrors.Age}</small>}
                  </label>

                  <label className="single-field">
                    <span>Monthly Income</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={singleEmployeeForm.MonthlyIncome}
                      onChange={(event) => handleSingleEmployeeFieldChange('MonthlyIncome', event.target.value)}
                      placeholder="Enter monthly income"
                    />
                    {singlePredictionErrors.MonthlyIncome && <small>{singlePredictionErrors.MonthlyIncome}</small>}
                  </label>

                  <label className="single-field">
                    <span>Job Role</span>
                    <select
                      value={singleEmployeeForm.JobRole}
                      onChange={(event) => handleSingleEmployeeFieldChange('JobRole', event.target.value)}
                    >
                      <option value="">Select role</option>
                      {SINGLE_EMPLOYEE_JOB_ROLE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    {singlePredictionErrors.JobRole && <small>{singlePredictionErrors.JobRole}</small>}
                  </label>

                  <label className="single-field">
                    <span>Job Level</span>
                    <select
                      value={singleEmployeeForm.JobLevel}
                      onChange={(event) => handleSingleEmployeeFieldChange('JobLevel', event.target.value)}
                    >
                      <option value="">Select job level</option>
                      {SINGLE_EMPLOYEE_JOB_LEVEL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    {singlePredictionErrors.JobLevel && <small>{singlePredictionErrors.JobLevel}</small>}
                  </label>

                  <label className="single-field">
                    <span>Business Travel</span>
                    <select
                      value={singleEmployeeForm.BusinessTravel}
                      onChange={(event) => handleSingleEmployeeFieldChange('BusinessTravel', event.target.value)}
                    >
                      <option value="">Select travel</option>
                      {SINGLE_EMPLOYEE_BUSINESS_TRAVEL_OPTIONS.map((option) => (
                        <option key={option} value={option}>{formatTravelLabel(option)}</option>
                      ))}
                    </select>
                    {singlePredictionErrors.BusinessTravel && <small>{singlePredictionErrors.BusinessTravel}</small>}
                  </label>

                  <label className="single-field">
                    <span>OverTime</span>
                    <select
                      value={singleEmployeeForm.OverTime}
                      onChange={(evt) => handleSingleEmployeeFieldChange('OverTime', evt.target.value)}
                    >
                      <option value="">Select choice</option>
                      {SINGLE_EMPLOYEE_OVERTIME_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {singlePredictionErrors.OverTime && <small>{singlePredictionErrors.OverTime}</small>}
                  </label>

                  <label className="single-field">
                    <span>Department</span>
                    <select
                      value={singleEmployeeForm.Department}
                      onChange={(evt) => handleSingleEmployeeFieldChange('Department', evt.target.value)}
                    >
                      <option value="">Select department</option>
                      {SINGLE_EMPLOYEE_DEPARTMENT_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {singlePredictionErrors.Department && <small>{singlePredictionErrors.Department}</small>}
                  </label>

                  <label className="single-field">
                    <span>Marital Status</span>
                    <select
                      value={singleEmployeeForm.MaritalStatus}
                      onChange={(evt) => handleSingleEmployeeFieldChange('MaritalStatus', evt.target.value)}
                    >
                      <option value="">Select status</option>
                      {SINGLE_EMPLOYEE_MARITAL_STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {singlePredictionErrors.MaritalStatus && <small>{singlePredictionErrors.MaritalStatus}</small>}
                  </label>

                  <div className="form-divider" style={{ gridColumn: '1 / -1', margin: '14px 0', borderBottom: '1px solid #eee' }}></div>
                  <h4 style={{ gridColumn: '1 / -1', fontSize: '1rem', color: '#4b5878', marginBottom: '8px' }}>
                    Critical Engagement Factors (1-4 Rating)
                  </h4>

                  <label className="single-field">
                    <span>Job Satisfaction</span>
                    <select
                      value={singleEmployeeForm.JobSatisfaction}
                      onChange={(evt) => handleSingleEmployeeFieldChange('JobSatisfaction', evt.target.value)}
                    >
                      {RATING_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="single-field">
                    <span>Work-Life Balance</span>
                    <select
                      value={singleEmployeeForm.WorkLifeBalance}
                      onChange={(evt) => handleSingleEmployeeFieldChange('WorkLifeBalance', evt.target.value)}
                    >
                      {RATING_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="single-field">
                    <span>Environment Satisfaction</span>
                    <select
                      value={singleEmployeeForm.EnvironmentSatisfaction}
                      onChange={(evt) => handleSingleEmployeeFieldChange('EnvironmentSatisfaction', evt.target.value)}
                    >
                      {RATING_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="single-field">
                    <span>Stock Option Level</span>
                    <select
                      value={singleEmployeeForm.StockOptionLevel}
                      onChange={(evt) => handleSingleEmployeeFieldChange('StockOptionLevel', evt.target.value)}
                    >
                      {STOCK_OPTION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="single-field">
                    <span>Years At Company</span>
                    <input
                      type="number"
                      min="0"
                      max="40"
                      value={singleEmployeeForm.YearsAtCompany}
                      onChange={(evt) => handleSingleEmployeeFieldChange('YearsAtCompany', evt.target.value)}
                    />
                  </label>

                  <label className="single-field">
                    <span>Distance From Home (km)</span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={singleEmployeeForm.DistanceFromHome}
                      onChange={(evt) => handleSingleEmployeeFieldChange('DistanceFromHome', evt.target.value)}
                    />
                  </label>

                  <div className="form-divider" style={{ gridColumn: '1 / -1', margin: '14px 0', borderBottom: '1px solid #eee' }}></div>
                  <h4 style={{ gridColumn: '1 / -1', fontSize: '1rem', color: '#4b5878', marginBottom: '8px' }}>
                    Career Progression & Performance
                  </h4>

                  <label className="single-field">
                    <span>Years Since Last Promotion</span>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={singleEmployeeForm.YearsSinceLastPromotion}
                      onChange={(evt) => handleSingleEmployeeFieldChange('YearsSinceLastPromotion', evt.target.value)}
                    />
                  </label>

                  <label className="single-field">
                    <span>Years With Current Manager</span>
                    <input
                      type="number"
                      min="0"
                      max="40"
                      value={singleEmployeeForm.YearsWithCurrManager}
                      onChange={(evt) => handleSingleEmployeeFieldChange('YearsWithCurrManager', evt.target.value)}
                    />
                  </label>

                  <label className="single-field">
                    <span>Performance Rating</span>
                    <select
                      value={singleEmployeeForm.PerformanceRating}
                      onChange={(evt) => handleSingleEmployeeFieldChange('PerformanceRating', evt.target.value)}
                    >
                      <option value="1">1 - Needs Development</option>
                      <option value="2">2 - Developing</option>
                      <option value="3">3 - Proficient</option>
                      <option value="4">4 - Outstanding</option>
                    </select>
                  </label>

                  <label className="single-field">
                    <span>Job Involvement</span>
                    <select
                      value={singleEmployeeForm.JobInvolvement}
                      onChange={(evt) => handleSingleEmployeeFieldChange('JobInvolvement', evt.target.value)}
                    >
                      <option value="1">1 - Low</option>
                      <option value="2">2 - Medium</option>
                      <option value="3">3 - High</option>
                      <option value="4">4 - Very High</option>
                    </select>
                  </label>

                  <label className="single-field">
                    <span>% Salary Hike</span>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={singleEmployeeForm.PercentSalaryHike}
                      onChange={(evt) => handleSingleEmployeeFieldChange('PercentSalaryHike', evt.target.value)}
                    />
                  </label>

                  <label className="single-field">
                    <span>Num Companies Worked</span>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={singleEmployeeForm.NumCompaniesWorked}
                      onChange={(evt) => handleSingleEmployeeFieldChange('NumCompaniesWorked', evt.target.value)}
                    />
                  </label>

                  <div className="form-actions" style={{ gridColumn: '1 / -1', display: 'flex', gap: '12px', marginTop: '12px' }}>
                    <button
                      type="submit"
                      disabled={singlePredictionLoading}
                      className="calculate-btn attrition-upload-btn attrition-upload-btn-primary"
                      style={{ flex: 2 }}
                    >
                      <i className={`fas ${singlePredictionLoading ? 'fa-spinner fa-spin' : 'fa-magic'}`}></i>
                      {singlePredictionLoading ? 'Calculating...' : 'Calculate Individual Risk'}
                    </button>
                    <button
                      type="button"
                      className="clear-btn attrition-upload-btn attrition-upload-btn-secondary"
                      style={{ flex: 1 }}
                      onClick={() => setSingleEmployeeForm({
                        Age: '', MonthlyIncome: '', JobRole: '', JobLevel: '', BusinessTravel: '', OverTime: '',
                        JobSatisfaction: '3', WorkLifeBalance: '3', EnvironmentSatisfaction: '3', RelationshipSatisfaction: '3',
                        YearsAtCompany: '2', YearsSinceLastPromotion: '0', YearsWithCurrManager: '2', YearsInCurrentRole: '2',
                        TotalWorkingYears: '5', PercentSalaryHike: '12', JobInvolvement: '3', PerformanceRating: '3',
                        StockOptionLevel: '1', DistanceFromHome: '5', NumCompaniesWorked: '1', Department: '', MaritalStatus: ''
                      })}
                    >
                      <i className="fas fa-redo"></i>
                      Clear
                    </button>
                  </div>

                  <div className="single-predictor-actions">
                    {singlePredictionErrors.form && (
                      <div className="single-predictor-error">
                        <i className="fas fa-exclamation-circle"></i>
                        <span>{singlePredictionErrors.form}</span>
                      </div>
                    )}
                  </div>
                </form>

                {singlePredictionResult && (
                  <div className="single-result-card">
                    <div className="single-result-summary">
                      <div className={`single-result-score ${getResultRowLabelClass(singlePredictionResult.risk_label)}`}>
                        <span className="single-result-label">Risk Score</span>
                        <strong>{formatScorePercent(singlePredictionResult.risk_score)}</strong>
                      </div>
                      <div className="single-result-meta">
                        <span className={`table-pill risk ${getResultRowLabelClass(singlePredictionResult.risk_label)}`}>
                          {singlePredictionResult.risk_label}
                        </span>
                        <p>
                          {singlePredictionResult.risk_score >= 0.70
                            ? 'CRITICAL: Immediate retention intervention required.'
                            : singlePredictionResult.risk_score >= 0.45
                              ? 'HIGH: This employee needs prioritized retention attention.'
                              : singlePredictionResult.risk_score >= 0.25
                                ? 'MEDIUM: Monitor closely with proactive engagement.'
                                : singlePredictionResult.risk_score >= 0.10
                                  ? 'LOW: Regular engagement and check-ins recommended.'
                                  : 'MINIMAL: This employee shows a stable attrition risk profile.'}
                        </p>
                      </div>
                    </div>

                    {singlePredictionResult.top_factors && singlePredictionResult.top_factors.length > 0 && (
                      <div className="single-result-factors" style={{ marginTop: '16px', borderTop: '1px solid #eee', paddingTop: '12px' }}>
                        <h4 style={{ fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>Core Risk Factors</h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {singlePredictionResult.top_factors.map((factor, idx) => (
                            <span key={idx} style={{ 
                              background: '#fef2f2', 
                              color: '#991b1b', 
                              padding: '4px 10px', 
                              borderRadius: '12px', 
                              fontSize: '0.8rem',
                              border: '1px solid #fecaca',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              <i className="fas fa-exclamation-triangle" style={{ fontSize: '0.7rem' }}></i>
                              {factor}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="single-result-recommendations">
                      <h4>Recommended Next Steps</h4>
                      <div className="single-result-pills">
                        {singlePredictionResult.recommendations.slice(0, 5).map((recommendation, index) => (
                          <span key={`${recommendation.category}-${index}`} className="single-result-pill">
                            {recommendation.category}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="batch-processing-section productivity-input-content">
              <div className="batch-upload-card">
                <div className="batch-upload-content">
                  <div className="upload-icon attrition-upload-icon">
                    <i className="fas fa-cloud-upload-alt"></i>
                  </div>
                  <h3>Employee CSV File</h3>
                  <p className="upload-description">
                    Upload a CSV file with the required employee attrition fields.
                  </p>
                  <p className="required-columns">
                    <strong>Required:</strong> Age, BusinessTravel, JobRole, JobLevel, MonthlyIncome, OverTime
                  </p>

                  <div className="attrition-upload-select-row">
                    <label className="file-upload-label large attrition-upload-btn attrition-upload-btn-select">
                      <i className="fas fa-cloud-upload-alt"></i>
                      {csvFileName ? 'Change CSV File' : 'Select CSV File'}
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleCsvFileChange}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>

                  {csvFileName && (
                    <div className="selected-file">
                      <i className="fas fa-check-circle"></i>
                      <span>{csvFileName}</span>
                    </div>
                  )}

                  <div className="batch-actions attrition-upload-actions">
                    <button
                      className="preview-btn attrition-upload-btn attrition-upload-btn-secondary"
                      onClick={handlePreview}
                      disabled={loading || !csvFile}
                    >
                      <i className="fas fa-eye"></i>
                      Preview Data
                    </button>

                    <button
                      className="predict-btn attrition-upload-btn attrition-upload-btn-primary"
                      onClick={handleBatchPredict}
                      disabled={loading || !csvFile}
                    >
                      {loading ? (
                        <>
                          <i className="fas fa-spinner fa-spin"></i>
                          Processing...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-bolt"></i>
                          Run Prediction
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {resultsTableRows.length > 0 && (
                <div className="preview-section">
                  <div className="results-table-card preview-results-card">
                    <div className="results-table-header">
                      <h4>
                        <i className="fas fa-table"></i>
                        Data Preview
                      </h4>
                      <p>
                        Showing {Math.min(resultsTableRows.length, activePreviewSource?.preview_rows || resultsTableRows.length)} preview rows
                        {activePreviewSource?.total_rows ? ` from ${activePreviewSource.total_rows} uploaded records` : ''}
                        {!activePreviewSource?.total_rows && activePreviewSource?.total_employees ? ` from ${activePreviewSource.total_employees} predicted employees` : ''}
                      </p>
                    </div>

                    <div className="results-toolbar">
                      <label className="results-searchbar" aria-label="Search employee">
                        <i className="fas fa-search"></i>
                        <input
                          type="text"
                          value={resultEmployeeIdSearch}
                          onChange={(e) => {
                            setResultEmployeeIdSearch(e.target.value);
                            setResultPage(1);
                          }}
                          placeholder="Search an employee"
                        />
                      </label>

                      <div className="results-toolbar-actions">
                        <label className="results-inline-select">
                          <span>Filter by</span>
                          <select value={resultRiskFilter} onChange={(e) => {
                            setResultRiskFilter(e.target.value);
                            setResultPage(1);
                          }}>
                            <option value="All">All risk levels</option>
                            <option value="Minimal Risk">Minimal Risk</option>
                            <option value="Low Risk">Low Risk</option>
                            <option value="Medium Risk">Medium Risk</option>
                            <option value="High Risk">High Risk</option>
                            <option value="Critical Risk">Critical Risk</option>
                          </select>
                        </label>

                        <label className="results-inline-select">
                          <span>Sort by</span>
                          <select value={resultSortBy} onChange={(e) => {
                            setResultSortBy(e.target.value);
                            setResultPage(1);
                          }}>
                            <option value="risk-desc">Risk High-Low</option>
                            <option value="risk-asc">Risk Low-High</option>
                            <option value="income-desc">Income High-Low</option>
                            <option value="age-desc">Age High-Low</option>
                          </select>
                        </label>

                        <button
                          type="button"
                          className="results-toolbar-download"
                          onClick={downloadPreviewTableResults}
                          title="Download results"
                          aria-label="Download results"
                          disabled={!batchResult?.download_url && !filteredResultsTableRows.length}
                        >
                          <i className="fas fa-download"></i>
                        </button>
                      </div>
                    </div>

                    <div className="results-table-shell">
                      <table className="results-table-grid">
                        <thead>
                          <tr>
                            <th>Employee ID</th>
                            <th>Age</th>
                            <th>BusinessTravel</th>
                            <th>JobRole</th>
                            <th>JobLevel</th>
                            <th>MonthlyIncome</th>
                            <th>OverTime</th>
                            <th>Risk Score</th>
                            <th>Risk Level</th>
                            <th>Risk Factors</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedResultsRows.map((row) => (
                            <tr key={row.key}>
                              <td>{row.employeeId}</td>
                              <td>{row.age}</td>
                              <td>{row.businessTravel}</td>
                              <td>{row.jobRole}</td>
                              <td>{row.jobLevel}</td>
                              <td>{row.monthlyIncome}</td>
                              <td>
                                <span className={`table-pill overtime ${row.overTime === 'Yes' ? 'yes' : 'no'}`}>
                                  {row.overTime}
                                </span>
                              </td>
                              <td>
                                <span className={`table-pill score ${row.riskTone}`}>
                                  {row.riskScoreText}
                                </span>
                              </td>
                              <td>
                                <span className={`table-pill risk ${row.riskTone}`}>
                                  {row.riskLabel}
                                </span>
                              </td>
                              <td style={{ minWidth: '180px' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                  {(row.topFactors || []).map((factor, fIdx) => (
                                    <span key={fIdx} style={{ 
                                      fontSize: '0.65rem', 
                                      background: '#fef2f2', 
                                      color: '#991b1b', 
                                      padding: '2px 6px', 
                                      borderRadius: '8px',
                                      border: '1px solid #fecaca',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      {factor}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="results-table-footer">
                      <div className="results-page-info">
                        {visibleResultStart} - {visibleResultEnd} of {filteredResultsTableRows.length}
                      </div>

                      <div className="results-pager">
                        <button
                          type="button"
                          onClick={() => setResultPage(1)}
                          disabled={resultPage === 1}
                        >
                          <i className="fas fa-angle-double-left"></i>
                        </button>
                        <button
                          type="button"
                          onClick={() => setResultPage((current) => Math.max(1, current - 1))}
                          disabled={resultPage === 1}
                        >
                          <i className="fas fa-angle-left"></i>
                        </button>
                        <span className="current-page-chip">{resultPage}</span>
                        <button
                          type="button"
                          onClick={() => setResultPage((current) => Math.min(totalResultPages, current + 1))}
                          disabled={resultPage === totalResultPages}
                        >
                          <i className="fas fa-angle-right"></i>
                        </button>
                        <button
                          type="button"
                          onClick={() => setResultPage(totalResultPages)}
                          disabled={resultPage === totalResultPages}
                        >
                          <i className="fas fa-angle-double-right"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Batch Results */}
      {batchResult && (
        <div className="batch-results">
          <div className="batch-results-header">
            <div>
              <h3>
                <i className="fas fa-chart-pie"></i>
                Attrition Insights Dashboard
              </h3>
              <p>Risk insights generated from the preview table rows shown in the prediction result.</p>
            </div>
            <button
              type="button"
              className="clear-saved-results-btn"
              onClick={clearStoredPredictionResult}
            >
              <i className="fas fa-trash-alt"></i>
              Clear Saved Results
            </button>
          </div>

          {riskInsights && (
            <div className="risk-insights-panel">
              <div className="risk-insights-title">
                <h4>
                  <i className="fas fa-clipboard-list"></i>
                  Risk Insights
                </h4>
              </div>

              <div className="risk-insights-metrics">
                <div className="insight-metric-card neutral">
                  <span className="metric-value">{riskInsights.totalEmployees}</span>
                  <span className="metric-label">Total Employees</span>
                </div>
                <div className="insight-metric-card critical">
                  <span className="metric-value">{riskInsights.criticalRiskCount}</span>
                  <span className="metric-label">Critical Risk</span>
                </div>
                <div className="insight-metric-card high">
                  <span className="metric-value">{riskInsights.highRiskCount}</span>
                  <span className="metric-label">High Risk</span>
                </div>
                <div className="insight-metric-card medium">
                  <span className="metric-value">{riskInsights.mediumRiskCount}</span>
                  <span className="metric-label">Medium Risk</span>
                </div>
                <div className="insight-metric-card low">
                  <span className="metric-value">{riskInsights.lowRiskCount}</span>
                  <span className="metric-label">Low Risk</span>
                </div>
                <div className="insight-metric-card minimal">
                  <span className="metric-value">{riskInsights.minimalRiskCount}</span>
                  <span className="metric-label">Minimal Risk</span>
                </div>
                <div className="insight-metric-card average">
                  <span className="metric-value">{formatScorePercent(riskInsights.averageRiskScore)}</span>
                  <span className="metric-label">Average Risk</span>
                </div>
              </div>

              <div className="risk-insights-grid">
                <div className="risk-insight-block">
                  <h5>Attrition Risk Distribution</h5>
                  <div className="distribution-chart">
                    {riskInsights.distribution.map((item) => (
                      <div key={item.key} className="distribution-row">
                        <span className="distribution-percent">{item.percent}%</span>
                        <div className="distribution-track">
                          <div
                            className="distribution-fill"
                            style={{
                              width: `${Math.max(item.percent, item.count > 0 ? 8 : 0)}%`,
                              background: item.color
                            }}
                            title={`${item.label} risk: ${item.count} employees (${item.percent}%)`}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="distribution-legend">
                    {riskInsights.distribution.map((item) => (
                      <span key={item.key} className="legend-item">
                        <span className="legend-dot" style={{ background: item.color }}></span>
                        {item.label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="risk-insight-block">
                  <h5>Risk by Job Role</h5>
                  {riskInsights.roleInsights.length > 0 ? (
                    <div className="role-risk-list">
                      {riskInsights.roleInsights.map((role) => (
                        <div key={role.role} className="role-risk-row">
                          <span className="role-name">{role.role}</span>
                          <div className="role-progress-track">
                            <div
                              className="role-progress-fill"
                              style={{
                                width: `${role.barWidth}%`,
                                background: role.color
                              }}
                              title={`${role.role}: ${role.percentage}% average risk`}
                            ></div>
                          </div>
                          <span className="role-percent">{role.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="role-insight-empty">Run prediction on a CSV with job roles to populate this chart.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {batchHistory.length > 0 && (
            <div className="batch-history-card">
              <div className="batch-history-header">
                <div>
                  <h4>
                    <i className="fas fa-history"></i>
                    Batch History
                  </h4>
                  <p>Stored prediction files with downloadable result snapshots.</p>
                </div>
              </div>

              <div className="batch-history-table-shell">
                <table className="batch-history-table">
                  <thead>
                    <tr>
                      <th>File Name</th>
                      <th>Date</th>
                      <th>Total Employees</th>
                      <th>Avg. Risk</th>
                      <th>Result Status</th>
                      <th>Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchHistory.map((item) => (
                      <tr key={item.id}>
                        <td>{item.fileName}</td>
                        <td>{formatBatchHistoryDate(item.createdAt)}</td>
                        <td>{item.totalEmployees}</td>
                        <td>
                          <span className={`history-risk-badge ${item.averageRiskScore > 0.2 ? 'high' : item.averageRiskScore > 0.1 ? 'medium' : 'low'}`}>
                            {formatScorePercent(item.averageRiskScore)}
                          </span>
                        </td>
                        <td>
                          <span className="history-status-pill completed">
                            <i className="fas fa-check-circle"></i>
                            {item.resultStatus}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="history-download-btn"
                            onClick={() => item.downloadUrl && window.open(`${API_BASE_URL}${item.downloadUrl}`, '_blank')}
                            disabled={!item.downloadUrl}
                            title="Download stored batch result"
                          >
                            <i className="fas fa-download"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* High Risk Employees */}
          {batchResult.high_risk_employees && batchResult.high_risk_employees.length > 0 && (
            <div className="high-risk-employees">
              <h4>⚠️ Top High Risk Employees</h4>
              <div className="risk-list">
                {batchResult.high_risk_employees.map((employee, idx) => (
                  <div key={idx} className="risk-item">
                    <span className="rank">#{idx + 1}</span>
                    <span className="name">{employee.name}</span>
                    <span className="role">{employee.job_role}</span>
                    <span className="score" style={{ color: semanticCss.danger, fontWeight: 'bold' }}>
                      Risk: {(employee.risk_score * 100).toFixed(1)}%
                    </span>
                    <button
                      className="small-recommend-btn"
                      onClick={() => handleViewRecommendations(employee)}
                      title="View retention recommendations"
                    >
                      <i className="fas fa-hand-holding-heart"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="download-btn" onClick={downloadResults}>
            <i className="fas fa-download"></i>
            Download Full Results CSV
          </button>
        </div>
      )}

      {/* Additional Styles for Recommendations */}
      <style jsx>{`
        .predictor-hero {
          position: relative;
          overflow: hidden;
          margin: 24px 0 22px;
          padding: 26px 36px 22px;
          border-radius: 26px;
          background:
            radial-gradient(circle at 12% 20%, rgba(126, 111, 255, 0.18), transparent 22%),
            radial-gradient(circle at 88% 18%, rgba(52, 117, 255, 0.18), transparent 24%),
            linear-gradient(135deg, #1b2347 0%, #222b57 48%, #17396b 100%);
          box-shadow: 0 18px 45px rgba(14, 25, 63, 0.28);
        }

        .predictor-hero::before,
        .predictor-hero::after {
          content: '';
          position: absolute;
          border-radius: 999px;
          pointer-events: none;
        }

        .predictor-hero::before {
          top: -42px;
          left: -18px;
          width: 120px;
          height: 120px;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.12) 0%, transparent 70%);
        }

        .predictor-hero::after {
          right: -54px;
          bottom: -58px;
          width: 180px;
          height: 180px;
          background: radial-gradient(circle, rgba(98, 169, 255, 0.16) 0%, transparent 72%);
        }

        .hero-content-centered {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 920px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 12px;
        }

        .hero-text {
          width: 100%;
          max-width: 760px;
          margin: 0 auto;
        }

        .hero-badge-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 14px;
          border: 1px solid rgba(179, 190, 255, 0.16);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          color: #d7defd;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .hero-badge-pill i {
          color: #9fb5ff;
        }

        .hero-text h1 {
          margin: 0;
          color: #ffffff;
          font-size: clamp(2rem, 4vw, 3.25rem);
          line-height: 1.02;
          font-weight: 800;
          letter-spacing: -0.03em;
        }

        .hero-text h1 span {
          background: linear-gradient(135deg, #8b82ff 0%, #66a8ff 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero-text p {
          max-width: 760px;
          margin: 8px auto 0;
          color: rgba(231, 236, 255, 0.82);
          font-size: 0.98rem;
          line-height: 1.55;
        }

        .hero-stats-pills {
          display: flex;
          width: 100%;
          max-width: 860px;
          margin: 2px auto 0;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .hero-stat {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          min-width: 190px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(205, 213, 255, 0.12);
          color: #f4f7ff;
          font-size: 0.95rem;
          font-weight: 600;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
          justify-content: center;
        }

        .hero-stat i {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(138, 128, 255, 0.95), rgba(87, 158, 255, 0.95));
          color: #ffffff;
          font-size: 13px;
          box-shadow: 0 8px 18px rgba(72, 113, 255, 0.28);
        }

        .single-predictor-section {
          margin: 0 auto 28px;
        }

        .single-predictor-card {
          padding: 24px;
          border-radius: 22px;
          background: linear-gradient(180deg, #fbfbfe 0%, #f4f5fb 100%);
          border: 1px solid #e6e9f3;
          box-shadow: 0 14px 32px rgba(73, 87, 133, 0.08);
        }

        .single-predictor-header {
          margin-bottom: 18px;
        }

        .single-predictor-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 14px;
          border-radius: 999px;
          background: #edf1ff;
          color: #4a63cf;
          font-size: 0.78rem;
          font-weight: 700;
          margin-bottom: 12px;
        }

        .single-predictor-header h3 {
          margin: 0 0 8px;
          color: #22324b;
          font-size: 1.6rem;
        }

        .single-predictor-header p {
          margin: 0;
          color: #6b7690;
          max-width: 760px;
          line-height: 1.6;
        }

        .single-predictor-form {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .single-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .single-field span {
          color: #55637f;
          font-size: 0.85rem;
          font-weight: 700;
        }

        .single-field select,
        .single-field input {
          min-height: 48px;
          padding: 0 14px;
          border-radius: 12px;
          border: 1px solid #d7dceb;
          background: #ffffff;
          color: #374763;
          outline: none;
        }

        .single-field select {
          padding-right: 44px;
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7.5L10 12.5L15 7.5' stroke='%232f254f' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") !important;
          background-repeat: no-repeat !important;
          background-size: 18px 18px !important;
          background-position: calc(100% - 16px) center !important;
        }

        .single-field small {
          color: #c94f65;
          font-size: 0.78rem;
          font-weight: 600;
        }

        .single-predictor-actions {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-top: 4px;
        }

        .single-predictor-error {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #c94f65;
          font-weight: 600;
        }

        .single-predict-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: var(--button-height-lg);
          padding: 0 1.5rem;
          border: none;
          border-radius: var(--button-radius-md);
          background: linear-gradient(135deg, #4f67ec 0%, #3658db 100%);
          color: #ffffff;
          font-size: var(--font-size-button);
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 14px 26px rgba(58, 88, 212, 0.25);
        }

        .single-predict-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          box-shadow: none;
        }

        .single-result-card {
          margin-top: 20px;
          padding: 18px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.82);
          border: 1px solid #e8ebf5;
        }

        .single-result-summary {
          display: grid;
          grid-template-columns: 220px 1fr;
          gap: 18px;
          align-items: center;
        }

        .single-result-score {
          padding: 20px;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .single-result-score.critical {
          background: linear-gradient(135deg, #4a148c 0%, #7b1fa2 100%);
          color: #ffffff;
        }

        .single-result-score.high {
          background: linear-gradient(135deg, #d15b75 0%, #dc4f73 100%);
          color: #ffffff;
        }

        .single-result-score.medium {
          background: linear-gradient(135deg, #f1d18d 0%, #e6c26b 100%);
          color: #5d4c1e;
        }

        .single-result-score.low {
          background: linear-gradient(135deg, #fbc02d 0%, #f9a825 100%);
          color: #534204;
        }

        .single-result-score.minimal,
        .single-result-score.neutral {
          background: #eef0f8;
          color: #44517a;
        }

        .single-result-label {
          font-size: 0.82rem;
          font-weight: 700;
          opacity: 0.92;
        }

        .single-result-score strong {
          font-size: 2rem;
          line-height: 1;
        }

        .single-result-meta p {
          margin: 12px 0 0;
          color: #5e6984;
          line-height: 1.6;
        }

        .single-result-recommendations {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #eceff6;
        }

        .single-result-recommendations h4 {
          margin: 0 0 12px;
          color: #2b3a58;
        }

        .single-result-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .single-result-pill {
          display: inline-flex;
          align-items: center;
          padding: 8px 12px;
          border-radius: 999px;
          background: #eef3ff;
          color: #4b63a5;
          font-size: 0.8rem;
          font-weight: 700;
        }

        .batch-upload-card {
          width: 100%;
          max-width: none;
          margin: 0 0 24px;
          padding: 42px 36px 32px;
          box-sizing: border-box;
          text-align: center;
          background: linear-gradient(180deg, #f7f8fe 0%, #f1f3fb 100%);
          border: 2px dashed #ccd2e6;
          border-radius: 22px;
          box-shadow: 0 16px 40px rgba(66, 86, 144, 0.08);
        }

        .batch-upload-content {
          width: 100%;
          max-width: 820px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .attrition-upload-icon {
          width: 78px;
          height: 78px;
          margin: 0 auto 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at 30% 30%, #7d5de1 0%, #5f3dc9 58%, #4d2fb2 100%);
          color: #ffffff;
          font-size: 30px;
          box-shadow: 0 16px 28px rgba(77, 47, 178, 0.24);
        }

        .batch-upload-card h3 {
          margin: 0 0 10px;
          color: #243147;
          font-size: clamp(1.7rem, 3vw, 2.25rem);
          font-weight: 700;
          letter-spacing: -0.02em;
        }

        .upload-description {
          margin: 0 auto 10px;
          max-width: 620px;
          color: #5b667c;
          line-height: 1.6;
          font-size: 0.98rem;
        }

        .required-columns {
          margin: 0 auto 22px;
          max-width: 680px;
          width: 100%;
          padding: 12px 16px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.88);
          color: #48556f;
          font-size: 0.9rem;
          box-shadow: inset 0 0 0 1px rgba(201, 208, 232, 0.8);
        }

        .attrition-upload-select-row {
          display: flex;
          justify-content: center;
          margin-bottom: 16px;
          width: 100%;
        }

        .attrition-upload-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin-top: 10px;
          width: 100%;
          max-width: 780px;
        }

        .attrition-upload-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 56px;
          padding: 0 24px;
          border-radius: 999px;
          font-size: 1rem;
          font-weight: 700;
          border: 2px solid transparent;
          cursor: pointer;
          transition: transform 0.22s ease, box-shadow 0.22s ease, background 0.22s ease, border-color 0.22s ease, color 0.22s ease;
        }

        .attrition-upload-btn:hover:not(:disabled) {
          transform: translateY(-2px);
        }

        .attrition-upload-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .attrition-upload-btn-select {
          width: 100%;
          max-width: 370px;
          background: #ffffff;
          border-color: var(--color-brand-purple);
          color: var(--color-brand-purple);
          box-shadow: 0 10px 24px rgba(var(--color-brand-purple-rgb), 0.08);
        }

        .attrition-upload-btn-select:hover {
          background: var(--color-brand-purple-soft);
          box-shadow: 0 14px 28px rgba(var(--color-brand-purple-rgb), 0.14);
        }

        .attrition-upload-btn-secondary {
          background: #ffffff;
          border-color: #c7cfdf;
          color: #46536c;
          box-shadow: 0 8px 20px rgba(112, 128, 163, 0.1);
        }

        .attrition-upload-btn-secondary:hover:not(:disabled) {
          background: #f8faff;
          border-color: #99a8cb;
        }

        .attrition-upload-btn-primary {
          background: var(--gradient-button-primary);
          color: #ffffff;
          box-shadow: var(--shadow-button-primary);
        }
        
        .attrition-upload-btn-primary:hover:not(:disabled) {
          box-shadow: var(--shadow-button-primary-hover);
        }

        .selected-file {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin: 0 auto 18px;
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(79, 103, 236, 0.08);
          color: #3658db;
          font-weight: 600;
        }

        .batch-results {
          margin-top: 28px;
        }

        .batch-results-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .batch-results-header h3 {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0 0 8px;
          color: #22324b;
          font-size: 1.5rem;
        }

        .batch-results-header p {
          margin: 0;
          color: #6b7690;
        }

        .clear-saved-results-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 42px;
          padding: 0 14px;
          border: 1px solid #d8dcea;
          border-radius: 10px;
          background: #ffffff;
          color: #53627f;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }

        .clear-saved-results-btn:hover {
          background: #f8f9fd;
        }

        .risk-insights-panel {
          padding: 22px;
          border-radius: 20px;
          background: var(--gradient-chart-surface);
          border: 1px solid var(--chart-grid);
          box-shadow: var(--shadow-chart);
        }

        .risk-insights-title h4 {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 16px;
          color: var(--chart-text);
          font-size: 1.12rem;
        }

        .risk-insights-metrics {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 14px;
        }

        .insight-metric-card {
          padding: 16px 18px;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-height: 92px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
        }

        .insight-metric-card.neutral {
          background: linear-gradient(135deg, var(--chart-quinary) 0%, #f6f1ff 100%);
          color: var(--chart-text);
        }

        .insight-metric-card.critical {
          background: #f3e5f5;
          color: #4a148c;
          border: 1px solid #d1c4e9;
          box-shadow: 0 4px 12px rgba(74, 20, 140, 0.05);
        }

        .insight-metric-card.high {
          background: #fdf0f0;
          color: #9f3030;
          border: 1px solid #f3c0c0;
          box-shadow: 0 4px 12px rgba(159, 48, 48, 0.05);
        }

        .insight-metric-card.medium {
          background: #fff7e7;
          color: #8b6714;
          border: 1px solid #efd493;
          box-shadow: 0 4px 12px rgba(139, 103, 20, 0.05);
        }

        .insight-metric-card.low {
          background: #fffde7;
          color: #827717;
          border: 1px solid #f9fbe7;
          box-shadow: 0 4px 12px rgba(130, 119, 23, 0.05);
        }

        .insight-metric-card.minimal {
          background: #ecf8f3;
          color: #0b7f61;
          border: 1px solid #a8dfcf;
          box-shadow: 0 4px 12px rgba(11, 127, 97, 0.05);
        }
    
        .insight-metric-card .metric-value {
          color: inherit;
        }
        
        .insight-metric-card .metric-label {
          color: inherit;
          opacity: 0.8;
          font-weight: 700;
        }

        .insight-metric-card.average {
          background: linear-gradient(135deg, var(--chart-quinary) 0%, var(--chart-quaternary) 100%);
          color: var(--chart-text);
        }

        .metric-value {
          font-size: 2rem;
          line-height: 1;
          font-weight: 800;
          letter-spacing: -0.03em;
        }

        .metric-label {
          font-size: 0.9rem;
          opacity: 0.92;
        }

        .risk-insights-grid {
          display: grid;
          grid-template-columns: 1.1fr 1.6fr;
          gap: 14px;
        }

        .risk-insight-block {
          padding: 18px;
          border-radius: 14px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.88) 0%, rgba(246, 241, 255, 0.96) 100%);
          border: 1px solid rgba(123, 97, 232, 0.14);
        }

        .risk-insight-block h5 {
          margin: 0 0 16px;
          color: var(--chart-text);
          font-size: 1rem;
        }

        .distribution-chart {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .distribution-row {
          display: grid;
          grid-template-columns: 34px 1fr;
          gap: 10px;
          align-items: center;
        }

        .distribution-percent {
          color: var(--chart-text-muted);
          font-size: 0.9rem;
          font-weight: 700;
          text-align: right;
        }

        .distribution-track,
        .role-progress-track {
          position: relative;
          overflow: hidden;
          height: 14px;
          border-radius: 999px;
          background: #e8ebf4;
        }

        .distribution-fill,
        .role-progress-fill {
          height: 100%;
          border-radius: 999px;
          box-shadow: 0 8px 20px rgba(93, 60, 201, 0.16);
          transition: width 0.35s ease, filter 0.2s ease;
        }

        .distribution-row:hover .distribution-fill,
        .role-risk-row:hover .role-progress-fill {
          filter: brightness(1.04);
        }

        .distribution-legend {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          margin-top: 14px;
          color: var(--chart-text-muted);
          font-size: 0.84rem;
        }

        .legend-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          box-shadow: 0 0 0 4px rgba(123, 97, 232, 0.08);
        }

        .role-risk-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .role-risk-row {
          display: grid;
          grid-template-columns: 160px 1fr 42px;
          gap: 12px;
          align-items: center;
        }

        .role-name,
        .role-percent {
          color: var(--chart-text);
          font-size: 0.9rem;
        }

        .role-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .role-percent {
          font-weight: 700;
          text-align: right;
        }

        .role-insight-empty {
          margin: 0;
          color: #7d88a4;
          line-height: 1.6;
        }

        .batch-history-card,
        .results-table-card {
          margin-top: 22px;
          padding: 24px 22px 18px;
          border-radius: 24px;
          background: linear-gradient(180deg, #f8f8fd 0%, #f3f4fb 100%);
          border: 1px solid #e1e5f0;
          box-shadow: 0 20px 40px rgba(60, 72, 105, 0.08);
        }

        .batch-history-header,
        .results-table-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .batch-history-header h4,
        .results-table-header h4 {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0;
          color: #4b5878;
          font-size: 1.08rem;
          font-weight: 800;
          letter-spacing: 0.01em;
        }

        .batch-history-header p,
        .results-table-header p {
          margin: 10px 0 0;
          color: #6e7894;
          font-size: 0.98rem;
          line-height: 1.5;
        }

        .batch-history-table-shell,
        .results-table-shell {
          overflow-x: auto;
          border-radius: 18px;
          border: 1px solid #dfe4ee;
          background: #ffffff;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
        }

        .batch-history-table,
        .results-table-grid {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
        }

        .batch-history-table {
          min-width: 760px;
        }

        .results-table-grid {
          min-width: 980px;
        }

        .batch-history-table th,
        .results-table-grid thead th {
          padding: 18px 16px;
          background: #dfe2ea;
          color: #667393;
          font-size: 0.78rem;
          font-weight: 800;
          text-align: left;
          white-space: nowrap;
          letter-spacing: 0.02em;
        }

        .batch-history-table th:first-child,
        .results-table-grid thead th:first-child {
          border-top-left-radius: 16px;
        }

        .batch-history-table th:last-child,
        .results-table-grid thead th:last-child {
          border-top-right-radius: 16px;
        }

        .batch-history-table td,
        .results-table-grid tbody td {
          padding: 18px 16px;
          border-top: 1px solid #ebeff5;
          color: #39445f;
          font-size: 0.96rem;
          white-space: nowrap;
          background: #ffffff;
        }

        .batch-history-table tbody tr:hover td,
        .results-table-grid tbody tr:hover td {
          background: #fbfcff;
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

        .results-toolbar-chip,
        .results-filter select,
        .results-inline-select select,
        .results-searchbar {
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
          border-radius: 14px;
          border: 1px solid #d6dceb;
          background: #f4f5fb;
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
          border: none;
          background: transparent;
          color: #55617f;
          font-size: 0.98rem;
          outline: none;
          padding: 0;
        }

        .results-toolbar-download,
        .history-download-btn {
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
          font-size: var(--font-size-button);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .results-toolbar-download:hover:not(:disabled),
        .history-download-btn:hover:not(:disabled) {
          background: #eef1ff;
          border-color: #cad4fb;
          color: #5f72dd;
          transform: translateY(-1px);
        }

        .results-toolbar-download:disabled,
        .history-download-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }

        .results-toolbar-chip {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 0 12px;
        }

        .toolbar-chip-label {
          font-size: 0.78rem;
          color: #7a84a0;
        }

        .toolbar-chip-value {
          font-size: 0.84rem;
          font-weight: 700;
          color: #49557a;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .results-filter {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .results-filter span {
          font-size: 0.72rem;
          color: #8a94af;
          font-weight: 700;
        }

        .results-filter select {
          width: 100%;
          padding: 0 12px;
          font-size: 0.84rem;
          outline: none;
        }

        .results-sort-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: none;
          background: transparent;
          color: inherit;
          font: inherit;
          font-weight: 700;
          padding: 0;
          cursor: pointer;
        }

        .results-sort-button i {
          color: #95a0bb;
          font-size: 0.8rem;
          transition: color 0.2s ease;
        }

        .results-sort-button:hover i,
        .results-sort-button.active i {
          color: #566fdb;
        }

        .results-sort-button.active {
          color: #55607f;
        }

        .table-pill,
        .history-risk-badge,
        .history-status-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-width: 72px;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 0.92rem;
          font-weight: 800;
          line-height: 1;
        }

        .table-pill.score.critical,
        .table-pill.risk.critical,
        .history-risk-badge.critical {
          background: #4a148c;
          color: #ffffff;
        }

        .table-pill.score.high,
        .table-pill.risk.high,
        .history-risk-badge.high {
          background: var(--color-danger);
          color: #ffffff;
        }

        .table-pill.score.medium,
        .table-pill.risk.medium,
        .history-risk-badge.medium {
          background: var(--color-warning-soft);
          color: var(--color-warning-text);
        }

        .table-pill.score.low,
        .table-pill.risk.low,
        .history-risk-badge.low {
          background: #fbc02d;
          color: #263238;
        }

        .table-pill.score.minimal,
        .table-pill.risk.minimal,
        .history-risk-badge.minimal {
          background: var(--color-success-soft);
          color: var(--color-success-text);
        }

        .table-pill.score.neutral,
        .table-pill.risk.neutral {
          background: #e7eaf5;
          color: #52607f;
        }

        .table-pill.score.neutral,
        .table-pill.risk.neutral {
          background: #e7eaf5;
          color: #52607f;
        }

        .table-pill.overtime,
        .history-status-pill.completed {
          min-width: 72px;
          background: var(--color-success-soft);
          color: var(--color-success-text);
        }

        .table-pill.overtime.yes {
          background: var(--color-warning-soft);
          color: var(--color-warning-text);
        }

        .table-pill.overtime.no {
          background: var(--color-success-soft);
          color: var(--color-success-text);
        }

        .results-table-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 2px 2px;
          color: #7b86a3;
          font-size: 0.92rem;
        }

        .results-page-info {
          font-weight: 700;
        }

        .results-pager {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .results-pager button,
        .current-page-chip {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          border: 1px solid #d6dceb;
          background: #f4f5fb;
          color: #5d6886;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .results-pager button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .current-page-chip {
          font-weight: 800;
          background: #ffffff;
        }

        .live-reload-container {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 5px;
        }

        .live-reload-btn {
          background: var(--gradient-brand-purple);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 50px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 4px 15px rgba(var(--color-brand-purple-rgb), 0.4);
          transition: all 0.3s ease;
          position: relative;
        }

        .live-reload-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(var(--color-brand-purple-rgb), 0.6);
        }

        .live-reload-btn.has-alerts {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          animation: pulse 2s infinite;
        }

        .live-reload-btn.loading {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .debug-btn {
          background: #6c757d;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          font-size: 14px;
          cursor: pointer;
          margin-top: 5px;
        }

        .fa-ring {
          animation: ring 0.5s ease;
        }

        .notification-badge {
          position: absolute;
          top: -8px;
          right: -8px;
          background: var(--color-danger);
          color: white;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
          border: 2px solid white;
        }

        .last-reload {
          font-size: 12px;
          color: #666;
          background: white;
          padding: 4px 8px;
          border-radius: 4px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }

        .live-popup-overlay,
        .recommendations-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 24px 16px;
          overflow-y: auto;
          z-index: 2000;
        }

        .live-popup,
        .recommendations-modal {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-height: calc(100vh - 48px);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          margin: auto 0;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        }

        .live-popup {
          max-width: 1040px;
          border-radius: 24px;
          background: linear-gradient(180deg, #fbfbfe 0%, #f4f5fb 100%);
          border: 1px solid #e7eaf4;
          box-shadow: 0 24px 60px rgba(17, 28, 70, 0.26);
        }

        .recommendations-modal {
          max-width: 900px;
        }

        .popup-header,
        .modal-header {
          color: white;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .popup-header {
          background:
            radial-gradient(circle at top right, rgba(var(--color-brand-purple-rgb), 0.22), transparent 28%),
            linear-gradient(135deg, #221448 0%, var(--color-brand-purple-deep) 48%, var(--color-brand-purple) 100%);
          padding: 24px 24px 22px;
          align-items: flex-start;
        }

        .modal-header {
          background: linear-gradient(135deg, #43a047 0%, #2e7d32 100%);
        }

        .popup-header h3,
        .modal-header h3 {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .popup-header-copy {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 720px;
        }

        .popup-header-copy h3 {
          font-size: clamp(1.5rem, 2.4vw, 2.2rem);
          line-height: 1.05;
          font-weight: 800;
          letter-spacing: -0.03em;
        }

        .popup-header-copy p {
          margin: 0;
          color: rgba(229, 235, 255, 0.82);
          line-height: 1.6;
          max-width: 640px;
        }

        .popup-header-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          width: fit-content;
          padding: 7px 14px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(190, 204, 255, 0.16);
          color: #d8e0ff;
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .live-popup-header-close {
          flex: 0 0 auto;
          width: 46px;
          height: 46px;
          padding: 0;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
          transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .live-popup-header-close i {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          line-height: 1;
          font-weight: 700;
        }

        .live-popup-header-close:hover {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(255, 255, 255, 0.28);
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.16);
          transform: translateY(-1px);
        }

        .live-popup-header-close:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.24), 0 0 0 6px rgba(var(--color-brand-purple-rgb), 0.36);
        }

        .popup-content,
        .modal-content {
          padding: 20px;
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          max-height: none;
        }

        .popup-content {
          padding: 22px 24px 18px;
        }

        .popup-summary-cards {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }

        .popup-summary-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-height: 104px;
          padding: 18px;
          border-radius: 16px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
        }

        .popup-summary-card.neutral,
        .popup-summary-card.average,
        .popup-summary-card.time {
          background: #eef0f8;
        }

        .popup-summary-card.critical {
          background: #f3e5f5;
          color: #4a148c;
          border: 1px solid #d1c4e9;
          box-shadow: 0 4px 12px rgba(74, 20, 140, 0.05);
        }

        .popup-summary-card.high {
          background: #fdf0f0;
          color: #9f3030;
          border: 1px solid #f3c0c0;
          box-shadow: 0 4px 12px rgba(159, 48, 48, 0.05);
        }

        .popup-summary-card.medium {
          background: #fff7e7;
          color: #8b6714;
          border: 1px solid #efd493;
          box-shadow: 0 4px 12px rgba(139, 103, 20, 0.05);
        }

        .popup-summary-card.low {
          background: #fffde7;
          color: #827717;
          border: 1px solid #f9fbe7;
          box-shadow: 0 4px 12px rgba(130, 119, 23, 0.05);
        }

        .popup-summary-card.minimal {
          background: #ecf8f3;
          color: #0b7f61;
          border: 1px solid #a8dfcf;
          box-shadow: 0 4px 12px rgba(11, 127, 97, 0.05);
        }

        .popup-card-label {
          font-size: 0.75rem;
          font-weight: 800;
          color: inherit;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          opacity: 0.8;
        }

        .popup-card-value {
          font-size: 1.75rem;
          line-height: 1;
          font-weight: 800;
          color: inherit;
        }

        .popup-summary-card.high .popup-card-value,
        .popup-summary-card.high .popup-card-label,
        .popup-summary-card.medium .popup-card-value,
        .popup-summary-card.medium .popup-card-label,
        .popup-summary-card.low .popup-card-value,
        .popup-summary-card.low .popup-card-label {
          color: inherit !important;
        }

        .popup-card-value.small {
          font-size: 1.05rem;
          line-height: 1.35;
        }

        .high-risk-section {
          background: rgba(255, 255, 255, 0.75);
          border-radius: 18px;
          padding: 18px;
          margin: 0;
          border: 1px solid #e8ebf5;
        }

        .high-risk-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 16px;
        }

        .high-risk-section h4 {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #273552;
        }

        .high-risk-header p {
          margin: 8px 0 0;
          color: #74819e;
          line-height: 1.55;
        }

        .high-risk-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 42px;
          height: 42px;
          background: #d45b76;
          color: white;
          padding: 0 12px;
          border-radius: 999px;
          font-size: 1rem;
          font-weight: 800;
        }

        .high-risk-table {
          overflow-x: auto;
          border-radius: 14px;
          border: 1px solid #eceff6;
          background: #ffffff;
        }

        .high-risk-table table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          min-width: 760px;
          table-layout: fixed;
        }

        .high-risk-col-name {
          width: 20%;
        }

        .high-risk-col-role {
          width: 18%;
        }

        .high-risk-col-score {
          width: 11%;
        }

        .high-risk-col-label {
          width: 12%;
        }

        .high-risk-col-action {
          width: 39%;
        }

        .high-risk-table th,
        .high-risk-table td {
          padding: 14px 12px;
          text-align: left;
          vertical-align: middle;
          border-bottom: 1px solid #f0f2f8;
        }

        .high-risk-table th {
          background: #eef0f8;
          font-weight: 700;
          color: #687492;
          font-size: 0.78rem;
          white-space: nowrap;
        }

        .high-risk-table td:first-child,
        .high-risk-table td:nth-child(2),
        .high-risk-table td:last-child {
          white-space: normal;
          word-break: break-word;
        }

        .recommend-btn {
          background: var(--color-success);
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .recommend-btn:hover {
          background: var(--color-success-text);
        }

        .small-recommend-btn {
          background: var(--color-success);
          color: white;
          border: none;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          margin-left: 10px;
        }

        .small-recommend-btn:hover {
          background: #218838;
        }

        .risk-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 88px;
          padding: 7px 12px;
          border-radius: 8px;
          font-size: 0.78rem;
          font-weight: 700;
        }

        .risk-badge.high-risk {
          background: var(--color-danger);
          color: white;
        }

        .risk-badge.medium-risk {
          background: var(--color-warning);
          color: var(--color-warning-text);
        }

        .risk-badge.low-risk {
          background: var(--color-success);
          color: white;
        }

        .popup-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          margin-top: 18px;
        }

        .stat-box {
          background: rgba(255, 255, 255, 0.72);
          padding: 16px;
          border-radius: 14px;
          text-align: center;
          border: 1px solid #e8ebf5;
        }

        .stat-box .stat-label {
          display: block;
          font-size: 13px;
          font-weight: 700;
          color: #4b5878;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }

        .stat-box .stat-value {
          font-size: 26px;
          font-weight: 800;
          display: block;
        }

        .popup-footer,
        .modal-footer {
          flex-shrink: 0;
          padding: 20px;
          background: #f8f9fa;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }

        .popup-footer {
          padding: 18px 24px 24px;
          background: transparent;
          border-top: 1px solid #eaedf5;
        }

        .popup-footer .download-btn,
        .popup-footer .close-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          align-self: center;
          margin: 0;
          line-height: 1;
          vertical-align: middle;
        }

        .no-risk {
          color: var(--color-success);
          font-style: italic;
          padding: 10px;
        }

        .no-risk-state {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 16px 18px;
          border-radius: 14px;
          background: #edf7ef;
          color: #2f7248;
          font-weight: 600;
        }

        .no-risk-state p {
          margin: 0;
        }

        .quick-recommend-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .quick-recommend-pill {
          display: inline-flex;
          align-items: center;
          padding: 6px 10px;
          border-radius: 999px;
          background: #eef3ff;
          color: #485b96;
          font-size: 0.76rem;
          font-weight: 700;
          line-height: 1.35;
        }

        .live-popup-download {
          min-height: 52px;
          height: 52px;
          padding: 0 22px;
          border-radius: 10px;
          background: linear-gradient(135deg, #4864ea 0%, #3558db 100%);
          box-shadow: 0 12px 24px rgba(53, 88, 219, 0.2);
        }

        .live-popup-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 52px;
          height: 52px;
          padding: 0 28px;
          border-radius: 10px;
          border: 1px solid #d7dceb;
          background: #ffffff;
          color: #54627f;
          box-sizing: border-box;
        }

        .required-columns {
          background: #e3f2fd;
          padding: 10px;
          border-radius: 4px;
          margin: 10px 0;
          font-size: 14px;
        }

        /* Recommendations Modal Styles */
        .employee-summary {
          margin-bottom: 20px;
        }

        .summary-card {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 15px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 10px;
        }

        .summary-row {
          display: flex;
          flex-direction: column;
        }

        .summary-row .label {
          font-size: 12px;
          color: #666;
          margin-bottom: 4px;
        }

        .summary-row .value {
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .recommendations-list {
          display: flex;
          flex-direction: column;
          gap: 15px;
          margin-bottom: 20px;
        }

        .recommendation-card {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 15px;
          background: white;
        }

        .recommendation-card.priority-critical {
          border-left: 4px solid var(--color-danger);
        }

        .recommendation-card.priority-high {
          border-left: 4px solid #fd7e14;
        }

        .recommendation-card.priority-medium {
          border-left: 4px solid var(--color-warning);
        }

        .recommendation-card.priority-standard {
          border-left: 4px solid var(--color-success);
        }

        .recommendation-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }

        .priority-icon {
          font-size: 20px;
        }

        .priority-badge {
          background: #f8f9fa;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
        }

        .category {
          font-weight: 600;
          color: #333;
        }

        .suggestions-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .suggestions-list li {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 0;
          border-bottom: 1px solid #f0f0f0;
        }

        .suggestions-list li:last-child {
          border-bottom: none;
        }

        .suggestions-list li i {
          color: var(--color-success);
          font-size: 14px;
        }

        .retention-tips {
          background: linear-gradient(135deg, #667eea0 0%, #764ba2 100%);
          border-radius: 8px;
          padding: 15px;
          margin-top: 20px;
        }

        .retention-tips h4 {
          margin: 0 0 15px 0;
          color: black;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .tips-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 10px;
        }

        .tip-item {
          background: rgba(255, 255, 255, 0.9);
          padding: 10px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }

        .tip-item i {
          color: var(--color-success);
        }

        .download-pdf-btn {
          background: var(--color-danger);
          color: white;
          border: none;
          min-height: var(--button-height-md);
          padding: 0 var(--button-padding-x);
          border-radius: var(--button-radius-md);
          font-size: var(--font-size-button);
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .download-pdf-btn:hover {
          background: #c82333;
        }

        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }

        @keyframes ring {
          0% { transform: rotate(0); }
          25% { transform: rotate(15deg); }
          50% { transform: rotate(-15deg); }
          75% { transform: rotate(5deg); }
          100% { transform: rotate(0); }
        }

        @media (max-width: 768px) {
          .predictor-hero {
            margin-top: 84px;
            padding: 22px 18px 20px;
            border-radius: 22px;
          }

          .hero-badge-pill {
            font-size: 11px;
            padding: 8px 14px;
          }

          .hero-text p {
            font-size: 0.94rem;
          }

          .hero-stats-pills {
            gap: 10px;
          }

          .hero-stat {
            width: 100%;
            min-width: 0;
            justify-content: center;
          }

          .batch-upload-card {
            padding: 30px 18px 22px;
            border-radius: 22px;
          }

          .batch-upload-content {
            max-width: none;
          }

          .single-predictor-form,
          .single-result-summary {
            grid-template-columns: 1fr;
          }

          .single-predictor-actions {
            flex-direction: column;
            align-items: stretch;
          }

          .risk-insights-metrics,
          .risk-insights-grid {
            grid-template-columns: 1fr;
          }

          .popup-header {
            flex-direction: column;
            gap: 16px;
          }

          .popup-summary-cards,
          .popup-stats {
            grid-template-columns: 1fr;
          }

          .high-risk-header {
            flex-direction: column;
          }

          .batch-results-header {
            flex-direction: column;
            align-items: flex-start;
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

          .results-table-footer {
            flex-direction: column;
            align-items: flex-start;
          }

          .role-risk-row {
            grid-template-columns: 1fr;
            gap: 8px;
          }

          .role-percent {
            text-align: left;
          }

          .attrition-upload-actions {
            grid-template-columns: 1fr;
          }

          .attrition-upload-btn,
          .attrition-upload-btn-select {
            width: 100%;
            min-width: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default EmployeeAttrition;