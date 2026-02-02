import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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

Use the directory on the left to navigate through the documentation sections.`;

export function DocumentationApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const [content, setContent] = useState(WELCOME_CONTENT);
  const [loading, setLoading] = useState(false);

  // Load content on mount and when path changes
  useEffect(() => {
    const path = location.pathname;
    // Skip loading for root/welcome path
    if (path === '/docs' || path === '/docs/') {
      setContent(WELCOME_CONTENT);
      setLoading(false);
      return;
    }
    loadDocumentation(path);
  }, [location.pathname]);

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
    // Use React Router navigation
    navigate(href);
  };

  const handleSearch = (query: string) => {
    console.log('Search query:', query);
    // TODO: Implement search functionality
    // This could redirect to a search results page or filter the navigation
  };

  return (
    <DocumentationPage onSearch={handleSearch} onNavigate={handleNavigate}>
      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Loading documentation...</p>
        </div>
      ) : (
        <MarkdownContent content={content} onNavigate={handleNavigate} />
      )}
    </DocumentationPage>
  );
}


