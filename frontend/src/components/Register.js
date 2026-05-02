
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Auth.css';

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    mobile: '',
    address: '',
    password: '',
    confirmPassword: ''
  });

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const validateForm = () => {
    if (formData.password !== formData.confirmPassword) {
      setMessage('Passwords do not match');
      setMessageType('danger');
      return false;
    }
    if (formData.password.length < 6) {
      setMessage('Password must be at least 6 characters');
      setMessageType('danger');
      return false;
    }
    return true;
  };

  const handleRegister = async (event) => {
    event.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('http://localhost:5000/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fullName: formData.fullName,
          email: formData.email,
          mobile: formData.mobile,
          address: formData.address,
          password: formData.password,
          userType: 'Player'
        })
      });

      const result = await response.json();

      if (response.ok) {
        setMessage('Registration successful! Redirecting to login...');
        setMessageType('success');
        setTimeout(() => {
          navigate('/Login');
        }, 2000);
      } else {
        setMessage(result.message || 'Registration failed');
        setMessageType('danger');
      }
    } catch (error) {
      console.error('Error during registration:', error);
      setMessage('An error occurred. Please try again.');
      setMessageType('danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      {/* Visual Left Side */}
      <div className="auth-hero-section">
        <img src="/static/Assets/images/login-hero-robot.png" alt="AI Robot Greeting" />
      </div>

      {/* Form Right Side */}
      <div className="auth-form-section">
        <div className="auth-glass-card">
          <div className="auth-header">
            <div className="auth-header-icon">
              <i className="fas fa-user-plus"></i>
            </div>
            <h2>Join HR Buddy!</h2>
            <p>Create your account to start your AI journey</p>
          </div>

          {message && (
            <div className={`alert-message ${messageType}`}>
              <i className={`fas fa-${messageType === 'success' ? 'check-circle' : 'exclamation-circle'}`}></i>
              <span>{message}</span>
              <button className="auth-close" onClick={() => setMessage('')} type="button">×</button>
            </div>
          )}

          <form onSubmit={handleRegister}>
            <div className="auth-form-group">
              <div className="input-wrapper">
                <div className="icon-container">
                  <i className="fas fa-user"></i>
                </div>
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  placeholder="Full Name"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  required
                  className="auth-form-control"
                />
              </div>
            </div>

            <div className="auth-form-group">
              <div className="input-wrapper">
                <div className="icon-container">
                  <i className="fas fa-envelope"></i>
                </div>
                <input
                  type="email"
                  id="email"
                  name="email"
                  placeholder="Email Address"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="auth-form-control"
                />
              </div>
            </div>

            <div className="auth-form-row">
              <div className="auth-form-group">
                <div className="input-wrapper">
                  <div className="icon-container">
                    <i className="fas fa-phone"></i>
                  </div>
                  <input
                    type="tel"
                    id="mobile"
                    name="mobile"
                    placeholder="Mobile"
                    value={formData.mobile}
                    onChange={handleInputChange}
                    required
                    className="auth-form-control"
                  />
                </div>
              </div>

              <div className="auth-form-group">
                <div className="input-wrapper">
                  <div className="icon-container">
                    <i className="fas fa-map-marker-alt"></i>
                  </div>
                  <input
                    type="text"
                    id="address"
                    name="address"
                    placeholder="Address"
                    value={formData.address}
                    onChange={handleInputChange}
                    required
                    className="auth-form-control"
                  />
                </div>
              </div>
            </div>

            <div className="auth-form-row">
              <div className="auth-form-group">
                <div className="input-wrapper">
                  <div className="icon-container">
                    <i className="fas fa-lock"></i>
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    name="password"
                    placeholder="Password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                    className="auth-form-control"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <i className={`fas fa-${showPassword ? 'eye-slash' : 'eye'}`}></i>
                  </button>
                </div>
              </div>

              <div className="auth-form-group">
                <div className="input-wrapper">
                  <div className="icon-container">
                    <i className="fas fa-lock"></i>
                  </div>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    id="confirmPassword"
                    name="confirmPassword"
                    placeholder="Confirm"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    required
                    className="auth-form-control"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    <i className={`fas fa-${showConfirmPassword ? 'eye-slash' : 'eye'}`}></i>
                  </button>
                </div>
              </div>
            </div>

            <div className="auth-options">
              <input type="checkbox" id="terms" required />
              <label htmlFor="terms">I agree to the <a href="#">Terms of Conditions</a> and <a href="#">Privacy Policy</a></label>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  Creating Account...
                </>
              ) : (
                <>
                  Register Now
                </>
              )}
            </button>
          </form>

          <div className="auth-divider">
            <span>Already have an account? <Link to="/Login" style={{ color: '#4da8da', textDecoration: 'none', fontWeight: 600 }}>Sign In</Link></span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;