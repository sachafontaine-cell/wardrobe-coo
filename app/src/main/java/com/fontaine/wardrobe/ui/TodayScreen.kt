package com.fontaine.wardrobe.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fontaine.wardrobe.R
import com.fontaine.wardrobe.data.AppData
import com.fontaine.wardrobe.data.Item
import com.fontaine.wardrobe.data.Occasion
import com.fontaine.wardrobe.data.Slot
import com.fontaine.wardrobe.data.Status
import com.fontaine.wardrobe.domain.DayConditions
import com.fontaine.wardrobe.domain.Ops
import com.fontaine.wardrobe.domain.Picker
import com.fontaine.wardrobe.ui.theme.W
import java.io.File
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun TodayScreen(
    data: AppData,
    today: LocalDate,
    conditions: DayConditions,
    photoVersion: Int,
    loadFailed: Boolean,
    thumbFor: (String) -> File,
    onOk: () -> Unit,
    onUndo: () -> Unit,
    onSwap: () -> Unit,
    onSwapTile: (Slot) -> Unit,
    onOccasion: (Occasion) -> Unit,
    onAddClothes: () -> Unit,
) {
    val c = W.c
    val items = remember(data.items) { data.items.associateBy { it.id } }
    val pick = data.prefs.todayPick?.takeIf { it.date == today.toString() }
    val outfit = Ops.shownOutfit(data, today)
    val logged = Ops.loggedToday(data, today) != null
    val occasion = Ops.occasionFor(data, today)

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Image(painterResource(R.drawable.crest), contentDescription = "Fontaine family crest", modifier = Modifier.size(36.dp))
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(today.format(DateTimeFormatter.ofPattern("EEEE, MMM d", Locale.US)), style = androidx.compose.material3.MaterialTheme.typography.titleLarge, color = c.text)
                Text(if (conditions.known) "" else "Weather arrives in the next update", color = c.muted, fontSize = 14.sp)
            }
        }

        OccasionChip(occasion, onOccasion)

        when {
            loadFailed -> Message("I can't read your closet data, so I can't pick an outfit right now. Your data file was kept safe.")
            outfit == null -> EmptyState(data, onAddClothes)
            else -> {
                OutfitGrid(outfit.topId, outfit.bottomId, outfit.shoeId, outfit.layerId, items, photoVersion, thumbFor, enabled = !logged, onSwapTile)
                val reason = Picker.reason(outfit, items, conditions, pick?.note ?: "")
                if (reason.isNotEmpty()) Text(reason, color = c.text, fontSize = 16.sp)

                if (logged) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.weight(1f).height(56.dp).clip(RoundedCornerShape(14.dp)).background(c.successBg),
                            contentAlignment = Alignment.Center,
                        ) { Text("✓  Logged", color = c.success, fontSize = 18.sp, fontWeight = FontWeight.SemiBold) }
                        TextButton(onClick = onUndo, modifier = Modifier.width(112.dp).height(56.dp)) {
                            Text("Undo", color = c.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        PrimaryButton("OK", onOk, Modifier.weight(1f))
                        SecondaryButton("Swap", onSwap, Modifier.width(112.dp).height(56.dp))
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun OccasionChip(current: Occasion, onPick: (Occasion) -> Unit) {
    val c = W.c
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.heightIn(min = 44.dp).clip(RoundedCornerShape(22.dp)).background(c.surface)
                .border(1.5.dp, c.text, RoundedCornerShape(22.dp)).clickable { open = true }.padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) { Text("${current.label}  ▾", color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Medium) }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            Occasion.entries.forEach { o ->
                DropdownMenuItem(text = { Text(o.label, fontSize = 16.sp) }, onClick = { open = false; onPick(o) })
            }
        }
    }
}

@Composable
private fun OutfitGrid(
    topId: String, bottomId: String, shoeId: String, layerId: String?,
    items: Map<String, Item>, version: Int, thumbFor: (String) -> File, enabled: Boolean, onSwapTile: (Slot) -> Unit,
) {
    val tiles = listOfNotNull(Slot.TOP to topId, Slot.BOTTOM to bottomId, Slot.SHOES to shoeId, layerId?.let { Slot.LAYER to it })
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        tiles.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                row.forEach { (slot, id) ->
                    val item = items[id]
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(14.dp))
                            .clickable(enabled = enabled) { onSwapTile(slot) },
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        ItemPicture(
                            file = item?.let { thumbFor(it.id) }, type = item?.type, swatch = item?.colorFamily?.swatch,
                            modifier = Modifier.fillMaxWidth().aspectRatio(1.15f), version = version,
                        )
                        Text(item?.name ?: "", color = W.c.text, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun EmptyState(data: AppData, onAdd: () -> Unit) {
    val active = data.items.filter { it.status == Status.ACTIVE }
    val missing = listOfNotNull(
        "a top".takeIf { active.none { it.slot == Slot.TOP } },
        "a bottom".takeIf { active.none { it.slot == Slot.BOTTOM } },
        "shoes".takeIf { active.none { it.slot == Slot.SHOES } },
    )
    val text = if (missing.isNotEmpty())
        "Add ${missing.joinToString(", ")} to get your first outfit."
    else "Nothing fits today's rules. Add a few more pieces, or change today's occasion."
    Card {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(text, color = W.c.text, fontSize = 16.sp)
            PrimaryButton("Add clothes", onAdd, Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun Message(text: String) {
    Card { Text(text, Modifier.padding(16.dp), color = W.c.text, fontSize = 16.sp) }
}
