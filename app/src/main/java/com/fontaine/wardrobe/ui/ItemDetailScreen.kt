package com.fontaine.wardrobe.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fontaine.wardrobe.data.ColorFamily
import com.fontaine.wardrobe.data.Condition
import com.fontaine.wardrobe.data.Fabric
import com.fontaine.wardrobe.data.Fit
import com.fontaine.wardrobe.data.Formality
import com.fontaine.wardrobe.data.Item
import com.fontaine.wardrobe.data.ItemType
import com.fontaine.wardrobe.data.Labeled
import com.fontaine.wardrobe.data.Occasion
import com.fontaine.wardrobe.data.PassFail
import com.fontaine.wardrobe.data.Pattern
import com.fontaine.wardrobe.data.Season
import com.fontaine.wardrobe.data.Status
import com.fontaine.wardrobe.data.Weight
import com.fontaine.wardrobe.data.YesNo
import com.fontaine.wardrobe.ui.theme.W
import java.io.File

/** One editable tag on an item: its choices and how to read/write it. */
private class TagField(
    val label: String,
    val options: List<Labeled>,
    val multi: Boolean,
    val get: (Item) -> Set<Labeled>,
    val set: (Item, Set<Labeled>) -> Item,
)

@Suppress("UNCHECKED_CAST")
private val TAGS = listOf(
    TagField("Type", ItemType.entries, false, { setOf(it.type) }, { i, v -> (v.firstOrNull() as? ItemType)?.let { i.copy(type = it) } ?: i }),
    TagField("Context", Occasion.entries, true, { it.contexts }, { i, v -> i.copy(contexts = v.map { it as Occasion }.toSet()) }),
    TagField("Weight", Weight.entries, false, { setOfNotNull(it.weight) }, { i, v -> i.copy(weight = v.firstOrNull() as Weight?) }),
    TagField("Formality", Formality.entries, false, { setOfNotNull(it.formality) }, { i, v -> i.copy(formality = v.firstOrNull() as Formality?) }),
    TagField("Color family", ColorFamily.entries, false, { setOfNotNull(it.colorFamily) }, { i, v -> i.copy(colorFamily = v.firstOrNull() as ColorFamily?) }),
    TagField("Pattern", Pattern.entries, false, { setOfNotNull(it.pattern) }, { i, v -> i.copy(pattern = v.firstOrNull() as Pattern?) }),
    TagField("Fabric", Fabric.entries, true, { it.fabrics }, { i, v -> i.copy(fabrics = v.map { it as Fabric }.toSet()) }),
    TagField("Season", Season.entries, false, { setOfNotNull(it.season) }, { i, v -> i.copy(season = v.firstOrNull() as Season?) }),
    TagField("Fit", Fit.entries, false, { setOfNotNull(it.fit) }, { i, v -> i.copy(fit = v.firstOrNull() as Fit?) }),
    TagField("Hero", YesNo.entries, false, { setOf(if (it.hero) YesNo.YES else YesNo.NO) }, { i, v -> i.copy(hero = v.firstOrNull() == YesNo.YES) }),
    TagField("Palette fit", PassFail.entries, false, { setOf(if (it.paletteFail) PassFail.FAIL else PassFail.PASS) }, { i, v -> i.copy(paletteFail = v.firstOrNull() == PassFail.FAIL) }),
    TagField("Condition", Condition.entries, false, { setOf(it.condition) }, { i, v -> i.copy(condition = (v.firstOrNull() as Condition?) ?: Condition.GOOD) }),
    TagField("Status", Status.entries, false, { setOf(it.status) }, { i, v -> i.copy(status = (v.firstOrNull() as Status?) ?: Status.ACTIVE) }),
)

private class TextFieldSpec(val label: String, val get: (Item) -> String, val set: (Item, String) -> Item)

private val DETAILS = listOf(
    TextFieldSpec("Name", { it.name }, { i, v -> i.copy(name = v.ifBlank { i.name }) }),
    TextFieldSpec("Brand", { it.brand }, { i, v -> i.copy(brand = v) }),
    TextFieldSpec("Exact color", { it.exactColor }, { i, v -> i.copy(exactColor = v) }),
    TextFieldSpec("Blend", { it.blend }, { i, v -> i.copy(blend = v) }),
    TextFieldSpec("Notes", { it.notes }, { i, v -> i.copy(notes = v) }),
)

