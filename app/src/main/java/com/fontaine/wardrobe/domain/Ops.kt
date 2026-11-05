package com.fontaine.wardrobe.domain

import com.fontaine.wardrobe.data.AppData
import com.fontaine.wardrobe.data.HistoryEntry
import com.fontaine.wardrobe.data.Item
import com.fontaine.wardrobe.data.ItemType
import com.fontaine.wardrobe.data.Occasion
import com.fontaine.wardrobe.data.Outfit
import com.fontaine.wardrobe.data.PrevValue
import com.fontaine.wardrobe.data.Slot
import com.fontaine.wardrobe.data.Status
import com.fontaine.wardrobe.data.SwapRecord
import com.fontaine.wardrobe.data.TodayPick
import com.fontaine.wardrobe.data.Weight
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** State changes, as pure functions of AppData. */
object Ops {

    fun occasionFor(d: AppData, today: LocalDate): Occasion =
        d.prefs.occasionOverride[today.toString()] ?: Picker.defaultOccasion(today)

    /**
     * Once per day: count suitable unworn days, drop old history, and delete
     * items donated 14+ days ago. Returns the new data and ids whose photos to delete.
     */
    fun dailyMaintenance(d: AppData, today: LocalDate): Pair<AppData, List<String>> {
        val last = d.prefs.lastEligibilityDate?.let { LocalDate.parse(it) }
        if (last != null && !last.isBefore(today)) return d to emptyList()

        val days = if (last == null) 0 else ChronoUnit.DAYS.between(last, today).toInt().coerceIn(0, 120)
        // Without weather history, only light and mid items accrue days (spec fallback).
        val items = d.items.map {
            if (days > 0 && it.status == Status.ACTIVE && (it.weight == null || it.weight == Weight.LIGHT || it.weight == Weight.MID))
                it.copy(eligibleDaysUnworn = it.eligibleDaysUnworn + days) else it
        }
        val cutoff = today.minusDays(14)
        val expired = items.filter { it.status == Status.DONATED && it.donatedOn != null && !LocalDate.parse(it.donatedOn).isAfter(cutoff) }
        val keep = items.filter { it !in expired }
        val history = d.history.filter { LocalDate.parse(it.date).isAfter(cutoff) }
        val overrides = d.prefs.occasionOverride.filterKeys { !LocalDate.parse(it).isBefore(today) }
        val snoozes = d.prefs.snoozes.filterValues { !LocalDate.parse(it).isBefore(today) }
        val swaps = d.prefs.swaps.filter { LocalDate.parse(it.date).isAfter(cutoff) }
        return d.copy(
            items = keep,
            history = history,
            prefs = d.prefs.copy(
                lastEligibilityDate = today.toString(),
                occasionOverride = overrides,
                snoozes = snoozes,
                swaps = swaps,
            ),
        ) to expired.map { it.id }
    }

    /** Today's pick, generated once and cached; regenerated if the occasion changed. */
    fun ensurePick(d: AppData, today: LocalDate, conditions: DayConditions, force: Boolean = false): AppData {
        val occ = occasionFor(d, today)
        val cached = d.prefs.todayPick
        val logged = d.history.any { it.date == today.toString() }
        val valid = cached != null && cached.date == today.toString() && cached.occasion == occ && cached.outfits.isNotEmpty() &&
            cached.outfits.all { o -> o.ids.all { id -> d.items.any { it.id == id && it.status == Status.ACTIVE } } }
        if (!force && (valid || (logged && cached?.date == today.toString()))) return d
        val result = Picker.pick(d.items, d.history, d.prefs, today, occ, conditions)
        return d.copy(prefs = d.prefs.copy(todayPick = TodayPick(today.toString(), occ, result.outfits, 0, result.note)))
    }

    fun shownOutfit(d: AppData, today: LocalDate): Outfit? {
        val p = d.prefs.todayPick ?: return null
        if (p.date != today.toString()) return null
        return p.shown ?: p.outfits.getOrNull(p.index)
    }

    fun loggedToday(d: AppData, today: LocalDate): HistoryEntry? = d.history.lastOrNull { it.date == today.toString() }

    fun ok(d: AppData, today: LocalDate): AppData {
        if (loggedToday(d, today) != null) return d
        val p = d.prefs.todayPick ?: return d
        val o = shownOutfit(d, today) ?: return d
        val ids = o.ids.toSet()
        val prev = d.items.filter { it.id in ids }.associate { it.id to PrevValue(it.lastWorn, it.eligibleDaysUnworn) }
        val source = if (p.index == 0 && p.shown == null) "pick" else "swap-${p.index}"
        val entry = HistoryEntry(today.toString(), o.topId, o.bottomId, o.shoeId, o.layerId, p.occasion, source, prev)
        val items = d.items.map { if (it.id in ids) it.copy(lastWorn = today.toString(), eligibleDaysUnworn = 0) else it }
        return d.copy(items = items, history = d.history + entry)
    }

