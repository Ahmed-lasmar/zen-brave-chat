package tn.myapps.zenbrave.ui

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Base64
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import tn.myapps.zenbrave.R
import tn.myapps.zenbrave.data.RoomPreferences
import tn.myapps.zenbrave.model.ChatMessage
import tn.myapps.zenbrave.model.MediaPayload
import tn.myapps.zenbrave.model.PeerInfo
import tn.myapps.zenbrave.net.RelayListener
import tn.myapps.zenbrave.net.RelayWebSocketClient
import java.io.ByteArrayOutputStream
import java.io.InputStream

class ShareActivity : AppCompatActivity(), RelayListener {

    private lateinit var prefs: RoomPreferences
    private lateinit var client: RelayWebSocketClient

    private lateinit var rootContainer: FrameLayout
    private lateinit var btnClose: ImageButton
    private lateinit var tvDomainBadge: TextView
    private lateinit var tvPreviewTitle: TextView
    private lateinit var tvPreviewUrl: TextView
    private lateinit var ivImagePreview: ImageView
    private lateinit var chipContainer: LinearLayout
    private lateinit var etRoomCode: EditText
    private lateinit var tvStatus: TextView
    private lateinit var btnCancel: Button
    private lateinit var btnSend: Button
    private lateinit var progressBar: ProgressBar

    private var sharedUrl: String? = null
    private var sharedTitle: String? = null
    private var sharedText: String? = null
    private var sharedImageBase64: String? = null
    private var sharedImageMime: String = "image/jpeg"

