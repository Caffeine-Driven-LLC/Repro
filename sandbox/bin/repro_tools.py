"""The linters and scanners behind repro-scan and repro-check, one class per detector.

Each class says which files its tool looks at, how the tool runs, and how the tool's native output
reads back as issues: a rule, a file, a line span, a message, and the tool's own level. The scan
(repro-scan) and the reproduction (repro-check) both go through the same class, so a Finding is
always re-checked with exactly the flags, config, and parser that produced it. Severity and
category are not decided here: that mapping lives with each adapter in packages/detect.

Every tool runs with Repro's own config (/opt/repro/lint), never the target's: the target repo is
untrusted (CLAUDE.md section 9), and its .pylintrc, .eslintrc, .yamllint, .checkov.yaml and the
like could otherwise switch off the very rules judging it. Where a tool has no flag to stop it
reading config from the working directory, it runs from / on absolute paths instead.

Nothing here prints matched source text. Secret scanners report a rule and a location only.
"""
import ast
import json
import os
import re
import subprocess
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass

LINT = "/opt/repro/lint"
# Installed dependencies and Repro's own scratch space aren't the project's code (same exclusions
# as the Semgrep scan).
EXCLUDED_DIRS = {"node_modules", ".repro", ".git"}
# One tool invocation's wall-clock limit. The adapter's own timeout bounds the whole scan.
BATCH_TIMEOUT_S = 300


@dataclass
class Issue:
    rule: str
    file: str
    line: int
    end_line: int
    message: str
    level: str = ""


class ToolError(Exception):
    pass


def one_line(text: str, limit: int = 300) -> str:
    return " ".join(str(text).split())[:limit]


def ext(path: str) -> str:
    return os.path.splitext(path)[1].lower()


def parses_as_python(path: str) -> bool:
    try:
        with open(path, "rb") as fh:
            ast.parse(fh.read(), filename=path)
        return True
    except (SyntaxError, ValueError, OSError):
        return False


class Tool:
    id = ""
    # How far an issue's evidence reaches, which decides what a reproduction re-runs:
    #   file     the issue depends only on its own file; re-run on that file alone
    #   dir      it depends on the other files in its directory (a Python package's modules)
    #   project  it depends on every file the tool looks at (dead code, a TypeScript project)
    scope = "file"
    batch_size = 100
    ok_codes: tuple[int, ...] = (0, 1)
    # Where the tool writes its report.
    stream = "stdout"
    # "/" for tools that would otherwise read config from the working directory; they get
    # absolute paths and report absolute paths, which normalize() strips back.
    cwd: str | None = None

    def matches(self, path: str) -> bool:
        raise NotImplementedError

    def argv(self, files: list[str]) -> list[str]:
        raise NotImplementedError

    def parse(self, out: str) -> list[Issue]:
        raise NotImplementedError

    # Files the tool can't take at all, dropped before it runs (e.g. Python that doesn't parse,
    # which stops mypy's whole batch; the syntax detector reports those).
    def runnable(self, path: str) -> bool:
        return True

    def batches(self, files: list[str]) -> list[list[str]]:
        if self.scope == "project":
            return [files] if files else []
        if self.scope == "dir":
            by_dir: dict[str, list[str]] = {}
            for f in files:
                by_dir.setdefault(os.path.dirname(f), []).append(f)
            return [by_dir[d] for d in sorted(by_dir)]
        return [files[i : i + self.batch_size] for i in range(0, len(files), self.batch_size)]

    # The batch a reproduction re-runs to judge `target`: the same files the scan ran it with.
    def peers(self, target: str, files: list[str]) -> list[str]:
        if self.scope == "file":
            return [target]
        if self.scope == "dir":
            same = [f for f in files if os.path.dirname(f) == os.path.dirname(target)]
        else:
            same = list(files)
        return same if target in same else [*same, target]

    # Issues to keep from a batch's run (tsc reports files from outside its own project).
    def keep(self, issue: Issue, batch: list[str]) -> bool:
        return True

    def run(self, files: list[str]) -> list[Issue]:
        # A path that starts with "-" goes in as ./-name, so no tool reads a target's file name as a
        # flag (most get "--" before their files too; cppcheck doesn't accept it).
        args = self.argv([os.path.abspath(f) if self.cwd else f"./{f}" if f.startswith("-") else f for f in files])
        try:
            proc = subprocess.run(args, capture_output=True, text=True, errors="replace", timeout=BATCH_TIMEOUT_S, cwd=self.cwd)
        except subprocess.TimeoutExpired:
            raise ToolError(f"{args[0]} timed out after {BATCH_TIMEOUT_S}s")
        except OSError as e:
            raise ToolError(f"{args[0]} could not start: {e}")
        if proc.returncode not in self.ok_codes:
            raise ToolError(f"{args[0]} exited {proc.returncode}: {(proc.stderr or proc.stdout)[-1500:]}")
        out = proc.stderr if self.stream == "stderr" else proc.stdout
        try:
            issues = self.read(out)
        except (ValueError, KeyError, TypeError, ET.ParseError) as e:
            raise ToolError(f"{args[0]} produced an unreadable report ({e}): {out[:500]} {proc.stderr[-500:]}")
        return [i for i in issues if self.keep(i, files)]

    # The tool's native report as issues, with every path relative to the workspace.
    def read(self, out: str) -> list[Issue]:
        issues = self.parse(out)
        for i in issues:
            i.file = normalize(i.file)
        return issues


