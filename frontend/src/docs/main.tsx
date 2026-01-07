import React from 'react';
import ReactDOM from 'react-dom/client';
import { DocumentationApp } from './DocumentationApp';
import '../index.css';

ReactDOM.createRoot(document.getElementById('docs-root')!).render(
  <React.StrictMode>
    <DocumentationApp />
  </React.StrictMode>
);


