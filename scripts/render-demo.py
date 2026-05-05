import json
import re
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CAST = ROOT / "docs" / "demo.cast"
SVG = ROOT / "docs" / "demo.svg"

DCS = re.compile(r"\x1bP.*?\x1b\\", re.DOTALL)
OSC = re.compile(r"\x1b\].*?(?:\x07|\x1b\\)", re.DOTALL)
PRIVATE_MODE = re.compile(r"\x1b\[\?[0-9;]*[hl]")
TERMINAL_QUERY = re.compile(r"\x1b\[(?:>|=)?[0-9;?]*[nqt]")
SIXEL_CURSOR = re.compile(r"\x1b\[>?[0-9;]* q")
def clean_output(text: str) -> str:
    text = DCS.sub("", text)
    text = OSC.sub("", text)
    text = PRIVATE_MODE.sub("", text)
    text = TERMINAL_QUERY.sub("", text)
    text = SIXEL_CURSOR.sub("", text)
    return text


def main() -> int:
    with tempfile.NamedTemporaryFile("w", suffix=".cast", delete=False) as tmp:
        tmp_path = Path(tmp.name)
        with CAST.open(encoding="utf-8") as source:
            header = json.loads(source.readline())
            header["env"]["TERM"] = "xterm-256color"
            tmp.write(json.dumps(header) + "\n")
            for line in source:
                event = json.loads(line)
                if len(event) >= 3 and event[1] == "o":
                    event[2] = clean_output(event[2])
                tmp.write(json.dumps(event) + "\n")

    try:
        subprocess.run(
            [
                str(Path.home() / ".local/bin/termtosvg"),
                "render",
                str(tmp_path),
                str(SVG),
                "--template",
                "xterm",
                "--min-frame-duration",
                "35",
                "--max-frame-duration",
                "500",
            ],
            check=True,
        )
    finally:
        tmp_path.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
