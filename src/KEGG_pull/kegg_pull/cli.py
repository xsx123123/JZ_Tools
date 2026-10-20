"""Rich command-line interface for kegg_pull."""

from __future__ import annotations

import argparse
from pathlib import Path

from rich.console import Console
from rich.panel import Panel

from .core import DEFAULT_USER_AGENT, run_pipeline
from .utils.configuration import load_default_config, load_software_config
from .utils.logo import config2logo
from .utils.log_utils import logger_generator

try:
    from rich_argparse import ArgumentDefaultsRichHelpFormatter

    HELP_FORMATTER = ArgumentDefaultsRichHelpFormatter
except ImportError:
    HELP_FORMATTER = argparse.ArgumentDefaultsHelpFormatter


console = Console()


def _load_cli_defaults() -> dict:
    try:
        default = load_default_config()
    except Exception:
        default = {}
    return default.get("kegg", {})


def build_parser() -> argparse.ArgumentParser:
    defaults = _load_cli_defaults()
    parser = argparse.ArgumentParser(
        prog="kegg-pull",
        description="Download KEGG organism annotations and build offline TSV/GMT files.",
        formatter_class=HELP_FORMATTER,
    )
    parser.add_argument(
        "species",
        nargs="*",
        help="KEGG organism code(s), e.g. ath hsa mmu osa sly.",
    )

    io_group = parser.add_argument_group("Input and output")
    io_group.add_argument(
        "-o",
        "--outdir",
        default="kegg_annotations",
        help="Output root directory. Each species is written to <outdir>/<species>/.",
    )
    io_group.add_argument(
        "--species-file",
        help="Optional text file with one KEGG organism code per line.",
    )
    io_group.add_argument(
        "--log-dir",
        help="Directory for rich/loguru logs. Defaults to <outdir>/logs.",
    )

    workflow_group = parser.add_argument_group("Workflow")
    workflow_group.add_argument(
        "--skip-download",
        action="store_true",
        help="Do not call KEGG; rebuild derived TSV/GMT files from existing raw files.",
    )
    workflow_group.add_argument(
        "--raw-only",
        action="store_true",
        help="Only download raw KEGG files; skip TSV/GMT generation.",
    )
    workflow_group.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing raw species files.",
    )
    workflow_group.add_argument(
        "--force-organism-list",
        action="store_true",
        help="Overwrite cached kegg_organism.list during validation.",
    )
    workflow_group.add_argument(
        "--no-validate",
        action="store_true",
        help="Skip /list/organism validation before downloading.",
    )
    workflow_group.add_argument(
        "--keep-going",
        action="store_true",
        help="Continue with remaining species after a failure.",
    )
    workflow_group.add_argument(
        "--keep-species-suffix",
        action="store_true",
        help="Keep KEGG pathway name suffix such as ' - Homo sapiens (human)'.",
    )

    network_group = parser.add_argument_group("KEGG REST")
    network_group.add_argument(
        "--delay",
        type=float,
        default=float(defaults.get("delay", 1.0)),
        help="Polite delay in seconds between KEGG REST requests.",
    )
    network_group.add_argument(
        "--timeout",
        type=float,
        default=float(defaults.get("timeout", 60.0)),
        help="HTTP timeout in seconds.",
    )
    network_group.add_argument(
        "--retries",
        type=int,
        default=int(defaults.get("retries", 3)),
        help="HTTP retry count per file.",
    )
    network_group.add_argument(
        "--backoff",
        type=float,
        default=float(defaults.get("backoff", 2.0)),
        help="Exponential retry backoff base.",
    )
    network_group.add_argument(
        "--user-agent",
        default=defaults.get("user_agent", DEFAULT_USER_AGENT),
        help="HTTP User-Agent header.",
    )

    ui_group = parser.add_argument_group("Display and logging")
    ui_group.add_argument(
        "--no-logo",
        action="store_true",
        help="Do not print the startup logo.",
    )
    ui_group.add_argument(
        "--log-level",
        default=None,
        choices=["TRACE", "DEBUG", "INFO", "SUCCESS", "WARNING", "ERROR", "CRITICAL"],
        help="Console log level.",
    )
    ui_group.add_argument(
        "--log-style",
        default="default",
        choices=["default", "minimal", "detailed", "plain"],
        help="Rich logging style.",
    )
    ui_group.add_argument(
        "--more-info",
        action="store_true",
        help="Show detailed logger path/function/line information.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.retries < 1:
        parser.error("--retries must be >= 1")
    if not args.species and not args.species_file:
        console.print("[bold red]ERROR:[/bold red] At least one species code is required.")
        parser.print_help()
        return 2

    try:
        software_config = load_software_config()
        if not args.no_logo:
            config2logo(software_config)

        log_dir = args.log_dir or str(Path(args.outdir) / "logs")
        logger_generator(
            log_dir,
            log_level=args.log_level or "INFO",
            more_info=args.more_info,
            style=args.log_style,
        )

        exit_code = run_pipeline(args)
        if exit_code == 0:
            console.print(
                Panel.fit(
                    f"KEGG annotation build finished.\nOutput: {Path(args.outdir).resolve()}",
                    title="Done",
                    border_style="green",
                )
            )
        return exit_code
    except KeyboardInterrupt:
        console.print("[bold red]Interrupted[/bold red]")
        return 130
    except Exception as exc:
        console.print(f"[bold red]ERROR:[/bold red] {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
