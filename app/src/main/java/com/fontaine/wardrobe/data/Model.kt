package com.fontaine.wardrobe.data

import kotlinx.serialization.Serializable

/** Something with a label a person reads. */
interface Labeled {
    val label: String
}

enum class Slot { TOP, BOTTOM, SHOES, LAYER, NONE }

enum class ItemType(override val label: String, val prefix: String, val slot: Slot) : Labeled {
    POLO("Polo", "POLO", Slot.TOP),
    TEE("Tee", "TEE", Slot.TOP),
    SHIRT("Dress shirt", "SHIRT", Slot.TOP),
    PANT("Pants", "PANT", Slot.BOTTOM),
    SHORT("Shorts", "SHORT", Slot.BOTTOM),
    LAYER("Layer", "LAYER", Slot.LAYER),
    SUIT("Suit", "SUIT", Slot.NONE),
    SHOE("Shoes", "SHOE", Slot.SHOES),
    SWIM("Swim", "SWIM", Slot.NONE),
    WORKOUT("Workout", "WORKOUT", Slot.NONE),
    ACCESSORY("Accessory", "ACCESSORY", Slot.NONE),
}

enum class Occasion(override val label: String) : Labeled {
    EXEC("Exec"), WFH("WFH"), FAMILY("Family"), DATE("Date"), BEACH("Beach"), ACTIVE("Active"),
}

enum class Weight(override val label: String) : Labeled {
    LIGHT("Lightweight"), MID("Midweight"), HEAVY("Heavyweight"),
}

enum class Formality(override val label: String) : Labeled {
    CASUAL("Casual"), SMART("Smart casual"), BUSINESS("Business"),
}

enum class ColorFamily(override val label: String, val swatch: Long, val accent: Boolean = false, val core: Boolean = false) : Labeled {
    OLIVE("Olive", 0xFF6B6B3A, core = true),
    STONE("Stone", 0xFFC9BBA0, core = true),
    CREAM("Cream", 0xFFEDE3CF, core = true),
    TOBACCO("Tobacco", 0xFF8A5A2B, core = true),
    CAMEL("Camel", 0xFFB98A55, core = true),
    NAVY("Navy", 0xFF22304F, core = true),
    ESPRESSO("Espresso", 0xFF4A3222, core = true),
    DENIM("Denim", 0xFF2F3E5C, core = true),
    RUST("Rust", 0xFFA0482A, accent = true),
    BURGUNDY("Burgundy", 0xFF6E2B33, accent = true),
    FOREST("Forest", 0xFF2F4A36, accent = true),
    BLACK("Black", 0xFF1C1C1C),
    OTHER("Other", 0xFFA3A8AE),
}

enum class Pattern(override val label: String) : Labeled {
    SOLID("Solid"), TEXTURE("Texture"), STRIPE("Stripe"), CHECK("Check"), PRINT("Print"),
}

enum class Fabric(override val label: String) : Labeled {
    COTTON("Cotton"), POLYESTER("Polyester"), NYLON("Nylon"), ELASTANE("Elastane"), WOOL("Wool"),
    LINEN("Linen"), VISCOSE("Viscose"), LEATHER("Leather"), SUEDE("Suede"), OTHER("Other"),
}

enum class Season(override val label: String) : Labeled {
    YEAR_ROUND("Year-round"), SUMMER("Summer"), WINTER("Winter"),
}

enum class Fit(override val label: String) : Labeled {
    TRIM("Trim"), TAILORED("Tailored"), REGULAR("Regular"), RELAXED("Relaxed"),
}

enum class Condition(override val label: String) : Labeled {
    GOOD("Good"), FADING("Fading"), WORN("Worn"),
}

enum class Status(override val label: String) : Labeled {
    ACTIVE("Active"), DONATED("Donated"),
}

enum class YesNo(override val label: String) : Labeled { YES("Yes"), NO("No") }
enum class PassFail(override val label: String) : Labeled { PASS("Pass"), FAIL("Fail") }

@Serializable
data class Item(
    val id: String,
    val name: String,
    val type: ItemType,
    val contexts: Set<Occasion> = emptySet(),
    val weight: Weight? = null,
    val formality: Formality? = null,
    val colorFamily: ColorFamily? = null,
    val pattern: Pattern? = null,
    val fabrics: Set<Fabric> = emptySet(),
    val season: Season? = null,
    val fit: Fit? = null,
    val hero: Boolean = false,
    val paletteFail: Boolean = false,
    val failReason: String = "",
    val condition: Condition = Condition.GOOD,
    val status: Status = Status.ACTIVE,
    val brand: String = "",
    val exactColor: String = "",
    val blend: String = "",
    val notes: String = "",
    val photo: String? = null,
    val thumb: String? = null,
    val added: String,
    val lastWorn: String? = null,
    val eligibleDaysUnworn: Int = 0,
    val donatedOn: String? = null,
) {
    val slot: Slot get() = type.slot
}

@Serializable
data class PrevValue(val lastWorn: String?, val eligibleDaysUnworn: Int)

@Serializable
data class HistoryEntry(
    val date: String,
    val topId: String,
    val bottomId: String,
    val shoeId: String,
    val layerId: String? = null,
    val occasion: Occasion,
    val source: String,
    val prev: Map<String, PrevValue> = emptyMap(),
)

@Serializable
data class Outfit(
    val topId: String,
    val bottomId: String,
    val shoeId: String,
    val layerId: String? = null,
) {
    val ids: List<String> get() = listOfNotNull(topId, bottomId, shoeId, layerId)
}

@Serializable
data class SwapRecord(val topId: String, val bottomId: String, val date: String)

@Serializable
data class TodayPick(
    val date: String,
    val occasion: Occasion,
    val outfits: List<Outfit>,
    val index: Int = 0,
    val note: String = "",
    /** Outfit currently shown, after any single-tile swaps. */
    val shown: Outfit? = null,
    /** Items skipped by single-tile swaps today, per slot. */
    val skipped: Map<Slot, List<String>> = emptyMap(),
)

@Serializable
data class Prefs(
    val swaps: List<SwapRecord> = emptyList(),
    val blockedCombos: List<SwapRecord> = emptyList(),
    /** itemId -> snoozed until (inclusive, YYYY-MM-DD). */
    val snoozes: Map<String, String> = emptyMap(),
    val lastEligibilityDate: String? = null,
    val occasionOverride: Map<String, Occasion> = emptyMap(),
    val todayPick: TodayPick? = null,
    val closetFilters: Map<String, Set<String>> = emptyMap(),
    val closetSort: String = "TYPE",
)

@Serializable
data class AppData(
    val items: List<Item> = emptyList(),
    val history: List<HistoryEntry> = emptyList(),
    val prefs: Prefs = Prefs(),
)
