package com.fontaine.wardrobe.domain

import com.fontaine.wardrobe.data.ColorFamily
import com.fontaine.wardrobe.data.Formality
import com.fontaine.wardrobe.data.HistoryEntry
import com.fontaine.wardrobe.data.Item
import com.fontaine.wardrobe.data.ItemType
import com.fontaine.wardrobe.data.Occasion
import com.fontaine.wardrobe.data.Outfit
import com.fontaine.wardrobe.data.Prefs
import com.fontaine.wardrobe.data.Slot
import com.fontaine.wardrobe.data.Status
import com.fontaine.wardrobe.data.Weight
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** Weather bands from the spec's daily-pick table. */
enum class WeatherBand { HOT, WARM, MILD, COOL }

enum class LayerNeed { NONE, LIGHT, WARM }

data class DayConditions(
    val band: WeatherBand,
    val layer: LayerNeed,
    val rainy: Boolean = false,
    val known: Boolean = true,
) {
    companion object {
        /** Spec fallback when weather is unavailable: plan for 18–22°C and bring a light layer. */
        val FALLBACK = DayConditions(WeatherBand.WARM, LayerNeed.LIGHT, rainy = false, known = false)
    }
}

data class PickResult(
    val outfits: List<Outfit>,
    val note: String,
)

/**
 * Pure outfit picker. No Android dependencies so it can be unit tested.
 */
object Picker {

    fun defaultOccasion(date: LocalDate): Occasion =
        if (date.dayOfWeek == DayOfWeek.SATURDAY || date.dayOfWeek == DayOfWeek.SUNDAY) Occasion.FAMILY else Occasion.WFH

    private fun daysSince(date: String?, today: LocalDate): Long? =
        date?.let { ChronoUnit.DAYS.between(LocalDate.parse(it), today) }

    private fun topWeightOk(w: Weight?, c: DayConditions) = when (c.band) {
        WeatherBand.HOT, WeatherBand.WARM -> w == null || w == Weight.LIGHT
        WeatherBand.MILD -> w == null || w == Weight.LIGHT || w == Weight.MID
        WeatherBand.COOL -> w == null || w == Weight.MID || w == Weight.HEAVY
    }

    private fun bottomOk(item: Item, c: DayConditions) = when (c.band) {
        WeatherBand.HOT, WeatherBand.WARM -> true
        WeatherBand.MILD, WeatherBand.COOL -> item.type != ItemType.SHORT
    }

    private fun layerOk(w: Weight?, need: LayerNeed) = when (need) {
        LayerNeed.NONE -> false
        LayerNeed.LIGHT -> w == null || w == Weight.LIGHT || w == Weight.MID
        LayerNeed.WARM -> w == null || w == Weight.MID || w == Weight.HEAVY
    }

    private fun fitsOccasion(item: Item, occ: Occasion) = item.contexts.isEmpty() || occ in item.contexts

    /** Near-face rule: tops and layers must be in palette; no black near the face. */
    private fun nearFaceOk(item: Item) = !item.paletteFail && item.colorFamily != ColorFamily.BLACK

    /** Rules that can be relaxed when too few outfits remain, in spec order. */
    private data class Relax(val topCap: Boolean = false, val bottomCap: Boolean = false, val combo7: Boolean = false, val snooze: Boolean = false)

    private val relaxLevels = listOf(
        Relax() to "",
        Relax(topCap = true) to "Top limit relaxed.",
        Relax(topCap = true, bottomCap = true) to "Top and bottom limits relaxed.",
        Relax(topCap = true, bottomCap = true, combo7 = true) to "Repeat rule relaxed.",
        Relax(topCap = true, bottomCap = true, combo7 = true, snooze = true) to "Repeat rules relaxed.",
    )

