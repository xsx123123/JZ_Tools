"""编号反查业务：GSE→SRA/PRJ、GSM 通道选择等路径构造（纯函数，可裸测）。"""
from __future__ import annotations

from urllib.parse import quote

from ..accessions import GSM_PATTERN


def sample_metadata_path(accession: str) -> str:
    """GSM 走 sample-detail 通道，SAMN/SAMD 走 sample 通道。"""
    return ("/sample-detail/" if GSM_PATTERN.fullmatch(accession.upper()) else "/sample/") + quote(accession, safe="")


def project_detail_path(accession: str) -> str:
    return f"/project/{quote(accession.upper(), safe='')}"


def accession_project_path(accession: str) -> str:
    return f"/accession/{quote(accession.upper(), safe='')}/project"


def prj_path(prj_accession: str) -> str:
    return f"/prj/{quote(prj_accession.upper(), safe='')}"
