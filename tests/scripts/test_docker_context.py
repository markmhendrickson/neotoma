"""Verify the real Docker context matcher with synthetic inputs only."""
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ENV_FILES = (
    ".env",
    ".env.development",
    ".env.production",
    ".envrc",
    ".env.example",
    "src/.env",
    "src/.env.development",
    "src/deep/.env.production",
)
BUILD_INPUTS = (
    "package.json",
    "src/required.ts",
    "inspector/src/main.ts",
    "scripts/build.ts",
    "openapi.yaml",
    "tests/fixtures/json/seed.json",
    "README.md",
)
CATALOG = "docs/developer/mcp/tool_descriptions.yaml"


def exported_context(rules):
    """Never build the checkout: only these public, synthetic files are sent."""
    with tempfile.TemporaryDirectory(prefix="docker-context-test-") as directory:
        root = Path(directory)
        context, output = root / "context", root / "output"
        context.mkdir()
        (context / ".dockerignore").write_text(rules)
        (context / "Dockerfile").write_text("FROM scratch\nCOPY . /proof/\n")
        for name in (*ENV_FILES, *BUILD_INPUTS, CATALOG):
            target = context / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("synthetic context canary: " + name)
        # Docker availability/build failure is a failed check, never a skip.
        subprocess.run(
            [
                "docker", "build", "--network=none", "--no-cache",
                "--progress=plain", "--output", "type=local,dest=" + str(output),
                str(context),
            ],
            check=True, capture_output=True, timeout=60,
        )
        return {
            str(path.relative_to(output / "proof")): path.read_bytes()
            for path in (output / "proof").rglob("*") if path.is_file()
        }


class DockerContextTests(unittest.TestCase):
    def assert_context(self, result):
        for name in ENV_FILES:
            with self.subTest(excluded=name):
                self.assertNotIn(name, result)
        for name in BUILD_INPUTS:
            with self.subTest(retained=name):
                self.assertEqual(
                    result.get(name), ("synthetic context canary: " + name).encode()
                )

    def test_current_context_excludes_environment_variants(self):
        self.assert_context(exported_context((ROOT / ".dockerignore").read_text()))

    def test_catalog_allowance_integration_preserves_the_exclusion(self):
        # This is the exact independently admitted PR #2596 ignore addition.
        # Its runtime/catalog implementation has its own review and tests;
        # this check verifies compatibility, without silently merging that PR.
        rules = (ROOT / ".dockerignore").read_text()
        result = exported_context(rules + "\n!" + CATALOG + "\n")
        self.assert_context(result)
        self.assertEqual(
            result.get(CATALOG), ("synthetic context canary: " + CATALOG).encode()
        )


if __name__ == "__main__":
    unittest.main()
