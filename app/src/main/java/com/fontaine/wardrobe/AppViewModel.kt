package com.fontaine.wardrobe

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.fontaine.wardrobe.data.ColorFamily
import com.fontaine.wardrobe.data.Formality
import com.fontaine.wardrobe.data.Item
import com.fontaine.wardrobe.data.ItemType
import com.fontaine.wardrobe.data.Occasion
import com.fontaine.wardrobe.data.Slot
import com.fontaine.wardrobe.data.Store
import com.fontaine.wardrobe.data.Weight
import com.fontaine.wardrobe.domain.DayConditions
import com.fontaine.wardrobe.domain.Ops
import com.fontaine.wardrobe.photo.PhotoPipeline
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.time.LocalDate
import java.util.UUID

/** A photographed item waiting for review before it joins the closet. */
data class Draft(
    val key: String = UUID.randomUUID().toString(),
    val full: File? = null,
    val thumb: File? = null,
    val failed: Boolean = false,
    val name: String = "",
    val type: ItemType? = null,
    val colorFamily: ColorFamily? = null,
    val weight: Weight? = null,
    val formality: Formality? = null,
    val contexts: Set<Occasion> = emptySet(),
    val hero: Boolean = false,
    val paletteFail: Boolean = false,
) {
    val ready get() = full != null && thumb != null
}

class AppViewModel(app: Application) : AndroidViewModel(app) {
    val store = Store(app)
    val data = store.data

    private val _today = MutableStateFlow(LocalDate.now())
    val today: StateFlow<LocalDate> = _today.asStateFlow()

    /** Phase 1 has no weather yet: use the spec fallback. */
    val conditions = DayConditions.FALLBACK

    private val _drafts = MutableStateFlow<List<Draft>>(emptyList())
    val drafts: StateFlow<List<Draft>> = _drafts.asStateFlow()

    private val draftDir = File(app.cacheDir, "drafts").apply { mkdirs() }

    fun onResume() {
        val now = LocalDate.now()
        _today.value = now
        var expired: List<String> = emptyList()
        store.update { d ->
            val (m, gone) = Ops.dailyMaintenance(d, now)
            expired = gone
            Ops.ensurePick(m, now, conditions)
        }
        if (expired.isNotEmpty()) viewModelScope.launch(Dispatchers.IO) { expired.forEach(store::deletePhotos) }
    }

    private val now get() = _today.value

    fun ok() = store.update { Ops.ok(it, now) }
    fun undo() = store.update { Ops.undo(it, now) }
    fun swap() = store.update { Ops.swapOutfit(it, now) }
    fun swapTile(slot: Slot) = store.update { Ops.swapTile(it, now, slot, conditions) }
    fun setOccasion(occ: Occasion) = store.update { Ops.ensurePick(Ops.setOccasion(it, now, occ), now, conditions) }

    fun setFilters(f: Map<String, Set<String>>) = store.update { it.copy(prefs = it.prefs.copy(closetFilters = f)) }
    fun setSort(s: String) = store.update { it.copy(prefs = it.prefs.copy(closetSort = s)) }

    fun updateItem(item: Item) = store.update { d ->
        Ops.ensurePick(d.copy(items = d.items.map { if (it.id == item.id) item else it }), now, conditions)
    }
    fun donate(id: String) = store.update { Ops.ensurePick(Ops.donate(it, id, now), now, conditions) }
    fun restore(id: String) = store.update { Ops.restore(it, id) }

    // ---- Adding items ----

    fun startBatch() { clearDrafts() }

    fun addCapture(file: File) = addDraft { name -> PhotoPipeline.fromFile(file, draftDir, name).also { file.delete() } }

    fun addUris(uris: List<Uri>) = uris.forEach { uri -> addDraft { name -> PhotoPipeline.fromUri(getApplication(), uri, draftDir, name) } }

    private fun addDraft(work: (String) -> PhotoPipeline.Processed?) {
        val d = Draft()
        _drafts.update { it + d }
        viewModelScope.launch(Dispatchers.Default) {
            val result = runCatching { work(d.key) }.getOrNull()
            _drafts.update { list ->
                list.map { if (it.key == d.key) it.copy(full = result?.full, thumb = result?.thumb, failed = result == null) else it }
            }
        }
    }

    fun updateDraft(d: Draft) = _drafts.update { list -> list.map { if (it.key == d.key) d else it } }
    fun removeDraft(key: String) = _drafts.update { list -> list.filterNot { it.key == key } }

    /** Saves every reviewed draft. Returns how many were saved. */
    fun saveDrafts(): Int {
        val ready = _drafts.value.filter { it.ready && it.type != null }
        if (ready.isEmpty()) return 0
        val today = now.toString()
        val newIds = ArrayList<String>()
        val created = ArrayList<Pair<Item, Draft>>()
        val existing = data.value.items
        for (dr in ready) {
            val type = dr.type!!
            val id = Ops.nextId(existing, type, newIds)
            newIds += id
            created += Item(
                id = id,
                name = dr.name.ifBlank { defaultName(dr) },
                type = type,
                contexts = dr.contexts,
                weight = dr.weight,
                formality = dr.formality,
                colorFamily = dr.colorFamily,
                hero = dr.hero,
                paletteFail = dr.paletteFail,
                photo = "photos/$id.jpg",
                thumb = "thumbs/$id.jpg",
                added = today,
            ) to dr
        }
        // Move photos into place first so the grid never shows a missing image.
        for ((item, dr) in created) {
            dr.full!!.copyTo(store.photoFile(item.id), overwrite = true)
            dr.thumb!!.copyTo(store.thumbFile(item.id), overwrite = true)
        }
        store.update { d -> Ops.ensurePick(d.copy(items = d.items + created.map { it.first }), now, conditions) }
        val savedKeys = ready.map { it.key }.toSet()
        _drafts.value.filter { it.key in savedKeys }.forEach { it.full?.delete(); it.thumb?.delete() }
        _drafts.update { list -> list.filterNot { it.key in savedKeys } }
        return created.size
    }

    fun clearDrafts() {
        _drafts.value.forEach { it.full?.delete(); it.thumb?.delete() }
        _drafts.value = emptyList()
    }

    fun replacePhoto(id: String, file: File? = null, uri: Uri? = null, done: () -> Unit = {}) {
        viewModelScope.launch {
            val ok = withContext(Dispatchers.Default) {
                val p = when {
                    file != null -> PhotoPipeline.fromFile(file, draftDir, "replace-$id").also { file.delete() }
                    uri != null -> PhotoPipeline.fromUri(getApplication(), uri, draftDir, "replace-$id")
                    else -> null
                } ?: return@withContext false
                p.full.copyTo(store.photoFile(id), overwrite = true)
                p.thumb.copyTo(store.thumbFile(id), overwrite = true)
                p.full.delete(); p.thumb.delete()
                true
            }
            if (ok) {
                // Bump a version so image caches reload the new file.
                store.update { d -> d.copy(items = d.items.map { if (it.id == id) it.copy(photo = "photos/$id.jpg", thumb = "thumbs/$id.jpg", notes = it.notes) else it }) }
                photoVersion.update { it + 1 }
            }
            done()
        }
    }

    val photoVersion = MutableStateFlow(0)

    private fun defaultName(d: Draft): String {
        val color = d.colorFamily?.takeIf { it != ColorFamily.OTHER }?.label
        val type = d.type?.label?.lowercase() ?: "item"
        return listOfNotNull(color, type).joinToString(" ").replaceFirstChar { it.uppercase() }
    }

    fun photoFile(id: String) = store.photoFile(id)
    fun thumbFile(id: String) = store.thumbFile(id)
}
