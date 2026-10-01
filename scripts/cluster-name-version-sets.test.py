import importlib.util
import json
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

SPEC = importlib.util.spec_from_file_location(
    "cluster_nvs",
    Path(__file__).with_name("cluster-name-version-sets.py"),
)
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)


def vec(*vals):
    arr = np.array(vals, dtype=np.float32)
    return arr / np.linalg.norm(arr)


class ClusterNameTests(unittest.TestCase):
    def test_catalog_species_match_does_not_merge_different_artbox(self):
        art_a = vec(1, 0, 0)
        art_b = vec(0.98, 0.1, 0)
        art_c = vec(0, 1, 0)
        same_species = vec(0.9, 0.1, 0.1)
        catalog = {1: same_species, 2: same_species, 3: same_species}
        art = {1: art_a, 2: art_b, 3: art_c}
        groups = {tuple(chunk) for chunk in mod.cluster_name([1, 2, 3], catalog, art)}
        self.assertIn((1, 2), groups)
        self.assertTrue(all(3 not in chunk for chunk in groups))

    def test_same_artbox_merges_without_catalog(self):
        a = vec(1, 0)
        b = vec(0.99, 0.1)
        groups = mod.cluster_name([10, 11], {}, {10: a, 11: b})
        self.assertEqual(groups, [[10, 11]])

    def test_mid_scores_do_not_chain_three_arts(self):
        a = vec(1, 0, 0)
        b = vec(0.83, 0.5578, 0)
        c = vec(0.83, 0.2789, 0.4813)
        dots = sorted(
            (
                float(u @ v)
                for u, v in ((a, b), (b, c), (a, c))
            ),
            reverse=True,
        )
        self.assertGreaterEqual(dots[0], 0.80)
        self.assertLess(dots[0], 0.90)
        groups = mod.cluster_name([1, 2, 3], {}, {1: a, 2: b, 3: c})
        self.assertEqual(groups, [])

    def test_printed_level_shares_name_bucket_not_lvx(self):
        self.assertEqual(mod.name_key("Unown [P]"), mod.name_key("Unown [P] LV.13"))
        self.assertEqual(mod.name_key("Unown [P]"), mod.name_key("Unown [P] Lv.17"))
        self.assertNotEqual(mod.name_key("Unown [P]"), mod.name_key("Unown [Q]"))
        self.assertNotEqual(mod.name_key("Unown [P]"), mod.name_key("Unown P Lv.17"))
        self.assertNotEqual(mod.name_key("Feraligatr"), mod.name_key("Feraligatr LV.X"))
        self.assertEqual(mod.name_key("Ho-Oh EX"), "ho-oh EX")
        self.assertEqual(mod.name_key("Ho-Oh ex"), "ho-oh ex")
        genesect = next(ids for key, ids, name in mod.STAMP_EX_PINS if name == "Genesect EX")
        self.assertIn(640472, genesect)
        self.assertIn(824990, genesect)
        self.assertIn(249482, genesect)
        pikachu = [name for *_, name in mod.STAMP_EX_PINS]
        self.assertNotIn("Pikachu EX", pikachu)
        self.assertNotIn("Greninja EX", pikachu)
        self.assertEqual(
            mod.name_key("Mega Lopunny & Jigglypuff Tag Team GX"),
            mod.name_key("Mega Lopunny & Jigglypuff GX"),
        )
        self.assertEqual(
            mod.name_key("Lucario & MelmetalTag Team GX"),
            mod.name_key("Lucario & Melmetal GX"),
        )
        ledyba = next(ids for key, ids, name in mod.ARTBOX_PINS if key == 255724)
        self.assertEqual(ledyba, (255724, 507370))
        apart = [ids for ids, label in mod.VERIFY_APART if 255724 in ids]
        self.assertEqual(apart, [(255724, 255408)])

    def test_import_ids_cluster_the_whole_name_bucket(self):
        rows = [
            {"card_id": 790994, "ct_id": 395497, "name": "Charizard", "set_name": "30th Celebration JP"},
            {"card_id": 200002, "ct_id": 100001, "name": "Charizard", "set_name": "Base Set"},
            {"card_id": 300003, "ct_id": 150002, "name": "Blastoise", "set_name": "30th Celebration JP"},
            {"card_id": 400004, "ct_id": 200002, "name": "Pikachu", "set_name": "30th Celebration"},
        ]
        self.assertEqual(mod.parse_id_list("790994, 395497 790994"), [790994, 395497])
        self.assertEqual(mod.name_keys_for_import(rows, ids=[790994]), {"charizard"})
        self.assertEqual(mod.name_keys_for_import(rows, ids=[395497]), {"charizard"})
        self.assertEqual(
            mod.name_keys_for_import(rows, expansion="30th Celebration JP"),
            {"charizard", "blastoise"},
        )
        self.assertEqual(mod.name_keys_for_import(rows, expansion="30th Celebration"), {"pikachu"})

    def test_placeholder_leftovers_are_not_clip_inputs(self):
        folder = Path("/tmp/pokoin-placeholder-clip-skip")
        folder.mkdir(exist_ok=True)
        grey = folder / "286874_fighting-energy.jpg"
        Image.new("RGB", (186, 260), (180, 180, 180)).save(grey, "JPEG")
        coin = folder / "286874_fighting-energy-pokoin.jpg"
        Image.new("RGB", (630, 880), (40, 20, 80)).save(coin, "JPEG")
        scan = folder / "141029_electabuzz.jpg"
        Image.new("RGB", (180, 255), (20, 30, 40)).save(scan, "JPEG")
        self.assertTrue(mod.is_placeholder_leftover(grey))
        self.assertTrue(mod.is_placeholder_leftover(coin))
        self.assertFalse(mod.is_placeholder_leftover(scan))

    def test_leftover_picks_unown_not_public_id_collision(self):
        unown = Path("/tmp/137186_unown-p-jp-darkness-and-to-light.jpg")
        kingambit = Path("/tmp/137186_kingambit-shiny-rare-187-092-paldean-fates.jpg")
        self.assertGreater(
            mod.leftover_slug_score(unown, "Unown [P] LV.13"),
            mod.leftover_slug_score(kingambit, "Unown [P] LV.13"),
        )

    def test_leftover_prefers_collector_slug_over_full_v4(self):
        numbered = Path("/tmp/113985_drifblim-24-130-diamond-pearl.jpg")
        generic = Path("/tmp/113985_drifblim-lv-40-full-v4.jpg")
        self.assertGreater(
            mod.leftover_slug_score(numbered, "Drifblim Lv.40", "24/130"),
            mod.leftover_slug_score(generic, "Drifblim Lv.40", "24/130"),
        )
        replica = Path("/home/nez/mnt/mybook/pokoin-pi-card-images/objects")
        if not replica.is_dir():
            return
        picked = mod.resolve_leftover(113985, None, "Drifblim Lv.40", "24/130")
        if picked is None:
            self.skipTest("D&P Drifblim leftover JPEG not on this machine")
        self.assertIn("24-130", picked.name)
        self.assertNotIn("full-v4", picked.name)

    def test_unique_near_pair_merges_among_other_arts(self):
        a = vec(1, 0, 0)
        b = vec(0.85, 0.5268, 0)
        c = vec(0, 1, 0)
        groups = {tuple(chunk) for chunk in mod.cluster_name([1, 2, 3], {}, {1: a, 2: b, 3: c})}
        self.assertIn((1, 2), groups)
        self.assertTrue(all(3 not in chunk for chunk in groups))

    def test_pixel_pose_joins_when_clip_cannot_split_mascots(self):
        a = vec(1, 0, 0)
        b = vec(0.92, 0.391918, 0)
        c = vec(0.92, 0.188, 0.344)
        dots = [float(a @ b), float(a @ c), float(b @ c)]
        self.assertTrue(all(score > 0.90 for score in dots))
        self.assertTrue(all(abs(x - y) < mod.ARTCUT_MARGIN for x in dots for y in dots))
        self.assertEqual(mod.cluster_name([1, 2, 3], {}, {1: a, 2: b, 3: c}), [])
        p1 = vec(1, 0, 0)
        p2 = vec(0.96, 0.28, 0)
        p3 = vec(0, 0, 1)
        groups = {tuple(chunk) for chunk in mod.cluster_name(
            [1, 2, 3],
            {},
            {1: a, 2: b, 3: c},
            pixel={1: p1, 2: p2, 3: p3},
        )}
        self.assertIn((1, 2), groups)
        self.assertTrue(all(3 not in chunk for chunk in groups))

    def test_pokemon_buckets_refuse_low_pixel_cluster_folds(self):
        # Two Girafarig paintings (Kanda vs Kusube): each stack merges on its
        # own (cross dots 0.53–0.57), but the old 0.55 cluster fold glued the
        # two groups because with only two clusters there is no second
        # candidate. Pokémon buckets now require 0.80 there.
        a = vec(1, 0, 0)
        b = vec(0.95, 0.3122, 0)
        c = vec(0, 1, 0)
        d = vec(0.35, 0.9367, 0)
        self.assertGreaterEqual(float(a @ b), mod.PIXEL_AUTO)
        self.assertGreaterEqual(float(c @ d), mod.PIXEL_AUTO)
        cross = [float(a @ c), float(a @ d), float(b @ c), float(b @ d)]
        self.assertGreaterEqual(max(cross), mod.PIXEL_CLUSTER_MIN)
        self.assertLess(max(cross), mod.POKEMON_PIXEL_CLUSTER_MIN)
        art = {1: a, 2: b, 3: c, 4: d}
        apart = mod.cluster_name([1, 2, 3, 4], {}, art, pixel=art, pokemon=True)
        self.assertEqual(
            sorted(tuple(sorted(chunk)) for chunk in apart),
            [(1, 2), (3, 4)],
        )
        glued = mod.cluster_name([1, 2, 3, 4], {}, art, pixel=art)
        self.assertEqual([tuple(sorted(chunk)) for chunk in glued], [(1, 2, 3, 4)])

    def test_pikachu_delta_pcg_p_112_pixels_match_legend_maker_not_holon(self):
        roots = (
            Path("/home/nez/mnt/mybook/pokoin-pi-card-images/objects"),
            Path("/home/nez/Projects/pokoin/PokoinTest/index/cdn_images"),
            Path("/home/nez/pokoincdn/cdn_images_digest"),
        )

        def leftover(ct_id: str) -> Path | None:
            prefix = f"{ct_id}_"
            for root in roots:
                if not root.is_dir():
                    continue
                hits = sorted(
                    p for p in root.glob(prefix + "*.jpg")
                    if p.is_file() and "_homepage" not in p.name.lower()
                )
                if hits:
                    return hits[0]
            return None

        jp112 = leftover("252300")
        en93 = leftover("116782")
        en79 = leftover("116545")
        if not (jp112 and en93 and en79):
            self.skipTest("leftover JPEGs not on this machine")
        a = mod.pixel_art_vec(jp112)
        b = mod.pixel_art_vec(en93)
        c = mod.pixel_art_vec(en79)
        same = float(a @ b)
        other = float(a @ c)
        self.assertGreater(same, 0.80)
        self.assertLess(other, 0.25)
        groups = mod.cluster_name(
            [504600, 233564, 233090],
            {},
            {},
            pixel={504600: a, 233564: b, 233090: c},
        )
        self.assertEqual(groups, [[233564, 504600]])

    def test_cottonee_010_pixels_match_black_collection_not_009(self):
        roots = (
            Path("/home/nez/mnt/mybook/pokoin-pi-card-images/objects"),
            Path("/home/nez/Projects/pokoin/PokoinTest/index/cdn_images"),
            Path("/home/nez/pokoincdn/cdn_images_digest"),
        )

        def leftover(ct_id: str) -> Path | None:
            prefix = f"{ct_id}_"
            for root in roots:
                if not root.is_dir():
                    continue
                hits = sorted(
                    p for p in root.glob(prefix + "*.jpg")
                    if p.is_file() and "_homepage" not in p.name.lower()
                )
                if hits:
                    return hits[0]
            return None

        en010 = leftover("118117")
        jp004 = leftover("135993")
        en009 = leftover("118115")
        if not (en010 and jp004 and en009):
            self.skipTest("leftover JPEGs not on this machine")
        a = mod.pixel_art_vec(en010)
        b = mod.pixel_art_vec(jp004)
        c = mod.pixel_art_vec(en009)
        same = float(a @ b)
        other = float(a @ c)
        self.assertGreater(same, 0.75)
        self.assertLess(other, 0.25)
        self.assertGreater(same - other, mod.PIXEL_MARGIN)
        groups = mod.cluster_name(
            [236234, 271986, 236230],
            {},
            {},
            pixel={236234: a, 271986: b, 236230: c},
        )
        self.assertEqual(groups, [[236234, 271986]])

    def test_pixel_auto_merges_reprint_stack_without_unique_nearest(self):
        a = vec(1, 0, 0)
        b = vec(0.96, 0.28, 0)
        c = vec(0.95, 0.3122, 0)
        d = vec(0.94, 0.3412, 0)
        dots = [float(a @ b), float(a @ c), float(a @ d), float(b @ c), float(b @ d), float(c @ d)]
        self.assertTrue(all(score >= mod.PIXEL_AUTO for score in dots))
        other = vec(0, 1, 0)
        groups = {tuple(chunk) for chunk in mod.cluster_name(
            [1, 2, 3, 4, 5],
            {},
            {},
            pixel={1: a, 2: b, 3: c, 4: d, 5: other},
        )}
        self.assertIn((1, 2, 3, 4), groups)
        self.assertTrue(all(5 not in chunk for chunk in groups))

    def test_tapu_lele_gx_60_pixels_match_jp_not_full_art(self):
        roots = (
            Path("/home/nez/mnt/mybook/pokoin-pi-card-images/objects"),
            Path("/home/nez/Projects/pokoin/PokoinTest/index/cdn_images"),
            Path("/home/nez/pokoincdn/cdn_images_digest"),
        )

        def leftover(ct_id: str) -> Path | None:
            prefix = f"{ct_id}_"
            for root in roots:
                if not root.is_dir():
                    continue
                hits = sorted(
                    p for p in root.glob(prefix + "*.jpg")
                    if p.is_file() and "_homepage" not in p.name.lower()
                )
                if hits:
                    return hits[0]
            return None

        en60 = leftover("120404")
        jp22 = leftover("135282")
        en_fa = leftover("120546")
        if not (en60 and jp22 and en_fa):
            self.skipTest("leftover JPEGs not on this machine")
        a = mod.pixel_art_vec(en60)
        b = mod.pixel_art_vec(jp22)
        c = mod.pixel_art_vec(en_fa)
        same = float(a @ b)
        other = float(a @ c)
        self.assertGreater(same, 0.90)
        self.assertLess(other, 0.25)
        groups = mod.cluster_name(
            [240808, 270564, 241092],
            {},
            {},
            pixel={240808: a, 270564: b, 241092: c},
        )
        self.assertEqual(groups, [[240808, 270564]])

    def test_item_trainer_gold_stays_with_regular_reprints(self):
        rows = {
            258636: {
                "name": "Air Balloon",
                "set_name": "Sword & Shield",
                "card_number": "156/202",
            },
            258812: {
                "name": "Air Balloon",
                "set_name": "Sword & Shield",
                "card_number": "Secret Rare | 213/202",
            },
            286738: {
                "name": "Air Balloon",
                "set_name": "Sword",
                "card_number": "57/060",
            },
            684690: {
                "name": "Air Balloon",
                "set_name": "Black Bolt",
                "card_number": "079/086",
            },
        }
        split = mod.split_secret_regular_arts(
            [[258636, 258812, 286738, 684690]],
            rows,
        )
        self.assertEqual(split, [[258636, 258812, 286738, 684690]])

    def test_same_set_regular_and_full_art_are_not_same_artwork(self):
        rows = {
            798852: {"set_name": "Pitch Black", "card_number": "080/084"},
            798914: {"set_name": "Pitch Black", "card_number": "Ultra Rare | 111/084"},
            800001: {"set_name": "Black Bolt", "card_number": "080/084"},
        }
        self.assertTrue(mod.collector_secret("Ultra Rare | 111/084"))
        self.assertFalse(mod.collector_secret("080/084"))
        split = mod.split_secret_regular_arts(
            [[798852, 798914, 800001]],
            rows,
        )
        self.assertEqual(split, [[798852, 800001]])

    def test_secret_reprints_stay_together_after_regular_split(self):
        rows = {
            1: {"set_name": "Pitch Black", "card_number": "080/084"},
            2: {"set_name": "Pitch Black", "card_number": "111/084"},
            3: {"set_name": "Night Wanderer", "card_number": "086/064"},
        }
        split = mod.split_secret_regular_arts([[1, 2, 3]], rows)
        self.assertEqual(split, [[2, 3]])

    def test_one_set_chase_numbers_are_not_one_artwork(self):
        rows = {
            806172: {"set_name": "Storm Emeralda", "card_number": "Ultra Rare | 058/076"},
            806356: {"set_name": "Storm Emeralda", "card_number": "Full-Art | 095/076"},
            806056: {"set_name": "Storm Emeralda", "card_number": "Special Illustration Rare | 110/076"},
            806390: {"set_name": "Storm Emeralda", "card_number": "Gold Secret Rare | 113/076"},
        }
        split = mod.split_secret_regular_arts(
            [[806172, 806356, 806056, 806390]],
            rows,
        )
        self.assertEqual(split, [])

    def test_pixel_veto_stops_clip_from_merging_same_set_species_mates(self):
        a = vec(1, 0, 0)
        b = vec(0.87, 0.493, 0)
        self.assertGreaterEqual(float(a @ b), 0.80)
        groups = mod.cluster_name(
            [31, 32],
            {},
            {31: a, 32: b},
            pixel={31: vec(1, 0), 32: vec(0, 1)},
        )
        self.assertEqual(groups, [])

    def test_dark_dragonair_reprints_join_and_ex_arts_stay_apart(self):
        roots = (
            Path("/home/nez/mnt/mybook/pokoin-pi-card-images/objects"),
            Path("/home/nez/Projects/pokoin/PokoinTest/index/cdn_images"),
        )

        def leftover(ct_id: str) -> Path | None:
            for root in roots:
                if not root.is_dir():
                    continue
                hits = sorted(
                    p for p in root.glob(f"{ct_id}_*.jpg")
                    if p.is_file()
                    and "_homepage" not in p.name.lower()
                    and "feather-ball" not in p.name.lower()
                )
                if hits:
                    return max(hits, key=lambda path: (mod.leftover_slug_score(path, "Dark Dragonair"), -len(path.name)))
            return None

        paths = {
            243216: leftover("121608"),
            258900: leftover("129450"),
            283850: leftover("141925"),
            235350: leftover("117675"),
            235354: leftover("117677"),
        }
        if not all(paths.values()):
            self.skipTest("Dark Dragonair leftover JPEGs not on this machine")
        cache = mod.load_artcut_cache()
        art = {pid: cache[pid] for pid in paths if pid in cache}
        if len(art) < 5:
            self.skipTest("Dark Dragonair art-box CLIP cache incomplete")
        pixel = {pid: mod.pixel_art_vec(path) for pid, path in paths.items()}
        groups = {tuple(chunk) for chunk in mod.cluster_name(list(paths), {}, art, pixel)}
        self.assertIn((243216, 258900, 283850), groups)
        self.assertTrue(all(235350 not in chunk or 235354 not in chunk for chunk in groups))
        sdk = {
            586552: leftover("293276"),
            586554: leftover("293277"),
        }
        if all(sdk.values()):
            more = {**paths, **sdk}
            pixel_more = {pid: mod.pixel_art_vec(path) for pid, path in more.items()}
            art_more = {pid: cache[pid] for pid in more if pid in cache}
            grouped = mod.cluster_name(list(more), {}, art_more, pixel_more)
        self.assertTrue(all(235350 not in chunk or 235354 not in chunk for chunk in grouped))
        himeno = next(chunk for chunk in grouped if 243216 in chunk)
        self.assertEqual(sorted(himeno), [243216, 258900, 283850])

    def test_jp_orphan_joins_en_reprint_pair_by_cluster_pixels(self):
        en_a = vec(1, 0, 0)
        en_b = vec(0.96, 0.28, 0)
        jp = vec(0.75, 0, 0.6614)
        self.assertGreaterEqual(float(en_a @ en_b), 0.94)
        self.assertLess(float(en_a @ jp), 0.80)
        p_en = vec(1, 0)
        p_jp = vec(0.77, 0.638)
        groups = {tuple(chunk) for chunk in mod.cluster_name(
            [1, 2, 3],
            {},
            {1: en_a, 2: en_b, 3: jp},
            pixel={1: p_en, 2: vec(0.995, 0.1), 3: p_jp},
        )}
        self.assertIn((1, 2, 3), groups)

    def test_two_printings_join_at_cluster_pixel_floor(self):
        a = vec(1, 0)
        b = vec(0.686, 0.7276)
        self.assertLess(float(a @ b), 0.80)
        groups = mod.cluster_name(
            [10, 11],
            {},
            {10: a, 11: b},
            pixel={10: vec(1, 0), 11: vec(0.61, 0.7924)},
        )
        self.assertEqual(groups, [[10, 11]])

    def test_cluster_pixel_floor_rejects_stormfront_svp_near_miss(self):
        a = vec(1, 0)
        b = vec(0.686, 0.7276)
        self.assertLess(float(a @ b), 0.80)
        near = vec(0.493, 0.8700)
        self.assertAlmostEqual(float(vec(1, 0) @ near), 0.493, places=3)
        self.assertLess(float(vec(1, 0) @ near), mod.PIXEL_CLUSTER_MIN)
        groups = mod.cluster_name(
            [10, 11],
            {},
            {10: a, 11: b},
            pixel={10: vec(1, 0), 11: near},
        )
        self.assertEqual(groups, [])

    def test_drifblim_arita_and_balloon_leftovers(self):
        paths = {
            227266: mod.resolve_leftover(113633, None, "Drifblim Lv.40", "Holo Promo | DP34"),
            557286: mod.resolve_leftover(278643, None, "Drifblim Lv.40", "031/DP-P"),
            227970: mod.resolve_leftover(113985, None, "Drifblim Lv.40", "24/130"),
            285598: mod.resolve_leftover(142799, None, "Drifblim Lv.40", "DPBP#491"),
            256260: mod.resolve_leftover(128130, None, "Drifblim", "16/100"),
            596910: mod.resolve_leftover(298455, None, "Drifblim", "SVP 135"),
        }
        if not all(paths.values()):
            self.skipTest("Drifblim leftover JPEGs not on this machine")
        pixel = {pid: mod.pixel_art_vec(path) for pid, path in paths.items()}
        if not all(vec is not None for vec in pixel.values()):
            self.skipTest("Drifblim leftover pixels failed")
        same = float(pixel[227266] @ pixel[557286])
        other_arita = float(pixel[227266] @ pixel[227970])
        balloons = float(pixel[256260] @ pixel[596910])
        mountains = float(pixel[227970] @ pixel[285598])
        self.assertGreaterEqual(same, mod.PIXEL_CLUSTER_MIN)
        self.assertLess(other_arita, 0.20)
        self.assertLess(balloons, mod.PIXEL_CLUSTER_MIN)
        self.assertGreaterEqual(mountains, 0.70)
        cache = mod.load_artcut_cache()
        art = {pid: cache[pid] for pid in paths if pid in cache}
        if len(art) < 6:
            self.skipTest("Drifblim art-box CLIP cache incomplete")
        groups = {tuple(chunk) for chunk in mod.cluster_name(list(paths), {}, art, pixel)}
        self.assertTrue(any(227266 in chunk and 557286 in chunk for chunk in groups))
        self.assertTrue(all(227266 not in chunk or 227970 not in chunk for chunk in groups))
        self.assertTrue(any(227970 in chunk and 285598 in chunk for chunk in groups))
        self.assertTrue(all(256260 not in chunk or 596910 not in chunk for chunk in groups))

    def test_drifblim_name_bucket_does_not_glue_balloon_arts(self):
        if not mod.CANDIDATES.exists():
            self.skipTest("version-candidates.json missing")
        rows = [
            row
            for row in json.loads(mod.CANDIDATES.read_text())
            if mod.name_key(row.get("name")) == "drifblim"
        ]
        if len(rows) < 8:
            self.skipTest("Drifblim candidates missing")
        cache = mod.load_artcut_cache()
        pixel = {}
        art = {}
        ids = []
        for row in rows:
            pid = int(row["card_id"])
            path = mod.resolve_leftover(
                row.get("ct_id"), None, row.get("name") or "", row.get("card_number") or ""
            )
            if not path:
                continue
            vec = mod.pixel_art_vec(path)
            if vec is None:
                continue
            ids.append(pid)
            pixel[pid] = vec
            if pid in cache:
                art[pid] = cache[pid]
        if 227266 not in pixel or 557286 not in pixel or 256260 not in pixel:
            self.skipTest("Drifblim leftover pixels incomplete")
        groups = {tuple(chunk) for chunk in mod.cluster_name(ids, {}, art, pixel)}
        self.assertTrue(any(227266 in chunk and 557286 in chunk for chunk in groups))
        self.assertTrue(all(227266 not in chunk or 227970 not in chunk for chunk in groups))
        self.assertTrue(all(256260 not in chunk or 596910 not in chunk for chunk in groups))

    def test_mid_clip_attach_needs_pixel_agreement(self):
        a = vec(1, 0, 0)
        b = vec(0.73, 0.6835, 0)
        self.assertGreaterEqual(float(a @ b), 0.72)
        self.assertLess(float(a @ b), 0.80)
        self.assertEqual(
            mod.cluster_name([1, 2], {}, {1: a, 2: b}),
            [],
        )
        self.assertEqual(
            mod.cluster_name(
                [1, 2],
                {},
                {1: a, 2: b},
                pixel={1: vec(1, 0), 2: vec(0, 1)},
            ),
            [],
        )
        self.assertEqual(
            mod.cluster_name(
                [1, 2],
                {},
                {1: a, 2: b},
                pixel={1: vec(1, 0), 2: vec(0.4, 0.9165)},
            ),
            [],
        )
        c = vec(0, 0, 1)
        groups = {tuple(chunk) for chunk in mod.cluster_name(
            [1, 2, 3],
            {},
            {1: a, 2: b, 3: c},
            pixel={1: vec(1, 0, 0), 2: vec(0.4, 0.9165, 0), 3: vec(0, 0, 1)},
        )}
        self.assertIn((1, 2), groups)
        self.assertTrue(all(3 not in chunk for chunk in groups))

    def test_clip_join_does_not_chain_base_set_onto_team_rocket(self):
        tr = vec(1, 0, 0)
        jp = vec(0.87, 0.493, 0)
        base = vec(0.76, 0, 0.65)
        self.assertGreaterEqual(float(tr @ jp), 0.80)
        self.assertGreaterEqual(float(tr @ base), 0.72)
        self.assertLess(float(tr @ base), 0.80)
        self.assertLess(float(jp @ base), 0.80)
        groups = {tuple(chunk) for chunk in mod.cluster_name(
            [1, 2, 3],
            {},
            {1: tr, 2: jp, 3: base},
            pixel={
                1: vec(1, 0, 0),
                2: vec(0.99, 0.141, 0),
                3: vec(0.31, 0, 0.9506),
            },
        )}
        self.assertIn((1, 2), groups)
        self.assertTrue(all(3 not in chunk for chunk in groups))


if __name__ == "__main__":
    unittest.main()
