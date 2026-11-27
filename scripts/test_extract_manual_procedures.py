import unittest

from extract_manual_procedures import approved_procedures, extract_numbered_steps


class ProcedureExtractionTests(unittest.TestCase):
    def test_preserves_order_units_and_page_across_pages(self):
        pages = [
            {"pdfPage": 4, "text": "Снятие насоса\n1. Ослабить гайку на 12 мм"},
            {"pdfPage": 5, "text": "2) Снять насос массой 3 кг"},
        ]
        steps = extract_numbered_steps(pages, 4, 5)
        self.assertEqual([4, 5], [item["pdfPage"] for item in steps])
        self.assertIn("12 мм", steps[0]["text"])
        self.assertIn("3 кг", steps[1]["text"])

    def test_refuses_missing_or_ambiguous_numbering(self):
        self.assertEqual([], extract_numbered_steps([{"pdfPage": 1, "text": "2. Второе"}], 1, 1))
        self.assertEqual([], extract_numbered_steps([{"pdfPage": 1, "text": "1. Первое\n3. Третье"}], 1, 1))

    def test_literal_anchors_bound_section_and_match_wrapped_text(self):
        pages = [{"pdfPage": 7, "text": "Секция A\n1) Не брать этот пункт\nПорядок снятия\nкрышки\n1) Ослабить болт\n2. Снять крышку\nДалее\n1. Чужой раздел"}]
        steps = extract_numbered_steps(pages, 7, 7, start_after="Порядок снятия крышки", stop_before="Далее")
        self.assertEqual(["Ослабить болт", "Снять крышку"], [step["text"] for step in steps])
        self.assertEqual([], extract_numbered_steps(pages, 7, 7, start_after="missing"))

    def test_rejects_repeated_anchors_page_gaps_and_cross_page_continuation(self):
        repeated = [{"pdfPage": 1, "text": "Начало\n1. Первый\nНачало\n2. Второй"}]
        self.assertEqual([], extract_numbered_steps(repeated, 1, 1, start_after="Начало"))
        self.assertEqual([], extract_numbered_steps([{"pdfPage": 1, "text": "1. Первый"},
                                                      {"pdfPage": 3, "text": "2. Второй"}], 1, 3))
        for continuation in ("продолжение", "обязательная проверка\n2. Второй"):
            pages = [{"pdfPage": 1, "text": "1. Первый"}, {"pdfPage": 2, "text": continuation}]
            self.assertEqual([], extract_numbered_steps(pages, 1, 2))

    def test_rejects_truncated_or_out_of_sequence_steps(self):
        self.assertEqual([], extract_numbered_steps([{"pdfPage": 1, "text": "1.\n2. Второй"}], 1, 1))
        self.assertEqual([], extract_numbered_steps([{"pdfPage": 1, "text": "1. Первый\n101. Дальний"}], 1, 1))

    def test_stale_approval_emits_no_procedure(self):
        manual = {"id": "sample", "procedures": [{"approvedSourceSha256": "old", "pdfPageStart": 1,
                  "pdfPageEnd": 1, "engineModel": "e", "anomalyType": "a", "label": "Операция"}]}
        self.assertEqual([], approved_procedures(manual, [{"pdfPage": 1, "text": "1. Шаг"}], "new"))

    def test_current_approval_emits_source_linked_guidance_shape(self):
        manual = {"id": "sample", "procedures": [{"approvedSourceSha256": "abc", "pdfPageStart": 1,
                  "pdfPageEnd": 1, "engineModel": "test-100", "anomalyType": "noise", "label": "Проверка"}]}
        result = approved_procedures(manual, [{"pdfPage": 1, "text": "Проверка узла\n1. Измерить зазор 0,4 мм"}], "abc")
        self.assertEqual("abc", result[0]["sourceSha256"])
        self.assertEqual("sample", result[0]["procedure"][0]["manualId"])
        self.assertEqual(1, result[0]["procedure"][0]["pdfPage"])
        self.assertIn("0,4 мм", result[0]["procedure"][0]["quote"])
        self.assertIsInstance(result[0]["procedure"], list)  # backend guidance contract uses `procedure`
        self.assertEqual(result[0]["procedure"][0]["pdfPage"], result[0]["pdfPage"])
        self.assertEqual(result[0]["procedure"][0]["quote"], result[0]["quote"])


if __name__ == "__main__":
    unittest.main()
