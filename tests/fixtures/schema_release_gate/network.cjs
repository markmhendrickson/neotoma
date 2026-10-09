// Every Node child, including npm's build descendants, loads this control.
const net = require("node:net");
const dns = require("node:dns");
const dgram = require("node:dgram");
const fs = require("node:fs");
const allowed = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
function check(host) {
  if (allowed.has(host)) return;
  // Persist the attempt even when a caller catches the thrown error.
  fs.appendFileSync(process.env.SCHEMA_GATE_NETWORK_JOURNAL, "denied\n");
  throw new Error("schema release gate: external network denied");
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let first = args[0];
  if (Array.isArray(first)) first = first[0];
  if (typeof first === "object" && first?.path) {
    check("unix-socket");
  } else if (typeof first === "string" && first.startsWith("/")) {
    check("unix-socket");
  } else {
    check(
      typeof first === "object"
        ? first?.host || "localhost"
        : typeof args[1] === "string"
          ? args[1]
          : "localhost"
    );
  }
  return connect.apply(this, args);
};
for (const name of ["lookup", "resolve", "resolve4", "resolve6"]) {
  const original = dns[name];
  dns[name] = function (host, ...args) {
    check(host);
    return original.call(this, host, ...args);
  };
  if (dns.promises[name]) {
    const promiseOriginal = dns.promises[name];
    dns.promises[name] = function (host, ...args) {
      check(host);
      return promiseOriginal.call(this, host, ...args);
    };
  }
}
const udp = dgram.createSocket;
dgram.createSocket = function (...args) {
  check("udp");
  return udp.apply(this, args);
};
const fetch = global.fetch;
if (fetch) {
  global.fetch = function (input, ...args) {
    check(new URL(typeof input === "string" ? input : input.url || String(input)).hostname);
    return fetch.call(this, input, ...args);
  };
}
