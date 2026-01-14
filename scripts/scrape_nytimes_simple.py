#!/usr/bin/env python3
"""
Simple NYTimes article scraper using Playwright with persistent browser context.
Uses your existing browser session if you're logged in to NYTimes.
"""

import sys
import json
from pathlib import Path

# Try to import playwright, with helpful error message
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Error: playwright not installed.")
    print("\nTo install:")
    print("  Option 1: Use web-scraper venv (recommended):")
    print("    cd mcp/web-scraper && source venv/bin/activate && python3 ../../scripts/scrape_nytimes_simple.py")
    print("\n  Option 2: Install in system Python:")
    print("    python3 -m pip install playwright")
    print("    python3 -m playwright install chromium")
    sys.exit(1)


def scrape_article(url: str):
    """Scrape NYTimes article using persistent browser context."""
    print(f"Scraping: {url}\n")
    
    with sync_playwright() as p:
        # Use persistent context to maintain cookies/session
        user_data_dir = Path.home() / ".playwright-nytimes"
        user_data_dir.mkdir(exist_ok=True)
        
        print("Launching browser (this may take a moment)...")
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(user_data_dir),
            headless=False,  # Visible so you can log in if needed
            args=['--disable-blink-features=AutomationControlled'],
        )
        
        page = context.pages[0] if context.pages else context.new_page()
        
        try:
            print("Navigating to article...")
            page.goto(url, wait_until="networkidle", timeout=60000)
            
            print("Waiting for content to load...")
            page.wait_for_timeout(3000)
            
            # Extract article content
            print("Extracting article content...")
            
            # Try multiple selectors for article content
            content = None
            for selector in [
                'article[data-testid="article"]',
                'section[data-testid="article-body"]',
                '.StoryBodyCompanionColumn',
                'article',
            ]:
                try:
                    elem = page.query_selector(selector)
                    if elem:
                        content = elem.inner_text()
                        if len(content) > 500:  # Make sure we got substantial content
                            print(f"✓ Found content using: {selector}")
                            break
                except:
                    continue
            
            if not content or len(content) < 500:
                # Fallback: get body text
                content = page.locator('body').inner_text()
            
            # Extract metadata
            title = page.title()
            
            # Try to get author
            author = None
            for selector in ['[data-testid="byline-author"]', '.byline-author', '[rel="author"]']:
                try:
                    elem = page.query_selector(selector)
                    if elem:
                        author = elem.inner_text().strip()
                        break
                except:
                    continue
            
            result = {
                "url": url,
                "title": title,
                "author": author,
                "content": content,
                "content_length": len(content),
            }
            
            print(f"\n✓ Success!")
            print(f"  Title: {title}")
            print(f"  Author: {author or 'Not found'}")
            print(f"  Content: {len(content)} characters\n")
            
            return result
            
        except Exception as e:
            print(f"\n✗ Error: {e}")
            print("\nIf you see a paywall:")
            print("  1. Log in to NYTimes in the browser window that opened")
            print("  2. Run this script again - it will use your saved session")
            raise
        finally:
            # Auto-close after a brief delay (or wait for user input if interactive)
            import time
            if '--interactive' in sys.argv:
                input("\nPress Enter to close the browser...")
            else:
                time.sleep(2)  # Brief delay to see results
            context.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Scrape a NYTimes article")
    parser.add_argument("url", nargs="?", default="https://www.nytimes.com/2026/01/13/opinion/openai-ai-bubble-financing.html", 
                       help="URL of the NYTimes article")
    parser.add_argument("--output", "-o", default="nytimes_article.json",
                       help="Output JSON file path")
    parser.add_argument("--interactive", action="store_true",
                       help="Wait for user input before closing browser")
    
    args = parser.parse_args()
    url = args.url
    output_file = args.output
    
    try:
        result = scrape_article(url)
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        print(f"✓ Saved to: {output_file}")
        print(f"\nArticle preview (first 500 chars):")
        print("=" * 60)
        print(result["content"][:500])
        print("...")
        
    except KeyboardInterrupt:
        print("\n\nCancelled")
        sys.exit(1)
    except Exception as e:
        print(f"\n\nError: {e}")
        sys.exit(1)
