const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const winston = require('winston');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// --------------------
// Express App Setup
// --------------------
const app = express();
app.use(bodyParser.json());
app.use(cors());

// --------------------
// Winston Logger
// --------------------
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// --------------------
// MongoDB Connection
// --------------------
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/userdb';

mongoose.connect(MONGODB_URI, {
  dbName: 'userdb'
})
.then(() => logger.info('MongoDB connected', { database: 'userdb' }))
.catch(err => logger.error('MongoDB connection error:', err));

// --------------------
// User Schema & Model
// --------------------
const userSchema = new mongoose.Schema({
  fullName: String,
  contact: String,
  email: { type: String, unique: true },
  playerType: String,
  password: String
});

const User = mongoose.model('User', userSchema);

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
const RATING_OPTIONS = [1, 2, 3, 4, 5];
const EMPLOYEE_ID_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;

function normalizeOption(value, options, aliases = {}) {
  const normalizedValue = String(value ?? '').trim().toLowerCase();
  if (!normalizedValue) return '';

  if (aliases[normalizedValue]) {
    return aliases[normalizedValue];
  }

  return options.find((option) => option.toLowerCase() === normalizedValue) || '';
}

function hasAtMostOneDecimal(value) {
  return /^\d+(\.\d)?$/.test(String(value));
}

function hasAtMostTwoDecimals(value) {
  return /^\d+(\.\d{1,2})?$/.test(String(value));
}

function validateEmployeePayload(payload) {
  const errors = {};
  const employeeId = String(payload.Employee_ID ?? '').trim();
  const roleLevel = normalizeOption(payload.role_level, ROLE_LEVEL_OPTIONS);
  const position = normalizeOption(payload.position, POSITION_OPTIONS, {
    devops: 'DevOps Engineer',
    'devops engineer': 'DevOps Engineer',
    'devops engineers': 'DevOps Engineer',
  });
  const ageRaw = String(payload.age ?? '').trim();
  const experienceRaw = String(payload.experience_years ?? '').trim();
  const avgTaskCompletion = Number(payload.avg_task_completion);
  const attendanceRate = Number(payload.attendance_rate);
  const projectsHandledRaw = String(payload.projects_handled ?? '').trim();
  const overtimeRaw = String(payload.overtime_hours ?? '').trim();
  const trainingRaw = String(payload.training_hours ?? '').trim();
  const feedbackRaw = String(payload.FeedBack ?? '').trim();

  if (!employeeId || !EMPLOYEE_ID_PATTERN.test(employeeId)) {
    errors.Employee_ID = 'Employee_ID is required, must be 3-20 characters, and can only contain letters, numbers, hyphens, or underscores.';
  }

  if (!ROLE_LEVEL_OPTIONS.includes(roleLevel)) {
    errors.role_level = 'Role level is required and must be Senior, Junior, Trainee, or Intern.';
  }

  if (!POSITION_OPTIONS.includes(position)) {
    errors.position = 'Position is required and must be one of the supported roles.';
  }

  if (!/^\d+$/.test(ageRaw)) {
    errors.age = 'Age is required and must be a whole number between 18 and 65.';
  }

  const age = Number(ageRaw);
  if (!errors.age && (age < 18 || age > 65)) {
    errors.age = 'Age is required and must be a whole number between 18 and 65.';
  }

  if (!experienceRaw || !hasAtMostOneDecimal(experienceRaw)) {
    errors.experience_years = 'Experience years is required, must be between 0 and 47, and can have at most 1 decimal place.';
  }

  const experienceYears = Number(experienceRaw);
  if (!errors.experience_years && (experienceYears < 0 || experienceYears > 47)) {
    errors.experience_years = 'Experience years is required, must be between 0 and 47, and can have at most 1 decimal place.';
  }

  if (!errors.experience_years && !errors.age && experienceYears > age - 18) {
    errors.experience_years = 'Experience years cannot be greater than age - 18.';
  }

  if (!Number.isInteger(avgTaskCompletion) || !RATING_OPTIONS.includes(avgTaskCompletion)) {
    errors.avg_task_completion = 'Avg task completion is required and must be an integer between 1 and 5.';
  }

  if (!Number.isInteger(attendanceRate) || !RATING_OPTIONS.includes(attendanceRate)) {
    errors.attendance_rate = 'Attendance rate is required and must be an integer between 1 and 5.';
  }

  if (!/^\d+$/.test(projectsHandledRaw)) {
    errors.projects_handled = 'Projects handled is required and must be a whole number between 0 and 100.';
  }

  const projectsHandled = Number(projectsHandledRaw);
  if (!errors.projects_handled && (projectsHandled < 0 || projectsHandled > 100)) {
    errors.projects_handled = 'Projects handled is required and must be a whole number between 0 and 100.';
  }

  if (!overtimeRaw || !hasAtMostOneDecimal(overtimeRaw)) {
    errors.overtime_hours = 'Overtime hours is required, must be between 0 and 200, and can have at most 1 decimal place.';
  }

  const overtimeHours = Number(overtimeRaw);
  if (!errors.overtime_hours && (overtimeHours < 0 || overtimeHours > 200)) {
    errors.overtime_hours = 'Overtime hours is required, must be between 0 and 200, and can have at most 1 decimal place.';
  }

  if (!trainingRaw || !hasAtMostOneDecimal(trainingRaw)) {
    errors.training_hours = 'Training hours is required, must be between 0 and 500, and can have at most 1 decimal place.';
  }

  const trainingHours = Number(trainingRaw);
  if (!errors.training_hours && (trainingHours < 0 || trainingHours > 500)) {
    errors.training_hours = 'Training hours is required, must be between 0 and 500, and can have at most 1 decimal place.';
  }

  if (!feedbackRaw || !hasAtMostTwoDecimals(feedbackRaw)) {
    errors.FeedBack = 'FeedBack is required and must be a number between 0 and 100 with up to 2 decimal places.';
  }

  const feedbackScore = Number(feedbackRaw);
  if (!errors.FeedBack && (feedbackScore < 0 || feedbackScore > 100)) {
    errors.FeedBack = 'FeedBack is required and must be a number between 0 and 100 with up to 2 decimal places.';
  }

  return {
    errors,
    sanitizedPayload: {
      Employee_ID: employeeId,
      employee_id: employeeId,
      role_level: roleLevel,
      position,
      age,
      experience_years: experienceYears,
      avg_task_completion: avgTaskCompletion,
      attendance_rate: attendanceRate,
      projects_handled: projectsHandled,
      overtime_hours: overtimeHours,
      training_hours: trainingHours,
      FeedBack: feedbackScore,
    },
  };
}

