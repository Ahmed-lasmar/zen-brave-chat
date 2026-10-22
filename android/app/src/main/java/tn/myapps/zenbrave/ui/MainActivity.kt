package tn.myapps.zenbrave.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaRecorder
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
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import tn.myapps.zenbrave.R
import tn.myapps.zenbrave.data.RoomPreferences
import tn.myapps.zenbrave.model.ChatMessage
import tn.myapps.zenbrave.model.MediaPayload
import tn.myapps.zenbrave.model.PeerInfo
import tn.myapps.zenbrave.net.RelayListener
import tn.myapps.zenbrave.net.RelayWebSocketClient
import tn.myapps.zenbrave.update.AppUpdateManager
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream

class MainActivity : AppCompatActivity(), RelayListener {

    private lateinit var prefs: RoomPreferences
    private lateinit var client: RelayWebSocketClient
    private lateinit var adapter: MessageAdapter
    private lateinit var updateManager: AppUpdateManager

    private lateinit var vStatusDot: View
    private lateinit var tvStatusText: TextView
    private lateinit var tvActiveRoomBadge: TextView
    private lateinit var btnCheckAppUpdate: TextView
    private lateinit var panelConnect: LinearLayout
    private lateinit var etMainRoomCode: EditText
    private lateinit var btnMainJoinRoom: Button
    private lateinit var btnMainCreateRoom: Button
    private lateinit var mainRecentChipsContainer: LinearLayout
    private lateinit var rvMessages: RecyclerView
    private lateinit var layoutEmptyState: LinearLayout
    private lateinit var etMessage: EditText
    private lateinit var btnSend: ImageButton
    private lateinit var btnAttachImage: ImageButton
    private lateinit var btnMicVoice: ImageButton
    private lateinit var layoutVoiceRecording: LinearLayout
    private lateinit var tvVoiceRecordingTimer: TextView
    private lateinit var btnVoiceCancel: Button
    private lateinit var btnVoiceSend: Button

    private var mediaRecorder: MediaRecorder? = null
    private var isRecordingVoice = false
    private var recordingStartTime = 0L
    private val voiceTimerHandler = Handler(Looper.getMainLooper())
    private var currentVoiceFile: File? = null

    private var reconnectHandler = Handler(Looper.getMainLooper())
    private var reconnectAttempt = 0
    private val maxReconnectDelay = 30000L

