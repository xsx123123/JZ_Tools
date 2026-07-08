#!/usr/bin/env python3
# Backward-compatible entry point for the kegg_pull package CLI.

from kegg_pull.cli import main


if __name__ == '__main__':
    raise SystemExit(main())
