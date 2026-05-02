
import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from './AuthContext';
import './Auth.css';

const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (response.ok) {
        setMessage('Login successful! Redirecting...');
        setMessageType('success');
        login(result.user._id, result.user.email, 'Player');
        setTimeout(() => {
          navigate('/');
        }, 1500);
      } else {
        setMessage(result.message || 'Invalid email or password');
        setMessageType('danger');
      }
    } catch (error) {
      console.error('Login error:', error);
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
              <i className="fas fa-robot"></i>
            </div>
            <h2>Welcome to HR Buddy!</h2>
            <p>Sign in to access your AI assistant</p>
          </div>

          {message && (
            <div className={`alert-message ${messageType}`}>
              <i className={`fas fa-${messageType === 'success' ? 'check-circle' : 'exclamation-circle'}`}></i>
              <span>{message}</span>
              <button className="alert-close" onClick={() => setMessage('')} type="button">×</button>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="auth-form-group">
              <div className="input-wrapper">
                <div className="icon-container">
                  <i className="fas fa-envelope"></i>
                </div>
                <input
                  type="email"
                  id="email"
                  name="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="auth-form-control"
                />
              </div>
            </div>

            <div className="auth-form-group">
              <div className="input-wrapper">
                <div className="icon-container">
                  <i className="fas fa-lock"></i>
                </div>
                <input
                  type="password"
                  id="password"
                  name="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                  className="auth-form-control"
                />
                <button type="button" className="password-toggle">
                  <i className="fas fa-eye-slash"></i>
                </button>
              </div>
            </div>

            <div className="auth-options">
              <input type="checkbox" id="remember" />
              <label htmlFor="remember">I agree to the <a href="#">Terms of Conditions</a> and <a href="#">Privacy Policy</a></label>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  Signing In...
                </>
              ) : (
                <>
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="auth-divider">
            <span>Don't have an account? <Link to="/Register" style={{ color: '#4da8da', textDecoration: 'none', fontWeight: 600 }}>Sign Up</Link></span>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Login;