ROOT = os.getcwd()
# Where the Executor mounts the workspace (packages/executor). Tools that get absolute paths report
# them under it.
CONTAINER_ROOT = "/workspace/"


def normalize(path: str) -> str:
    if path.startswith(CONTAINER_ROOT):
        return os.path.normpath(path[len(CONTAINER_ROOT) :])
    if os.path.isabs(path):
        rel = os.path.relpath(path, ROOT)
        return rel if not rel.startswith("..") else path
    return os.path.normpath(path)


# --- Python ---------------------------------------------------------------------------------------


class Bandit(Tool):
    id = "bandit"
    # Same exclusions as the ruff detector's, for the same reasons (ruff.ts): B101 flags every
    # pytest assert, B603/B607 fire on the argument-list call that is the fix for shell=True, and
    # B404 flags `import subprocess` itself.
    SKIP = "B101,B404,B603,B607"
    # The hardcoded-password tests (B105-B107) quote the password itself in their message.
    QUOTED = re.compile(r":\s*'.*'$")

    def matches(self, path):
        return ext(path) == ".py"

    def argv(self, files):
        # Explicit files rather than -r, so a target's .bandit file is never read; --ignore-nosec so
        # its `# nosec` comments can't hide anything.
        return ["bandit", "-f", "json", "-q", "--ignore-nosec", "-s", self.SKIP, "--", *files]

    def parse(self, out):
        return [
            Issue(r["test_id"], r["filename"], r["line_number"], max(r.get("line_range") or [r["line_number"]]),
                  f"{r['test_name']}: {one_line(self.QUOTED.sub('', r['issue_text']))}", r["issue_severity"].lower())
            for r in json.loads(out)["results"]
        ]


class Mypy(Tool):
    id = "mypy"
    # Per directory, so two modules with the same name in different folders (every tests/conftest.py)
    # never land in one mypy run, which mypy refuses outright.
    scope = "dir"

    def matches(self, path):
        return ext(path) in (".py", ".pyi")

    def runnable(self, path):
        return parses_as_python(path)

    def argv(self, files):
        return [
            "mypy", "--config-file", f"{LINT}/mypy.ini", "--cache-dir", "/tmp/repro-mypy-cache",
            # The target's dependencies aren't installed at scan time; a missing one is Any, not a
            # finding. --follow-imports silent reads the project's other modules for their types
            # without reporting on them: each file's issues come from its own run.
            "--ignore-missing-imports", "--follow-imports", "silent",
            "--no-error-summary", "--show-error-end", "--output", "json", "--", *files,
        ]

    def parse(self, out):
        issues = []
        for line in out.splitlines():
            if not line.startswith("{"):
                continue
            r = json.loads(line)
            if r.get("severity") != "error" or not r.get("code"):
                continue
            issues.append(Issue(r["code"], r["file"], r["line"], max(r.get("end_line") or r["line"], r["line"]),
                                one_line(r["message"]), r["severity"]))
        return issues


