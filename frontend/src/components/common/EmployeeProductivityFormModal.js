import React, { useEffect, useMemo, useState } from 'react';

const ROLE_LEVEL_OPTIONS = ['Senior', 'Junior', 'Trainee', 'Intern'];

const POSITION_OPTIONS = [
  'Data Scientist',
  'Data Analyst',
  'Data Engineer',
  'UI / UX Designer',
  'DevOps Engineer',
  'IT Manager',
  'Support Analyst',
  'Business Analyst',
  'Cloud Engineer',
  'System Analyst',
  'QA Engineer',
  'Software Engineer',
];

const RATING_OPTIONS = ['1', '2', '3', '4', '5'];

const FIELD_LABELS = {
  Employee_ID: 'Employee ID',
  role_level: 'Role Level',
  position: 'Position',
  age: 'Age',
  experience_years: 'Experience Years',
  avg_task_completion: 'Average Task Completion',
  attendance_rate: 'Attendance Rate',
  projects_handled: 'Projects Handled',
  overtime_hours: 'Overtime Hours',
  training_hours: 'Training Hours',
  FeedBack: 'Feedback Percentage',
};

const DEFAULT_VALUES = {
  Employee_ID: '',
  role_level: '',
  position: '',
  age: '',
  experience_years: '',
  avg_task_completion: '',
  attendance_rate: '',
  projects_handled: '',
  overtime_hours: '',
  training_hours: '',
  FeedBack: '',
};

const NUMBER_FIELDS = new Set([
  'age',
  'experience_years',
  'avg_task_completion',
  'attendance_rate',
  'projects_handled',
  'overtime_hours',
  'training_hours',
  'FeedBack',
]);

const INTEGER_FIELDS = new Set([
  'age',
  'avg_task_completion',
  'attendance_rate',
  'projects_handled',
]);

const EMPLOYEE_ID_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;

function hasAtMostOneDecimal(value) {
  return /^\d+(\.\d)?$/.test(value);
}

function hasAtMostTwoDecimals(value) {
  return /^\d+(\.\d{1,2})?$/.test(value);
}

