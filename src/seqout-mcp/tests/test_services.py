"""services 层裸测：纯函数、无框架依赖（M1 抽离的回归保障）"""
import unittest

from seqout_mcp.services.evidence import (
    build_search_terms,
    esearch_url,
    not_found_card,
    parse_efetch_outline,
    parse_epmc,
    parse_esearch,
    parse_esummary,
)
from seqout_mcp.services.resolve import (
    accession_project_path,
    prj_path,
    project_detail_path,
    sample_metadata_path,
)
from seqout_mcp.services.search import (
    apply_transform,
    build_search_query,
    summarize_pagination,
)


class ServiceResolveTests(unittest.TestCase):
    def test_gsm_uses_sample_detail_channel(self):
        self.assertEqual(sample_metadata_path("GSM4581240"), "/sample-detail/GSM4581240")

    def test_samn_uses_sample_channel(self):
        self.assertEqual(sample_metadata_path("SAMN123"), "/sample/SAMN123")

    def test_paths_uppercase_and_quoted(self):
        self.assertEqual(project_detail_path("gse151530"), "/project/GSE151530")
        self.assertEqual(accession_project_path("srr123"), "/accession/SRR123/project")
        self.assertEqual(prj_path("prjna732811"), "/prj/PRJNA732811")


class ServiceSearchTests(unittest.TestCase):
    def test_query_mapping_skips_none(self):
        # query_map: api 参数名 → tool 入参名
        self.assertEqual(
            build_search_query({"query": "liver", "cursor": None}, {"q": "query", "cursor": "cursor"}),
            {"q": "liver"},
        )
        self.assertIsNone(build_search_query({"query": None}, {"q": "query"}))

    def test_apply_transform_search(self):
        data, meta = apply_transform("search", {"results": [{"accession": "GSE1", "summary": "x" * 300}], "total": 1, "next_cursor": "c"})
        self.assertEqual(data[0]["accession"], "GSE1")
        self.assertTrue(data[0]["summary"].endswith("..."))
        self.assertEqual(meta["next_cursor"], "c")

    def test_apply_transform_unknown_passthrough(self):
        self.assertEqual(apply_transform(None, {"a": 1}), ({"a": 1}, {}))

    def test_summarize_pagination_appends_hint(self):
        summary = summarize_pagination("结果", {"total": 40, "shown": 20})
        self.assertIn("共 40 条", summary)

    def test_summarize_pagination_no_hint_when_fits(self):
        self.assertEqual(summarize_pagination("结果", {"total": 5, "shown": 5}), "结果")


class ServiceEvidenceTests(unittest.TestCase):
    def test_esearch_url_carries_tool_param(self):
        url = esearch_url("GSE151530[Title]")
        self.assertIn("tool=go_xunbaoshu", url)
        self.assertIn("db=pubmed", url)

    def test_parse_esearch_ids(self):
        self.assertEqual(parse_esearch({"esearchresult": {"idlist": ["123", "456"]}}), ["123", "456"])
        self.assertEqual(parse_esearch({}), [])

    def test_parse_esummary_extracts_doi(self):
        data = {"result": {"123": {"title": "T", "fulljournalname": "J", "pubdate": "2021 Jan",
                                   "articleids": [{"type": "doi", "value": "10.1/x"}]}}}
        meta = parse_esummary(data, ["123"])
        self.assertEqual(meta["123"]["doi"], "10.1/x")

    def test_parse_efetch_outline_labeled_and_unlabeled(self):
        xml = '<Abstract><AbstractText Label="BACKGROUND">b</AbstractText><AbstractText>plain</AbstractText></Abstract>'
        sections = parse_efetch_outline(xml)
        self.assertEqual(sections, [{"section": "BACKGROUND", "text": "b"}, {"section": "Abstract", "text": "plain"}])

    def test_parse_epmc_full_card(self):
        data = {"resultList": {"result": [{
            "title": "T", "pmid": "123", "doi": "10.1/x", "abstractText": "abs",
            "journalInfo": {"journal": {"title": "J"}, "yearOfPublication": 2021},
            "fullTextUrlList": {"fullTextUrl": [{"documentStyle": "html", "url": "u1"}, {"documentStyle": "pdf", "url": "u2"}]},
        }]}}
        card = parse_epmc(data)
        self.assertEqual(card["status"], "ok")
        self.assertEqual(card["urls"]["full_text"], "u2")

    def test_not_found_is_business_status(self):
        card = not_found_card(["GSE1[Title]"])
        self.assertEqual(card, {"status": "not_found", "suggested_queries": ["GSE1[Title]"]})

    def test_build_search_terms_geo_requires_title_match(self):
        self.assertEqual(build_search_terms("geo_series", "GSE151530"), ["GSE151530[Title]"])

    def test_build_search_terms_pubmed_direct(self):
        self.assertEqual(build_search_terms("pubmed", "PMID:123"), [])


if __name__ == "__main__":
    unittest.main()
