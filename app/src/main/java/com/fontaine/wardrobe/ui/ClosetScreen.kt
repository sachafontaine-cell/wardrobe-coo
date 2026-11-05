package com.fontaine.wardrobe.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fontaine.wardrobe.R
import com.fontaine.wardrobe.data.AppData
import com.fontaine.wardrobe.data.Condition
import com.fontaine.wardrobe.ui.theme.W
import java.io.File
import java.time.LocalDate

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ClosetScreen(
    data: AppData,
    today: LocalDate,
    photoVersion: Int,
    thumbFor: (String) -> File,
    onOpen: (String) -> Unit,
    onAdd: () -> Unit,
    onFilters: (Map<String, Set<String>>) -> Unit,
    onSort: (String) -> Unit,
) {
    val c = W.c
    var query by rememberSaveable { mutableStateOf("") }
    var showFilters by remember { mutableStateOf(false) }
    var sortOpen by remember { mutableStateOf(false) }
    val filters = data.prefs.closetFilters
    val sort = runCatching { SortBy.valueOf(data.prefs.closetSort) }.getOrDefault(SortBy.TYPE)
    val shown = remember(data.items, filters, query, sort, today) { sortItems(applyFilters(data.items, filters, query, today), sort) }
    val activeChips = FILTER_GROUPS.mapNotNull { g ->
        val picked = filters[g.key].orEmpty()
        if (picked.isEmpty()) null else g to picked
    }

    LazyVerticalGrid(
        columns = GridCells.Fixed(3),
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(bottom = 4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Image(painterResource(R.drawable.crest), contentDescription = "Fontaine family crest", modifier = Modifier.size(36.dp))
                    Text("Closet", style = androidx.compose.material3.MaterialTheme.typography.titleLarge, color = c.text, modifier = Modifier.weight(1f))
                    Box(
                        Modifier.size(48.dp).clip(CircleShape).background(c.primary).clickable(onClick = onAdd),
                        contentAlignment = Alignment.Center,
                    ) { Text("+", color = c.onPrimary, fontSize = 26.sp, fontWeight = FontWeight.Medium) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.weight(1f).height(48.dp).clip(RoundedCornerShape(12.dp)).background(c.surface)
                            .border(1.dp, c.border, RoundedCornerShape(12.dp)).padding(horizontal = 14.dp),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        if (query.isEmpty()) Text("Search name, brand, color…", color = c.muted, fontSize = 16.sp)
                        BasicTextField(
                            value = query, onValueChange = { query = it }, singleLine = true,
                            textStyle = TextStyle(color = c.text, fontSize = 16.sp), cursorBrush = SolidColor(c.text),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    Row(
                        Modifier.height(48.dp).clip(RoundedCornerShape(12.dp)).background(c.surface)
                            .border(1.dp, c.border, RoundedCornerShape(12.dp)).clickable { showFilters = true }.padding(horizontal = 14.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(painterResource(R.drawable.ic_filters), contentDescription = null, tint = c.text, modifier = Modifier.size(18.dp))
                        Text("Filters", color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                    }
                }
                if (activeChips.isNotEmpty()) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        activeChips.forEach { (g, picked) ->
                            val labels = g.options.filter { it.code in picked }.joinToString(", ") { it.label }
                            Chip("$labels  ×", true, { onFilters(filters - g.key) })
                        }
                        TextButton(onClick = { onFilters(emptyMap()) }) { Text("Clear all", color = c.text, fontSize = 14.sp) }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${shown.size} items", color = c.muted, fontSize = 14.sp, modifier = Modifier.weight(1f))
                    Box {
                        TextButton(onClick = { sortOpen = true }, modifier = Modifier.heightIn(min = 44.dp)) {
                            Text("Sort: ${sort.label} ▾", color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        }
                        DropdownMenu(expanded = sortOpen, onDismissRequest = { sortOpen = false }) {
                            SortBy.entries.forEach { s ->
                                DropdownMenuItem(text = { Text(s.label) }, onClick = { sortOpen = false; onSort(s.name) })
                            }
                        }
                    }
                }
            }
        }

        if (shown.isEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    if (data.items.isEmpty()) "Your closet is empty. Tap + to photograph your clothes." else "No items match.",
                    color = c.muted, fontSize = 16.sp, modifier = Modifier.padding(vertical = 24.dp),
                )
            }
        }

        items(shown, key = { it.id }) { item ->
            Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(12.dp)).clickable { onOpen(item.id) }) {
                ItemPicture(thumbFor(item.id).takeIf { item.thumb != null }, item.type, item.colorFamily?.swatch, Modifier.fillMaxSize(), photoVersion)
                val badge = when {
                    item.condition == Condition.WORN -> Triple("Worn", c.redBg, c.redText)
                    item.condition == Condition.FADING -> Triple("Fading", c.redBg, c.redText)
                    item.paletteFail -> Triple("Off palette", c.amberBg, c.amberText)
                    else -> null
                }
                if (badge != null) Badge(badge.first, badge.second, badge.third, Modifier.padding(6.dp))
            }
        }
    }

    if (showFilters) {
        FiltersSheet(
            data = data, today = today, current = filters, query = query,
            onApply = { onFilters(it) }, onDismiss = { showFilters = false },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun FiltersSheet(
    data: AppData,
    today: LocalDate,
    current: Map<String, Set<String>>,
    query: String,
    onApply: (Map<String, Set<String>>) -> Unit,
    onDismiss: () -> Unit,
) {
    val c = W.c
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var picked by remember { mutableStateOf(current) }
    val count = remember(picked, data.items, query) { applyFilters(data.items, picked, query, today).size }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = state, containerColor = c.bg) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding()) {
            Text("Filters", style = androidx.compose.material3.MaterialTheme.typography.titleLarge, color = c.text, modifier = Modifier.padding(horizontal = 16.dp))
            Column(
                Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                FILTER_GROUPS.forEach { g ->
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        SectionLabel(g.label)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            g.options.forEach { o ->
                                val sel = picked[g.key].orEmpty()
                                Chip(o.label, o.code in sel, {
                                    val next = if (o.code in sel) sel - o.code else sel + o.code
                                    picked = if (next.isEmpty()) picked - g.key else picked + (g.key to next)
                                })
                            }
                        }
                    }
                }
            }
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SecondaryButton("Clear all", { picked = emptyMap() }, Modifier.height(52.dp))
                PrimaryButton("Show $count items", { onApply(picked); onDismiss() }, Modifier.weight(1f))
            }
        }
    }
}
