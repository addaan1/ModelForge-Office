import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import main


class KaggleAnalyzeHelpersTest(unittest.TestCase):
    def test_extract_competition_slug_accepts_url_and_plain_slug(self):
        self.assertEqual(
            main.extract_competition_slug("https://www.kaggle.com/competitions/house-prices-advanced-regression-techniques/overview"),
            "house-prices-advanced-regression-techniques",
        )
        self.assertEqual(main.extract_competition_slug("titanic"), "titanic")

    def test_extract_competition_slug_rejects_unsafe_values(self):
        with self.assertRaises(ValueError):
            main.extract_competition_slug("../secrets")
        with self.assertRaises(ValueError):
            main.extract_competition_slug("bad slug")

    def test_competition_paths_stay_inside_data_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            paths = main.competition_paths("titanic", Path(tmp))
            self.assertEqual(paths["root"], Path(tmp) / "competitions" / "titanic")
            self.assertEqual(paths["raw"], Path(tmp) / "competitions" / "titanic" / "raw")
            self.assertEqual(paths["code"], Path(tmp) / "competitions" / "titanic" / "code")
            self.assertEqual(paths["outputs"], Path(tmp) / "competitions" / "titanic" / "outputs")
            self.assertEqual(paths["runs"], Path(tmp) / "competitions" / "titanic" / "runs")
            self.assertEqual(paths["metadata"], Path(tmp) / "competitions" / "titanic" / "metadata.json")

    def test_profile_downloaded_data_reads_csv_shapes_and_columns(self):
        with tempfile.TemporaryDirectory() as tmp:
            raw = Path(tmp)
            (raw / "train.csv").write_text("id,target,feature\n1,0,a\n2,1,b\n", encoding="utf-8")
            (raw / "notes.txt").write_text("ignore me", encoding="utf-8")

            profile = main.profile_downloaded_data(raw)

            self.assertEqual(profile["files_scanned"], 2)
            self.assertEqual(profile["tables"][0]["name"], "train.csv")
            self.assertEqual(profile["tables"][0]["rows"], 2)
            self.assertEqual(profile["tables"][0]["columns"], ["id", "target", "feature"])
            self.assertIn("size_human", profile["tables"][0])
            self.assertIn("size_human", profile["files"][0])

    def test_write_metadata_file_persists_analyze_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            metadata_path = Path(tmp) / "metadata.json"
            payload = {"slug": "titanic", "files": [{"name": "train.csv"}], "warnings": []}

            main.write_metadata_file(metadata_path, payload)

            saved = json.loads(metadata_path.read_text(encoding="utf-8"))
            self.assertEqual(saved["slug"], "titanic")
            self.assertEqual(saved["files"][0]["name"], "train.csv")

    def test_workspace_helpers_create_safe_structure_and_reject_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            old_root = main.DEFAULT_DATA_ROOT
            main.DEFAULT_DATA_ROOT = Path(tmp)
            try:
                paths = main.ensure_workspace("titanic")
                self.assertTrue(paths["code"].exists())
                (paths["code"] / "01_test.py").write_text("print('ok')\n", encoding="utf-8")
                listing = main.list_workspace_files(paths)
                self.assertEqual(listing["code_files"][0]["path"], "code/01_test.py")
                with self.assertRaises(Exception):
                    main.safe_project_relative_path(paths["root"], "code/../../secret.py", ("code/",))
            finally:
                main.DEFAULT_DATA_ROOT = old_root

    def test_notebook_template_contains_code_cells(self):
        notebook = main.notebook_template("titanic", "eda")
        self.assertEqual(notebook["nbformat"], 4)
        self.assertTrue(any(cell["cell_type"] == "code" for cell in notebook["cells"]))


if __name__ == "__main__":
    unittest.main()
