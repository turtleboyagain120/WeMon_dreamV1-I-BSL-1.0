#!/usr/bin/env python3
"""UVAN Hybrid Custom Terminal v7.0 (ZZX)

This module provides the interactive entrypoint and the two-pass
Pre-Scan Execution model.

IMPORTANT SAFETY NOTE
- This repository is intended as a system-level controller.
- The execution engine is guarded by a strict source attestation token
  and by presence of the admin execution module at C:/UVAN/uvan7.py.

If you intentionally run this on your system, ensure you understand the
impact of the dispatched OS commands.
"""

from __future__ import annotations

import importlib.util
import os
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


SOURCE_SIG = "source:?turtleboyagain120"
UVAN7_PATH = os.path.join(os.path.dirname(__file__), "uvan7.py")


@dataclass
class ScanPlan:
    source_ok: bool
    requires_admin: bool
    has_file_access: bool
    has_remote: bool
    has_break_force: bool
    loop_12_cycles: bool
    bang_payloads: List[str]


class Terminal:
    """Interactive UVAN terminal."""

    def __init__(self) -> None:
        self._uvan7 = self._load_uvan7()

    @staticmethod
    def _load_uvan7() -> Any:
        """Load uvan7.py from the fixed location.

        If missing, the workspace is treated as untrusted.
        """
        if not os.path.exists(UVAN7_PATH):
            raise FileNotFoundError(
                f"Untrusted workspace: required admin engine not found at {UVAN7_PATH}."
            )

        spec = importlib.util.spec_from_file_location("uvan7", UVAN7_PATH)
        if spec is None or spec.loader is None:
            raise ImportError(f"Unable to load spec for {UVAN7_PATH}")

        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    @staticmethod
    def _strip_comments(program: str) -> str:
        out_lines: List[str] = []
        for raw_line in program.splitlines():
            stripped = raw_line.lstrip()
            if stripped.startswith("#$"):
                continue
            out_lines.append(raw_line.rstrip("\n"))
        return "\n".join(out_lines).strip("\n")

    @staticmethod
    def _extract_bang_payloads(text: str) -> List[str]:
        # Non-greedy: each !{...} is a distinct token
        import re

        return re.findall(r"!\{(.*?)\}", text, flags=re.DOTALL)

    @staticmethod
    def _normalize_quotes(s: str) -> str:
        return s.replace("\u201c", '"').replace("\u201d", '"').strip()

    @staticmethod
    def _payload_has_force_quote(payload: str) -> bool:
        return ('"' in payload) or ("\u201c" in payload) or ("\u201d" in payload)

    @classmethod
    def _scan_pass1(cls, raw_program: str) -> ScanPlan:
        program = cls._strip_comments(raw_program)

        source_ok = SOURCE_SIG in program
        requires_admin = any(
            x in program
            for x in ["admin<=else", "admin=true", "admin:yes", "LL!@M", "ZZX"]
        )
        has_file_access = "^%FILE-ACCESS" in program
        has_remote = "^%REMOTE-COMPUTER" in program
        loop_12_cycles = "else for 12 in number" in program
        bang_payloads = cls._extract_bang_payloads(program)

        # "double-force" break: !{BREAK"}
        has_break_force = any(
            "BREAK" in cls._normalize_quotes(p).upper() and cls._payload_has_force_quote(p)
            for p in bang_payloads
        )

        return ScanPlan(
            source_ok=source_ok,
            requires_admin=requires_admin,
            has_file_access=has_file_access,
            has_remote=has_remote,
            has_break_force=has_break_force,
            loop_12_cycles=loop_12_cycles,
            bang_payloads=bang_payloads,
        )

    @staticmethod
    def _parse_dispatch_tokens(plan: ScanPlan, program_text: str) -> Dict[str, Any]:
        """Convert scan information and raw payloads into dispatch directives.

        This layer is intentionally order-independent: it uses substring scanning and
        extracts any nearby arguments opportunistically.

        Contract passed to `C:/UVAN/uvan7.py`:
          - dispatch["actions"]: list of structured actions to execute
          - dispatch["other_outputs"]: legacy/text payloads (optional)
          - dispatch["break_payload"]: raw BREAK-like payload (optional)
        """

        def _first_match(regex: str) -> Optional[str]:
            import re

            m = re.search(regex, program_text, flags=re.DOTALL | re.IGNORECASE)
            return None if m is None else m.group(1).strip()

        dispatch: Dict[str, Any] = {
            "actions": [],
            "net_user_or_admin_tokens": [],
            "file_access_tokens": [],
            "remote_tokens": [],
            "break_payload": None,
            "other_outputs": [],
        }

        # 1) Structured file access (^%FILE-ACCESS)
        if plan.has_file_access:
            # Best-effort capture of a target path after the marker.
            # Accepts forms like: ^%FILE-ACCESS C:\path\to\target or ^%FILE-ACCESS "C:\..."
            target = _first_match(r"\^%FILE-ACCESS\s*(?:\"([^\"]+)\"|'([^']+)'|([^\s!]+))")
            target_clean = None
            if target is not None:
                # If regex uses groups, re.search returns the whole group(1) only; we keep it simple.
                target_clean = target

            dispatch["actions"].append(
                {
                    "type": "file_access",
                    "target": target_clean,
                    "raw": "^%FILE-ACCESS",
                }
            )
            dispatch["file_access_tokens"].append("^%FILE-ACCESS")

        # 2) Structured remote hook (^%REMOTE-COMPUTER)
        if plan.has_remote:
            remote = _first_match(r"\^%REMOTE-COMPUTER\s*(?:\"([^\"]+)\"|'([^']+)'|([^\s!]+))")
            dispatch["actions"].append(
                {
                    "type": "remote_hook",
                    "target": remote,
                    "raw": "^%REMOTE-COMPUTER",
                }
            )
            dispatch["remote_tokens"].append("^%REMOTE-COMPUTER")

        # 3) Service-control phrases (e.g., force net stop)
        # We convert plain substring phrases into structured actions.
        # Example patterns accepted:
        #   "force net stop"\n        #   "net stop" + "force" nearby
        if "net stop" in program_text.lower():
            force_present = "force" in program_text.lower()
            dispatch["actions"].append(
                {
                    "type": "net_stop",
                    "force": force_present,
                    "service": _first_match(r"net\s+stop\s+([^\s\r\n!&]+)") or None,
                }
            )

        # 4) BREAK payload capture: keep raw BREAK-like token for uvan7.
        for payload in plan.bang_payloads:
            p = Terminal._normalize_quotes(payload)
            if not p:
                continue

            if "BREAK" in p.upper() and dispatch["break_payload"] is None:
                dispatch["break_payload"] = p

            # Legacy output capture: preserve every !{...} payload text.
            dispatch["other_outputs"].append(p)

        return dispatch


    def run_once(self, program_text: str) -> None:
        raw_program = program_text

        plan = self._scan_pass1(raw_program)

        # Pass 1 safety gate
        if not plan.source_ok:
            print("[CRITICAL] NO SOURCE FOUND. ACCESS DENIED.")
            return

        # Pass 1: require admin if requested by language tokens
        if plan.requires_admin:
            # Keep the admin gate semantics, but actual effects are controlled
            # by the executor backend.
            self._uvan7.ensure_admin_or_raise()


        dispatch = self._parse_dispatch_tokens(plan, program_text=raw_program)


        # Pass 2 execution
        if plan.loop_12_cycles:
            # Execute up to 12 times, stopping on forced-break.
            for i in range(12):
                self._uvan7.execute_dispatch(
                    dispatch=dispatch,
                    ctx={
                        "cycle": i + 1,
                        "break_force": plan.has_break_force,
                    },
                )
                if plan.has_break_force and dispatch.get("break_payload"):
                    break
        else:
            self._uvan7.execute_dispatch(
                dispatch=dispatch,
                ctx={
                    "cycle": 1,
                    "break_force": plan.has_break_force,
                },
            )

    def repl(self) -> None:
        print("UVAN ZZX Terminal v7.0")
        print("Enter ZZX-Script. End input with Ctrl+Z (Windows) or Ctrl+D (Unix).")

        while True:
            try:
                # Minimal REPL: read a full stdin chunk until EOF-like behavior.
                # For true interactive multi-line editing, a line editor library is needed.
                prompt = "ZZX >> "
                sys.stdout.write(prompt)
                sys.stdout.flush()
                buf = sys.stdin.readline()
                if not buf:
                    break
                # If user pasted single line, still run pre-scan on buffer.
                self.run_once(buf)
            except KeyboardInterrupt:
                print("\n[EXIT] KeyboardInterrupt")
                return


def main() -> None:
    # Allow piping a full program to stdin
    stdin = ""
    if not sys.stdin.isatty():
        stdin = sys.stdin.read()

    if stdin and stdin.strip():
        Terminal().run_once(stdin)
        return

    Terminal().repl()


if __name__ == "__main__":
    main()