    private var isSending = false
    private var targetRoom: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_share)

        prefs = RoomPreferences(this)
        client = RelayWebSocketClient(this)

        initViews()
        parseSharedIntent(intent)
        setupRecentRooms()
    }

    private fun initViews() {
        rootContainer = findViewById(R.id.rootContainer)
        btnClose = findViewById(R.id.btnClose)
        tvDomainBadge = findViewById(R.id.tvDomainBadge)
        tvPreviewTitle = findViewById(R.id.tvPreviewTitle)
        tvPreviewUrl = findViewById(R.id.tvPreviewUrl)
        ivImagePreview = findViewById(R.id.ivImagePreview)
        chipContainer = findViewById(R.id.chipContainer)
        etRoomCode = findViewById(R.id.etRoomCode)
        tvStatus = findViewById(R.id.tvStatus)
        btnCancel = findViewById(R.id.btnCancel)
        btnSend = findViewById(R.id.btnSend)
        progressBar = findViewById(R.id.progressBar)

        // Dismiss when tapping outside dialog
        rootContainer.setOnClickListener {
            if (!isSending) finish()
        }
        findViewById<View>(R.id.dialogCard).setOnClickListener {
            // Prevent dismiss when clicking inside the card
        }

        btnClose.setOnClickListener {
            if (!isSending) finish()
        }
        btnCancel.setOnClickListener {
            if (!isSending) finish()
        }

        btnSend.setOnClickListener {
            executeSend()
        }
    }

    private fun parseSharedIntent(inIntent: Intent?) {
        if (inIntent == null) return

        val action = inIntent.action
        val type = inIntent.type ?: ""

        if (Intent.ACTION_SEND == action) {
            if (type.startsWith("image/")) {
                handleSendImage(inIntent)
            } else {
                handleSendText(inIntent)
            }
        } else if (Intent.ACTION_SEND_MULTIPLE == action && type.startsWith("image/")) {
            handleSendMultipleImages(inIntent)
        }
    }

    private fun handleSendText(inIntent: Intent) {
        val extraText = inIntent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
        val extraSubject = inIntent.getStringExtra(Intent.EXTRA_SUBJECT)

        val extractedUrl = RoomPreferences.extractUrl(extraText)
        sharedUrl = extractedUrl
        sharedText = extraText

        if (extractedUrl != null) {
            val domain = RoomPreferences.extractDomain(extractedUrl)
            tvDomainBadge.text = domain.uppercase()

            val title = if (!extraSubject.isNullOrBlank()) {
                extraSubject
            } else {
                val nonUrlPart = extraText.replace(extractedUrl, "").trim()
                if (nonUrlPart.isNotEmpty()) nonUrlPart else extractedUrl
            }
            sharedTitle = title
            tvPreviewTitle.text = title
            tvPreviewUrl.text = extractedUrl
            tvPreviewUrl.visibility = View.VISIBLE
        } else {
            tvDomainBadge.text = "TEXT MESSAGE"
            tvPreviewTitle.text = extraText.ifEmpty { "Shared message" }
            tvPreviewUrl.visibility = View.GONE
        }
    }

    private fun handleSendImage(inIntent: Intent) {
        val imageUri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            inIntent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            @Suppress("DEPRECATION")
            inIntent.getParcelableExtra(Intent.EXTRA_STREAM)
        }

        if (imageUri != null) {
            processImageUri(imageUri)
        }
    }

    private fun handleSendMultipleImages(inIntent: Intent) {
        val imageUris = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            inIntent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            @Suppress("DEPRECATION")
            inIntent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
        }

        if (!imageUris.isNullOrEmpty()) {
            processImageUri(imageUris[0])
        }
    }

    private fun processImageUri(uri: Uri) {
        try {
            val inputStream: InputStream? = contentResolver.openInputStream(uri)
            val bitmap = BitmapFactory.decodeStream(inputStream)
            inputStream?.close()

            if (bitmap != null) {
                ivImagePreview.setImageBitmap(bitmap)
                ivImagePreview.visibility = View.VISIBLE
                tvDomainBadge.text = "IMAGE"
                tvPreviewTitle.text = "Shared Image / Photo"
                tvPreviewUrl.text = uri.lastPathSegment ?: "image.jpg"
                tvPreviewUrl.visibility = View.VISIBLE

                // Downscale & compress for fast websocket transmission
                val scaled = if (bitmap.width > 1200 || bitmap.height > 1200) {
                    val ratio = Math.min(1200f / bitmap.width, 1200f / bitmap.height)
                    Bitmap.createScaledBitmap(
                        bitmap,
                        (bitmap.width * ratio).toInt(),
                        (bitmap.height * ratio).toInt(),
                        true
                    )
                } else bitmap

                val stream = ByteArrayOutputStream()
                scaled.compress(Bitmap.CompressFormat.JPEG, 80, stream)
                val bytes = stream.toByteArray()
                sharedImageBase64 = "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
                sharedImageMime = "image/jpeg"
            }
        } catch (e: Exception) {
            Toast.makeText(this, "Could not load image: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun setupRecentRooms() {
        val recents = prefs.getRecentRooms()
        val lastRoom = prefs.lastRoomId

        if (!lastRoom.isNullOrEmpty()) {
            etRoomCode.setText(lastRoom)
            targetRoom = lastRoom
        }

        chipContainer.removeAllViews()
        for (room in recents) {
            val chip = TextView(this).apply {
                text = room
                textSize = 13f
                setTextColor(ContextCompat.getColor(this@ShareActivity, R.color.text_primary))
                val isSelected = room.equals(lastRoom, ignoreCase = true)
                background = ContextCompat.getDrawable(
                    this@ShareActivity,
                    if (isSelected) R.drawable.bg_chip_selected else R.drawable.bg_chip
                )

                val params = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                params.setMargins(0, 0, 16, 0)
                layoutParams = params

                setOnClickListener {
                    selectChip(room)
                }
            }
            chipContainer.addView(chip)
        }
    }

    private fun selectChip(selectedRoom: String) {
        etRoomCode.setText(selectedRoom)
        targetRoom = selectedRoom

        for (i in 0 until chipContainer.childCount) {
            val child = chipContainer.getChildAt(i) as? TextView ?: continue
            val isMatch = child.text.toString().equals(selectedRoom, ignoreCase = true)
            child.background = ContextCompat.getDrawable(
                this,
                if (isMatch) R.drawable.bg_chip_selected else R.drawable.bg_chip
            )
        }
    }

    private fun executeSend() {
        val code = etRoomCode.text.toString().trim().uppercase()
        if (code.isEmpty()) {
            Toast.makeText(this, "Please enter or select a room code!", Toast.LENGTH_SHORT).show()
            etRoomCode.requestFocus()
            return
        }

        targetRoom = code
        prefs.lastRoomId = code
        isSending = true

        btnSend.isEnabled = false
        btnCancel.isEnabled = false
        progressBar.visibility = View.VISIBLE
        tvStatus.visibility = View.VISIBLE
        tvStatus.text = "Connecting to relay server..."

        // Connect and send
        client.connect(prefs.serverUrl) {
            tvStatus.text = "Joining room $targetRoom..."
            client.joinRoom(targetRoom, prefs.userName, prefs.peerId)
        }
    }

    override fun onRoomJoined(roomId: String, peerId: String, peers: List<PeerInfo>, history: List<ChatMessage>) {
        if (!isSending) return

        tvStatus.text = "Beaming to desktop browsers..."

        val msgType = if (sharedUrl != null) "link" else if (sharedImageBase64 != null) "image" else "text"
        val message = ChatMessage(
            id = "msg-${System.currentTimeMillis()}-${(1000..9999).random()}",
            type = msgType,
            text = sharedText ?: "",
            url = sharedUrl,
            title = sharedTitle,
            domain = if (sharedUrl != null) RoomPreferences.extractDomain(sharedUrl) else null,
            media = if (sharedImageBase64 != null) {
                MediaPayload(
                    type = "image",
                    mimeType = sharedImageMime,
                    data = sharedImageBase64!!,
                    name = "share-${System.currentTimeMillis()}.jpg"
                )
            } else null,
            senderId = prefs.peerId,
            senderName = prefs.userName,
            browser = "Android",
            timestamp = System.currentTimeMillis(),
            isOutgoing = true
        )

        client.sendRelayMessage(roomId, message) {
            onSendSuccess()
        }
    }

    private fun onSendSuccess() {
        triggerHaptic()
        tvStatus.setTextColor(ContextCompat.getColor(this, R.color.accent_green))
        tvStatus.text = "Sent to room $targetRoom! 🚀"
        progressBar.visibility = View.GONE

        Toast.makeText(this, "Beamed to Zen & Brave ($targetRoom)!", Toast.LENGTH_SHORT).show()

        Handler(Looper.getMainLooper()).postDelayed({
            client.disconnect()
            finish()
        }, 900)
    }

    private fun triggerHaptic() {
        try {
            val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(50)
            }
        } catch (_: Exception) {}
    }

    override fun onError(error: String) {
        if (isSending) {
            tvStatus.setTextColor(ContextCompat.getColor(this, R.color.accent_red))
            tvStatus.text = "Error: $error"
            btnSend.isEnabled = true
            btnCancel.isEnabled = true
            progressBar.visibility = View.GONE
            isSending = false
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        client.disconnect()
    }
}
