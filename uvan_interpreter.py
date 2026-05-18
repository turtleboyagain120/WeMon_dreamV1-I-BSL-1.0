import os
import re
import sys
import ctypes
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class ExecContext:
    source_ok: bool = False
    is_admin: bool = False
    file_access: bool = False
    memory: dict = None

    def __post_init__(self):
        if self.memory is None:
            self.memory = {"outputx!000": None}


class UvanInterpreter:
    """
    Safe UVAN interpreter/simulator.

    What it does (based on your language notes):
    - Scans the whole program (order-independent).
    - Requires `source:?turtleboyagain120` anywhere (gate).
    - Emits output for EVERY `!{...}` payload, in the order they appear.
    - BREAK loop:
        If `else for 12 in number` exists AND a !{...} payload contains BREAK,
        it prints 12 forced BREAK outputs.
    - Ignores note lines starting with `#$`.

    Mode header (first non-empty line):
    - `Demo`    => simulation (prints everything; safe).
    - `No demo` => still safe in this environment; it will require admin check locally
                    and otherwise "kicks you out". It will NOT run real net/user/remote commands.
    """

    SOURCE_SIG = "source:?turtleboyagain120"

    def __init__(self):
        self.ctx = ExecContext()

    @staticmethod
    def _strip_comments(program: str) -> str:
        out_lines = []
        for raw_line in program.splitlines():
            stripped = raw_line.lstrip()
            if stripped.startswith("#$"):
                continue
            out_lines.append(raw_line.rstrip("\n"))
        return "\n".join(out_lines).strip("\n")

    @staticmethod
    def _extract_bang_payloads(text: str) -> List[str]:
        return re.findall(r"!\{(.*?)\}", text, flags=re.DOTALL)

    @staticmethod
    def _normalize_quotes(s: str) -> str:
        # normalize curly quotes to straight quotes for consistent detection/output
        return s.replace("“", '"').replace("”", '"').strip()

    @staticmethod
    def _payload_has_force_quote(original_payload: str) -> bool:
        # If payload contains quotes, treat as forced output.
        return ('"' in original_payload) or ("“" in original_payload) or ("”" in original_payload)

    @staticmethod
    def _is_windows_admin() -> bool:
        if os.name != "nt":
            return False
        try:
            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        except Exception:
            return False

    def _detect_flags(self, program: str) -> None:
        self.ctx.source_ok = self.SOURCE_SIG in program

        # Admin-ish markers in your language (simulated signal)
        self.ctx.is_admin = any(x in program for x in ["admin<=else", "admin/true", "admin:yes", "ZZX"])

        # Permission markers (simulated signal)
        self.ctx.file_access = "^%FILE-ACCESS" in program

    def _simulate_run(self, program: str, mode_label: str) -> None:
        program = self._strip_comments(program)
        self.ctx = ExecContext()
        self._detect_flags(program)

        print(f"--- [MODE] {mode_label} ---")
        print("--- [LI!@M] 3GB RAM ACTIVE ---")
        print("--- [UVAN .7.0 ZZX] BOOTING ---")

        if not self.ctx.source_ok:
            print("[CRITICAL] NO SOURCE FOUND. ACCESS DENIED.")
            return

        if self.ctx.is_admin:
            print("[SYSTEM] ZZX/Admin Status: ACTIVE (simulated).")
        if self.ctx.file_access:
            print("[SYSTEM] ^%FILE-ACCESS detected (simulated).")

        payloads = self._extract_bang_payloads(program)

        # BREAK loop
        loop_triggered = "else for 12 in number" in program
        break_payload: Optional[str] = None

        if loop_triggered:
            for payload in payloads:
                pn = self._normalize_quotes(payload)
                if "BREAK" in pn.upper():
                    break_payload = pn
                    break
            print("[LOOP] Triggering 12x Forced Break Sequence...")
            chosen = break_payload if break_payload else "BREAK"
            for i in range(1, 13):
                print(f"  - FORCE EXE >> {chosen} (break {i}/12)")

        # Emit output for EVERY !{...} payload (every detail inside brackets)
        # In your requested mindset: treat these like an alternative to python print().
        for idx, raw_payload in enumerate(payloads):
            cleaned = self._normalize_quotes(raw_payload)
            if cleaned == "":
                continue

            # Cache: keep first payload into outputx!000 (deterministic)
            if idx == 0:
                self.ctx.memory["outputx!000"] = cleaned
                print(f"[MEM] '!{{{cleaned}}}' cached into outputx!000 (simulated).")

            is_forced = self._payload_has_force_quote(raw_payload)
            if is_forced:
                print(f"FORCE EXE >> {cleaned}")
            else:
                print(f"OUTPUT >> {cleaned}")

        # Finish marker
        if "!@fin!" in program or '“!@fin!”' in program or "“!@fin!”" in program:
            print("[STATUS] Signal: !@fin! - Execution Complete. (simulated)")

        print("\n--- DONE: All commands processed (safe simulator) ---")

    def run(self, full_program: str) -> None:
        raw = full_program.lstrip()

        # Determine mode header: first non-empty line
        first_nonempty = ""
        for line in raw.splitlines():
            if line.strip():
                first_nonempty = line.strip()
                break

        mode = "Demo"
        if first_nonempty.lower().startswith("no demo"):
            mode = "No demo"
        elif first_nonempty.lower().startswith("demo"):
            mode = "Demo"

        # Remove mode header line if present
        program_to_run = raw
        if first_nonempty.lower().startswith(("demo", "no demo")):
            program_to_run = "\n".join(raw.splitlines()[1:])

        if mode.lower().startswith("no demo"):
            # Per your requirement: admin required; kick out otherwise.
            if not self._is_windows_admin():
                print("[SECURITY] No demo requested, but admin privileges are not present.")
                print("[SECURITY] KICKED OUT.")
                return

            print("[SECURITY] Admin detected locally.")
            print("[SECURITY] This environment will only run SAFE simulation/training (no real net/admin actions here).")
            self._simulate_run(program_to_run, mode_label="No demo (admin-verified, SAFE simulation)")
            return

        # Demo mode
        self._simulate_run(program_to_run, mode_label="Demo (simulation)")


def main():
    demo_program = r"""
Demo
admin<=else: 2?admin=true && net user = admin:yes & >%90 = admin && else admin/true ^^ force net stop else && admin:yes else force x2 V} _)|MQ X 2.0 UVAN .7.0 ZZX
LL!@M araa progra= ubuntulatest id=is_checks/=( [id-20])_++ext program.

#$ this is a note. #$ = a note.

@+admin=admin^%FILE-ACCESS

If else CMD:yes ^ !{hello} and else __! = outputx!000 = 3 of letters ?/3?/ then stop “!@fin!”? Else for 12 in number !{BREAK”} __break-com!__ ^^source:?turtleboyagain120
""".strip("\n")

    stdin = ""
    if not sys.stdin.isatty():
        stdin = sys.stdin.read()

    program = stdin if stdin and stdin.strip() else demo_program
    UvanInterpreter().run(program)


if __name__ == "__main__":
    main()
