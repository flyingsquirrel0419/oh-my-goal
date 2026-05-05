import os
import sys
import time

import pexpect


def main() -> int:
    env = os.environ.copy()
    env["TERM"] = "xterm-256color"
    env["COLORTERM"] = "truecolor"
    env["PS1"] = "$ "

    child = pexpect.spawn(
        "/bin/bash",
        ["--noprofile", "--norc", "-i"],
        cwd="/root/oh-my-goal",
        dimensions=(34, 120),
        encoding="utf-8",
        env=env,
    )
    child.logfile_read = sys.stdout

    child.expect(r"\$ ", timeout=10)
    command = "opencode"
    for char in command:
        child.send(char)
        time.sleep(0.025)
    child.send("\r")

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
        child.sendline("exit")
    child.expect([pexpect.TIMEOUT, pexpect.EOF], timeout=1.0)
    if child.isalive():
        child.terminate(force=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
