"""KEGG offline annotation downloader package."""

from .core import KEGG_BASE_URL, generate_derived_files, run_pipeline

__all__ = ["KEGG_BASE_URL", "generate_derived_files", "run_pipeline"]
