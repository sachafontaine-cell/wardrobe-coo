package com.fontaine.wardrobe

import com.fontaine.wardrobe.data.AppData
import com.fontaine.wardrobe.data.ColorFamily
import com.fontaine.wardrobe.data.Fabric
import com.fontaine.wardrobe.data.HistoryEntry
import com.fontaine.wardrobe.data.Item
import com.fontaine.wardrobe.data.ItemType
import com.fontaine.wardrobe.data.Occasion
import com.fontaine.wardrobe.data.Prefs
import com.fontaine.wardrobe.data.Status
import com.fontaine.wardrobe.domain.DayConditions
import com.fontaine.wardrobe.domain.LayerNeed
import com.fontaine.wardrobe.domain.Ops
import com.fontaine.wardrobe.domain.Picker
import com.fontaine.wardrobe.domain.WeatherBand
import com.fontaine.wardrobe.ui.applyFilters
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class PickerTest {
    private val today = LocalDate.of(2026, 11, 5) // a Thursday
    private val noLayer = DayConditions(WeatherBand.WARM, LayerNeed.NONE)

    private fun item(id: String, type: ItemType, color: ColorFamily = ColorFamily.OLIVE, lastWorn: String? = null, hero: Boolean = false, fabrics: Set<Fabric> = emptySet()) =
        Item(id = id, name = id, type = type, colorFamily = color, added = "2026-11-01", lastWorn = lastWorn, hero = hero, fabrics = fabrics)

    private val basic = listOf(
        item("POLO-001", ItemType.POLO, ColorFamily.OLIVE),
        item("POLO-002", ItemType.POLO, ColorFamily.NAVY),
        item("PANT-001", ItemType.PANT, ColorFamily.STONE),
        item("PANT-002", ItemType.PANT, ColorFamily.DENIM),
        item("SHOE-001", ItemType.SHOE, ColorFamily.TOBACCO),
    )

    @Test fun picksFromSmallCloset() {
        val r = Picker.pick(basic.take(1) + basic[2] + basic[4], emptyList(), Prefs(), today, Occasion.WFH, noLayer)
        assertEquals(1, r.outfits.size)
        assertEquals("POLO-001", r.outfits[0].topId)
    }

    @Test fun neverPicksBlackTop() {
        val items = basic + item("TEE-001", ItemType.TEE, ColorFamily.BLACK)
        val r = Picker.pick(items, emptyList(), Prefs(), today, Occasion.WFH, noLayer)
        assertTrue(r.outfits.none { it.topId == "TEE-001" })
    }

    @Test fun freshestPiecesWin() {
        val items = basic.map { if (it.id == "POLO-001") it.copy(lastWorn = "2026-11-04") else it }
        val r = Picker.pick(items, emptyList(), Prefs(), today, Occasion.WFH, noLayer)
        assertEquals("POLO-002", r.outfits[0].topId)
    }

    @Test fun topCapRespected() {
        val hist = (1..3).map { HistoryEntry("2026-11-0$it", "POLO-001", "PANT-00${it % 2 + 1}", "SHOE-001", null, Occasion.WFH, "pick") }
        val r = Picker.pick(basic, hist, Prefs(), today, Occasion.WFH, noLayer)
        assertTrue(r.outfits.none { it.topId == "POLO-001" })
    }

    @Test fun oneHeroMax() {
        val items = listOf(
            item("POLO-001", ItemType.POLO, ColorFamily.RUST, hero = true),
            item("PANT-001", ItemType.PANT, ColorFamily.FOREST, hero = true),
            item("PANT-002", ItemType.PANT, ColorFamily.STONE),
            item("SHOE-001", ItemType.SHOE, ColorFamily.TOBACCO),
        )
        val r = Picker.pick(items, emptyList(), Prefs(), today, Occasion.WFH, noLayer)
        assertTrue(r.outfits.isNotEmpty())
        assertTrue(r.outfits.none { it.topId == "POLO-001" && it.bottomId == "PANT-001" })
    }

    @Test fun okThenUndoRestores() {
        var d = Ops.ensurePick(AppData(items = basic), today, noLayer)
        assertNotNull(Ops.shownOutfit(d, today))
        d = Ops.ok(d, today)
        val worn = Ops.shownOutfit(d, today)!!.ids
        assertTrue(worn.all { id -> d.items.first { it.id == id }.lastWorn == today.toString() })
        d = Ops.undo(d, today)
        assertTrue(d.items.all { it.lastWorn == null })
        assertNull(Ops.loggedToday(d, today))
    }

    @Test fun threeSwapsBlockCombo() {
        var d = Ops.ensurePick(AppData(items = basic), today, noLayer)
        val first = Ops.shownOutfit(d, today)!!
        repeat(3) {
            d = d.copy(prefs = d.prefs.copy(todayPick = d.prefs.todayPick!!.copy(index = 0)))
            d = Ops.swapOutfit(d, today)
        }
        assertTrue(d.prefs.blockedCombos.any { it.topId == first.topId && it.bottomId == first.bottomId })
    }

    @Test fun nextIdContinues() {
        assertEquals("POLO-003", Ops.nextId(basic, ItemType.POLO))
        assertEquals("TEE-001", Ops.nextId(basic, ItemType.TEE))
        assertEquals("POLO-004", Ops.nextId(basic, ItemType.POLO, listOf("POLO-003")))
    }

    @Test fun fabricFilterNeedsEveryFabric() {
        val items = listOf(
            item("A", ItemType.POLO, fabrics = setOf(Fabric.WOOL, Fabric.POLYESTER)),
            item("B", ItemType.POLO, fabrics = setOf(Fabric.WOOL, Fabric.POLYESTER, Fabric.ELASTANE)),
            item("C", ItemType.POLO, fabrics = setOf(Fabric.WOOL)),
            item("D", ItemType.POLO, fabrics = setOf(Fabric.POLYESTER)),
        )
        val r = applyFilters(items, mapOf("fabric" to setOf("WOOL", "POLYESTER")), "", today).map { it.id }
        assertEquals(listOf("A", "B"), r)
    }

    @Test fun donatedItemsExpireAfter14Days() {
        val d = AppData(
            items = basic + item("TEE-009", ItemType.TEE).copy(status = Status.DONATED, donatedOn = "2026-10-20"),
            prefs = Prefs(lastEligibilityDate = "2026-11-04"),
        )
        val (m, gone) = Ops.dailyMaintenance(d, today)
        assertEquals(listOf("TEE-009"), gone)
        assertFalse(m.items.any { it.id == "TEE-009" })
        assertTrue(m.items.all { it.status != Status.ACTIVE || it.eligibleDaysUnworn == 1 })
    }

    @Test fun weekendIsFamily() {
        assertEquals(Occasion.FAMILY, Picker.defaultOccasion(LocalDate.of(2026, 11, 7)))
        assertEquals(Occasion.WFH, Picker.defaultOccasion(today))
    }
}
