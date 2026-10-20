from __future__ import annotations

import re
from typing import Any

STUDY_PATTERN = r"^([SED]RP|PRJ[A-Z]+|CRA|HRA|[Ee]-[Gg][Ee][Aa][Dd]-)\d+$"
SAMPLE_PATTERN = r"^([SED]RS|SAM[A-Z]+|HRS|GSM)\d+$"
GSE_PATTERN = re.compile(r"^GSE\d+$", re.IGNORECASE)
GSM_PATTERN = re.compile(r"^GSM\d+$", re.IGNORECASE)
STUDY_ACCESSION_PATTERN = re.compile(
    r"(?:SRP|ERP|DRP|PRJNA|PRJEB|PRJDB|CRA|HRA)\d+|e-GEAD-\d+", re.I
)


def find_study_accession(data: Any) -> str | None:
    """Find an SRA/BioProject accession recursively in project aliases and xrefs."""
    if isinstance(data, dict):
        for key in ("xref", "xrefs", "alias", "aliases", "accession", "accessions"):
            if key in data:
                found = find_study_accession(data[key])
                if found:
                    return found
        for value in data.values():
            found = find_study_accession(value)
            if found:
                return found
    elif isinstance(data, (list, tuple)):
        for value in data:
            found = find_study_accession(value)
            if found:
                return found
    elif isinstance(data, str):
        match = STUDY_ACCESSION_PATTERN.search(data)
        if match:
            return match.group(0).upper()
    return None
