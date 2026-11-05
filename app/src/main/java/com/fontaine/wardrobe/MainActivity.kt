package com.fontaine.wardrobe

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fontaine.wardrobe.ui.CameraScreen
import com.fontaine.wardrobe.ui.ClosetScreen
import com.fontaine.wardrobe.ui.ItemDetailScreen
import com.fontaine.wardrobe.ui.ProfileScreen
import com.fontaine.wardrobe.ui.ReviewScreen
import com.fontaine.wardrobe.ui.RowSpacer
import com.fontaine.wardrobe.ui.TodayScreen
import com.fontaine.wardrobe.ui.theme.W
import com.fontaine.wardrobe.ui.theme.WardrobeTheme

private enum class Tab(val label: String, val icon: Int) {
    TODAY("Today", R.drawable.ic_tab_today),
    CLOSET("Closet", R.drawable.ic_tab_closet),
    PROFILE("Profile", R.drawable.ic_tab_profile),
}

private sealed interface Sub {
    data class Detail(val id: String) : Sub
    data class Camera(val replaceId: String? = null) : Sub
    data object Review : Sub
}

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { WardrobeTheme { App(vm) } }
    }

    override fun onResume() {
        super.onResume()
        vm.onResume()
    }
}

@Composable
private fun App(vm: AppViewModel) {
    val data by vm.data.collectAsStateWithLifecycle()
    val today by vm.today.collectAsStateWithLifecycle()
    val drafts by vm.drafts.collectAsStateWithLifecycle()
    val photoVersion by vm.photoVersion.collectAsStateWithLifecycle()
    var tab by remember { mutableStateOf(Tab.TODAY) }
    var stack by remember { mutableStateOf(listOf<Sub>()) }
    val top = stack.lastOrNull()

    fun push(s: Sub) { stack = stack + s }
    fun pop() { stack = stack.dropLast(1) }

    val replacePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        val d = stack.lastOrNull() as? Sub.Detail
        if (uri != null && d != null) vm.replacePhoto(d.id, uri = uri)
    }

    BackHandler(enabled = stack.isNotEmpty() || tab != Tab.TODAY) {
        when {
            top is Sub.Review -> { vm.clearDrafts(); pop() }
            stack.isNotEmpty() -> pop()
            else -> tab = Tab.TODAY
        }
    }

    val c = W.c
    Box(Modifier.fillMaxSize().background(c.bg)) {
        when (top) {
            is Sub.Camera -> Box(Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Color(0xFF111318)).statusBarsPadding().navigationBarsPadding()) {
                CameraScreen(
                    single = top.replaceId != null,
                    takenCount = drafts.size,
                    onCaptured = { f -> if (top.replaceId != null) vm.replacePhoto(top.replaceId, file = f) else vm.addCapture(f) },
                    onPicked = { uris ->
                        if (top.replaceId != null) uris.firstOrNull()?.let { vm.replacePhoto(top.replaceId, uri = it) } else vm.addUris(uris)
                    },
                    onDone = {
                        if (top.replaceId != null) pop()
                        else { stack = stack.dropLast(1).let { if (it.lastOrNull() is Sub.Review) it else it + Sub.Review } }
                    },
                    onClose = {
                        if (top.replaceId == null && stack.none { it is Sub.Review }) vm.clearDrafts()
                        pop()
                    },
                )
            }
            is Sub.Review -> Box(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
                ReviewScreen(
                    drafts = drafts, existing = data.items,
                    onChange = vm::updateDraft, onRemove = vm::removeDraft,
                    onAddMore = { push(Sub.Camera()) },
                    onSaveAll = { vm.saveDrafts(); stack = emptyList(); tab = Tab.CLOSET },
                    onBack = { vm.clearDrafts(); pop() },
                )
            }
            is Sub.Detail -> Box(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
                val item = data.items.firstOrNull { it.id == top.id }
                if (item == null) androidx.compose.runtime.LaunchedEffect(top) { pop() } else ItemDetailScreen(
                    item = item, photo = vm.photoFile(item.id), photoVersion = photoVersion,
                    onBack = { pop() },
                    onChange = vm::updateItem,
                    onDonate = {
                        if (item.status == com.fontaine.wardrobe.data.Status.DONATED) vm.restore(item.id)
                        else { vm.donate(item.id); pop() }
                    },
                    onTakePhoto = { push(Sub.Camera(replaceId = item.id)) },
                    onPickPhoto = { replacePicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                )
            }
            null -> Column(Modifier.fillMaxSize().statusBarsPadding()) {
                Box(Modifier.weight(1f)) {
                    when (tab) {
                        Tab.TODAY -> TodayScreen(
                            data = data, today = today, conditions = vm.conditions, photoVersion = photoVersion,
                            loadFailed = vm.store.loadFailed, thumbFor = vm::thumbFile,
                            onOk = vm::ok, onUndo = vm::undo, onSwap = vm::swap, onSwapTile = vm::swapTile,
                            onOccasion = vm::setOccasion,
                            onAddClothes = { vm.startBatch(); push(Sub.Camera()) },
                        )
                        Tab.CLOSET -> ClosetScreen(
                            data = data, today = today, photoVersion = photoVersion, thumbFor = vm::thumbFile,
                            onOpen = { push(Sub.Detail(it)) },
                            onAdd = { vm.startBatch(); push(Sub.Camera()) },
                            onFilters = vm::setFilters, onSort = vm::setSort,
                        )
                        Tab.PROFILE -> ProfileScreen(data)
                    }
                }
                TabBar(tab) { tab = it }
            }
        }
    }
}

@Composable
private fun TabBar(current: Tab, onSelect: (Tab) -> Unit) {
    val c = W.c
    Column(Modifier.fillMaxWidth().background(c.surface).navigationBarsPadding()) {
        RowSpacer()
        Row(Modifier.fillMaxWidth().height(68.dp)) {
            Tab.entries.forEach { t ->
                val on = t == current
                val color = if (on) c.text else c.muted
                Column(
                    Modifier.weight(1f).fillMaxSize().clickable { onSelect(t) },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Icon(painterResource(t.icon), contentDescription = null, tint = color, modifier = Modifier.size(24.dp))
                    Text(t.label, color = color, fontSize = 13.sp, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal)
                }
            }
        }
    }
}