@Composable
fun ItemDetailScreen(
    item: Item,
    photo: File,
    photoVersion: Int,
    onBack: () -> Unit,
    onChange: (Item) -> Unit,
    onDonate: () -> Unit,
    onTakePhoto: () -> Unit,
    onPickPhoto: () -> Unit,
) {
    val c = W.c
    var editingTag by remember { mutableStateOf<TagField?>(null) }
    var editingText by remember { mutableStateOf<TextFieldSpec?>(null) }
    var photoMenu by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ Back", color = c.text, fontSize = 16.sp) }
            Text(item.id, color = c.muted, fontSize = 14.sp)
        }
        ItemPicture(photo.takeIf { item.photo != null }, item.type, item.colorFamily?.swatch, Modifier.fillMaxWidth().aspectRatio(1.4f), photoVersion)
        Text(
            item.name, style = androidx.compose.material3.MaterialTheme.typography.headlineSmall, color = c.text,
            modifier = Modifier.clickable { editingText = DETAILS.first() },
        )

        Card {
            Column {
                TAGS.forEachIndexed { idx, t ->
                    val v = t.get(item)
                    KeyValueRow(t.label, if (v.isEmpty()) "Not set" else v.joinToString(" · ") { it.label }) { editingTag = t }
                    if (idx < TAGS.lastIndex) RowSpacer()
                }
            }
        }
        Card {
            Column {
                DETAILS.drop(1).forEachIndexed { idx, f ->
                    KeyValueRow(f.label, f.get(item).ifBlank { "Add" }, { editingText = f })
                    if (idx < DETAILS.size - 2) RowSpacer()
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f)) {
                SecondaryButton("Replace photo", { photoMenu = true }, Modifier.fillMaxWidth())
                DropdownMenu(expanded = photoMenu, onDismissRequest = { photoMenu = false }) {
                    DropdownMenuItem(text = { Text("Take photo") }, onClick = { photoMenu = false; onTakePhoto() })
                    DropdownMenuItem(text = { Text("Choose from your photos") }, onClick = { photoMenu = false; onPickPhoto() })
                }
            }
            SecondaryButton(if (item.status == Status.DONATED) "Donated" else "Donate", onDonate, Modifier.weight(1f), danger = true)
        }
        Box(Modifier.height(12.dp))
    }

    editingTag?.let { t ->
        TagDialog(t, item, onDismiss = { editingTag = null }) { onChange(it); editingTag = null }
    }
    editingText?.let { f ->
        TextDialog(f.label, f.get(item), onDismiss = { editingText = null }) { onChange(f.set(item, it)); editingText = null }
    }
}

@Composable
private fun TagDialog(field: TagField, item: Item, onDismiss: () -> Unit, onSave: (Item) -> Unit) {
    var sel by remember { mutableStateOf(field.get(item)) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = W.c.bg,
        title = { Text(field.label, color = W.c.text) },
        text = {
            ChipGroup(field.options, sel, { o ->
                sel = if (field.multi) (if (o in sel) sel - o else sel + o) else setOf(o)
                if (!field.multi) onSave(field.set(item, sel))
            })
        },
        confirmButton = {
            if (field.multi) TextButton(onClick = { onSave(field.set(item, sel)) }) { Text("Done", color = W.c.text, fontWeight = FontWeight.SemiBold) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = W.c.muted) } },
    )
}

@Composable
private fun TextDialog(label: String, initial: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var text by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = W.c.bg,
        title = { Text(label, color = W.c.text) },
        text = { OutlinedTextField(value = text, onValueChange = { text = it }, singleLine = label != "Notes", modifier = Modifier.fillMaxWidth()) },
        confirmButton = { TextButton(onClick = { onSave(text.trim()) }) { Text("Save", color = W.c.text, fontWeight = FontWeight.SemiBold) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = W.c.muted) } },
    )
}