    fun undo(d: AppData, today: LocalDate): AppData {
        val entry = loggedToday(d, today) ?: return d
        val items = d.items.map { item ->
            entry.prev[item.id]?.let { item.copy(lastWorn = it.lastWorn, eligibleDaysUnworn = it.eligibleDaysUnworn) } ?: item
        }
        return d.copy(items = items, history = d.history - entry)
    }

    /** Next ranked outfit. Records the swap; three swaps away from one combo blocks it. */
    fun swapOutfit(d: AppData, today: LocalDate): AppData {
        val p = d.prefs.todayPick ?: return d
        if (p.outfits.size < 2) return d
        val away = shownOutfit(d, today) ?: return d
        val rec = SwapRecord(away.topId, away.bottomId, today.toString())
        val swaps = d.prefs.swaps + rec
        val count = swaps.count { it.topId == rec.topId && it.bottomId == rec.bottomId }
        val blocked = if (count >= 3 && d.prefs.blockedCombos.none { it.topId == rec.topId && it.bottomId == rec.bottomId })
            d.prefs.blockedCombos + rec else d.prefs.blockedCombos
        val until = today.plusDays(2).toString()
        val snoozes = d.prefs.snoozes + mapOf(away.topId to until, away.bottomId to until)
        val next = (p.index + 1) % p.outfits.size
        return d.copy(prefs = d.prefs.copy(
            swaps = swaps, blockedCombos = blocked, snoozes = snoozes,
            todayPick = p.copy(index = next, shown = null, skipped = emptyMap()),
        ))
    }

    fun swapTile(d: AppData, today: LocalDate, slot: Slot, conditions: DayConditions): AppData {
        val p = d.prefs.todayPick ?: return d
        val current = shownOutfit(d, today) ?: return d
        val currentId = when (slot) {
            Slot.TOP -> current.topId; Slot.BOTTOM -> current.bottomId
            Slot.SHOES -> current.shoeId; Slot.LAYER -> current.layerId ?: return d; Slot.NONE -> return d
        }
        val skipped = (p.skipped[slot] ?: emptyList()) + currentId
        var next = Picker.swapSlot(current, slot, d.items, d.prefs, today, p.occasion, conditions, skipped)
        var newSkipped = skipped
        if (next == null) {
            // Cycled through everything: start over from the full list.
            newSkipped = listOf(currentId)
            next = Picker.swapSlot(current, slot, d.items, d.prefs, today, p.occasion, conditions, newSkipped) ?: return d
        }
        return d.copy(prefs = d.prefs.copy(todayPick = p.copy(shown = next, skipped = p.skipped + (slot to newSkipped))))
    }

    fun setOccasion(d: AppData, today: LocalDate, occ: Occasion): AppData =
        d.copy(prefs = d.prefs.copy(occasionOverride = d.prefs.occasionOverride + (today.toString() to occ)))

    fun nextId(items: List<Item>, type: ItemType, extraTaken: Collection<String> = emptyList()): String {
        val taken = items.map { it.id } + extraTaken
        val max = taken.filter { it.startsWith(type.prefix + "-") }
            .mapNotNull { it.substringAfter("-").toIntOrNull() }.maxOrNull() ?: 0
        return "%s-%03d".format(type.prefix, max + 1)
    }

    /** An existing active item that looks the same: same type, color family and pattern. */
    fun lookalike(items: List<Item>, type: ItemType?, family: com.fontaine.wardrobe.data.ColorFamily?, pattern: com.fontaine.wardrobe.data.Pattern?): Item? {
        if (type == null || family == null) return null
        return items.firstOrNull { it.status == Status.ACTIVE && it.type == type && it.colorFamily == family && (pattern == null || it.pattern == null || it.pattern == pattern) }
    }

    fun donate(d: AppData, id: String, today: LocalDate): AppData =
        d.copy(items = d.items.map { if (it.id == id) it.copy(status = Status.DONATED, donatedOn = today.toString()) else it })

    fun restore(d: AppData, id: String): AppData =
        d.copy(items = d.items.map { if (it.id == id) it.copy(status = Status.ACTIVE, donatedOn = null) else it })
}
