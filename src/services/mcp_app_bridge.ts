/**
 * View-side MCP Apps bridge, inlined into Neotoma's `ui://` widgets.
 *
 * Implements the View half of the MCP Apps protocol (modelcontextprotocol
 * ext-apps, protocol version 2026-01-26) over `postMessage` to
 * `window.parent`, without a bundled SDK so the widget HTML stays
 * self-contained:
 *
 *   1. On load the View sends the `ui/initialize` request. A host MUST NOT
 *      send the View anything until it has answered and received
 *      `ui/notifications/initialized`, so without this step no tool result
 *      ever arrives.
 *   2. When the host answers, the View sends `ui/notifications/initialized`
 *      and reports its size with `ui/notifications/size-changed` (and again
 *      on every layout change), so the iframe is not left at zero height.
 *   3. `ui/notifications/tool-result` carries the CallToolResult as `params`
 *      directly; the bridge hands `structuredContent` to the widget, falling
 *      back to JSON in the first text block for older servers.
 *   4. Links open through the `ui/open-link` request: a sandboxed iframe
 *      cannot navigate the host itself.
 *   5. Host requests the View does not implement get a JSON-RPC error rather
 *      than silence; `ping` and `ui/resource-teardown` get an empty result.
 *
 *   6. A failed (`isError`, or an `{ error }` payload) or cancelled tool call
 *      calls `window.neotomaAppFailure(message)` so the widget leaves its
 *      waiting state instead of spinning forever.
 *
 * The widget script defines `window.neotomaAppRender(payload)` and
 * `window.neotomaAppFailure(message)`, sets `href` only when
 * `window.neotomaApp.isSafeLink(url)`, and calls
 * `window.neotomaApp.openLink(url)` for links.
 */

export const MCP_APPS_PROTOCOL_VERSION = "2026-01-26";

export function buildMcpAppBridgeScript(appName: string): string {
  const name = JSON.stringify(appName);
  const protocolVersion = JSON.stringify(MCP_APPS_PROTOCOL_VERSION);
  return `
    (function () {
      var nextId = 1;
      var pending = {};
      var initialized = false;
      var lastSize = "";

      function post(message) {
        window.parent.postMessage(message, "*");
      }
      function request(method, params) {
        var id = nextId++;
        return new Promise(function (resolve, reject) {
          pending[id] = { resolve: resolve, reject: reject };
          post({ jsonrpc: "2.0", id: id, method: method, params: params });
        });
      }
      function notify(method, params) {
        post({ jsonrpc: "2.0", method: method, params: params });
      }
      function respond(id, result) {
        post({ jsonrpc: "2.0", id: id, result: result });
      }
      function respondError(id, code, message) {
        post({ jsonrpc: "2.0", id: id, error: { code: code, message: message } });
      }

      function reportSize() {
        if (!initialized) return;
        var el = document.documentElement;
        var width = Math.ceil(el.scrollWidth);
        var height = Math.ceil(el.scrollHeight);
        var key = width + "x" + height;
        if (key === lastSize) return;
        lastSize = key;
        notify("ui/notifications/size-changed", { width: width, height: height });
      }

      function payloadFromToolResult(result) {
        if (!result || typeof result !== "object") return null;
        if (result.structuredContent && typeof result.structuredContent === "object") {
          return result.structuredContent;
        }
        var blocks = Array.isArray(result.content) ? result.content : [];
        for (var i = 0; i < blocks.length; i++) {
          var block = blocks[i];
          if (block && block.type === "text" && typeof block.text === "string") {
            try {
              var parsed = JSON.parse(block.text);
              if (parsed && typeof parsed === "object") return parsed;
            } catch (e) {
              // Not JSON; try the next block.
            }
          }
        }
        return null;
      }

      function render(payload) {
        if (typeof window.neotomaAppRender === "function") {
          window.neotomaAppRender(payload);
        }
        reportSize();
      }

      function fail(message) {
        if (typeof window.neotomaAppFailure === "function") {
          window.neotomaAppFailure(message);
        }
        reportSize();
      }

      function isSafeLink(url) {
        return typeof url === "string" && /^https?:\\/\\//i.test(url);
      }

      window.neotomaApp = {
        isSafeLink: isSafeLink,
        openLink: function (url) {
          if (!isSafeLink(url)) return Promise.resolve(null);
          return request("ui/open-link", { url: url }).catch(function () { return null; });
        },
        reportSize: reportSize,
      };

      window.addEventListener("message", function (event) {
        if (event.source && event.source !== window.parent) return;
        var message = event.data;
        if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") return;

        if (message.method === undefined && message.id !== undefined) {
          var entry = pending[message.id];
          if (!entry) return;
          delete pending[message.id];
          if (message.error) entry.reject(message.error);
          else entry.resolve(message.result);
          return;
        }

        var hasId = message.id !== undefined && message.id !== null;
        switch (message.method) {
          case "ui/notifications/tool-result": {
            var result = message.params;
            if (result && result.isError === true) {
              fail("The Neotoma tool call failed.");
              return;
            }
            var payload = payloadFromToolResult(result);
            if (!payload) {
              fail("The Neotoma tool returned no readable result.");
              return;
            }
            if (payload.error && typeof payload.error === "object") {
              fail("The Neotoma tool call failed.");
              return;
            }
            render(payload);
            return;
          }
          case "ui/notifications/tool-cancelled":
            fail("The Neotoma tool call was cancelled.");
            return;
          case "ui/notifications/tool-input":
          case "ui/notifications/tool-input-partial":
          case "ui/notifications/host-context-changed":
            return;
          case "ping":
          case "ui/resource-teardown":
            if (hasId) respond(message.id, {});
            return;
          default:
            if (hasId) respondError(message.id, -32601, "Method not found: " + message.method);
        }
      });

      if (typeof ResizeObserver === "function") {
        new ResizeObserver(reportSize).observe(document.documentElement);
      }

      request("ui/initialize", {
        protocolVersion: ${protocolVersion},
        appInfo: { name: ${name}, version: "1.0.0" },
        appCapabilities: { availableDisplayModes: ["inline"] },
      }).then(function () {
        initialized = true;
        notify("ui/notifications/initialized", {});
        reportSize();
      }, function () {
        // Host refused initialization; nothing will be delivered.
      });
    })();
  `;
}
