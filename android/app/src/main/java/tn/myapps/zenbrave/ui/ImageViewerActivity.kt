package tn.myapps.zenbrave.ui

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.PointF
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.widget.Button
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import tn.myapps.zenbrave.R
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.text.SimpleDateFormat
import java.util.*

class ImageViewerActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_IMAGE_DATA = "extra_image_data"
        const val EXTRA_IMAGE_NAME = "extra_image_name"
        const val EXTRA_SENDER = "extra_sender"
        const val EXTRA_TIMESTAMP = "extra_timestamp"

        private val timeFormatter = SimpleDateFormat("MMM d, yyyy • HH:mm", Locale.getDefault())
    }

    private lateinit var ivFullPreview: ImageView
    private lateinit var btnClose: ImageButton
    private lateinit var tvSender: TextView
    private lateinit var tvMeta: TextView
    private lateinit var btnOpenExternal: Button
    private lateinit var btnSave: Button
    private lateinit var btnShare: Button

    private var currentBitmap: Bitmap? = null
    private var imageName: String = "photo.jpg"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_image_viewer)

        val topBar = findViewById<View>(R.id.layoutViewerTopBar)
        val bottomBar = findViewById<View>(R.id.layoutViewerBottomBar)
        val baseTop = topBar.paddingTop
        val baseBottom = bottomBar.paddingBottom

        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.rootImageViewer)) { _, insets ->
            val status = insets.getInsets(
                WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars())

            topBar.setPadding(
                topBar.paddingLeft,
                status.top + baseTop,
                topBar.paddingRight,
                topBar.paddingBottom
            )
            bottomBar.setPadding(
                bottomBar.paddingLeft,
                bottomBar.paddingTop,
                bottomBar.paddingRight,
                nav.bottom + baseBottom
            )
            insets
        }

        ivFullPreview = findViewById(R.id.ivFullPreview)
        btnClose = findViewById(R.id.btnViewerClose)
        tvSender = findViewById(R.id.tvViewerSender)
        tvMeta = findViewById(R.id.tvViewerMeta)
        btnOpenExternal = findViewById(R.id.btnViewerOpenExternal)
        btnSave = findViewById(R.id.btnViewerSave)
        btnShare = findViewById(R.id.btnViewerShare)

        val rawData = intent.getStringExtra(EXTRA_IMAGE_DATA) ?: ""
        imageName = intent.getStringExtra(EXTRA_IMAGE_NAME) ?: "image_${System.currentTimeMillis()}.jpg"
        val sender = intent.getStringExtra(EXTRA_SENDER) ?: "Shared Image"
        val timestamp = intent.getLongExtra(EXTRA_TIMESTAMP, System.currentTimeMillis())

        tvSender.text = sender
        tvMeta.text = "${timeFormatter.format(Date(timestamp))} • Pinch to zoom"

        btnClose.setOnClickListener { finish() }

        if (rawData.isEmpty()) {
            Toast.makeText(this, "Image data not available", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        loadBitmap(rawData)
        setupInteractiveZoom()

        btnOpenExternal.setOnClickListener { openInExternalGallery() }
        btnSave.setOnClickListener { saveImageToGallery() }
        btnShare.setOnClickListener { shareImage() }
    }

    private fun loadBitmap(rawData: String) {
        try {
            val cleanBase64 = if (rawData.contains(",")) rawData.substringAfter(",") else rawData
            val decodedBytes = Base64.decode(cleanBase64, Base64.DEFAULT)
            val bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
            if (bitmap != null) {
                currentBitmap = bitmap
                ivFullPreview.setImageBitmap(bitmap)
            } else {
                Toast.makeText(this, "Could not decode image", Toast.LENGTH_SHORT).show()
                finish()
            }
        } catch (e: Exception) {
            Toast.makeText(this, "Error loading image: ${e.message}", Toast.LENGTH_SHORT).show()
            finish()
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun setupInteractiveZoom() {
        val matrix = Matrix()
        val savedMatrix = Matrix()

        var mode = 0
        val NONE = 0
        val DRAG = 1
        val ZOOM = 2

        val start = PointF()
        val mid = PointF()
        var oldDist = 1f
        var currentScale = 1f

        ivFullPreview.scaleType = ImageView.ScaleType.MATRIX

        // Initial centering once image is measured
        ivFullPreview.post {
            val bmp = currentBitmap ?: return@post
            val vWidth = ivFullPreview.width.toFloat()
            val vHeight = ivFullPreview.height.toFloat()
            if (vWidth <= 0 || vHeight <= 0) return@post

            val scale = Math.min(vWidth / bmp.width.toFloat(), vHeight / bmp.height.toFloat())
            val dx = (vWidth - bmp.width * scale) / 2f
            val dy = (vHeight - bmp.height * scale) / 2f

            matrix.setScale(scale, scale)
            matrix.postTranslate(dx, dy)
            ivFullPreview.imageMatrix = matrix
            currentScale = scale
        }

        val gestureDetector = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDoubleTap(e: MotionEvent): Boolean {
                val bmp = currentBitmap ?: return false
                val vWidth = ivFullPreview.width.toFloat()
                val vHeight = ivFullPreview.height.toFloat()
                val baseScale = Math.min(vWidth / bmp.width.toFloat(), vHeight / bmp.height.toFloat())

                if (currentScale > baseScale * 1.5f) {
                    // Reset to base fit
                    matrix.reset()
                    val dx = (vWidth - bmp.width * baseScale) / 2f
                    val dy = (vHeight - bmp.height * baseScale) / 2f
                    matrix.setScale(baseScale, baseScale)
                    matrix.postTranslate(dx, dy)
                    currentScale = baseScale
                } else {
                    // Zoom in 2.5x at tap point
                    val zoomFactor = 2.5f
                    matrix.postScale(zoomFactor, zoomFactor, e.x, e.y)
                    currentScale = baseScale * zoomFactor
                }
                ivFullPreview.imageMatrix = matrix
                return true
            }
        })

        ivFullPreview.setOnTouchListener { _, event ->
            gestureDetector.onTouchEvent(event)

            when (event.action and MotionEvent.ACTION_MASK) {
                MotionEvent.ACTION_DOWN -> {
                    savedMatrix.set(matrix)
                    start.set(event.x, event.y)
                    mode = DRAG
                }
                MotionEvent.ACTION_POINTER_DOWN -> {
                    oldDist = spacing(event)
                    if (oldDist > 10f) {
                        savedMatrix.set(matrix)
                        midPoint(mid, event)
                        mode = ZOOM
                    }
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> {
                    mode = NONE
                }
                MotionEvent.ACTION_MOVE -> {
                    if (mode == DRAG) {
                        matrix.set(savedMatrix)
                        matrix.postTranslate(event.x - start.x, event.y - start.y)
                    } else if (mode == ZOOM) {
                        val newDist = spacing(event)
                        if (newDist > 10f) {
                            matrix.set(savedMatrix)
                            val scale = newDist / oldDist
                            matrix.postScale(scale, scale, mid.x, mid.y)
                        }
                    }
                }
            }
            ivFullPreview.imageMatrix = matrix
            true
        }
    }

    private fun spacing(event: MotionEvent): Float {
        val x = event.getX(0) - event.getX(1)
        val y = event.getY(0) - event.getY(1)
        return Math.sqrt((x * x + y * y).toDouble()).toFloat()
    }

    private fun midPoint(point: PointF, event: MotionEvent) {
        val x = event.getX(0) + event.getX(1)
        val y = event.getY(0) + event.getY(1)
        point.set(x / 2, y / 2)
    }

    private fun getSharedFile(): File? {
        val bmp = currentBitmap ?: return null
        return try {
            val shareDir = File(cacheDir, "shared_images").apply { mkdirs() }
            val file = File(shareDir, "view_${System.currentTimeMillis()}_$imageName")
            FileOutputStream(file).use { out ->
                bmp.compress(Bitmap.CompressFormat.JPEG, 95, out)
            }
            file
        } catch (e: Exception) {
            null
        }
    }

    private fun openInExternalGallery() {
        val file = getSharedFile()
        if (file == null) {
            Toast.makeText(this, "Could not prepare image file", Toast.LENGTH_SHORT).show()
            return
        }

        try {
            val contentUri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(contentUri, "image/*")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(this, "No external gallery app found: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun saveImageToGallery() {
        val bmp = currentBitmap ?: return
        val filename = "zenbrave_${System.currentTimeMillis()}.jpg"

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val resolver = contentResolver
                val contentValues = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                    put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/ZenBrave")
                }
                val imageUri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)
                if (imageUri != null) {
                    resolver.openOutputStream(imageUri).use { out ->
                        if (out != null) bmp.compress(Bitmap.CompressFormat.JPEG, 95, out)
                    }
                    Toast.makeText(this, "Saved to Pictures/ZenBrave", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this, "Failed to save image", Toast.LENGTH_SHORT).show()
                }
            } else {
                @Suppress("DEPRECATION")
                val picturesDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
                val targetDir = File(picturesDir, "ZenBrave").apply { mkdirs() }
                val targetFile = File(targetDir, filename)
                FileOutputStream(targetFile).use { out ->
                    bmp.compress(Bitmap.CompressFormat.JPEG, 95, out)
                }
                @Suppress("DEPRECATION")
                sendBroadcast(Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, Uri.fromFile(targetFile)))
                Toast.makeText(this, "Saved to Pictures/ZenBrave", Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            Toast.makeText(this, "Save error: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun shareImage() {
        val file = getSharedFile()
        if (file == null) {
            Toast.makeText(this, "Could not prepare image file", Toast.LENGTH_SHORT).show()
            return
        }

        try {
            val contentUri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", file)
            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "image/*"
                putExtra(Intent.EXTRA_STREAM, contentUri)
                putExtra(Intent.EXTRA_TEXT, "Shared via Zen & Brave Chat")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(shareIntent, "Share Image via"))
        } catch (e: Exception) {
            Toast.makeText(this, "Share failed: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        currentBitmap = null
    }
}
