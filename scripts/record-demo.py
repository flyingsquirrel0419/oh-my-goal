import os
import sys
import time

import pexpect


def main() -> int:
    env = os.environ.copy()
    env.setdefault("TERM", "xterm-256color")
    env.setdefault("COLORTERM", "truecolor")

    child = pexpect.spawn(
        "opencode",
        ["/root/oh-my-goal", "--model", "zai-coding-plan/glm-5.1", "--log-level", "ERROR"],
        dimensions=(34, 120),
        encoding="utf-8",
        env=env,
    )
    child.logfile = sys.stdout

    child.expect("Ask anything", timeout=30)
    time.sleep(1.0)

    child.send("/")
    child.expect([pexpect.TIMEOUT], timeout=2.0)
    child.send("g")
    child.expect([pexpect.TIMEOUT], timeout=1.0)

    for char in "oal create TODO.md with one checkbox":
        child.send(char)
        time.sleep(0.045)

    child.expect([pexpect.TIMEOUT], timeout=3.0)
    child.sendcontrol("c")
    child.expect([pexpect.TIMEOUT, pexpect.EOF], timeout=0.5)
    if child.isalive():
        child.terminate(force=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
