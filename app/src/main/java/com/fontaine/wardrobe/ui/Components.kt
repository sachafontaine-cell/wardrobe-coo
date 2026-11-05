package com.fontaine.wardrobe.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.fontaine.wardrobe.data.ItemType
import com.fontaine.wardrobe.data.Labeled
import com.fontaine.wardrobe.ui.theme.W
import java.io.File

private const val TOP = "M30 22 L42 16 Q50 24 58 16 L70 22 L82 34 L72 42 L67 37 L67 84 L33 84 L33 37 L28 42 L18 34 Z"
private const val PANT = "M32 10 L68 10 L73 90 L56 90 L50 38 L44 90 L27 90 Z"
private const val SHORT = "M28 20 L72 20 L76 66 L55 66 L50 42 L45 66 L24 66 Z"
private const val SHOE = "M12 64 Q14 46 30 46 L46 48 Q56 57 72 57 Q88 59 90 70 L90 78 L12 78 Z"
private const val LAYER = "M30 14 L42 10 L50 20 L58 10 L70 14 L88 64 L76 68 L68 40 L68 92 L32 92 L32 40 L24 68 L12 64 Z"
private const val OTHER = "M30 30 L70 30 L70 70 L30 70 Z"

private fun shapeFor(type: ItemType?) = when (type) {
    ItemType.POLO, ItemType.TEE, ItemType.SHIRT, ItemType.WORKOUT, ItemType.SWIM -> TOP
    ItemType.PANT, ItemType.SUIT -> PANT
    ItemType.SHORT -> SHORT
    ItemType.SHOE -> SHOE
    ItemType.LAYER -> LAYER
    else -> OTHER
}

/** Category silhouette in the item's color, for items without a photo. */
@Composable
fun GarmentShape(type: ItemType?, color: Color, modifier: Modifier = Modifier) {
    val path = remember(type) { PathParser().parsePathString(shapeFor(type)).toPath() }
    Canvas(modifier) {
        val s = minOf(size.width, size.height) / 100f
        val dx = (size.width - 100f * s) / 2f
        val dy = (size.height - 100f * s) / 2f
        withTransform({
            translate(dx, dy)
            scale(s, s, pivot = Offset.Zero)
        }) { drawPath(path, color) }
    }
}

/** Photo tile: shows the photo file, or a colored silhouette when there is none. */
@Composable
fun ItemPicture(
    file: File?,
    type: ItemType?,
    swatch: Long?,
    modifier: Modifier = Modifier,
    version: Int = 0,
) {
    val c = W.c
    Box(
        modifier.clip(RoundedCornerShape(14.dp)).background(c.tile).border(1.dp, c.border, RoundedCornerShape(14.dp)),
        contentAlignment = Alignment.Center,
    ) {
        if (file != null && file.exists()) {
            val ctx = LocalContext.current
            AsyncImage(
                model = remember(file, version, file.lastModified()) {
                    ImageRequest.Builder(ctx).data(file).memoryCacheKey("${file.path}#${file.lastModified()}#$version").crossfade(false).build()
                },
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            GarmentShape(type, Color(swatch ?: 0xFFA3A8AE), Modifier.fillMaxSize().padding(14.dp))
        }
    }
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val c = W.c
    Button(
        onClick = onClick, enabled = enabled, modifier = modifier.heightIn(min = 56.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(containerColor = c.primary, contentColor = c.onPrimary),
    ) { Text(text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold) }
}

@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, danger: Boolean = false) {
    val c = W.c
    val color = if (danger) c.danger else c.text
    OutlinedButton(
        onClick = onClick, modifier = modifier.heightIn(min = 48.dp),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.5.dp, color),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = color, containerColor = c.surface),
        contentPadding = PaddingValues(horizontal = 14.dp),
    ) { Text(text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis) }
}

@Composable
fun Chip(text: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = W.c
    val shape = RoundedCornerShape(19.dp)
    Box(
        modifier
            .heightIn(min = 38.dp)
            .clip(shape)
            .background(if (selected) c.chipOn else c.surface)
            .border(if (selected) 1.5.dp else 1.dp, if (selected) c.chipOn else c.border, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = if (selected) c.onChipOn else c.text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun <T : Labeled> ChipGroup(
    options: List<T>,
    selected: Set<T>,
    onToggle: (T) -> Unit,
    modifier: Modifier = Modifier,
) {
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { o -> Chip(o.label, o in selected, { onToggle(o) }) }
    }
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(), modifier = modifier, color = W.c.muted,
        fontSize = 13.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.8.sp,
    )
}

@Composable
fun Badge(text: String, bg: Color, fg: Color, modifier: Modifier = Modifier) {
    Text(
        text, modifier = modifier.clip(RoundedCornerShape(8.dp)).background(bg).padding(horizontal = 7.dp, vertical = 3.dp),
        color = fg, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
    )
}

@Composable
fun Card(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val c = W.c
    Box(
        modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.surface).border(1.dp, c.border, RoundedCornerShape(16.dp)),
    ) { content() }
}

@Composable
fun RowSpacer() = Box(Modifier.height(1.dp).fillMaxWidth().background(W.c.border))

@Composable
fun KeyValueRow(key: String, value: String, onClick: () -> Unit, chevron: Boolean = true) {
    val c = W.c
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(onClick = onClick).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(key, color = c.muted, fontSize = 15.sp)
        Text(
            if (chevron) "$value ›" else value, color = c.text, fontSize = 15.sp,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 12.dp),
        )
    }
}

@Composable
fun Swatch(color: Long, modifier: Modifier = Modifier) {
    Box(modifier.size(14.dp).clip(RoundedCornerShape(4.dp)).background(Color(color)))
}
