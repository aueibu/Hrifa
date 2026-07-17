from pathlib import Path


def resolve_mbox_files(inputs: list[str]) -> list[Path]:
    files: list[Path] = []
    for raw in inputs:
        path = Path(raw).expanduser()
        if path.is_file() and path.suffix.lower() == ".mbox":
            files.append(path)
        elif path.is_dir():
            files.extend(p for p in path.rglob("*") if p.is_file() and p.suffix.lower() == ".mbox")
        else:
            raise FileNotFoundError(f"Not an MBOX file or directory: {path}")
    unique = list(dict.fromkeys(p.resolve() for p in files))
    if not unique:
        raise FileNotFoundError("No .mbox files found in the supplied input.")
    return unique
