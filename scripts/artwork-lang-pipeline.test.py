import unittest

from importlib.machinery import SourceFileLoader
from pathlib import Path

pipeline = SourceFileLoader(
    "artwork_lang_pipeline",
    str(Path("/home/nez/Projects/pokemon-card-extension/scripts/artwork-lang-pipeline.py")),
).load_module()


class ArtworkKindTests(unittest.TestCase):
    def test_largest_cluster_is_reprint(self):
        clusters = {
            "art_10": [{"public_id": "10"}] * 2,
            "art_1": [{"public_id": "1"}] * 9,
        }
        self.assertEqual(pipeline.auto_reprint_cluster(clusters), "art_1")

    def test_cluster_id_uses_min_public_id(self):
        rows = [{"public_id": "273140"}, {"public_id": "257080"}]
        self.assertEqual(pipeline.cluster_id_for(rows), "art_257080")

    def test_slim_qwen_job_caps_clusters_and_keeps_set_example(self):
        job = {
            "name": "Nest Ball",
            "peer2_versions": 77,
            "clusters": [
                {
                    "id": f"art_{index}",
                    "size": 10 - index,
                    "members": [
                        {
                            "id": str(100 + index),
                            "lang": "western",
                            "set": "Sun & Moon",
                            "num": "123/149",
                            "local": "nest-ball.jpg",
                            "hint": "alt" if index else "reprint",
                        }
                    ],
                }
                for index in range(9)
            ],
        }
        slim = pipeline.slim_qwen_job(job)
        self.assertEqual(slim["name"], "Nest Ball")
        self.assertEqual(len(slim["clusters"]), 6)
        self.assertEqual(slim["clusters"][0]["m"][0]["set"], "Sun & Moon")
        self.assertNotIn("hint", slim["clusters"][0]["m"][0])
        self.assertEqual(slim["clusters"][1]["m"][0]["hint"], "alt")

    def test_qwen_request_disables_thinking(self):
        source = Path("/home/nez/Projects/pokemon-card-extension/scripts/artwork-lang-pipeline.py").read_text()
        self.assertIn('"think": False', source)
        self.assertIn('"num_predict": 700', source)
        self.assertIn("/no_think", source)
        self.assertIn("QWEN_NUM_CTX = 16384", source)
        self.assertIn('name in qwen_labels else ("skipped" if skip_qwen else "auto")', source)

    def test_mutual_cross_lang_links_near_threshold_pairs(self):
        import numpy as np
        uf = pipeline.UnionFind()
        west = [{"public_id": "741826", "vec": np.array([1.0, 0.0], dtype=np.float32)}]
        japan = [{"public_id": "720194", "vec": np.array([0.8515, 0.5243], dtype=np.float32)}]
        for row in west + japan:
            row["vec"] = row["vec"] / float(np.linalg.norm(row["vec"]))
            uf.add(row["public_id"])
        greedy = pipeline.union_cross_lang(west, japan, uf, 0.86)
        mutual = pipeline.union_cross_lang(west, japan, uf, 0.82, mutual=True, margin=0.03)
        self.assertEqual(greedy, 0)
        self.assertEqual(mutual, 1)
        self.assertEqual(uf.find("741826"), uf.find("720194"))

    def test_backfill_row_image_url_from_ct_id(self):
        filled = pipeline.backfill_row_image_url(
            {"ct_id": "370913", "image_url": "", "local_name": "", "cdn_local": False},
            {"370913": ["370913_mega-froslass-ex.jpg"]},
        )
        self.assertEqual(filled["image_url"], "https://cdn.pokoin.com/370913_mega-froslass-ex.jpg")
        self.assertEqual(filled["local_name"], "370913_mega-froslass-ex.jpg")
        self.assertTrue(filled["cdn_local"])

    def test_parse_qwen_json_strips_think_and_survives_truncated(self):
        payload = pipeline.parse_qwen_json(
            '<think>nope</think>{"names":[{"name":"Nest Ball","reprint":["art_1"],"alt":["art_2"]}]}'
        )
        self.assertEqual(payload["names"][0]["name"], "Nest Ball")
        self.assertEqual(pipeline.parse_qwen_json("{not json"), {})

    def test_pixel_art_separates_pikachu_delta_poses(self):
        jp112 = pipeline.leftover_path({
            "public_id": "504600",
            "ct_id": "252300",
            "image_url": "https://cdn.pokoin.com/252300_pikachu-pcg-p-112-pcg-promos.jpg",
        })
        en93 = pipeline.leftover_path({
            "public_id": "233564",
            "ct_id": "116782",
            "image_url": "https://cdn.pokoin.com/116782_pikachu-delta-species-full-v4.jpg",
        })
        en79 = pipeline.leftover_path({
            "public_id": "233090",
            "ct_id": "116545",
            "image_url": "https://cdn.pokoin.com/116545_pikachu-79-110-ex-holon-phantoms.jpg",
        })
        self.assertTrue(jp112 and jp112.is_file())
        self.assertTrue(en93 and en93.is_file())
        self.assertTrue(en79 and en79.is_file())
        a = pipeline.pixel_art_vec(jp112)
        b = pipeline.pixel_art_vec(en93)
        c = pipeline.pixel_art_vec(en79)
        same = float(a @ b)
        other = float(a @ c)
        self.assertGreater(same, 0.88)
        self.assertLess(other, 0.25)
        self.assertGreater(same - other, pipeline.PIXEL_MARGIN)

    def test_pixel_unique_pair_fills_empty_eur_pack(self):
        from PIL import Image, ImageDraw

        tmp = Path("/tmp/pokoin-pixel-link-test")
        tmp.mkdir(parents=True, exist_ok=True)
        roots = pipeline.LEFTOVER_ROOTS
        pipeline.LEFTOVER_ROOTS = (tmp,)

        def card(name, color, blob):
            image = Image.new("RGB", (200, 280), (30, 30, 30))
            draw = ImageDraw.Draw(image)
            draw.rectangle((32, 44, 168, 140), fill=color)
            if blob == "same":
                draw.ellipse((70, 60, 130, 120), fill=(255, 220, 40))
            else:
                draw.polygon([(40, 50), (160, 50), (100, 130)], fill=(40, 80, 200))
            path = tmp / name
            image.save(path)
            return path

        card("1_same.jpg", (20, 80, 20), "same")
        card("2_same.jpg", (20, 80, 20), "same")
        card("3_other.jpg", (20, 80, 20), "other")
        try:
            uf = pipeline.UnionFind()
            cache = {}
            west = [
                {"public_id": "10", "ct_id": "1", "image_url": "https://cdn.pokoin.com/1_same.jpg", "language": "western"},
                {"public_id": "30", "ct_id": "3", "image_url": "https://cdn.pokoin.com/3_other.jpg", "language": "western"},
            ]
            japan = [
                {"public_id": "20", "ct_id": "2", "image_url": "https://cdn.pokoin.com/2_same.jpg", "language": "japanese"},
            ]
            for row in west + japan:
                uf.add(row["public_id"])
            self.assertEqual(pipeline.union_pixel_cross_lang(west, japan, uf, cache), 1)
            self.assertEqual(uf.find("10"), uf.find("20"))
            self.assertNotEqual(uf.find("30"), uf.find("20"))
            index = {
                "ids": {
                    "10": ["10", "", "", 2, "art_10"],
                    "20": ["", "20", "", 2, "art_20"],
                    "30": ["30", "", "", 2, "art_30"],
                },
                "img": {},
            }
            by_name = {"Demo": west + japan}
            pipeline.pixel_link_index(index, by_name)
            self.assertEqual(index["ids"]["20"][0], "10")
            self.assertEqual(index["ids"]["20"][1], "20")
            self.assertEqual(index["ids"]["30"][0], "30")
            self.assertEqual(index["ids"]["30"][1], "")
        finally:
            pipeline.LEFTOVER_ROOTS = roots


if __name__ == "__main__":
    unittest.main()