    private val pickImageLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            sendImageUri(uri)
        }
    }

    private val requestAudioPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            startVoiceRecording()
        } else {
            Toast.makeText(this, "Microphone permission is required to record voice notes", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = RoomPreferences(this)
        client = RelayWebSocketClient(this)
        updateManager = AppUpdateManager(this)

        initViews()
        setupRecyclerView()
        setupRecentChips()

        // Auto-connect to server
        connectToServer()

        // Background update check
        checkForUpdates(isUserInitiated = false)
    }

    private fun initViews() {
        vStatusDot = findViewById(R.id.vStatusDot)
        tvStatusText = findViewById(R.id.tvStatusText)
        tvActiveRoomBadge = findViewById(R.id.tvActiveRoomBadge)
        btnCheckAppUpdate = findViewById(R.id.btnCheckAppUpdate)
        panelConnect = findViewById(R.id.panelConnect)
        etMainRoomCode = findViewById(R.id.etMainRoomCode)
        btnMainJoinRoom = findViewById(R.id.btnMainJoinRoom)
        btnMainCreateRoom = findViewById(R.id.btnMainCreateRoom)
        mainRecentChipsContainer = findViewById(R.id.mainRecentChipsContainer)
        rvMessages = findViewById(R.id.rvMessages)
        layoutEmptyState = findViewById(R.id.layoutEmptyState)
        etMessage = findViewById(R.id.etMessage)
        btnSend = findViewById(R.id.btnSend)
        btnAttachImage = findViewById(R.id.btnAttachImage)
        btnMicVoice = findViewById(R.id.btnMicVoice)
        layoutVoiceRecording = findViewById(R.id.layoutVoiceRecording)
        tvVoiceRecordingTimer = findViewById(R.id.tvVoiceRecordingTimer)
        btnVoiceCancel = findViewById(R.id.btnVoiceCancel)
        btnVoiceSend = findViewById(R.id.btnVoiceSend)

        tvActiveRoomBadge.setOnClickListener {
            // Toggle connect panel to switch rooms
            panelConnect.visibility = if (panelConnect.visibility == View.VISIBLE) View.GONE else View.VISIBLE
        }

        val (_, initialName) = updateManager.getCurrentVersion()
        btnCheckAppUpdate.text = "v$initialName 🔄"
        btnCheckAppUpdate.setOnClickListener {
            checkForUpdates(isUserInitiated = true)
        }

        vStatusDot.setOnClickListener {
            if (!client.isConnected) connectToServer()
        }
        tvStatusText.setOnClickListener {
            if (!client.isConnected) connectToServer()
        }

        btnMainJoinRoom.setOnClickListener {
            val code = etMainRoomCode.text.toString().trim().uppercase()
            if (code.isEmpty()) {
                Toast.makeText(this, "Please enter a room code", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            joinTargetRoom(code)
        }

        btnMainCreateRoom.setOnClickListener {
            if (client.isConnected) {
                client.createRoom(prefs.userName, prefs.peerId)
            } else {
                connectToServer {
                    client.createRoom(prefs.userName, prefs.peerId)
                }
            }
        }

        btnSend.setOnClickListener {
            sendTextMessage()
        }

        btnAttachImage.setOnClickListener {
            pickImageLauncher.launch("image/*")
        }

        btnMicVoice.setOnClickListener {
            if (isRecordingVoice) {
                stopAndSendVoiceRecording()
            } else {
                val activeRoom = client.currentRoomId
                if (activeRoom.isNullOrEmpty()) {
                    Toast.makeText(this, "Please join a room first", Toast.LENGTH_SHORT).show()
                    panelConnect.visibility = View.VISIBLE
                    return@setOnClickListener
                }
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    startVoiceRecording()
                } else {
                    requestAudioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                }
            }
        }

        btnVoiceCancel.setOnClickListener {
            cancelVoiceRecording()
        }

        btnVoiceSend.setOnClickListener {
            stopAndSendVoiceRecording()
        }
    }

    private fun setupRecyclerView() {
        adapter = MessageAdapter(this)
        val layoutManager = LinearLayoutManager(this).apply {
            stackFromEnd = true
        }
        rvMessages.layoutManager = layoutManager
        rvMessages.adapter = adapter
    }

    private fun setupRecentChips() {
        val recents = prefs.getRecentRooms()
        mainRecentChipsContainer.removeAllViews()

        for (room in recents) {
            val chip = TextView(this).apply {
                text = room
                textSize = 12f
                setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_primary))
                background = ContextCompat.getDrawable(this@MainActivity, R.drawable.bg_chip)

                val params = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                params.setMargins(0, 0, 12, 0)
                layoutParams = params

                setOnClickListener {
                    etMainRoomCode.setText(room)
                    joinTargetRoom(room)
                }
            }
            mainRecentChipsContainer.addView(chip)
        }
    }

    private fun checkForUpdates(isUserInitiated: Boolean) {
        if (isUserInitiated) {
            Toast.makeText(this, "Checking for updates...", Toast.LENGTH_SHORT).show()
        }
        updateManager.checkForUpdates { result ->
            result.onSuccess { info ->
                if (info.isUpdateAvailable) {
                    btnCheckAppUpdate.text = "Update! 🚀"
                    btnCheckAppUpdate.setTextColor(ContextCompat.getColor(this, R.color.accent_brave))
                    updateManager.showUpdateDialog(this, info)
                } else {
                    btnCheckAppUpdate.text = "v${info.currentVersionName} 🔄"
                    btnCheckAppUpdate.setTextColor(ContextCompat.getColor(this, R.color.text_secondary))
                    if (isUserInitiated) {
                        updateManager.showUpdateDialog(this, info)
                    }
                }
            }.onFailure { err ->
                if (isUserInitiated) {
                    Toast.makeText(this, "Update check error: ${err.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun connectToServer(onConnected: (() -> Unit)? = null) {
        tvStatusText.text = "Connecting..."
        vStatusDot.background = ContextCompat.getDrawable(this, R.drawable.ic_status_dot_red)

        client.connect(prefs.serverUrl) {
            onConnected?.invoke()
            val last = prefs.lastRoomId
            if (!last.isNullOrEmpty() && client.currentRoomId == null) {
                joinTargetRoom(last)
            }
        }
    }

    private fun joinTargetRoom(roomId: String) {
        val clean = roomId.trim().uppercase()
        prefs.lastRoomId = clean
        etMainRoomCode.setText(clean)

        if (!client.isConnected) {
            connectToServer {
                client.joinRoom(clean, prefs.userName, prefs.peerId)
            }
        } else {
            client.joinRoom(clean, prefs.userName, prefs.peerId)
        }
    }

    private fun sendTextMessage() {
        val text = etMessage.text.toString().trim()
        if (text.isEmpty()) return

        val activeRoom = client.currentRoomId
        if (activeRoom.isNullOrEmpty()) {
            Toast.makeText(this, "Please join a room first", Toast.LENGTH_SHORT).show()
            panelConnect.visibility = View.VISIBLE
            return
        }

        val extractedUrl = RoomPreferences.extractUrl(text)
        val msgType = if (extractedUrl != null) "link" else "text"
        val domain = if (extractedUrl != null) RoomPreferences.extractDomain(extractedUrl) else null

        val message = ChatMessage(
            id = "msg-${System.currentTimeMillis()}-${(1000..9999).random()}",
            type = msgType,
            text = text,
            url = extractedUrl,
            title = if (extractedUrl != null) text.replace(extractedUrl, "").trim().ifEmpty { extractedUrl } else null,
            domain = domain,
            senderId = prefs.peerId,
            senderName = prefs.userName,
            browser = "Android",
            timestamp = System.currentTimeMillis(),
            isOutgoing = true
        )

        client.sendRelayMessage(activeRoom, message) {
            adapter.addMessage(message)
            rvMessages.scrollToPosition(adapter.itemCount - 1)
            layoutEmptyState.visibility = View.GONE
            etMessage.text.clear()
            triggerHaptic()
        }
    }

    private fun sendImageUri(uri: Uri) {
        val activeRoom = client.currentRoomId
        if (activeRoom.isNullOrEmpty()) {
            Toast.makeText(this, "Please join a room first", Toast.LENGTH_SHORT).show()
            panelConnect.visibility = View.VISIBLE
            return
        }

        try {
            val inputStream: InputStream? = contentResolver.openInputStream(uri)
            val bitmap = BitmapFactory.decodeStream(inputStream)
            inputStream?.close()

            if (bitmap != null) {
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
                val base64Data = "data:image/jpeg;base64," + Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)

                val message = ChatMessage(
                    id = "msg-${System.currentTimeMillis()}-${(1000..9999).random()}",
                    type = "image",
                    text = "",
                    media = MediaPayload(
                        type = "image",
                        mimeType = "image/jpeg",
                        data = base64Data,
                        name = "photo.jpg"
                    ),
                    senderId = prefs.peerId,
                    senderName = prefs.userName,
                    browser = "Android",
                    timestamp = System.currentTimeMillis(),
                    isOutgoing = true
                )

                client.sendRelayMessage(activeRoom, message) {
                    adapter.addMessage(message)
                    rvMessages.scrollToPosition(adapter.itemCount - 1)
                    layoutEmptyState.visibility = View.GONE
                    triggerHaptic()
                }
            }
        } catch (e: Exception) {
            Toast.makeText(this, "Failed to load image: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun startVoiceRecording() {
        val audioFile = File(cacheDir, "voice_record.m4a")
        currentVoiceFile = audioFile
        try {
            mediaRecorder = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }).apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setOutputFile(audioFile.absolutePath)
                prepare()
                start()
            }
            isRecordingVoice = true
            recordingStartTime = System.currentTimeMillis()
            layoutVoiceRecording.visibility = View.VISIBLE
            voiceTimerHandler.removeCallbacksAndMessages(null)
            updateVoiceTimer()
            triggerHaptic()
        } catch (e: Exception) {
            Toast.makeText(this, "Could not start audio recording: ${e.message}", Toast.LENGTH_SHORT).show()
            cancelVoiceRecording()
        }
    }

    private fun updateVoiceTimer() {
        if (!isRecordingVoice) return
        val elapsedSec = ((System.currentTimeMillis() - recordingStartTime) / 1000).toInt()
        val mins = elapsedSec / 60
        val secs = elapsedSec % 60
        tvVoiceRecordingTimer.text = String.format("Recording... %02d:%02d", mins, secs)
        voiceTimerHandler.postDelayed({ updateVoiceTimer() }, 1000)
    }

    private fun cancelVoiceRecording() {
        voiceTimerHandler.removeCallbacksAndMessages(null)
        try {
            mediaRecorder?.stop()
            mediaRecorder?.release()
        } catch (_: Exception) {}
        mediaRecorder = null
        isRecordingVoice = false
        layoutVoiceRecording.visibility = View.GONE
        try {
            currentVoiceFile?.delete()
        } catch (_: Exception) {}
        currentVoiceFile = null
    }

    private fun stopAndSendVoiceRecording() {
        if (!isRecordingVoice) return
        voiceTimerHandler.removeCallbacksAndMessages(null)
        val durationSec = Math.max(1, ((System.currentTimeMillis() - recordingStartTime) / 1000).toInt())
        try {
            mediaRecorder?.stop()
            mediaRecorder?.release()
        } catch (e: Exception) {
            Toast.makeText(this, "Recording too short", Toast.LENGTH_SHORT).show()
            cancelVoiceRecording()
            return
        }
        mediaRecorder = null
        isRecordingVoice = false
        layoutVoiceRecording.visibility = View.GONE

        val file = currentVoiceFile ?: return
        if (!file.exists() || file.length() == 0L) return

        val activeRoom = client.currentRoomId
        if (activeRoom.isNullOrEmpty()) {
            Toast.makeText(this, "Please join a room first", Toast.LENGTH_SHORT).show()
            return
        }

        try {
            val bytes = file.readBytes()
            val base64 = "data:audio/mp4;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
            val message = ChatMessage(
                id = "msg-${System.currentTimeMillis()}-${(1000..9999).random()}",
                type = "voice",
                text = "🎤 Voice note (${durationSec}s)",
                media = MediaPayload(
                    type = "voice",
                    mimeType = "audio/mp4",
                    data = base64,
                    name = "voice_${System.currentTimeMillis()}.m4a"
                ),
                senderId = prefs.peerId,
                senderName = prefs.userName,
                browser = "Android",
                timestamp = System.currentTimeMillis(),
                isOutgoing = true
            )

            client.sendRelayMessage(activeRoom, message) {
                adapter.addMessage(message)
                rvMessages.scrollToPosition(adapter.itemCount - 1)
                layoutEmptyState.visibility = View.GONE
                triggerHaptic()
            }
        } catch (e: Exception) {
            Toast.makeText(this, "Failed to send voice note: ${e.message}", Toast.LENGTH_SHORT).show()
        } finally {
            try { file.delete() } catch (_: Exception) {}
            currentVoiceFile = null
        }
    }

    private fun triggerHaptic() {
        try {
            val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE))
            }
        } catch (_: Exception) {}
    }

    private fun scheduleReconnect() {
        if (isDestroyed || isFinishing) return
        val delay = Math.min(1000L * (1 shl reconnectAttempt), maxReconnectDelay)
        reconnectAttempt++
        reconnectHandler.postDelayed({
            if (!client.isConnected) {
                connectToServer()
            }
        }, delay)
    }

    // RelayListener implementation
    override fun onConnected() {
        reconnectAttempt = 0
        reconnectHandler.removeCallbacksAndMessages(null)
        vStatusDot.background = ContextCompat.getDrawable(this, R.drawable.ic_status_dot_green)
        tvStatusText.text = "Connected"
    }

    override fun onDisconnected(reason: String) {
        vStatusDot.background = ContextCompat.getDrawable(this, R.drawable.ic_status_dot_red)
        tvStatusText.text = "Offline (Reconnecting...)"
        scheduleReconnect()
    }

    override fun onRoomCreated(roomId: String) {
        prefs.lastRoomId = roomId
        etMainRoomCode.setText(roomId)
        tvActiveRoomBadge.text = "Room: $roomId"
    }

    override fun onRoomJoined(roomId: String, peerId: String, peers: List<PeerInfo>, history: List<ChatMessage>) {
        tvActiveRoomBadge.text = "Room: $roomId"
        panelConnect.visibility = View.GONE
        setupRecentChips()

        val peerCount = peers.size
        val peerSummary = if (peerCount == 1) "1 friend online" else "$peerCount friends online"
        tvStatusText.text = "Online ($peerSummary)"

        if (history.isNotEmpty()) {
            adapter.setMessages(history)
            layoutEmptyState.visibility = View.GONE
            rvMessages.scrollToPosition(adapter.itemCount - 1)
        } else {
            layoutEmptyState.visibility = View.VISIBLE
        }

        // Announcement
        val sysMsg = ChatMessage(
            type = "system",
            text = "Joined room $roomId. Desktop friends: $peerCount"
        )
        adapter.addMessage(sysMsg)
    }

    override fun onPeerJoined(peer: PeerInfo) {
        val sysMsg = ChatMessage(
            type = "system",
            text = "${peer.name} (${peer.browser}) joined the room 👋"
        )
        adapter.addMessage(sysMsg)
        layoutEmptyState.visibility = View.GONE
        rvMessages.scrollToPosition(adapter.itemCount - 1)
        triggerHaptic()
    }

    override fun onPeerLeft(peerId: String, name: String) {
        val sysMsg = ChatMessage(
            type = "system",
            text = "$name disconnected"
        )
        adapter.addMessage(sysMsg)
        rvMessages.scrollToPosition(adapter.itemCount - 1)
    }

    override fun onMessageReceived(message: ChatMessage) {
        adapter.addMessage(message)
        layoutEmptyState.visibility = View.GONE
        rvMessages.scrollToPosition(adapter.itemCount - 1)
        triggerHaptic()
    }

    override fun onError(error: String) {
        Toast.makeText(this, error, Toast.LENGTH_SHORT).show()
    }

    override fun onDestroy() {
        super.onDestroy()
        reconnectHandler.removeCallbacksAndMessages(null)
        cancelVoiceRecording()
        adapter.stopAudio()
        client.disconnect()
    }
}