async function findEmployeeByIdentifier(employeeId) {
  return Employee.findOne({
    $or: [
      { Employee_ID: employeeId },
      { employee_id: employeeId },
    ],
  });
}

const employeeSchema = new mongoose.Schema({
  Employee_ID: { type: String, required: true, unique: true, trim: true },
  employee_id: { type: String, trim: true },
  role_level: { type: String, required: true, trim: true, enum: ROLE_LEVEL_OPTIONS },
  position: { type: String, required: true, trim: true, enum: POSITION_OPTIONS },
  age: { type: Number, required: true, min: 18, max: 65 },
  experience_years: { type: Number, required: true, min: 0, max: 47 },
  avg_task_completion: { type: Number, required: true, enum: RATING_OPTIONS },
  attendance_rate: { type: Number, required: true, enum: RATING_OPTIONS },
  projects_handled: { type: Number, required: true, min: 0, max: 100 },
  overtime_hours: { type: Number, required: true, min: 0, max: 200 },
  training_hours: { type: Number, required: true, min: 0, max: 500 },
  FeedBack: { type: Number, required: true, min: 0, max: 100 },
}, { timestamps: true });

const Employee = mongoose.model('Employee', employeeSchema);

// --------------------
// JWT Middleware
// --------------------
const JWT_SECRET = 'your_jwt_secret65ase';
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).send('Unauthorized');

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).send('Forbidden');
    req.user = user;
    next();
  });
};

// --------------------
// Register Route
// --------------------
app.post('/api/register', async (req, res) => {
  try {
    const { fullName, contact, email, playerType, password } = req.body;

    logger.info('Received data for registration', { fullName, contact, email, playerType });

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email is already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      fullName,
      contact,
      email,
      playerType,
      password: hashedPassword
    });

    await newUser.save();
    logger.info('User registered successfully', { fullName, email });
    res.status(201).json({ message: 'User registered successfully' });

  } catch (error) {
    logger.error('Error saving user', { message: error.message });
    res.status(500).json({ message: 'An error occurred', error: error.message });
  }
});