class Pylint(Tool):
    id = "pylint"
    # Left out of E and W:
    # - import-error, no-name-in-module, no-member: the target's dependencies aren't installed at
    #   scan time, so these fire on every third-party import.
    # - fixme: a TODO comment is not a defect.
    # - unused-argument, protected-access, logging-fstring-interpolation, unspecified-encoding,
    #   broad-exception-caught, broad-exception-raised, global-statement, redefined-outer-name: they
    #   fire on deliberate, idiomatic code far more often than on a bug.
    LEFT_OUT = (
        "import-error,no-name-in-module,no-member,fixme,unused-argument,protected-access,"
        "logging-fstring-interpolation,unspecified-encoding,broad-exception-caught,"
        "broad-exception-raised,global-statement,redefined-outer-name"
    )
    batch_size = 50
    # Pylint's exit code is a bit mask of the message types it emitted; 32 is a usage error.
    ok_codes = tuple(range(32))

    def matches(self, path):
        return ext(path) == ".py"

    def argv(self, files):
        # Errors and warnings only, with Repro's own rcfile (pylintrc says which are left out).
        return ["pylint", "--rcfile", f"{LINT}/pylintrc", f"--disable={self.LEFT_OUT}", "--output-format", "json2", "--", *files]

    def parse(self, out):
        return [
            Issue(m["messageId"], m["path"], m["line"], max(m.get("endLine") or m["line"], m["line"]),
                  f"{m['symbol']}: {one_line(m['message'])}", m["type"])
            for m in json.loads(out)["messages"]
        ]


class Vulture(Tool):
    id = "vulture"
    # Dead code is a whole-program question: a function unused in its own file may be called from
    # another.
    scope = "project"
    # 3 means "dead code found".
    ok_codes = (0, 3)
    LINE = re.compile(r"^(.+?):(\d+): (.+) \((\d+)% confidence(?:, (\d+) lines?)?\)$")
    KIND = re.compile(r"^(unused \w+|unreachable code|unsatisfiable \w+ condition|redundant if-condition)")

    def matches(self, path):
        return ext(path) == ".py"

    def runnable(self, path):
        return parses_as_python(path)

    def argv(self, files):
        # 90% and up: unused imports, unreachable code, unused arguments. Everything vulture rates
        # lower (unused functions, classes, attributes) is a guess about dynamic use.
        return ["vulture", "--config", f"{LINT}/vulture.toml", "--min-confidence", "90", "--", *files]

    def parse(self, out):
        issues = []
        for line in out.splitlines():
            m = self.LINE.match(line.strip())
            if not m:
                continue
            path, row, message, _conf, size = m.groups()
            kind = self.KIND.match(message)
            rule = (kind.group(1) if kind else message.split("'")[0].strip()).replace(" ", "-")
            start = int(row)
            issues.append(Issue(rule, path, start, start + max(int(size or 1), 1) - 1, one_line(message)))
        return issues


# --- JavaScript, TypeScript, web ------------------------------------------------------------------

JS_EXTS = (".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts")


class Eslint(Tool):
    id = "eslint"

    def matches(self, path):
        return ext(path) in JS_EXTS and not path.endswith((".min.js", ".d.ts", ".d.mts", ".d.cts"))

    def argv(self, files):
        # --config is Repro's flat config, so the target's eslint.config.* is never looked up, and
        # --no-inline-config so its `eslint-disable` comments can't switch rules off.
        return [
            "eslint", "--config", f"{LINT}/eslint.config.mjs", "--no-inline-config", "--no-warn-ignored",
            "--no-error-on-unmatched-pattern", "--format", "json", "--", *files,
        ]

    def parse(self, out):
        issues = []
        for result in json.loads(out):
            for m in result["messages"]:
                # A null ruleId is a parse error, not a rule finding.
                if not m.get("ruleId"):
                    continue
                issues.append(Issue(m["ruleId"], result["filePath"], m["line"], max(m.get("endLine") or m["line"], m["line"]),
                                    one_line(m["message"]), "error" if m["severity"] == 2 else "warning"))
        return issues