function validateForm(formValues) {
  const errors = {};
  const employeeId = String(formValues.Employee_ID || '').trim();
  const ageValue = String(formValues.age || '').trim();
  const experienceValue = String(formValues.experience_years || '').trim();
  const projectsHandledValue = String(formValues.projects_handled || '').trim();
  const overtimeValue = String(formValues.overtime_hours || '').trim();
  const trainingValue = String(formValues.training_hours || '').trim();

  if (!employeeId || !EMPLOYEE_ID_PATTERN.test(employeeId)) {
    errors.Employee_ID = 'Employee ID is required. Use 3-20 letters, numbers, hyphens, or underscores.';
  }

  if (!ROLE_LEVEL_OPTIONS.includes(formValues.role_level)) {
    errors.role_level = 'Role level is required and must be Senior, Junior, Trainee, or Intern.';
  }

  if (!POSITION_OPTIONS.includes(formValues.position)) {
    errors.position = 'Position is required and must be a valid option.';
  }

  if (!/^\d+$/.test(ageValue)) {
    errors.age = 'Age is required and must be a whole number between 18 and 65.';
  } else {
    const age = Number(ageValue);
    if (age < 18 || age > 65) {
      errors.age = 'Age is required and must be a whole number between 18 and 65.';
    }
  }

  if (!experienceValue || !hasAtMostOneDecimal(experienceValue)) {
    errors.experience_years = 'Experience years is required, must be between 0 and 47, and can have at most 1 decimal place.';
  } else {
    const experience = Number(experienceValue);
    const age = Number(ageValue);
    if (experience < 0 || experience > 47) {
      errors.experience_years = 'Experience years is required, must be between 0 and 47, and can have at most 1 decimal place.';
    } else if (Number.isFinite(age) && experience > age - 18) {
      errors.experience_years = 'Experience years cannot be greater than age - 18.';
    }
  }

  ['avg_task_completion', 'attendance_rate'].forEach((fieldName) => {
    const value = String(formValues[fieldName] || '').trim();
    if (!RATING_OPTIONS.includes(value)) {
      const label = FIELD_LABELS[fieldName];
      errors[fieldName] = `${label} is required and must be an integer between 1 and 5.`;
    }
  });

  const feedbackValue = String(formValues.FeedBack || '').trim();
  if (!feedbackValue || !hasAtMostTwoDecimals(feedbackValue)) {
    errors.FeedBack = 'Feedback Percentage is required, must be between 0 and 100, and can have at most 2 decimal places.';
  } else {
    const feedback = Number(feedbackValue);
    if (feedback < 0 || feedback > 100) {
      errors.FeedBack = 'Feedback Percentage is required, must be between 0 and 100, and can have at most 2 decimal places.';
    }
  }

  if (!/^\d+$/.test(projectsHandledValue)) {
    errors.projects_handled = 'Projects handled is required and must be a whole number between 0 and 100.';
  } else {
    const projectsHandled = Number(projectsHandledValue);
    if (projectsHandled < 0 || projectsHandled > 100) {
      errors.projects_handled = 'Projects handled is required and must be a whole number between 0 and 100.';
    }
  }

  if (!overtimeValue || !hasAtMostOneDecimal(overtimeValue)) {
    errors.overtime_hours = 'Overtime hours is required, must be between 0 and 200, and can have at most 1 decimal place.';
  } else {
    const overtimeHours = Number(overtimeValue);
    if (overtimeHours < 0 || overtimeHours > 200) {
      errors.overtime_hours = 'Overtime hours is required, must be between 0 and 200, and can have at most 1 decimal place.';
    }
  }

  if (!trainingValue || !hasAtMostOneDecimal(trainingValue)) {
    errors.training_hours = 'Training hours is required, must be between 0 and 500, and can have at most 1 decimal place.';
  } else {
    const trainingHours = Number(trainingValue);
    if (trainingHours < 0 || trainingHours > 500) {
      errors.training_hours = 'Training hours is required, must be between 0 and 500, and can have at most 1 decimal place.';
    }
  }

  return errors;
}

function toPayload(formValues) {
  const payload = {
    ...formValues,
    Employee_ID: String(formValues.Employee_ID || '').trim(),
    role_level: String(formValues.role_level || '').trim(),
    position: String(formValues.position || '').trim(),
  };

  for (const key of Object.keys(payload)) {
    if (!NUMBER_FIELDS.has(key)) continue;

    const rawValue = payload[key];
    if (rawValue === '' || rawValue === null || rawValue === undefined) {
      payload[key] = 0;
      continue;
    }

    const parsed = Number(rawValue);
    payload[key] = Number.isFinite(parsed)
      ? (INTEGER_FIELDS.has(key) ? Number.parseInt(rawValue, 10) : parsed)
      : 0;
  }

  return payload;
}

