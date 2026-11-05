package com.fontaine.wardrobe.ui

import com.fontaine.wardrobe.data.ColorFamily
import com.fontaine.wardrobe.data.Condition
import com.fontaine.wardrobe.data.Fabric
import com.fontaine.wardrobe.data.Fit
import com.fontaine.wardrobe.data.Formality
import com.fontaine.wardrobe.data.Item
import com.fontaine.wardrobe.data.ItemType
import com.fontaine.wardrobe.data.Labeled
import com.fontaine.wardrobe.data.Occasion
import com.fontaine.wardrobe.data.Pattern
import com.fontaine.wardrobe.data.Season
import com.fontaine.wardrobe.data.Status
import com.fontaine.wardrobe.data.Weight
import java.time.LocalDate
import java.time.temporal.ChronoUnit

data class Opt(val code: String, override val label: String) : Labeled

/**
 * A filter group. Within a group, picks mean "any of these", except Fabric,
 * which means "contains every fabric picked".
 */
class FilterGroup(
    val key: String,
    val label: String,
    val options: List<Opt>,
    val matchAll: Boolean = false,
    val value: (Item, LocalDate) -> Set<String>,
)

private fun <E> opts(values: Array<E>): List<Opt> where E : Enum<E>, E : Labeled = values.map { Opt(it.name, it.label) }

private fun lastWornBucket(item: Item, today: LocalDate): String {
    val d = item.lastWorn?.let { ChronoUnit.DAYS.between(LocalDate.parse(it), today) } ?: return "NEVER"
    return when {
        d < 7 -> "LT7"; d < 30 -> "D7_30"; d < 90 -> "D30_90"; else -> "D90"
    }
}

val FILTER_GROUPS: List<FilterGroup> = listOf(
    FilterGroup("type", "Type", opts(ItemType.entries.toTypedArray())) { i, _ -> setOf(i.type.name) },
    FilterGroup("context", "Context", opts(Occasion.entries.toTypedArray())) { i, _ -> i.contexts.map { it.name }.toSet() },
    FilterGroup("weight", "Weight", opts(Weight.entries.toTypedArray())) { i, _ -> setOfNotNull(i.weight?.name) },
    FilterGroup("formality", "Formality", opts(Formality.entries.toTypedArray())) { i, _ -> setOfNotNull(i.formality?.name) },
    FilterGroup("color", "Color family", opts(ColorFamily.entries.toTypedArray())) { i, _ -> setOfNotNull(i.colorFamily?.name) },
    FilterGroup("pattern", "Pattern", opts(Pattern.entries.toTypedArray())) { i, _ -> setOfNotNull(i.pattern?.name) },
    FilterGroup("fabric", "Fabric (contains all)", opts(Fabric.entries.toTypedArray()), matchAll = true) { i, _ -> i.fabrics.map { it.name }.toSet() },
    FilterGroup("season", "Season", opts(Season.entries.toTypedArray())) { i, _ -> setOfNotNull(i.season?.name) },
    FilterGroup("fit", "Fit", opts(Fit.entries.toTypedArray())) { i, _ -> setOfNotNull(i.fit?.name) },
    FilterGroup("hero", "Hero", listOf(Opt("Y", "Yes"), Opt("N", "No"))) { i, _ -> setOf(if (i.hero) "Y" else "N") },
    FilterGroup("palette", "Palette fit", listOf(Opt("PASS", "Pass"), Opt("FAIL", "Fail"))) { i, _ -> setOf(if (i.paletteFail) "FAIL" else "PASS") },
    FilterGroup("condition", "Condition", opts(Condition.entries.toTypedArray())) { i, _ -> setOf(i.condition.name) },
    FilterGroup("status", "Status", opts(Status.entries.toTypedArray())) { i, _ -> setOf(i.status.name) },
    FilterGroup(
        "lastWorn", "Last worn",
        listOf(Opt("LT7", "Under 7 days"), Opt("D7_30", "7–30 days"), Opt("D30_90", "30–90 days"), Opt("D90", "90+ days"), Opt("NEVER", "Never")),
    ) { i, t -> setOf(lastWornBucket(i, t)) },
    FilterGroup("photo", "Photo", listOf(Opt("HAS", "Has photo"), Opt("MISSING", "Missing photo"))) { i, _ -> setOf(if (i.photo != null) "HAS" else "MISSING") },
)

/** Status defaults to Active when not chosen. */
fun applyFilters(items: List<Item>, filters: Map<String, Set<String>>, query: String, today: LocalDate): List<Item> {
    val q = query.trim().lowercase()
    val effective = if (filters["status"].isNullOrEmpty()) filters + ("status" to setOf(Status.ACTIVE.name)) else filters
    return items.filter { item ->
        FILTER_GROUPS.all { g ->
            val picked = effective[g.key].orEmpty()
            if (picked.isEmpty()) true else {
                val v = g.value(item, today)
                if (g.matchAll) v.containsAll(picked) else v.any { it in picked }
            }
        } && (q.isEmpty() || listOf(item.name, item.brand, item.exactColor, item.colorFamily?.label ?: "", item.blend,
            item.fabrics.joinToString(" ") { it.label }, item.notes).any { it.lowercase().contains(q) })
    }
}

enum class SortBy(val label: String) {
    TYPE("Type"), RECENT("Recently added"), LEAST_WORN("Least recently worn"), COLOR("Color"), FORMALITY("Formality"),
}

fun sortItems(items: List<Item>, sort: SortBy): List<Item> = when (sort) {
    SortBy.TYPE -> items.sortedWith(compareBy<Item> { it.type.ordinal }.thenBy { it.id })
    SortBy.RECENT -> items.sortedByDescending { it.added + it.id }
    SortBy.LEAST_WORN -> items.sortedBy { it.lastWorn ?: "" }
    SortBy.COLOR -> items.sortedWith(compareBy<Item> { it.colorFamily?.ordinal ?: 99 }.thenBy { it.type.ordinal })
    SortBy.FORMALITY -> items.sortedWith(compareBy<Item> { it.formality?.ordinal ?: 99 }.thenBy { it.type.ordinal })
}
