#!/usr/bin/env python3
"""
Scrape a NYTimes article using Playwright.
Supports authenticated access if user is logged in via persistent browser context.
"""

import sys
import json
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Error: playwright not installed. Install with:")
    print("  pip install playwright")
    print("  playwright install chromium")
    sys.exit(1)


def scrape_nytimes_article(url: str, headless: bool = False, use_persistent_context: bool = True):
    """
    Scrape a NYTimes article.
    
    Args:
        url: URL of the NYTimes article
        headless: If False, launches visible browser (user can log in)
        use_persistent_context: If True, uses persistent browser context with cookies
    """
    print(f"Scraping NYTimes article: {url}")
    
    with sync_playwright() as p:
        if use_persistent_context:
            # Use persistent context to maintain cookies/session
            user_data_dir = Path.home() / ".playwright-browser-data"
            user_data_dir.mkdir(exist_ok=True)
            
            context = p.chromium.launch_persistent_context(
                user_data_dir=str(user_data_dir),
                headless=headless,
                args=['--disable-blink-features=AutomationControlled'],
            )
            page = context.pages[0] if context.pages else context.new_page()
        else:
            browser = p.chromium.launch(headless=headless)
            context = browser.new_context(
                args=['--disable-blink-features=AutomationControlled'],
            )
            page = context.new_page()
        
        try:
            print("Navigating to article...")
            page.goto(url, wait_until="networkidle", timeout=60000)
            
            # Wait for article content to load
            print("Waiting for content to load...")
            page.wait_for_timeout(3000)
            
            # Try to find the article content
            # NYTimes uses various selectors for article content
            article_selectors = [
                'article[data-testid="article"]',
                'article',
                '[data-testid="article-body"]',
                'section[data-testid="article-body"]',
                '.StoryBodyCompanionColumn',
                'div[class*="article"]',
            ]
            
            article_content = None
            for selector in article_selectors:
                try:
                    element = page.wait_for_selector(selector, timeout=5000)
                    if element:
                        article_content = element.inner_text()
                        print(f"Found article content using selector: {selector}")
                        break
                except Exception:
                    continue
            
            if not article_content:
                # Fallback: get all text from body
                print("Using fallback: extracting all body text")
                article_content = page.locator('body').inner_text()
            
            # Extract metadata
            title = page.title()
            
            # Try to get author
            author = None
            author_selectors = [
                '[data-testid="byline-author"]',
                '.byline-author',
                '[rel="author"]',
                'span[itemprop="author"]',
            ]
            for selector in author_selectors:
                try:
                    author_elem = page.query_selector(selector)
                    if author_elem:
                        author = author_elem.inner_text().strip()
                        break
                except Exception:
                    continue
            
            # Try to get publication date
            pub_date = None
            date_selectors = [
                'time[datetime]',
                '[data-testid="timestamp"]',
                'time',
            ]
            for selector in date_selectors:
                try:
                    date_elem = page.query_selector(selector)
                    if date_elem:
                        pub_date = date_elem.get_attribute('datetime') or date_elem.inner_text()
                        break
                except Exception:
                    continue
            
            result = {
                "url": url,
                "title": title,
                "author": author,
                "publication_date": pub_date,
                "content": article_content,
                "content_length": len(article_content) if article_content else 0,
            }
            
            print(f"\n✓ Successfully scraped article")
            print(f"  Title: {title}")
            print(f"  Author: {author or 'Not found'}")
            print(f"  Content length: {len(article_content) if article_content else 0} characters")
            
            return result
            
        except Exception as e:
            print(f"\n✗ Error scraping article: {e}")
            print("\nIf you see a paywall or login prompt:")
            print("  1. Set headless=False to see the browser")
            print("  2. Log in to NYTimes in the browser window")
            print("  3. The script will use your session for future runs")
            raise
        finally:
            if not use_persistent_context:
                context.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Scrape a NYTimes article")
    parser.add_argument("url", help="URL of the NYTimes article")
    parser.add_argument("--headless", action="store_true", help="Run browser in headless mode")
    parser.add_argument("--no-persistent", action="store_true", help="Don't use persistent browser context")
    parser.add_argument("--output", "-o", help="Output JSON file path")
    
    args = parser.parse_args()
    
    try:
        result = scrape_nytimes_article(
            args.url,
            headless=args.headless,
            use_persistent_context=not args.no_persistent,
        )
        
        if args.output:
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
            print(f"\n✓ Saved to: {args.output}")
        else:
            print("\n" + "="*60)
            print("ARTICLE CONTENT:")
            print("="*60)
            print(result["content"])
            
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\nError: {e}")
        sys.exit(1)
