package com.fontaine.wardrobe.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.fontaine.wardrobe.R
import java.io.File
import java.util.UUID

/**
 * In-app camera with a square guide. In batch mode it keeps shooting until Done;
 * in single mode (replacing a photo) it returns after one shot.
 */
@Composable
fun CameraScreen(
    single: Boolean,
    takenCount: Int,
    onCaptured: (File) -> Unit,
    onPicked: (List<android.net.Uri>) -> Unit,
    onDone: () -> Unit,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var granted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    LaunchedEffect(Unit) { if (!granted) permission.launch(Manifest.permission.CAMERA) }

    val pickMany = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(30)) { uris ->
        if (uris.isNotEmpty()) { onPicked(uris); onDone() }
    }
    val pickOne = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) { onPicked(listOf(uri)); onDone() }
    }

    val capture = remember { ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build() }
    var flash by remember { mutableIntStateOf(0) }
    val previewView = remember { PreviewView(context).apply { scaleType = PreviewView.ScaleType.FILL_CENTER } }

    DisposableEffect(granted) {
        var provider: ProcessCameraProvider? = null
        if (granted) {
            val future = ProcessCameraProvider.getInstance(context)
            future.addListener({
                provider = future.get()
                val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
                runCatching {
                    provider?.unbindAll()
                    provider?.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, capture)
                }
            }, ContextCompat.getMainExecutor(context))
        }
        onDispose { provider?.unbindAll() }
    }

    fun shoot() {
        val file = File(context.cacheDir, "shot-${UUID.randomUUID()}.jpg")
        flash++
        capture.takePicture(
            ImageCapture.OutputFileOptions.Builder(file).build(),
            ContextCompat.getMainExecutor(context),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                    onCaptured(file)
                    if (single) onDone()
                }
                override fun onError(exception: ImageCaptureException) { file.delete() }
            },
        )
    }

    val cream = Color(0xFFF7F3EA)
    val gold = Color(0xFFD9A21B)
    Column(
        Modifier.fillMaxSize().background(Color(0xFF111318)).padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onClose) { Text("✕", color = cream, fontSize = 22.sp) }
            Text(if (single) "Replace photo" else "$takenCount taken", color = cream, fontSize = 15.sp, fontWeight = FontWeight.Medium,
                modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
            if (!single) {
                Box(
                    Modifier.height(40.dp).clip(RoundedCornerShape(20.dp)).background(if (takenCount > 0) gold else Color(0xFF55524B))
                        .clickable(enabled = takenCount > 0, onClick = onDone).padding(horizontal = 16.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("Done", color = Color(0xFF14213D), fontSize = 15.sp, fontWeight = FontWeight.SemiBold) }
            } else Box(Modifier.width(64.dp))
        }

        Box(Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color(0xFF3B3A36)), contentAlignment = Alignment.Center) {
            if (granted) {
                AndroidView({ previewView }, Modifier.fillMaxSize())
            } else {
                Text("Camera access is off. You can still pick from your photos.", color = cream, fontSize = 15.sp,
                    textAlign = TextAlign.Center, modifier = Modifier.padding(24.dp))
            }
            Box(Modifier.fillMaxWidth(0.88f).aspectRatio(1f).border(2.dp, gold, RoundedCornerShape(14.dp)))
            Text("Lay flat on a plain surface, fill the frame, daylight.", color = cream, fontSize = 15.sp, textAlign = TextAlign.Center,
                modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp))
        }

        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.width(80.dp)) {
                Box(
                    Modifier.size(56.dp).clip(RoundedCornerShape(12.dp)).border(2.dp, cream, RoundedCornerShape(12.dp)).clickable {
                        val req = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                        if (single) pickOne.launch(req) else pickMany.launch(req)
                    },
                    contentAlignment = Alignment.Center,
                ) { Icon(painterResource(R.drawable.ic_camera), contentDescription = "Pick from your photos", tint = cream) }
                Text("Your photos", color = Color(0xFFC9C3B6), fontSize = 12.sp)
            }
            Box(
                Modifier.size(80.dp).clip(CircleShape).border(4.dp, cream, CircleShape).clickable(enabled = granted) { shoot() },
                contentAlignment = Alignment.Center,
            ) { Box(Modifier.size(if (flash % 2 == 0) 62.dp else 58.dp).clip(CircleShape).background(cream)) }
            Box(Modifier.width(80.dp))
        }
    }
}