// --------------------
// Login Route
// --------------------
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid email or password' });

    const token = jwt.sign({ _id: user._id }, JWT_SECRET, { expiresIn: '1h' });

    res.json({
      token,
      user: {
        _id: user._id,
        email: user.email,
      }
    });

  } catch (error) {
    logger.error('Login error:', { message: error.message });
    res.status(500).json({ message: 'Login failed' });
  }
});

// --------------------
// Example Protected Route
// --------------------
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching profile', error: error.message });
  }
});

app.post('/api/employees', async (req, res) => {
  try {
    const { errors, sanitizedPayload } = validateEmployeePayload(req.body || {});

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        message: 'Validation failed',
        errors,
      });
    }

    const existingEmployee = await findEmployeeByIdentifier(sanitizedPayload.Employee_ID);
    const employee = await Employee.findOneAndUpdate(
      existingEmployee
        ? { _id: existingEmployee._id }
        : {
            $or: [
              { Employee_ID: sanitizedPayload.Employee_ID },
              { employee_id: sanitizedPayload.Employee_ID },
            ],
          },
      sanitizedPayload,
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    logger.info('Employee saved successfully', {
      Employee_ID: employee.Employee_ID,
      position: employee.position,
    });

    res.status(existingEmployee ? 200 : 201).json({
      message: existingEmployee ? 'Employee updated successfully' : 'Employee added successfully',
      employee,
    });
  } catch (error) {
    logger.error('Error saving employee', { message: error.message });
    res.status(500).json({ message: 'Failed to add employee', error: error.message });
  }
});

app.put('/api/employees/:employeeId', async (req, res) => {
  try {
    const routeEmployeeId = String(req.params.employeeId || '').trim();
    const { errors, sanitizedPayload } = validateEmployeePayload(req.body || {});

    if (!routeEmployeeId) {
      return res.status(400).json({ message: 'Employee ID is required' });
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        message: 'Validation failed',
        errors,
      });
    }

    const existingEmployee = await findEmployeeByIdentifier(routeEmployeeId);
    if (!existingEmployee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    if (sanitizedPayload.Employee_ID !== routeEmployeeId) {
      const conflictingEmployee = await findEmployeeByIdentifier(sanitizedPayload.Employee_ID);
      if (conflictingEmployee && String(conflictingEmployee._id) !== String(existingEmployee._id)) {
        return res.status(409).json({ message: 'Employee ID already exists' });
      }
    }

    const employee = await Employee.findByIdAndUpdate(
      existingEmployee._id,
      sanitizedPayload,
      {
        new: true,
        runValidators: true,
      }
    );

    logger.info('Employee updated successfully', {
      Employee_ID: employee.Employee_ID,
      position: employee.position,
    });

    res.json({
      message: 'Employee updated successfully',
      employee,
    });
  } catch (error) {
    logger.error('Error updating employee', { message: error.message });
    res.status(500).json({ message: 'Failed to update employee', error: error.message });
  }
});

app.delete('/api/employees/:employeeId', async (req, res) => {
  try {
    const routeEmployeeId = String(req.params.employeeId || '').trim();

    if (!routeEmployeeId) {
      return res.status(400).json({ message: 'Employee ID is required' });
    }

    const employee = await findEmployeeByIdentifier(routeEmployeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    await Employee.findByIdAndDelete(employee._id);

    logger.info('Employee deleted successfully', {
      Employee_ID: employee.Employee_ID || employee.employee_id,
    });

    res.json({
      message: 'Employee deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting employee', { message: error.message });
    res.status(500).json({ message: 'Failed to delete employee', error: error.message });
  }
});

app.get('/api/employees', async (req, res) => {
  try {
    const employees = await Employee.find({})
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const normalizedEmployees = employees.map((employee) => ({
      ...employee,
      Employee_ID: employee.Employee_ID || employee.employee_id || '',
      role_level: employee.role_level || '',
      position: employee.position || employee.job_role || '',
      overtime_hours: employee.overtime_hours ?? 0,
      FeedBack: employee.FeedBack ?? '',
    }));

    res.json({
      employees: normalizedEmployees,
      total: normalizedEmployees.length,
    });
  } catch (error) {
    logger.error('Error fetching employees', { message: error.message });
    res.status(500).json({ message: 'Failed to fetch employees', error: error.message });
  }
});

// --------------------
// Start Server
// --------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});