class Tsc(Tool):
    id = "tsc"
    # One run per tsconfig.json: a type error depends on the whole project it compiles in.
    scope = "project"
    ok_codes = (0, 1, 2)
    LINE = re.compile(r"^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$")
    # Noise from the target's dependencies not being installed at scan time, not defects in its
    # code: cannot find module / its declarations / @types packages for node, jest, mocha, and JSX
    # typings that come from react. Config-level diagnostics (TS5xxx, TS6xxx, TS18003) are about
    # running Repro's tsc on the project's tsconfig, not about its code, and are dropped too.
    MISSING_DEPS = {"TS2307", "TS2792", "TS7016", "TS2688", "TS2580", "TS2591", "TS2582", "TS2593", "TS2503", "TS2875", "TS7026"}

    def matches(self, path):
        return os.path.basename(path) == "tsconfig.json"

    def batches(self, files):
        return [[f] for f in files]

    def peers(self, target, files):
        return [nearest_tsconfig(target)] if nearest_tsconfig(target) else []

    def argv(self, files):
        return ["tsc", "-p", files[0], "--noEmit", "--pretty", "false", "--incremental", "false"]

    def keep(self, issue, batch):
        # A file belongs to the project of its nearest tsconfig.json; the same error reported by a
        # parent project is that project's duplicate.
        return nearest_tsconfig(issue.file) == batch[0]

    def parse(self, out):
        issues = []
        for line in out.splitlines():
            m = self.LINE.match(line.strip())
            if not m:
                continue
            path, row, _col, code, message = m.groups()
            n = int(code[2:])
            if code in self.MISSING_DEPS or 5000 <= n < 7000 or n == 18003:
                continue
            issues.append(Issue(code, path, int(row), int(row), one_line(message), "error"))
        return issues


def nearest_tsconfig(path: str) -> str | None:
    d = os.path.dirname(path)
    while True:
        candidate = os.path.join(d, "tsconfig.json") if d else "tsconfig.json"
        if os.path.isfile(candidate):
            return candidate
        if not d:
            return None
        d = os.path.dirname(d)


class Htmlhint(Tool):
    id = "htmlhint"

    def matches(self, path):
        return ext(path) in (".html", ".htm")

    def argv(self, files):
        return ["htmlhint", "--config", f"{LINT}/htmlhint.json", "--format", "json", "--", *files]

    def parse(self, out):
        issues = []
        for result in json.loads(out or "[]"):
            for m in result["messages"]:
                issues.append(Issue(m["rule"]["id"], result["file"], m["line"], m["line"], one_line(m["message"]), m["type"]))
        return issues


TOOLS: dict[str, Tool] = {
    t.id: t
    for t in (
        Bandit(), Mypy(), Pylint(), Vulture(), Eslint(), Tsc(), Htmlhint(),
    )
}


def project_files() -> list[str]:
    """The files the scan judges: what git tracks at the workspace's commit (Workspace.fileIndex),
    plus anything a patch has added since, minus installed dependencies."""
    try:
        out = subprocess.run(
            ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
            capture_output=True, check=True,
        ).stdout.decode("utf-8", "replace")
        files = [f for f in out.split("\0") if f]
    except (OSError, subprocess.CalledProcessError):
        files = []
        for d, dirs, names in os.walk("."):
            dirs[:] = [x for x in dirs if x not in EXCLUDED_DIRS]
            files += [os.path.relpath(os.path.join(d, n)) for n in names]
    files = [f for f in files if not EXCLUDED_DIRS.intersection(f.split("/")) and os.path.isfile(f)]
    return sorted(set(files))


def tool_files(tool: Tool) -> list[str]:
    return [f for f in project_files() if tool.matches(f) and tool.runnable(f)]


def get_tool(name: str) -> Tool:
    tool = TOOLS.get(name)
    if tool is None:
        raise ToolError(f"unknown detector {name!r}")
    return tool


def to_json(issues: list[Issue]) -> list[dict]:
    return [asdict(i) for i in issues]
