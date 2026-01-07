import { useState, useEffect } from 'react';
import { DocumentationLayout } from './DocumentationLayout';
import { DocumentationPage } from './DocumentationPage';
import { MarkdownContent } from './MarkdownContent';

const WELCOME_CONTENT = `# Neotoma Documentation

Welcome to the Neotoma documentation.

## Quick Links

- **[Getting Started](/docs/developer/getting_started.md)** - Setup and configuration
- **[Architecture Overview](/docs/architecture/architecture.md)** - System design and structure
- **[API Reference](/docs/specs/MCP_SPEC.md)** - MCP and REST API documentation
- **[Developer Guides](/docs/developer/)** - Development workflows and setup

## Overview

Neotoma is a personal knowledge management system that stores, organizes, and retrieves information from various sources.

Use the sidebar to navigate through the documentation sections.`;

export function DocumentationApp() {
  // Initialize currentPath from window location
  const getInitialPath = () => {
    const path = window.location.pathname;
    // If we're on /docs or /docs/, show welcome
    if (path === '/docs' || path === '/docs/') {
      return '/docs/';
    }
    // Otherwise use the current path
    return path;
  };

  const [currentPath, setCurrentPath] = useState(getInitialPath());
  const [content, setContent] = useState(WELCOME_CONTENT);
  const [loading, setLoading] = useState(false);

  // Load content on mount and when path changes
  useEffect(() => {
    // Skip loading for root/welcome path
    if (currentPath === '/docs/' || currentPath === '/docs') {
      setContent(WELCOME_CONTENT);
      setLoading(false);
      return;
    }
    loadDocumentation(currentPath);
  }, [currentPath]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      setCurrentPath(path);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const loadDocumentation = async (path: string) => {
    setLoading(true);
    try {
      // For markdown files, explicitly request as markdown
      const headers: HeadersInit = {};
      if (path.endsWith('.md')) {
        headers['Accept'] = 'text/markdown';
      }
      
      const response = await fetch(path, { headers });
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        // Accept markdown content type or assume text/markdown for .md files
        if (contentType.includes('text/markdown') || path.endsWith('.md')) {
          const text = await response.text();
          setContent(text);
        } else {
          // If we get HTML or other content, try parsing as text anyway
          const text = await response.text();
          // If it looks like HTML, show error message
          if (text.trim().startsWith('<!')) {
            setContent(`# Documentation\n\nDocumentation for \`${path}\` is not yet available in the browser-based viewer.\n\nThis content is available in the repository at \`${path}\`.`);
          } else {
            setContent(text);
          }
        }
      } else {
        setContent(`# Error\n\nCould not load documentation for path: ${path}\n\nStatus: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error loading documentation:', error);
      setContent(`# Error\n\nFailed to load documentation for \`${path}\`\n\nError: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (href: string) => {
    // If navigating to main app, do full page navigation
    if (href === '/') {
      window.location.href = '/';
      return;
    }
    // Update path and push to history
    setCurrentPath(href);
    window.history.pushState({}, '', href);
    // Load content for the new path
    if (href === '/docs/' || href === '/docs') {
      setContent(WELCOME_CONTENT);
      setLoading(false);
    } else {
      loadDocumentation(href);
    }
  };

  const handleSearch = (query: string) => {
    console.log('Search query:', query);
    // TODO: Implement search functionality
    // This could redirect to a search results page or filter the navigation
  };

  return (
    <DocumentationLayout currentPath={currentPath} onNavigate={handleNavigate}>
      <DocumentationPage onSearch={handleSearch}>
        {loading ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <p className="text-[hsl(var(--doc-secondary))]">Loading documentation...</p>
          </div>
        ) : (
          <MarkdownContent content={content} />
        )}
      </DocumentationPage>
    </DocumentationLayout>
  );
}


