package com.fontaine.wardrobe.data

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import java.io.File

/**
 * Keeps everything in memory for instant reads and writes a single JSON file
 * in the background. The file lives in app storage, which Android backs up to
 * the person's Google account.
 */
class Store(context: Context) {
    private val dir = context.filesDir
    private val file = File(dir, "wardrobe.json")
    val photoDir = File(dir, "photos").apply { mkdirs() }
    val thumbDir = File(dir, "thumbs").apply { mkdirs() }

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = false }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val saves = Channel<AppData>(Channel.CONFLATED)

    /** True when the saved file exists but could not be read. Declared before [_data] so load() can set it. */
    var loadFailed: Boolean = false
        private set

    private val _data = MutableStateFlow(load())
    val data: StateFlow<AppData> = _data.asStateFlow()

    init {
        scope.launch {
            for (d in saves) write(d)
        }
    }

    private fun load(): AppData {
        if (!file.exists()) return AppData()
        return try {
            json.decodeFromString(AppData.serializer(), file.readText())
        } catch (e: Exception) {
            loadFailed = true
            // Keep the unreadable file for recovery instead of overwriting it.
            file.copyTo(File(dir, "wardrobe.unreadable.json"), overwrite = true)
            AppData()
        }
    }

    private fun write(d: AppData) {
        val tmp = File(dir, "wardrobe.json.tmp")
        tmp.writeText(json.encodeToString(AppData.serializer(), d))
        if (!tmp.renameTo(file)) {
            file.delete()
            tmp.renameTo(file)
        }
    }

    fun update(transform: (AppData) -> AppData) {
        val next = transform(_data.value)
        _data.value = next
        saves.trySend(next)
    }

    fun photoFile(id: String) = File(photoDir, "$id.jpg")
    fun thumbFile(id: String) = File(thumbDir, "$id.jpg")

    fun deletePhotos(id: String) {
        photoFile(id).delete()
        thumbFile(id).delete()
    }
}
