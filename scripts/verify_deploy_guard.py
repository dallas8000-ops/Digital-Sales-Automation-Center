import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def fail(message: str) -> None:
    print(f"Deploy guard failed: {message}")
    sys.exit(1)


def read_json(path: pathlib.Path):
    if not path.exists():
        fail(f"{path.name} is missing")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"{path.name} is not valid JSON: {exc}")


def git_tracked_files() -> set[str]:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


railway_json = read_json(ROOT / "railway.json")
deploy = railway_json.get("deploy", {})

nixpacks_path = ROOT / "nixpacks.toml"
if not nixpacks_path.exists():
    fail("nixpacks.toml is required")

nixpacks_content = nixpacks_path.read_text(encoding="utf-8")
if "providers = ['python']" not in nixpacks_content and 'providers = ["python"]' not in nixpacks_content:
    fail("nixpacks.toml must explicitly set providers = ['python']")

start_command = str(deploy.get("startCommand", "")).strip()
if "python manage.py runserver" not in start_command:
    fail("railway.json deploy.startCommand must run Django with python manage.py runserver")

if str(deploy.get("restartPolicyType", "")).strip() != "ON_FAILURE":
    fail("railway.json deploy.restartPolicyType must be ON_FAILURE")

forbidden_tracked_paths = {
    "server.js",
    "package.json",
    "package-lock.json",
    "src/db.js",
    "src/services/automation.js",
    "src/services/salesPackage.js",
    "src/services/validationService.js",
    "scripts/connect-railway-stripe.js",
    "scripts/predeploy-check.js",
    "scripts/process-email-jobs.js",
    "scripts/verify-deploy-guard.js",
}

tracked = git_tracked_files()

for rel_path in sorted(forbidden_tracked_paths):
    if rel_path in tracked and (ROOT / rel_path).exists():
        fail(f"{rel_path} must not be tracked in Django-only runtime")

print("Deploy guard passed.")