export default function EmployeeProductivityFormModal({
  isOpen,
  title = 'Add Employee',
  initialValues,
  submitting = false,
  submitLabel = 'Save Employee',
  submittingLabel = 'Saving...',
  readOnlyEmployeeId = false,
  onClose,
  onSubmit,
}) {
  const mergedInitialValues = useMemo(() => {
    return { ...DEFAULT_VALUES, ...(initialValues || {}) };
  }, [initialValues]);

  const [values, setValues] = useState(mergedInitialValues);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    setValues(mergedInitialValues);
    setErrors({});
  }, [isOpen, mergedInitialValues]);

  if (!isOpen) return null;

  const setField = (name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const nextErrors = { ...prev };
      delete nextErrors[name];
      return nextErrors;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!onSubmit) return;

    const nextErrors = validateForm(values);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    await onSubmit(toPayload(values));
  };

  return (
    <div className="epfm-overlay" role="dialog" aria-modal="true">
      <div className="epfm-modal">
        <div className="epfm-header">
          <h3 className="epfm-title">
            <i className="fas fa-user-plus"></i>
            {title}
          </h3>
          <button type="button" className="epfm-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form className="epfm-body" onSubmit={handleSubmit}>
          <div className="epfm-grid">
            <div className="epfm-field">
              <label>Employee ID</label>
              <input
                type="text"
                value={values.Employee_ID}
                onChange={(e) => setField('Employee_ID', e.target.value)}
                placeholder="Enter employee ID (e.g., ID001)"
                disabled={readOnlyEmployeeId}
              />
              {errors.Employee_ID && <p className="epfm-error">{errors.Employee_ID}</p>}
            </div>

            <div className="epfm-field">
              <label>Role Level</label>
              <select value={values.role_level} onChange={(e) => setField('role_level', e.target.value)}>
                <option value="">Select role level</option>
                {ROLE_LEVEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {errors.role_level && <p className="epfm-error">{errors.role_level}</p>}
            </div>

            <div className="epfm-field">
              <label>Position</label>
              <select value={values.position} onChange={(e) => setField('position', e.target.value)}>
                <option value="">Select position</option>
                {POSITION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {errors.position && <p className="epfm-error">{errors.position}</p>}
            </div>

            <div className="epfm-field">
              <label>Age</label>
              <input
                type="number"
                value={values.age}
                onChange={(e) => setField('age', e.target.value)}
                min="18"
                max="65"
                step="1"
                placeholder="Enter age (18–65)"
              />
              {errors.age && <p className="epfm-error">{errors.age}</p>}
            </div>

            <div className="epfm-field">
              <label>Experience Years</label>
              <input
                type="number"
                value={values.experience_years}
                onChange={(e) => setField('experience_years', e.target.value)}
                min="0"
                max="47"
                step="0.1"
                placeholder="Enter experience (e.g., 2)"
              />
              {errors.experience_years && <p className="epfm-error">{errors.experience_years}</p>}
            </div>

            <div className="epfm-field">
              <label>Average Task Completion</label>
              <select value={values.avg_task_completion} onChange={(e) => setField('avg_task_completion', e.target.value)}>
                <option value="">Select rating (1–5)</option>
                {RATING_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {errors.avg_task_completion && <p className="epfm-error">{errors.avg_task_completion}</p>}
            </div>

            <div className="epfm-field">
              <label>Attendance Rate</label>
              <select value={values.attendance_rate} onChange={(e) => setField('attendance_rate', e.target.value)}>
                <option value="">Select rating (1–5)</option>
                {RATING_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {errors.attendance_rate && <p className="epfm-error">{errors.attendance_rate}</p>}
            </div>

            <div className="epfm-field">
              <label>Projects Handled</label>
              <input
                type="number"
                value={values.projects_handled}
                onChange={(e) => setField('projects_handled', e.target.value)}
                min="0"
                max="100"
                step="1"
                placeholder="Enter number of projects (e.g., 6)"
              />
              {errors.projects_handled && <p className="epfm-error">{errors.projects_handled}</p>}
            </div>

            <div className="epfm-field">
              <label>Overtime Hours</label>
              <input
                type="number"
                value={values.overtime_hours}
                onChange={(e) => setField('overtime_hours', e.target.value)}
                min="0"
                max="200"
                step="0.1"
                placeholder="Enter overtime hours (e.g., 12)"
              />
              {errors.overtime_hours && <p className="epfm-error">{errors.overtime_hours}</p>}
            </div>

            <div className="epfm-field">
              <label>Training Hours</label>
              <input
                type="number"
                value={values.training_hours}
                onChange={(e) => setField('training_hours', e.target.value)}
                min="0"
                max="500"
                step="0.1"
                placeholder="Enter training hours (e.g., 24)"
              />
              {errors.training_hours && <p className="epfm-error">{errors.training_hours}</p>}
            </div>

            <div className="epfm-field">
              <label>Feedback Percentage</label>
              <input
                type="number"
                value={values.FeedBack}
                onChange={(e) => setField('FeedBack', e.target.value)}
                min="0"
                max="100"
                step="0.01"
                placeholder="Enter percentage (e.g., 56.98)"
              />
              {errors.FeedBack && <p className="epfm-error">{errors.FeedBack}</p>}
            </div>
          </div>

          <div className="epfm-footer">
            <button type="button" className="epfm-btn epfm-btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="epfm-btn epfm-btn-primary" disabled={submitting}>
              {submitting ? submittingLabel : submitLabel}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .epfm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.42);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 24px;
        }

        .epfm-modal {
          font-family: var(--font-family-base);
          background: var(--gradient-surface);
          border-radius: 20px;
          width: 100%;
          max-width: 980px;
          overflow: hidden;
          border: 1px solid var(--color-border-subtle);
          box-shadow: var(--shadow-soft);
        }

        .epfm-header {
          padding: 18px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--gradient-accent);
          color: var(--color-text-inverse);
          border-bottom: 1px solid var(--color-brand-purple-border);
        }

        .epfm-title {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 0.01em;
        }

        .epfm-title i {
          color: var(--color-text-inverse);
          background: rgba(255,255,255,0.08);
          padding: 6px;
          border-radius: 8px;
        }

        .epfm-close {
          border: none;
          background: transparent;
          color: #64748b;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          font-size: 28px;
          line-height: 1;
          cursor: pointer;
          padding: 0;
          transition: background 0.2s ease, color 0.2s ease;
        }

        .epfm-close:hover {
          background: rgba(255,255,255,0.06);
          color: var(--color-text-inverse);
        }

        .epfm-body {
          padding: 24px 24px 20px;
        }

        .epfm-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px 16px;
          align-items: start;
        }

        .epfm-field {
          min-width: 0;
        }

        .epfm-field label {
          display: block;
          font-size: 13px;
          font-weight: 700;
          color: #334155;
          margin-bottom: 8px;
          letter-spacing: 0.01em;
        }

        .epfm-field input,
        .epfm-field select {
          width: 100%;
          min-height: 48px;
          padding: 12px 14px;
          border: 1px solid #d7e0ea;
          border-radius: 12px;
          outline: none;
          background: #ffffff;
          color: #0f172a;
          font-size: 14px;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
          box-sizing: border-box;
        }

        .epfm-field input::placeholder {
          color: #94a3b8;
        }

        .epfm-field input:focus,
        .epfm-field select:focus {
          border-color: var(--color-brand-purple-hover);
          box-shadow: 0 0 0 6px rgba(var(--color-brand-purple-rgb), 0.08);
        }

        .epfm-error {
          margin: 6px 0 0;
          color: var(--color-danger);
          font-size: 11px;
          font-weight: 600;
          line-height: 1.4;
        }

        .epfm-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 22px;
          padding-top: 18px;
          border-top: 1px solid #eef2f7;
        }

        .epfm-btn {
          border: none;
          border-radius: var(--button-radius-md);
          min-height: var(--button-height-md);
          padding: 0 var(--button-padding-x);
          font-size: var(--font-size-button);
          font-weight: 800;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }

        .epfm-btn-secondary {
          background: #f8fafc;
          color: #334155;
          border: 1px solid #dbe4ee;
        }

        .epfm-btn-primary {
          background: var(--gradient-button-primary);
          color: var(--color-text-inverse);
          box-shadow: var(--shadow-button-primary);
        }

        .epfm-btn:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        .epfm-btn-secondary:hover:not(:disabled) {
          background: #eff6ff;
        }

        .epfm-btn-primary:hover:not(:disabled) {
          box-shadow: var(--shadow-button-primary-hover);
        }

        .epfm-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        @media (max-width: 900px) {
          .epfm-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 720px) {
          .epfm-overlay {
            padding: 14px;
          }

          .epfm-header,
          .epfm-body {
            padding-left: 16px;
            padding-right: 16px;
          }

          .epfm-grid {
            grid-template-columns: 1fr;
          }

          .epfm-footer {
            justify-content: stretch;
          }

          .epfm-btn {
            flex: 1 1 0;
          }
        }
      `}</style>
    </div>
  );
}
