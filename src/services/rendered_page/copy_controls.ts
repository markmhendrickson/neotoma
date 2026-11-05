import { createHash } from "node:crypto";

/** Only this immutable helper may execute; author HTML never supplies script. */
export const RENDERED_PAGE_COPY_SCRIPT = `
(function () {
  function initialize() {
    document.querySelectorAll('pre[data-copyable]').forEach(function (pre) {
      if (pre.dataset.neotomaCopyInitialized === 'true') return;
      pre.dataset.neotomaCopyInitialized = 'true';
      var controls = document.createElement('div');
      controls.className = 'neotoma-copy-controls';
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'neotoma-copy-button';
      var label = pre.getAttribute('data-copy-label') || 'Copy';
      button.textContent = label;
      var status = document.createElement('span');
      status.className = 'neotoma-copy-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      controls.appendChild(button);
      controls.appendChild(status);
      pre.parentNode.insertBefore(controls, pre);

      function selectText() {
        var range = document.createRange();
        range.selectNodeContents(pre);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }

      function copyLegacy(text) {
        var area = document.createElement('textarea');
        area.value = text;
        area.readOnly = true;
        area.style.position = 'fixed';
        area.style.top = '-9999px';
        document.body.appendChild(area);
        try {
          area.focus({ preventScroll: true });
          area.select();
          area.setSelectionRange(0, text.length);
          return document.execCommand('copy') === true;
        } catch (_) {
          return false;
        } finally {
          area.remove();
          button.focus();
        }
      }

      button.addEventListener('click', async function () {
        button.disabled = true;
        status.textContent = '';
        var text = pre.textContent;
        // Copy synchronously while activation is held: an opaque sandbox may
        // reject the permission-based Clipboard API before a fallback can run.
        var copied = copyLegacy(text);
        try {
          if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            copied = true;
          }
        } catch (_) {}
        button.disabled = false;
        button.focus({ preventScroll: true });
        if (copied) {
          button.textContent = pre.getAttribute('data-copied-label') || 'Copied';
          status.textContent = pre.getAttribute('data-copy-success') || 'Copied to clipboard.';
        } else {
          selectText();
          button.textContent = label;
          status.textContent = pre.getAttribute('data-copy-failure') || 'Text selected. Press Ctrl+C or Command+C to copy.';
        }
      });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
`;

export const RENDERED_PAGE_COPY_SCRIPT_HASH = createHash("sha256")
  .update(RENDERED_PAGE_COPY_SCRIPT, "utf8")
  .digest("base64");

// Enforced alongside the hash policy: this policy permits inline execution but
// has no external-script source. The intersection permits only the fixed helper.
export const RENDERED_PAGE_INLINE_ONLY_SCRIPT_POLICY =
  "script-src 'unsafe-inline'; script-src-attr 'none'";

/** A false positive only enables the fixed helper, never author-supplied code. */
export function hasRenderedPageCopyBlocks(htmlBody: string): boolean {
  const startTags = htmlBody.matchAll(/<pre(?=[\s/>])((?:"[^"]*"|'[^']*'|[^"'<>])*)>/gi);
  for (const match of startTags) {
    // Attribute values may contain > or the marker's name. Neither terminates
    // the tag or opts in a different attribute.
    const attributes = match[1].replace(/"[^"]*"|'[^']*'/g, '""');
    if (/(?:^|\s)data-copyable(?=[\s=/>]|$)/i.test(attributes)) return true;
  }
  return false;
}

export function renderedPageContentSecurityPolicy(htmlBody: string): string {
  const copyable = hasRenderedPageCopyBlocks(htmlBody);
  const policy = [
    "default-src 'none'",
    copyable ? `script-src 'sha256-${RENDERED_PAGE_COPY_SCRIPT_HASH}'` : "script-src 'none'",
    "script-src-attr 'none'",
    "style-src 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
    // Opted-in documents execute only the pinned helper in an opaque origin.
    // Never combine allow-scripts with allow-same-origin on author HTML.
    copyable ? "sandbox allow-scripts" : "sandbox allow-same-origin",
  ].join("; ");
  // A comma serializes multiple ENFORCED policies, not alternative sources.
  return copyable ? `${policy}, ${RENDERED_PAGE_INLINE_ONLY_SCRIPT_POLICY}` : policy;
}
