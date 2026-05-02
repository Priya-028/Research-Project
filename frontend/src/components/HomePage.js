import React from 'react';
import { Link } from 'react-router-dom';
import './Dashboard.css';

const HomePage = () => {
  const heroStyle = {
    '--hero-bg-image': `url(${process.env.PUBLIC_URL}/static/Assets/images/login-hero-robot.png)`,
  };

  return (
    <div className="dashboard-container">
      {/* Hero Section */}
      <div className="dashboard-hero" style={heroStyle}>
        <div className="hero-text-content">
          <div className="hero-badge">
            <i className="fas fa-robot"></i>
            <span>AI-Powered HCM System</span>
          </div>

          <h1 className="hero-title">
            Welcome to
            <span className="hero-title-break gradient-text">AI_HCM</span>
          </h1>

          <p className="hero-subtitle">
            Revolutionizing Human Capital Management with Artificial Intelligence. Streamline your HR processes and make data-driven decisions.
          </p>

          <div className="hero-stats">
            <div className="stat-item">
              <div className="stat-item-icon">
                <i className="fas fa-brain"></i>
              </div>
              <div className="stat-content">
                <span className="stat-value">4</span>
                <span className="stat-label">AI Predictors</span>
              </div>
            </div>

            <div className="stat-item">
              <div className="stat-item-icon">
                <i className="fas fa-database"></i>
              </div>
              <div className="stat-content">
                <span className="stat-value">100%</span>
                <span className="stat-label">Data-Driven</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Features Section */}
      <div className="features-section">
        <div className="section-header">
          <h2>AI-Powered HR Solutions</h2>
          <p>Leverage cutting-edge machine learning for smarter HR decisions</p>
        </div>

        <div className="features-grid">
          <div className="feature-card feature-blue">
            <div className="feature-icon">
              <i className="fas fa-file-lines"></i>
            </div>
            <h3>Candidate Fit Predictor</h3>
            <p>Match candidates with job requirements using AI scoring</p>
          </div>

          <div className="feature-card feature-cyan">
            <div className="feature-icon">
              <i className="fas fa-gauge-high"></i>
            </div>
            <h3>Productivity Predictor</h3>
            <p>Forecast performance &amp; identify key patterns</p>
          </div>

          <div className="feature-card feature-orange">
            <div className="feature-icon">
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <h3>Attrition Predictor</h3>
            <p>Detect risk &amp; take proactive retention actions</p>
          </div>

          <div className="feature-card feature-violet">
            <div className="feature-icon">
              <i className="fas fa-circle-user"></i>
            </div>
            <h3>Dynamic Interview</h3>
            <p>AI-driven questions &amp; evaluation system</p>

          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="how-it-works">
        <div className="section-header">
          <h2>How It Works</h2>
          <p>Simple, intuitive, and powerful - get started in minutes</p>
        </div>

        <div className="steps-container">
          <div className="step-item">
            <div className="step-number">1</div>
            <div className="step-content">
              <h3>Register Account</h3>
              <p>Create your account with basic information to access our AI tools</p>
            </div>
          </div>

          <div className="step-item">
            <div className="step-number">2</div>
            <div className="step-content">
              <h3>Upload Data</h3>
              <p>Upload employee CSV files or input data for analysis</p>
            </div>
          </div>

          <div className="step-item">
            <div className="step-number">3</div>
            <div className="step-content">
              <h3>Get Insights</h3>
              <p>Receive AI-powered predictions and actionable insights</p>
            </div>
          </div>

          <div className="step-item">
            <div className="step-number">4</div>
            <div className="step-content">
              <h3>Make Decisions</h3>
              <p>Use data-driven insights for better HR decisions</p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="cta-section">
        <div className="cta-content">
          <h2>Ready to Transform Your HR Operations?</h2>
          <p>Join hundreds of companies using AI to make smarter human capital decisions</p>
          <div className="cta-buttons">
            <Link to="/Player_register" className="cta-btn primary">
              <i className="fas fa-user-plus"></i>
              Get Started
            </Link>
            <Link to="/Player_login" className="cta-btn secondary">
              <i className="fas fa-sign-in-alt"></i>
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;