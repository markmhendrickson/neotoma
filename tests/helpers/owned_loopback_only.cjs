// Synthetic CLI child processes must never reach a provider or hosted store.
const net = require("node:net");
const dns = require("node:dns");
const allowed = (host) =>
  host == null ||
  ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(String(host)) ||
  String(host).startsWith("::ffff:127.");
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let normalized = args;
  while (Array.isArray(normalized[0])) normalized = normalized[0];
  const first = normalized[0];
  const host =
    first && typeof first === "object"
      ? first.host || first.hostname
      : typeof first === "number" && typeof normalized[1] === "string"
        ? normalized[1]
        : undefined;
  if (!allowed(host)) throw new Error("Owned harness refused external socket");
  return connect.apply(this, args);
};
const lookup = dns.lookup;
dns.lookup = function (host, ...args) {
  if (!allowed(host)) throw new Error("Owned harness refused external DNS");
  return lookup.call(this, host, ...args);
};
const promisedLookup = dns.promises.lookup;
dns.promises.lookup = async function (host, ...args) {
  if (!allowed(host)) throw new Error("Owned harness refused external DNS");
  return promisedLookup.call(this, host, ...args);
};
