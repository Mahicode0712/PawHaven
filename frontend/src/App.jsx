import React, { useEffect, useState } from 'react';
import {
  Activity,
  FileBarChart2,
  Heart,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  PawPrint,
  RefreshCw,
  Shield,
  Stethoscope,
  Users,
} from 'lucide-react';
import { api } from './api';
import { Dashboard } from './pages/Dashboard';
import { AnimalsAndIntake } from './pages/AnimalsAndIntake';
import { MedicalAndVaccines } from './pages/MedicalAndVaccines';
import { AdoptionsAndFollowups } from './pages/AdoptionsAndFollowups';
import { ReportsCenter } from './pages/ReportsCenter';
import { AdminUsers } from './pages/AdminUsers';
import { AdopterDashboard } from './pages/AdopterDashboard';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';

const NAV_BY_ROLE = {
  ADMIN: [
    { id: 'dashboard', label: 'Admin Dashboard', icon: LayoutDashboard },
    { id: 'animals', label: 'Animals & Capacity', icon: PawPrint },
    { id: 'medical', label: 'Medical & Vaccines', icon: Stethoscope },
    { id: 'adoptions', label: 'Adoptions & Follow-Ups', icon: HeartHandshake },
    { id: 'reports', label: 'Reports & Certificates', icon: FileBarChart2 },
    { id: 'admin-users', label: 'Users & Staff', icon: Users },
  ],
  SHELTER_STAFF: [
    { id: 'dashboard', label: 'Staff Dashboard', icon: LayoutDashboard },
    { id: 'animals', label: 'Animals & Capacity', icon: PawPrint },
    { id: 'medical', label: 'Medical & Vaccines', icon: Stethoscope },
    { id: 'adoptions', label: 'Adoptions & Follow-Ups', icon: HeartHandshake },
    { id: 'reports', label: 'Reports & Certificates', icon: FileBarChart2 },
  ],
  ADOPTER: [
    { id: 'dashboard', label: 'Adopter Dashboard', icon: LayoutDashboard },
    { id: 'browse-pets', label: 'Browse Pets', icon: PawPrint },
    { id: 'my-applications', label: 'My Applications & Certs', icon: Heart },
  ],
};

function readHashRoute() {
  return window.location.hash.replace(/^#\/?/, '') || '';
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authNotice, setAuthNotice] = useState('');

  const [activeTab, setActiveTab] = useState('dashboard');
  const [metadata, setMetadata] = useState({ species: [], breeds: [], vaccine_types: [] });
  const [zones, setZones] = useState([]);
  const [refreshTick, setRefreshTick] = useState(0);

  const navigate = (tabId) => {
    setActiveTab(tabId);
    window.location.hash = `#/${tabId}`;
  };

  useEffect(() => {
    api
      .me()
      .then((res) => {
        setUser(res.user);
        const hash = readHashRoute();
        if (hash && hash !== 'login' && hash !== 'register') {
          setActiveTab(hash);
        } else {
          setActiveTab('dashboard');
        }
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setAuthChecked(true));

    const onHashChange = () => {
      const hash = readHashRoute();
      if (hash) setActiveTab(hash);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!user) return;
    api
      .getMetadata()
      .then(setMetadata)
      .catch(() => {});

    if (user.role === 'ADMIN' || user.role === 'SHELTER_STAFF') {
      api
        .getZones()
        .then(setZones)
        .catch(() => {});
    }
  }, [user, refreshTick]);

  const triggerRefresh = () => setRefreshTick((t) => t + 1);

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    setAuthNotice('');
    navigate('dashboard');
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    setMetadata({ species: [], breeds: [], vaccine_types: [] });
    setZones([]);
    setAuthMode('login');
    setAuthNotice('You have been signed out securely.');
    window.location.hash = '#/login';
  };

  if (!authChecked) {
    return (
      <div className="auth-shell">
        <div className="card" style={{ padding: 28 }}>Verifying session...</div>
      </div>
    );
  }

  if (!user) {
    if (authMode === 'register' || activeTab === 'register') {
      return (
        <RegisterPage
          onRegistered={(msg) => {
            setAuthNotice(msg);
            setAuthMode('login');
            window.location.hash = '#/login';
          }}
          onGoLogin={() => {
            setAuthMode('login');
            window.location.hash = '#/login';
          }}
        />
      );
    }
    return (
      <LoginPage
        notice={authNotice}
        onLoginSuccess={handleLoginSuccess}
        onGoRegister={() => {
          setAuthNotice('');
          setAuthMode('register');
          window.location.hash = '#/register';
        }}
      />
    );
  }

  const navItems = NAV_BY_ROLE[user.role] || [];
  const allowedIds = new Set(navItems.map((i) => i.id));
  const isAuthorized = allowedIds.has(activeTab);

  return (
    <div className="app-shell">
      <aside className="sidebar no-print">
        <div className="brand">
          <div className="brand-icon">
            <PawPrint size={22} />
          </div>
          <div>
            <div className="brand-title">PawHaven</div>
            <div className="brand-sub">Shelter & Adoption DBMS</div>
          </div>
        </div>

        <div className="user-panel">
          <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#ffffff' }}>
            {user.full_name}
          </div>
          <div style={{ fontSize: '0.76rem', color: '#a8beb4', wordBreak: 'break-all' }}>
            {user.email}
          </div>
          <div style={{ marginTop: 2 }}>
            <span className="badge badge-success">
              <Shield size={11} /> {user.role.replace('_', ' ')}
            </span>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-btn ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => navigate(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div style={{ fontWeight: 600, color: '#edf4f0', marginBottom: 4 }}>
            <Activity size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />
            RBAC + 3NF Engine
          </div>
          <div>Cookie Session • CSRF Protected • BEGIN IMMEDIATE</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              className="btn btn-sm"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={triggerRefresh}
            >
              <RefreshCw size={13} /> Refresh
            </button>
            <button
              className="btn btn-sm btn-danger"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={handleLogout}
            >
              <LogOut size={13} /> Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        {!isAuthorized ? (
          <UnauthorizedPage role={user.role} onReturn={() => navigate('dashboard')} />
        ) : user.role === 'ADOPTER' ? (
          <AdopterDashboard
            activeSection={activeTab}
            onNavigate={navigate}
            refreshTick={refreshTick}
            onChanged={triggerRefresh}
          />
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <Dashboard userRole={user.role} refreshTick={refreshTick} onNavigate={navigate} />
            )}
            {activeTab === 'animals' && (
              <AnimalsAndIntake
                userRole={user.role}
                metadata={metadata}
                zones={zones}
                refreshTick={refreshTick}
                onChanged={triggerRefresh}
              />
            )}
            {activeTab === 'medical' && (
              <MedicalAndVaccines
                metadata={metadata}
                refreshTick={refreshTick}
                onChanged={triggerRefresh}
              />
            )}
            {activeTab === 'adoptions' && (
              <AdoptionsAndFollowups
                refreshTick={refreshTick}
                onChanged={triggerRefresh}
              />
            )}
            {activeTab === 'reports' && (
              <ReportsCenter refreshTick={refreshTick} />
            )}
            {activeTab === 'admin-users' && user.role === 'ADMIN' && (
              <AdminUsers
                currentUser={user}
                refreshTick={refreshTick}
                onChanged={triggerRefresh}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