    fun pick(
        allItems: List<Item>,
        history: List<HistoryEntry>,
        prefs: Prefs,
        today: LocalDate,
        occasion: Occasion,
        conditions: DayConditions,
        maxOutfits: Int = 6,
    ): PickResult {
        val items = allItems.filter { it.status == Status.ACTIVE && it.type != ItemType.WORKOUT }
        val recent = history.filter {
            val d = daysSince(it.date, today) ?: 99
            d in 1..14 || (d == 0L)
        }.filter { it.date != today.toString() }

        val topCounts = recent.groupingBy { it.topId }.eachCount()
        val bottomCounts = recent.groupingBy { it.bottomId }.eachCount()
        val combos7 = recent.filter { (daysSince(it.date, today) ?: 99) <= 7 }.map { it.topId to it.bottomId }.toSet()
        val wornWithin4 = recent.filter { (daysSince(it.date, today) ?: 99) <= 4 }.flatMap { listOfNotNull(it.topId, it.bottomId, it.shoeId, it.layerId) }.toSet()
        val snoozed = prefs.snoozes.filterValues { LocalDate.parse(it) >= today }.keys
        val blocked = prefs.blockedCombos.map { it.topId to it.bottomId }.toSet()
        var fallback: Pair<MutableList<Pair<Outfit, Double>>, String>? = null

        for ((relax, note) in relaxLevels) {
            fun usable(it: Item): Boolean {
                if (!fitsOccasion(it, occasion)) return false
                if (!relax.snooze && it.id in snoozed) return false
                // Hero items never repeat within 4 days (never relaxed).
                if (it.hero && it.id in wornWithin4) return false
                return true
            }
            val tops = items.filter { it.slot == Slot.TOP && usable(it) && nearFaceOk(it) && topWeightOk(it.weight, conditions) &&
                (relax.topCap || (topCounts[it.id] ?: 0) < 3) }
            val bottoms = items.filter { it.slot == Slot.BOTTOM && usable(it) && bottomOk(it, conditions) &&
                (relax.bottomCap || (bottomCounts[it.id] ?: 0) < 4) }
            val shoes = items.filter { it.slot == Slot.SHOES && usable(it) &&
                !(conditions.rainy && com.fontaine.wardrobe.data.Fabric.SUEDE in it.fabrics) }
            val layers: List<Item?> = if (conditions.layer == LayerNeed.NONE) listOf(null) else {
                val ls = items.filter { it.slot == Slot.LAYER && usable(it) && !it.paletteFail && layerOk(it.weight, conditions.layer) }
                ls.ifEmpty { listOf(null) }
            }

            val scored = ArrayList<Pair<Outfit, Double>>()
            for (t in tops) for (b in bottoms) {
                if ((t.id to b.id) in blocked) continue
                if (!relax.combo7 && (t.id to b.id) in combos7) continue
                for (s in shoes) for (l in layers) {
                    val pieces = listOfNotNull(t, b, s, l)
                    if (pieces.count { it.hero } > 1) continue
                    scored += Outfit(t.id, b.id, s.id, l?.id) to score(pieces, occasion, today)
                }
            }
            if (scored.size >= 2) return rank(scored, note, maxOutfits)
            if (scored.isNotEmpty() && fallback == null) fallback = scored to note
        }
        return fallback?.let { (s, n) -> rank(s, n, maxOutfits) } ?: PickResult(emptyList(), "")
    }

    private fun rank(scored: MutableList<Pair<Outfit, Double>>, note: String, maxOutfits: Int): PickResult {
        scored.sortByDescending { it.second }
        val chosen = ArrayList<Outfit>()
        for ((o, _) in scored) {
            if (chosen.none { it.topId == o.topId && it.bottomId == o.bottomId }) chosen += o
            if (chosen.size >= maxOutfits) break
        }
        return PickResult(chosen, note)
    }

    fun score(pieces: List<Item>, occasion: Occasion, today: LocalDate): Double {
        val freshness = pieces.map { p -> ((daysSince(p.lastWorn, today) ?: 30L).coerceIn(0, 30)) / 30.0 }.average()

        var harmony = 1.0
        val families = pieces.mapNotNull { it.colorFamily }
        if (families.toSet().size > 3) harmony -= 0.6
        if (families.count { it.accent } > 1) harmony -= 0.6
        pieces.filter { it.slot == Slot.BOTTOM || it.slot == Slot.SHOES }.forEach { if (it.paletteFail) harmony -= 0.2 }
        val top = pieces.firstOrNull { it.slot == Slot.TOP }?.colorFamily
        val bottom = pieces.firstOrNull { it.slot == Slot.BOTTOM }?.colorFamily
        if (top != null && bottom != null) {
            if (top == bottom) harmony -= 0.15 // same color top and bottom reads flat
            if (!(top.core || top.accent) || !(bottom.core || bottom.accent)) harmony -= 0.1
        }
        harmony = harmony.coerceIn(0.0, 1.0)

        val occasionFit = pieces.map { formalityFit(it.formality, occasion) }.average()
        return 0.45 * freshness + 0.35 * harmony + 0.20 * occasionFit
    }

