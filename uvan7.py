"""UVAN 7.0 executor backend (SAFE IMPLEMENTATION)

This repository intentionally provides a non-destructive executor.
It does NOT run real privileged OS commands.

`terminal.py` expects this module (or an external file at C:/UVAN/uvan7.py)
with:
  - ensure_admin_or_raise()
  - execute_dispatch(dispatch, ctx)

For safety, this executor:
  - treats LL!@M as a *logging/cache directive* only
  - never performs file deletion, ACL modification, net/user changes,
    service termination, or remote execution.

If you later want a real executor, that must be built with explicit
user consent, strict allowlists, and audited command execution.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass

from datetime import datetime
from typing import Any, Dict, List, Optional


@dataclass
class ExecutorState:
    is_admin: bool = False


class Uvan7Executor:
    """Safe executor backend."""

    SOURCE_SIG = "source:?turtleboyagain120"
    UVAN_LL_CACHE_TOKEN = "LL!@M"

    def __init__(self) -> None:
        self.state = ExecutorState(is_admin=False)
        # Project-local cache (non-destructive)
        self.cache_dir = os.path.join(os.path.dirname(__file__), "uvan_cache")
        os.makedirs(self.cache_dir, exist_ok=True)

    @staticmethod
    def _is_windows_admin() -> bool:
        try:
            import ctypes

            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        except Exception:
            return False

    def ensure_admin_or_raise(self) -> None:
        """Preserve terminal's admin requirement gate, but remain safe.

        In this SAFE implementation we do not refuse execution; we only
        record the admin bit for logging.
        """

        self.state.is_admin = self._is_windows_admin()

    def _safe_log(self, lines: List[str], *, filename: str) -> None:
        path = os.path.join(self.cache_dir, filename)
        payload = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "lines": lines,
        }
        with open(path, "w", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False, indent=2))

    def _serialize_dispatch(self, dispatch: Dict[str, Any]) -> str:
        try:
            return json.dumps(dispatch, ensure_ascii=False)
        except TypeError:
            # Fallback: best-effort stringification
            return str(dispatch)

    def execute_dispatch(self, dispatch: Dict[str, Any], ctx: Dict[str, Any]) -> None:
        """Execute parsed dispatch actions safely.

        - Converts actions into log lines.
        - If LL!@M is present in any payload/output, caches the generated
          output/logs.
        """

        cycle = ctx.get("cycle", 1)
        break_force = bool(ctx.get("break_force", False))

        actions = dispatch.get("actions", [])
        break_payload = dispatch.get("break_payload")
        other_outputs: List[str] = dispatch.get("other_outputs", [])

        log_lines: List[str] = []
        log_lines.append(f"[UVAN7 SAFE] cycle={cycle} admin={self.state.is_admin} break_force={break_force}")

        # BREAK payload handling: do not force-stop anything in safe mode.
        if break_payload is not None:
            log_lines.append(f"[UVAN7 SAFE] break_payload={break_payload}")

        # Convert actions into safe messages
        for i, action in enumerate(actions):
            atype = action.get("type")
            log_lines.append(f"[UVAN7 SAFE] action[{i}] type={atype} data={action}")

        # Legacy outputs
        for out in other_outputs:
            log_lines.append(f"[UVAN7 SAFE] output={out}")

        # Detect LL!@M directive based on action/raw text presence
        ll_present = any(
            isinstance(x, str) and self.UVAN_LL_CACHE_TOKEN in x
            for x in other_outputs
        ) or any(
            isinstance(a, dict) and any(
                isinstance(v, str) and self.UVAN_LL_CACHE_TOKEN in v
                for v in a.values()
            )
            for a in actions
        )

        # Always print, but only cache when LL!@M directive is present.
        for line in log_lines:
            print(line)

        if ll_present:
            filename = f"llm_cache_cycle_{cycle}.json"
            self._safe_log(log_lines, filename=filename)


# --- Module-level hooks expected by terminal.py ---
_executor = Uvan7Executor()


def ensure_admin_or_raise() -> None:
    _executor.ensure_admin_or_raise()


def execute_dispatch(dispatch: Dict[str, Any], ctx: Dict[str, Any]) -> None:
    _executor.execute_dispatch(dispatch=dispatch, ctx=ctx)

