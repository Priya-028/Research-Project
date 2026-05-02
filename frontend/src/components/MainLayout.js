
import React, { useContext, useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from './AuthContext';
import './MainLayout.css';

const MainLayout = ({ children }) => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/Register');
  };

  const isActive = (path) => {
    return location.pathname === path;
  };

  const closeMobileSidebar = () => setMobileOpen(false);

  const isAuthPage =
    location.pathname.toLowerCase() === '/login' ||
    location.pathname.toLowerCase() === '/register';
  const isCandidatePage = location.pathname.toLowerCase().startsWith('/candidate/interview');
  const isClubUser = user?.userType === 'club';
  const isPlayerUser = !!user && !isClubUser;

  const primaryNavItems = useMemo(() => {
    if (!user) {
      return [
        { path: '/', label: 'Home', icon: 'fa-home' },
        { path: '/register', label: 'Register', icon: 'fa-user-plus' },
        { path: '/login', label: 'Login', icon: 'fa-sign-in-alt' },
      ];
    }

    if (user && !isClubUser) {
      return [
        { path: '/', label: 'Dashboard', icon: 'fa-home' },
        { path: '/CandidateFitPredictor', label: 'Candidate Fit', icon: 'fa-chart-line' },
        { path: '/Productivity_Predictor', label: 'Productivity', icon: 'fa-tachometer-alt' },
        { path: '/Employee_Attrition', label: 'Attrition', icon: 'fa-exclamation-triangle' },
        { path: '/Dynamic_Interview', label: 'Interview', icon: 'fa-comments' },
      ];
    }

    if (isClubUser) {
      return [
        { path: '/RankedPlayers', label: 'Ranked Players', icon: 'fa-trophy' },
      ];
    }

    return [];
  }, [isClubUser, user]);

  if (isAuthPage) {
    return (
      <div className="app-container auth-layout-surface">
        <main className="main-content auth-main-content">
          {children}
        </main>
      </div>
    );
  }

  if (isCandidatePage) {
    // Render candidate interview pages without the dashboard/sidebar shell
    return (
      <main className="main-content auth-main-content">
        {children}
      </main>
    );
  }

  return (
    <div className="app-container">
      {/* Mobile Hamburger Button */}
      <button
        className="mobile-menu-toggle"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle menu"
      >
        <i className={`fas fa-${mobileOpen ? 'times' : 'bars'}`}></i>
      </button>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={closeMobileSidebar}></div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-container">
            <div className="sidebar-brand-mark">
              <img src="/static/Assets/images/logo.png" alt="AI HCM System" className="sidebar-logo" />
            </div>
            {!sidebarCollapsed && (
              <div className="sidebar-brand-copy">
                <span className="logo-text">AI HCM</span>
              </div>
            )}
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <i className={`fas fa-chevron-${sidebarCollapsed ? 'right' : 'left'}`}></i>
          </button>
        </div>

        <div className="sidebar-content">
          <nav className="sidebar-nav">
            {!sidebarCollapsed && <span className="sidebar-section-title">Menu</span>}
            <ul className="nav-menu">
              {primaryNavItems.map((item) => (
                <li key={item.path} className={`nav-item ${isActive(item.path) ? 'active' : ''}`}>
                  <Link to={item.path} className="nav-link" onClick={closeMobileSidebar}>
                    <span className="nav-icon-wrap">
                      <i className={`fas ${item.icon}`}></i>
                    </span>
                    <span className="nav-label">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>

            {user && (
              <>
                {!sidebarCollapsed && <span className="sidebar-section-title secondary">Account</span>}
                <ul className="nav-menu utility-menu">
                  <li className="nav-item logout">
                    <button className="nav-link logout-btn" onClick={handleLogout}>
                      <span className="nav-icon-wrap">
                        <i className="fas fa-sign-out-alt"></i>
                      </span>
                      <span className="nav-label">Logout</span>
                    </button>
                  </li>
                </ul>
              </>
            )}
          </nav>
        </div>

        <div className="sidebar-footer">
          {user ? (
            <div className="sidebar-profile-card">
              <div className="user-avatar">
                <i className="fas fa-user"></i>
              </div>
              {!sidebarCollapsed && (
                <div className="user-details">
                  <span className="user-name">{user.email}</span>
                  <span className="user-role">{isPlayerUser ? 'HR Workspace User' : 'System User'}</span>
                </div>
              )}
            </div>
          ) : (
            !sidebarCollapsed && <p>© 2026 AI HCM System</p>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className={`main-content ${sidebarCollapsed ? 'expanded' : ''}`}>
        {children}
      </main>
    </div>
  );
};

export default MainLayout;