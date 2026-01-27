import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuth } from './contexts/AuthContext';
import { LogOut, FileText, Users, Calendar, BarChart, Upload, Database, Network } from "lucide-react";
import { Button } from './components/ui/button';

// Initialize theme on app load
function initializeTheme() {
  const stored = localStorage.getItem("theme") || "system";
  const root = document.documentElement;
  
  if (stored === "system") {
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", systemPrefersDark);
  } else {
    root.classList.toggle("dark", stored === "dark");
  }
}

// Initialize theme before React renders
initializeTheme();

// Wrapper component to provide auth context to ErrorBoundary
function AppWithErrorBoundary() {
  const { user, signOut } = useAuth();
  
  const menuItems = [
    { path: "/", label: "Dashboard", icon: BarChart },
    { path: "/sources", label: "Sources", icon: FileText },
    { path: "/entities", label: "Entities", icon: Users },
    { path: "/schemas", label: "Schemas", icon: Database },
    { path: "/relationships", label: "Relationships", icon: Network },
    { path: "/timeline", label: "Timeline", icon: Calendar },
    { path: "/upload", label: "Upload", icon: Upload },
  ];

  const headerActions = (
    <>
      <span className="text-sm text-muted-foreground">{user?.email}</span>
      <Button variant="ghost" size="sm" onClick={signOut}>
        <LogOut className="h-4 w-4 mr-2" />
        Sign Out
      </Button>
    </>
  );

  return (
    <ErrorBoundary showLayout={true} menuItems={menuItems} headerActions={headerActions}>
      <App />
    </ErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppWithErrorBoundary />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

