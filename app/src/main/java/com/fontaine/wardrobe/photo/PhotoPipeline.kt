package com.fontaine.wardrobe.photo

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream

/**
 * On-phone photo processing: fix orientation, square crop, resize, compress,
 * thumbnail. Re-encoding drops all metadata, including GPS location.
 */
object PhotoPipeline {
    private const val FULL = 1024
    private const val THUMB = 256
    private const val MAX_BYTES = 300 * 1024

    data class Processed(val full: File, val thumb: File)

    fun fromUri(context: Context, uri: Uri, outDir: File, name: String): Processed? =
        process({ context.contentResolver.openInputStream(uri) }, outDir, name)

    fun fromFile(file: File, outDir: File, name: String): Processed? =
        process({ file.inputStream() }, outDir, name)

    private fun process(open: () -> InputStream?, outDir: File, name: String): Processed? {
        val orientation = open()?.use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
            ?: return null

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        open()?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (minOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= FULL) sample *= 2
        val decoded = open()?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) } ?: return null

        val rotated = rotate(decoded, orientation)
        val side = minOf(rotated.width, rotated.height)
        val square = Bitmap.createBitmap(rotated, (rotated.width - side) / 2, (rotated.height - side) / 2, side, side)
        val full = Bitmap.createScaledBitmap(square, FULL, FULL, true)
        val thumb = Bitmap.createScaledBitmap(full, THUMB, THUMB, true)

        outDir.mkdirs()
        val fullFile = File(outDir, "$name.jpg")
        val thumbFile = File(outDir, "$name.thumb.jpg")
        fullFile.writeBytes(compress(full, MAX_BYTES))
        thumbFile.writeBytes(compress(thumb, Int.MAX_VALUE))
        return Processed(fullFile, thumbFile)
    }

    private fun compress(bitmap: Bitmap, maxBytes: Int): ByteArray {
        var quality = 80
        while (true) {
            val out = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
            if (out.size() <= maxBytes || quality <= 60) return out.toByteArray()
            quality -= 5
        }
    }

    private fun rotate(src: Bitmap, orientation: Int): Bitmap {
        val m = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.postScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> { m.postRotate(90f); m.postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_TRANSVERSE -> { m.postRotate(270f); m.postScale(-1f, 1f) }
            else -> return src
        }
        return Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
    }
}
