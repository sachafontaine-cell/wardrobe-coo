package com.fontaine.wardrobe.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fontaine.wardrobe.BuildConfig
import com.fontaine.wardrobe.R
import com.fontaine.wardrobe.data.AppData
import com.fontaine.wardrobe.data.Status
import com.fontaine.wardrobe.ui.theme.W

@Composable
fun ProfileScreen(data: AppData) {
    val c = W.c
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Image(painterResource(R.drawable.crest), contentDescription = "Fontaine family crest", modifier = Modifier.size(36.dp))
            Text("Profile", style = androidx.compose.material3.MaterialTheme.typography.titleLarge, color = c.text)
        }
        Card {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Coming in update 3", color = c.text, fontSize = 16.sp)
                Text("Sizes, colors, style, brands and settings. Your style rules from the spec are already built into the daily pick.",
                    color = c.muted, fontSize = 14.sp)
            }
        }
        Card {
            Column {
                KeyValueRow("Items in closet", data.items.count { it.status == Status.ACTIVE }.toString(), {}, chevron = false)
                RowSpacer()
                KeyValueRow("Outfits logged (14 days)", data.history.size.toString(), {}, chevron = false)
                RowSpacer()
                KeyValueRow("Version", BuildConfig.VERSION_NAME, {}, chevron = false)
            }
        }
    }
}