    private fun formalityFit(f: Formality?, occ: Occasion): Double {
        if (f == null) return 0.6
        return when (occ) {
            Occasion.EXEC -> when (f) { Formality.BUSINESS -> 1.0; Formality.SMART -> 0.7; Formality.CASUAL -> 0.1 }
            Occasion.WFH -> when (f) { Formality.SMART -> 1.0; Formality.CASUAL -> 0.8; Formality.BUSINESS -> 0.3 }
            Occasion.FAMILY -> when (f) { Formality.CASUAL -> 1.0; Formality.SMART -> 0.7; Formality.BUSINESS -> 0.2 }
            Occasion.DATE -> when (f) { Formality.SMART -> 1.0; Formality.BUSINESS -> 0.7; Formality.CASUAL -> 0.5 }
            Occasion.BEACH -> when (f) { Formality.CASUAL -> 1.0; Formality.SMART -> 0.4; Formality.BUSINESS -> 0.0 }
            Occasion.ACTIVE -> when (f) { Formality.CASUAL -> 1.0; else -> 0.2 }
        }
    }

    /**
     * Next-best item for one slot, with the rest of the outfit fixed.
     * Returns null when nothing else fits.
     */
    fun swapSlot(
        current: Outfit,
        slot: Slot,
        allItems: List<Item>,
        prefs: Prefs,
        today: LocalDate,
        occasion: Occasion,
        conditions: DayConditions,
        skip: Collection<String>,
    ): Outfit? {
        val byId = allItems.associateBy { it.id }
        val currentId = when (slot) {
            Slot.TOP -> current.topId; Slot.BOTTOM -> current.bottomId
            Slot.SHOES -> current.shoeId; Slot.LAYER -> current.layerId; Slot.NONE -> null
        }
        val candidates = allItems.filter {
            it.status == Status.ACTIVE && it.slot == slot && it.id != currentId && it.id !in skip && fitsOccasion(it, occasion) &&
                when (slot) {
                    Slot.TOP -> nearFaceOk(it) && topWeightOk(it.weight, conditions)
                    Slot.BOTTOM -> bottomOk(it, conditions)
                    Slot.LAYER -> !it.paletteFail
                    else -> true
                }
        }
        val blocked = prefs.blockedCombos.map { it.topId to it.bottomId }.toSet()
        return candidates.map { c ->
            val o = when (slot) {
                Slot.TOP -> current.copy(topId = c.id)
                Slot.BOTTOM -> current.copy(bottomId = c.id)
                Slot.SHOES -> current.copy(shoeId = c.id)
                Slot.LAYER -> current.copy(layerId = c.id)
                Slot.NONE -> current
            }
            o to o.ids.mapNotNull { byId[it] }
        }.filter { (o, pieces) -> (o.topId to o.bottomId) !in blocked && pieces.count { it.hero } <= 1 }
            .maxByOrNull { (_, pieces) -> score(pieces, occasion, today) }?.first
    }

    /** One plain line saying why this outfit, without repeating the header. */
    fun reason(outfit: Outfit, items: Map<String, Item>, conditions: DayConditions, note: String): String {
        val top = items[outfit.topId]
        val bottom = items[outfit.bottomId]
        val layer = outfit.layerId?.let { items[it] }
        val parts = ArrayList<String>()
        val tf = top?.colorFamily?.label?.lowercase()
        val bf = bottom?.colorFamily?.label?.lowercase()
        if (tf != null && bf != null) parts += "${tf.replaceFirstChar { it.uppercase() }} on $bf"
        if (layer != null) parts += if (conditions.known) "${layer.name.lowercase()} for the cool start" else "${layer.name.lowercase()} in case it's cool"
        var line = parts.joinToString(", ")
        if (line.isNotEmpty()) line += "."
        if (note.isNotEmpty()) line = if (line.isEmpty()) note else "$line $note"
        return line
    }
}
