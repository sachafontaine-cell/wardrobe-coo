package com.fontaine.wardrobe.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fontaine.wardrobe.Draft
import com.fontaine.wardrobe.data.ColorFamily
import com.fontaine.wardrobe.data.Formality
import com.fontaine.wardrobe.data.Item
import com.fontaine.wardrobe.data.ItemType
import com.fontaine.wardrobe.data.Occasion
import com.fontaine.wardrobe.data.PassFail
import com.fontaine.wardrobe.data.Weight
import com.fontaine.wardrobe.data.YesNo
import com.fontaine.wardrobe.domain.Ops
import com.fontaine.wardrobe.ui.theme.W

@Composable
fun ReviewScreen(
    drafts: List<Draft>,
    existing: List<Item>,
    onChange: (Draft) -> Unit,
    onRemove: (String) -> Unit,
    onAddMore: () -> Unit,
    onSaveAll: () -> Unit,
    onBack: () -> Unit,
) {
    val c = W.c
    val untyped = drafts.count { it.ready && it.type == null }
    val processing = drafts.any { !it.ready && !it.failed }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹", color = c.text, fontSize = 26.sp) }
            Text("Review ${drafts.size} item${if (drafts.size == 1) "" else "s"}", style = androidx.compose.material3.MaterialTheme.typography.titleLarge,
                color = c.text, modifier = Modifier.weight(1f))
            TextButton(onClick = onAddMore) { Text("+ More", color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Medium) }
        }
        Text("Pick a type for each item. Everything else is optional and can be changed later.",
            color = c.muted, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 16.dp))

        LazyColumn(
            Modifier.weight(1f),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(drafts, key = { it.key }) { d -> DraftCard(d, existing, onChange, onRemove) }
        }

        Box(Modifier.padding(16.dp)) {
            PrimaryButton(
                when {
                    processing -> "Preparing photos…"
                    untyped > 0 -> "Pick a type for $untyped item${if (untyped == 1) "" else "s"}"
                    else -> "Save all"
                },
                onSaveAll, Modifier.fillMaxWidth(), enabled = !processing && untyped == 0 && drafts.any { it.ready },
            )
        }
    }
}

@Composable
private fun DraftCard(d: Draft, existing: List<Item>, onChange: (Draft) -> Unit, onRemove: (String) -> Unit) {
    val c = W.c
    Card {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(92.dp), contentAlignment = Alignment.Center) {
                    when {
                        d.ready -> ItemPicture(d.thumb, d.type, d.colorFamily?.swatch, Modifier.fillMaxSize())
                        d.failed -> Text("Couldn't read photo", color = c.redText, fontSize = 12.sp)
                        else -> CircularProgressIndicator(color = c.text, strokeWidth = 2.dp, modifier = Modifier.size(28.dp))
                    }
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(
                        Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(10.dp)).background(c.tile)
                            .border(1.dp, c.border, RoundedCornerShape(10.dp)).padding(horizontal = 10.dp),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        if (d.name.isEmpty()) Text("Name (optional)", color = c.muted, fontSize = 15.sp)
                        BasicTextField(
                            value = d.name, onValueChange = { onChange(d.copy(name = it)) }, singleLine = true,
                            textStyle = TextStyle(color = c.text, fontSize = 15.sp), cursorBrush = SolidColor(c.text),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    TextButton(onClick = { onRemove(d.key) }, contentPadding = PaddingValues(0.dp)) {
                        Text("Remove", color = c.danger, fontSize = 14.sp)
                    }
                }
            }

            SectionLabel("Type")
            ChipGroup(ItemType.entries, setOfNotNull(d.type), { onChange(d.copy(type = it)) })
            SectionLabel("Color family")
            ChipGroup(ColorFamily.entries, setOfNotNull(d.colorFamily), { onChange(d.copy(colorFamily = it)) })
            SectionLabel("Weight")
            ChipGroup(Weight.entries, setOfNotNull(d.weight), { onChange(d.copy(weight = if (d.weight == it) null else it)) })
            SectionLabel("Formality")
            ChipGroup(Formality.entries, setOfNotNull(d.formality), { onChange(d.copy(formality = if (d.formality == it) null else it)) })
            SectionLabel("Context")
            ChipGroup(Occasion.entries, d.contexts, { onChange(d.copy(contexts = if (it in d.contexts) d.contexts - it else d.contexts + it)) })
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    SectionLabel("Hero")
                    ChipGroup(YesNo.entries, setOf(if (d.hero) YesNo.YES else YesNo.NO), { onChange(d.copy(hero = it == YesNo.YES)) })
                }
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    SectionLabel("Palette")
                    ChipGroup(PassFail.entries, setOf(if (d.paletteFail) PassFail.FAIL else PassFail.PASS), { onChange(d.copy(paletteFail = it == PassFail.FAIL)) })
                }
            }
            Ops.lookalike(existing, d.type, d.colorFamily, null)?.let { twin ->
                Text("Looks like ${twin.id} (${twin.name}). Save anyway?", color = c.amberText, fontSize = 13.sp,
                    modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(c.amberBg).padding(horizontal = 8.dp, vertical = 6.dp))
            }
        }
    }
}
