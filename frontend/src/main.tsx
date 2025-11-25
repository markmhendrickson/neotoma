import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const baseTitle = document.title;
const worktreeSuffix = import.meta.env.VITE_WORKTREE_SUFFIX;
if (typeof worktreeSuffix === 'string' && worktreeSuffix.trim().length > 0) {
  document.title = `${baseTitle}${worktreeSuffix}`;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

