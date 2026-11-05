package com.fontaine.wardrobe.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.fontaine.wardrobe.R

val Serif = FontFamily(Font(R.font.dm_serif_display))

@Immutable
data class Palette(
    val bg: Color,
    val surface: Color,
    val tile: Color,
    val border: Color,
    val text: Color,
    val muted: Color,
    val primary: Color,
    val onPrimary: Color,
    val gold: Color,
    val goldText: Color,
    val danger: Color,
    val success: Color,
    val successBg: Color,
    val amberBg: Color,
    val amberText: Color,
    val redBg: Color,
    val redText: Color,
    val chipOn: Color,
    val onChipOn: Color,
)

val LightPalette = Palette(
    bg = Color(0xFFF7F3EA), surface = Color(0xFFFFFFFF), tile = Color(0xFFF4F1EA), border = Color(0xFFE6DFCF),
    text = Color(0xFF14213D), muted = Color(0xFF55524B), primary = Color(0xFF14213D), onPrimary = Color(0xFFF7F3EA),
    gold = Color(0xFFD9A21B), goldText = Color(0xFF8A6300), danger = Color(0xFF8A2B1C),
    success = Color(0xFF2E4A2B), successBg = Color(0xFFE9EFE4),
    amberBg = Color(0xFFF6E3B4), amberText = Color(0xFF6B4A00), redBg = Color(0xFFF6D3CC), redText = Color(0xFF7A1F12),
    chipOn = Color(0xFF14213D), onChipOn = Color(0xFFF7F3EA),
)

val DarkPalette = Palette(
    bg = Color(0xFF0E1729), surface = Color(0xFF16223A), tile = Color(0xFF1C2A45), border = Color(0xFF2A3A5A),
    text = Color(0xFFF2EDE2), muted = Color(0xFFB8B2A5), primary = Color(0xFFE7C46A), onPrimary = Color(0xFF14213D),
    gold = Color(0xFFE0A21C), goldText = Color(0xFFE7C46A), danger = Color(0xFFF0A090),
    success = Color(0xFFB9D8AE), successBg = Color(0xFF22362A),
    amberBg = Color(0xFF4A3A10), amberText = Color(0xFFF6E3B4), redBg = Color(0xFF4A1F18), redText = Color(0xFFF6D3CC),
    chipOn = Color(0xFFE7C46A), onChipOn = Color(0xFF14213D),
)

val LocalPalette = staticCompositionLocalOf { LightPalette }

object W {
    val c: Palette @Composable get() = LocalPalette.current
}

@Composable
fun WardrobeTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val p = if (dark) DarkPalette else LightPalette
    val scheme = if (dark) darkColorScheme(
        primary = p.primary, onPrimary = p.onPrimary, background = p.bg, surface = p.surface,
        onBackground = p.text, onSurface = p.text, surfaceVariant = p.tile, onSurfaceVariant = p.muted,
        outline = p.border, secondary = p.gold,
    ) else lightColorScheme(
        primary = p.primary, onPrimary = p.onPrimary, background = p.bg, surface = p.surface,
        onBackground = p.text, onSurface = p.text, surfaceVariant = p.tile, onSurfaceVariant = p.muted,
        outline = p.border, secondary = p.gold, surfaceContainerLow = p.bg, surfaceContainer = p.surface,
    )
    val base = Typography()
    val type = base.copy(
        headlineSmall = TextStyle(fontFamily = Serif, fontSize = 26.sp, lineHeight = 30.sp),
        titleLarge = TextStyle(fontFamily = Serif, fontSize = 24.sp, lineHeight = 28.sp),
        bodyLarge = base.bodyLarge.copy(fontSize = 16.sp),
        bodyMedium = base.bodyMedium.copy(fontSize = 15.sp),
        labelLarge = base.labelLarge.copy(fontSize = 15.sp, fontWeight = FontWeight.SemiBold),
    )
    CompositionLocalProvider(LocalPalette provides p) {
        MaterialTheme(colorScheme = scheme, typography = type, content = content)
    }
}
