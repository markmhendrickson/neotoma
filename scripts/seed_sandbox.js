#!/usr/bin/env tsx
"use strict";
/**
 * Seed the public sandbox deployment at `sandbox.neotoma.io` with a mix of
 * reused fixtures and synthetic conversation / public-domain content. Driven
 * by `tests/fixtures/sandbox/manifest.json` so the dataset is defined in one
 * place and can be audited independently of seeding code.
 *
 * Runs against a live Neotoma API over HTTP (the same surface visitors use),
 * so observations, timeline events, and the Agents directory populate
 * realistically. Four synthetic agent identities rotate through submissions
 * via X-Client-Name / X-Client-Version / X-Connection-Id headers so the
 * `/agents` page shows diversity.
 *
 * Usage:
 *   tsx scripts/seed_sandbox.ts [--base-url http://localhost:3180] [--dry-run]
 *
 * Environment:
 *   NEOTOMA_SANDBOX_BASE_URL   Same effect as --base-url. Default http://localhost:3180.
 *   NEOTOMA_SANDBOX_BEARER     Optional Bearer token (only needed when the target
 *                              is running without NEOTOMA_SANDBOX_MODE=1).
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SANDBOX_MANIFEST_REL_PATH = void 0;
exports.loadManifest = loadManifest;
exports.seedSandbox = seedSandbox;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var node_crypto_1 = require("node:crypto");
exports.SANDBOX_MANIFEST_REL_PATH = "tests/fixtures/sandbox/manifest.json";
function loadManifest(repoRoot) {
    return __awaiter(this, void 0, void 0, function () {
        var manifestPath, raw;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    manifestPath = node_path_1.default.join(repoRoot, exports.SANDBOX_MANIFEST_REL_PATH);
                    return [4 /*yield*/, node_fs_1.promises.readFile(manifestPath, "utf8")];
                case 1:
                    raw = _a.sent();
                    return [2 /*return*/, JSON.parse(raw)];
            }
        });
    });
}
function inlineConversation(key) {
    if (key === "conversation_chatgpt") {
        var convId = "conv-sandbox-chatgpt-1";
        return [
            {
                entity_type: "conversation",
                canonical_name: "Planning a weekend hike",
                title: "Planning a weekend hike",
                platform: "chatgpt",
                started_at: "2026-03-15T09:30:00Z",
                ended_at: "2026-03-15T10:12:00Z",
                turn_count: 5,
                idempotency_hint: convId,
            },
            {
                entity_type: "conversation_message",
                canonical_name: "hike-planning-msg-1",
                role: "user",
                sender_kind: "user",
                content: "I want to plan a weekend hike under 10km with a view at the top.",
                turn_key: "".concat(convId, ":turn:1"),
                timestamp: "2026-03-15T09:30:00Z",
            },
            {
                entity_type: "conversation_message",
                canonical_name: "hike-planning-msg-2",
                role: "assistant",
                sender_kind: "assistant",
                content: "Three solid candidates: Cedar Ridge, Hollow Creek, Painted Bluff.",
                turn_key: "".concat(convId, ":turn:2"),
                timestamp: "2026-03-15T09:30:30Z",
            },
        ];
    }
    if (key === "conversation_claude") {
        var convId = "conv-sandbox-claude-1";
        return [
            {
                entity_type: "conversation",
                canonical_name: "Sourdough crumb diagnosis",
                title: "Sourdough crumb diagnosis",
                platform: "claude",
                started_at: "2026-02-12T18:04:00Z",
                ended_at: "2026-02-12T18:07:05Z",
                turn_count: 5,
                idempotency_hint: convId,
            },
            {
                entity_type: "conversation_message",
                canonical_name: "sourdough-msg-1",
                role: "user",
                sender_kind: "user",
                content: "Crumb was too tight despite longer bulk.",
                turn_key: "".concat(convId, ":turn:1"),
                timestamp: "2026-02-12T18:04:00Z",
            },
            {
                entity_type: "conversation_message",
                canonical_name: "sourdough-msg-2",
                role: "assistant",
                sender_kind: "assistant",
                content: "Likely under-proofed final shape at 18C. Try a 2h final proof.",
                turn_key: "".concat(convId, ":turn:2"),
                timestamp: "2026-02-12T18:06:40Z",
            },
        ];
    }
    throw new Error("Unknown inline fixture key: ".concat(key));
}
function resolveFixtureEntities(batch, repoRoot) {
    return __awaiter(this, void 0, void 0, function () {
        var key, relPath, fullPath, raw, parsed, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (batch.fixture.startsWith("inline://")) {
                        key = batch.fixture.slice("inline://".length);
                        return [2 /*return*/, inlineConversation(key)];
                    }
                    if (!batch.fixture.startsWith("reuse://")) return [3 /*break*/, 2];
                    relPath = batch.fixture.slice("reuse://".length);
                    fullPath = node_path_1.default.join(repoRoot, relPath);
                    return [4 /*yield*/, node_fs_1.promises.readFile(fullPath, "utf8")];
                case 1:
                    raw = _a.sent();
                    parsed = JSON.parse(raw);
                    rows = Array.isArray(parsed) ? parsed : [parsed];
                    if (batch.entity_type_override) {
                        return [2 /*return*/, rows.map(function (row) { return (__assign({ entity_type: batch.entity_type_override }, row)); })];
                    }
                    return [2 /*return*/, rows];
                case 2: throw new Error("Unsupported fixture scheme: ".concat(batch.fixture));
            }
        });
    });
}
function headersForAgent(agent, bearer) {
    var headers = {
        "content-type": "application/json",
        "x-client-name": agent.client_name,
        "x-client-version": agent.client_version,
        "x-connection-id": "sandbox-seed-".concat(agent.agent_sub),
        "user-agent": "neotoma-sandbox-seed/1.0 (".concat(agent.label, ")"),
    };
    if (bearer)
        headers["authorization"] = "Bearer ".concat(bearer);
    return headers;
}
function stableIdempotencyKey(prefix, entityIndex) {
    // Stable (non-random) so re-running the seeder is idempotent — the server
    // replays the existing source rather than creating duplicates.
    var hash = node_crypto_1.default
        .createHash("sha256")
        .update("".concat(prefix, ":").concat(entityIndex))
        .digest("hex")
        .slice(0, 12);
    return "".concat(prefix, "-").concat(hash);
}
function seedSandbox(options) {
    return __awaiter(this, void 0, void 0, function () {
        var logger, fetchFn, repoRoot, manifest, _a, _b, _c, baseUrl, entityBatchesSubmitted, entitiesPlanned, unstructuredSubmitted, i, batch, agent, entities, idempotencyKey, body, res, text, _i, _d, source, agent, abs, buf, base64, body, res, text;
        var _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    if (options.skipSeeding) {
                        return [2 /*return*/, {
                                entity_batches_submitted: 0,
                                entities_planned: 0,
                                unstructured_sources_submitted: 0,
                                dry_run: false,
                            }];
                    }
                    logger = (_e = options.logger) !== null && _e !== void 0 ? _e : (function (msg) { return process.stdout.write(msg + "\n"); });
                    fetchFn = (_f = options.fetchImpl) !== null && _f !== void 0 ? _f : fetch;
                    repoRoot = (_g = options.repoRoot) !== null && _g !== void 0 ? _g : process.cwd();
                    if (!options.manifestPath) return [3 /*break*/, 2];
                    _c = (_b = JSON).parse;
                    return [4 /*yield*/, node_fs_1.promises.readFile(options.manifestPath, "utf8")];
                case 1:
                    _a = _c.apply(_b, [_h.sent()]);
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, loadManifest(repoRoot)];
                case 3:
                    _a = _h.sent();
                    _h.label = 4;
                case 4:
                    manifest = _a;
                    baseUrl = options.baseUrl.replace(/\/$/, "");
                    entityBatchesSubmitted = 0;
                    entitiesPlanned = 0;
                    unstructuredSubmitted = 0;
                    i = 0;
                    _h.label = 5;
                case 5:
                    if (!(i < manifest.entity_batches.length)) return [3 /*break*/, 11];
                    batch = manifest.entity_batches[i];
                    agent = manifest.agent_identities[batch.agent_index];
                    if (!agent) {
                        throw new Error("Batch ".concat(i, " (").concat(batch.idempotency_prefix, ") references agent_index ").concat(batch.agent_index, ", which is out of range"));
                    }
                    return [4 /*yield*/, resolveFixtureEntities(batch, repoRoot)];
                case 6:
                    entities = _h.sent();
                    entitiesPlanned += entities.length;
                    if (options.dryRun) {
                        logger("[dry-run] batch ".concat(batch.idempotency_prefix, " \u2014 ").concat(entities.length, " entities as ").concat(agent.client_name));
                        entityBatchesSubmitted++;
                        return [3 /*break*/, 10];
                    }
                    idempotencyKey = stableIdempotencyKey(batch.idempotency_prefix, i);
                    body = JSON.stringify({
                        entities: entities,
                        idempotency_key: idempotencyKey,
                        source_priority: 80,
                    });
                    return [4 /*yield*/, fetchFn("".concat(baseUrl, "/store"), {
                            method: "POST",
                            headers: headersForAgent(agent, options.bearer),
                            body: body,
                        })];
                case 7:
                    res = _h.sent();
                    if (!!res.ok) return [3 /*break*/, 9];
                    return [4 /*yield*/, res.text().catch(function () { return ""; })];
                case 8:
                    text = _h.sent();
                    throw new Error("seed batch ".concat(batch.idempotency_prefix, " failed: ").concat(res.status, " ").concat(text.slice(0, 200)));
                case 9:
                    entityBatchesSubmitted++;
                    logger("seeded batch ".concat(batch.idempotency_prefix, " (").concat(entities.length, " entities)"));
                    _h.label = 10;
                case 10:
                    i++;
                    return [3 /*break*/, 5];
                case 11:
                    _i = 0, _d = manifest.unstructured_sources;
                    _h.label = 12;
                case 12:
                    if (!(_i < _d.length)) return [3 /*break*/, 18];
                    source = _d[_i];
                    agent = manifest.agent_identities[source.agent_index];
                    if (!agent) {
                        throw new Error("Unstructured source for ".concat(source.fixture_path, " references agent_index ").concat(source.agent_index, " (out of range)"));
                    }
                    if (options.dryRun) {
                        logger("[dry-run] unstructured source ".concat(source.fixture_path));
                        unstructuredSubmitted++;
                        return [3 /*break*/, 17];
                    }
                    abs = node_path_1.default.join(repoRoot, source.fixture_path);
                    return [4 /*yield*/, node_fs_1.promises.readFile(abs)];
                case 13:
                    buf = _h.sent();
                    base64 = buf.toString("base64");
                    body = JSON.stringify({
                        file_content: base64,
                        mime_type: source.mime_type,
                        original_filename: source.original_filename,
                        idempotency_key: stableIdempotencyKey("sandbox-seed-unstructured-".concat(source.original_filename), 0),
                    });
                    return [4 /*yield*/, fetchFn("".concat(baseUrl, "/store/unstructured"), {
                            method: "POST",
                            headers: headersForAgent(agent, options.bearer),
                            body: body,
                        })];
                case 14:
                    res = _h.sent();
                    if (!!res.ok) return [3 /*break*/, 16];
                    return [4 /*yield*/, res.text().catch(function () { return ""; })];
                case 15:
                    text = _h.sent();
                    // Non-fatal for seeding — we log and continue so one bad fixture
                    // doesn't blow up the whole reset.
                    logger("WARN: unstructured source ".concat(source.fixture_path, " failed (").concat(res.status, "): ").concat(text.slice(0, 200)));
                    return [3 /*break*/, 17];
                case 16:
                    unstructuredSubmitted++;
                    logger("seeded unstructured source ".concat(source.original_filename));
                    _h.label = 17;
                case 17:
                    _i++;
                    return [3 /*break*/, 12];
                case 18: return [2 /*return*/, {
                        entity_batches_submitted: entityBatchesSubmitted,
                        entities_planned: entitiesPlanned,
                        unstructured_sources_submitted: unstructuredSubmitted,
                        dry_run: options.dryRun === true,
                    }];
            }
        });
    });
}
function parseArgs(argv) {
    var _a;
    var baseUrl = ((_a = process.env.NEOTOMA_SANDBOX_BASE_URL) === null || _a === void 0 ? void 0 : _a.trim()) || "http://localhost:3180";
    var dryRun = false;
    for (var i = 0; i < argv.length; i++) {
        var arg = argv[i];
        if (arg === "--base-url" && argv[i + 1]) {
            baseUrl = argv[i + 1];
            i++;
        }
        else if (arg === "--dry-run") {
            dryRun = true;
        }
    }
    return { baseUrl: baseUrl, dryRun: dryRun };
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var _a, baseUrl, dryRun, bearer, result;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _a = parseArgs(process.argv.slice(2)), baseUrl = _a.baseUrl, dryRun = _a.dryRun;
                    bearer = ((_b = process.env.NEOTOMA_SANDBOX_BEARER) === null || _b === void 0 ? void 0 : _b.trim()) || undefined;
                    return [4 /*yield*/, seedSandbox({ baseUrl: baseUrl, bearer: bearer, dryRun: dryRun })];
                case 1:
                    result = _c.sent();
                    process.stdout.write(JSON.stringify(__assign({ ok: true, base_url: baseUrl }, result), null, 2) + "\n");
                    return [2 /*return*/];
            }
        });
    });
}
var isMain = typeof process !== "undefined" &&
    process.argv[1] &&
    node_path_1.default.resolve(process.argv[1]) === node_path_1.default.resolve(new URL(import.meta.url).pathname);
if (isMain) {
    main().catch(function (err) {
        process.stderr.write("[seed_sandbox] ".concat(err.message, "\n"));
        process.exit(1);
    });
}
