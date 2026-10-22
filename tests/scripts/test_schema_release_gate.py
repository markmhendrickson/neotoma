"""Execute the shipped release command against owned native SQLite state.

This is a candidate-pinned testing gate, not deployment or schema authority.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path("tests/fixtures/schema_release_gate/fixture.mjs")
NETWORK = Path("tests/fixtures/schema_release_gate/network.cjs")
BUILD = ["npm", "run", "build:server"]
ENTRY = ["node", "dist/seed_schemas_entry.js"]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, timeout=30)


def candidate():
    # Tracked candidate content, including tests, is pinned; ignored credentials
    # and dependency/build outputs never enter the copied build root.
    if subprocess.run(["git", "diff", "--quiet", "HEAD", "--"], cwd=ROOT,
                      timeout=30).returncode != 0 or git("ls-files", "-u"):
        raise AssertionError("schema release gate requires a clean committed candidate")
    files = [Path(name.decode()) for name in git("ls-files", "-z").split(b"\0") if name]
    digest = hashlib.sha256()
    for name in files:
        path = ROOT / name
        if path.is_symlink():
            # Editor command aliases are not compiler inputs. Pin their literal
            # targets without following them into another checkout.
            digest.update(str(name).encode() + b"\0link\0" + os.readlink(path).encode() + b"\0")
            continue
        if not path.is_file():  # Gitlink directories are not this build input.
            continue
        digest.update(str(name).encode() + b"\0" + path.read_bytes() + b"\0")
    return {"commit": git("rev-parse", "HEAD").decode().strip(),
            "tracked_sha256": digest.hexdigest(),
            "lock_sha256": sha((ROOT / "package-lock.json").read_bytes()),
            "build_command": BUILD, "entry_argv": ENTRY}, files


def closed_environment(home, data, root, journal):
    # Do not forward shell credentials, config overrides, NODE_OPTIONS or HOME.
    node = shutil.which("node")
    npm = shutil.which("npm")
    if not node or not npm:
        raise AssertionError("Node and npm are required, never skipped")
    return {"PATH": os.pathsep.join(dict.fromkeys([
                str(Path(node).parent), str(Path(npm).parent), "/usr/bin", "/bin"])),
            "HOME": str(home), "USERPROFILE": str(home),
            "TMPDIR": str(home), "NODE_ENV": "test", "NEOTOMA_ENV": "development",
            "NEOTOMA_PROJECT_ROOT": str(root), "NEOTOMA_DATA_DIR": str(data),
            "NEOTOMA_SQLITE_PATH": str(data / "owned.db"),
            "NEOTOMA_DB_BACKEND": "sqlite", "NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR": "1",
            "NEOTOMA_ACTIONS_DISABLE_AUTOSTART": "1", "NEOTOMA_TUNNEL_AUTO_DISCOVER": "0",
            "SCHEMA_GATE_NETWORK_JOURNAL": str(journal),
            "SCHEMA_GATE_IPC_ROOT": str(home),
            "npm_config_update_notifier": "false", "npm_config_audit": "false",
            "npm_config_fund": "false", "npm_config_cache": str(home / "npm-cache"),
            "npm_config_userconfig": str(home / "empty-npmrc"),
            "NODE_OPTIONS": "--require=" + json.dumps(str(root / NETWORK))}


def child(argv, root, env, seconds=60, expected_denial=False):
    journal = Path(env["SCHEMA_GATE_NETWORK_JOURNAL"])
    journal.write_text("")
    with subprocess.Popen(argv, cwd=root, env=env, text=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, start_new_session=True) as process:
        try:
            stdout, stderr = process.communicate(timeout=seconds)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.communicate()
            raise AssertionError("schema release child exceeded deadline") from None
        if process.poll() is None:
            raise AssertionError("schema release child did not terminate")
    if journal.read_text() and not expected_denial:
        raise AssertionError("unexpected external network attempt: " + stderr + stdout)
    return {"argv": argv, "returncode": process.returncode,
            "stdout": stdout, "stderr": stderr}


class SchemaReleaseGate(unittest.TestCase):
    def skipTest(self, reason):
        raise AssertionError("required schema release case cannot be skipped: " + reason)

    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="schema-release-gate-")
        cls.addClassCleanup(cls.temporary.cleanup)
        base = Path(cls.temporary.name)
        cls.root = base / "candidate"
        cls.root.mkdir()
        cls.binding, files = candidate()
        for name in files:
            path = ROOT / name
            if path.is_symlink() or not path.is_file() or any(part.startswith(".env") for part in name.parts):
                continue
            dest = cls.root / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, dest)
        if not (ROOT / "node_modules").is_dir():
            raise AssertionError("installed locked dependencies are required")
        (cls.root / "node_modules").symlink_to((ROOT / "node_modules").resolve())
        cls.home = base / "home"
        cls.home.mkdir()
        # A malicious user fallback exists but the explicit owned path wins.
        trap = cls.home / ".config/neotoma/.env"
        trap.parent.mkdir(parents=True)
        trap.write_text("NEOTOMA_DATA_DIR=/must-not-open\n")
        cls.env = closed_environment(cls.home, base / "build-data", cls.root, base / "network")
        cls.records = []
        control = child(["node", str(FIXTURE), str(cls.root), "network_control"],
                        cls.root, cls.env, expected_denial=True)
        if control["returncode"] != 0:
            raise AssertionError("network positive/negative instrument failed: " + control["stderr"])
        cls.records.append(control)
        result = child(BUILD, cls.root, cls.env, seconds=180)
        cls.records.append(result)
        if result["returncode"] != 0:
            raise AssertionError("candidate build failed: " + result["stderr"])
        cls.entry_hash = sha((cls.root / "dist/seed_schemas_entry.js").read_bytes())
        if candidate()[0] != cls.binding:
            raise AssertionError("candidate changed during build")

    @classmethod
    def tearDownClass(cls):
        if candidate()[0] != cls.binding:
            raise AssertionError("candidate changed during gate")
        if sha((cls.root / "dist/seed_schemas_entry.js").read_bytes()) != cls.entry_hash:
            raise AssertionError("compiled entry changed during gate")
        report = {**cls.binding, "compiled_entry_sha256": cls.entry_hash,
                  "executions": cls.records, "scope": "owned SQLite compiled entry only"}
        if os.environ.get("SCHEMA_RELEASE_GATE_REPORT"):
            Path(os.environ["SCHEMA_RELEASE_GATE_REPORT"]).write_text(json.dumps(report, indent=2))
        # The consumer has actual execution pins, not a Boolean declaration.
        print("SCHEMA_RELEASE_GATE_BINDING=" + json.dumps({**cls.binding,
              "compiled_entry_sha256": cls.entry_hash, "executions": len(cls.records)}))

    def setUp(self):
        self.database = tempfile.TemporaryDirectory(prefix="schema-release-case-")
        self.addCleanup(self.database.cleanup)
        base = Path(self.database.name)
        self.env = closed_environment(self.home, base, self.root, base / "network")

    def fixture(self, mode="read"):
        result = child(["node", str(FIXTURE), str(self.root), mode], self.root, self.env)
        self.records.append(result)
        self.assertEqual(result["returncode"], 0, result["stderr"])
        parsed = json.loads(result["stdout"].split("SCHEMA_GATE_RESULT=")[-1])
        self.assertEqual(set(parsed["business"].values()), {0})
        return parsed

    def entry(self, success=True):
        result = child(ENTRY, self.root, self.env)
        self.records.append(result)
        if success:
            self.assertEqual(result["returncode"], 0, result["stderr"])
        else:
            self.assertNotEqual(result["returncode"], 0, "native rejection must fail entry")
        return result

    def vocabulary(self, after):
        self.assertEqual(sorted(row["entity_type"] for row in after["schemas"]
                                if row["active"] and row["scope"] == "global"),
                         after["expected_types"])
        self.assertEqual(sorted(row["relationship_type"] for row in after["vocabulary"]),
                         after["expected_relationships"])
        for row in after["schemas"]:
            self.assertIsInstance(json.loads(row["schema_definition"]), dict)
        for row in after["vocabulary"]:
            self.assertIsInstance(json.loads(row["definition"]), dict)

    def test_fresh_registry_exact_vocabulary_and_no_business_effects(self):
        before = self.fixture()
        self.assertEqual(before["schemas"], [])
        self.assertEqual(before["vocabulary"], [])
        self.entry()
        self.vocabulary(self.fixture())

    def test_active_custom_schema_and_inactive_builtin_are_preserved(self):
        before = self.fixture("custom_entity")
        self.entry()
        after = self.fixture()
        self.assertEqual([r for r in after["schemas"] if r["entity_type"] == "contact"],
                         before["schemas"])
        self.assertEqual(after["active"], before["active"])
        self.assertEqual(after["active"]["schema_definition"]["canonical_name_fields"],
                         ["owned_key"])
        self.vocabulary(after)

    def test_custom_relationship_complete_row_is_preserved(self):
        before = self.fixture("custom_relationship")
        self.entry()
        after = self.fixture()
        self.assertEqual([r for r in after["vocabulary"] if r["relationship_type"] == "REFERS_TO"],
                         before["vocabulary"])
        self.vocabulary(after)

    def test_second_real_invocation_has_no_growth_or_change(self):
        self.fixture()
        self.entry()
        before = self.fixture()
        self.entry()
        self.assertEqual(self.fixture(), before)

    def test_entity_registry_rejection_fails_and_retains_custom_rows(self):
        before = self.fixture("entity_failure")
        result = self.entry(success=False)
        self.assertIn("owned_schema_failure", result["stderr"])
        after = self.fixture()
        self.assertEqual([r for r in after["schemas"] if r["entity_type"] == "contact"],
                         before["schemas"])
        self.assertEqual(after["active"], before["active"])
        # Other additive writes may remain; no transactional rollback claim.
        self.assertNotIn("company", [r["entity_type"] for r in after["schemas"]])

    def test_relationship_registry_rejection_fails_after_entity_seed(self):
        self.fixture("relationship_failure")
        result = self.entry(success=False)
        self.assertIn("owned_relationship_failure", result["stderr"])
        after = self.fixture()
        self.assertEqual(sorted(row["entity_type"] for row in after["schemas"]),
                         after["expected_types"])
        self.assertNotIn("REFERS_TO", [r["relationship_type"] for r in after["vocabulary"]])


def load_tests(loader, tests, pattern):
    # Discovery is the consumer surface. Do not turn omitted/disabled cases
    # into a successful zero-test or partially skipped gate.
    names = loader.getTestCaseNames(SchemaReleaseGate)
    if tests.countTestCases() != 6 or len(names) != 6:
        raise AssertionError("schema release gate requires exactly six native cases")
    if getattr(SchemaReleaseGate, "__unittest_skip__", False) or any(
            getattr(getattr(SchemaReleaseGate, name), "__unittest_skip__", False)
            for name in names):
        raise AssertionError("required schema release cases cannot be disabled")
    return tests


if __name__ == "__main__":
    unittest.main()
