package tn.myapps.zenbrave.net

import android.os.Handler
import android.os.Looper
import okhttp3.*
import org.json.JSONArray
import org.json.JSONObject
import tn.myapps.zenbrave.model.ChatMessage
import tn.myapps.zenbrave.model.MediaPayload
import tn.myapps.zenbrave.model.PeerInfo
import java.util.concurrent.TimeUnit

interface RelayListener {
    fun onConnected() {}
    fun onDisconnected(reason: String) {}
    fun onRoomCreated(roomId: String) {}
    fun onRoomJoined(roomId: String, peerId: String, peers: List<PeerInfo>, history: List<ChatMessage>) {}
    fun onPeerJoined(peer: PeerInfo) {}
    fun onPeerLeft(peerId: String, name: String) {}
    fun onPeerUpdated(peer: PeerInfo, oldName: String) {}
    fun onMessageReceived(message: ChatMessage) {}
    fun onMessageAck(messageId: String) {}
    fun onError(error: String) {}
}

class RelayWebSocketClient(private var listener: RelayListener? = null) {
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS) // infinite for websockets
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    var isConnected: Boolean = false
        private set

    var currentRoomId: String? = null
        private set

    var currentPeerId: String? = null
        private set

    private var pendingJoinRoom: String? = null
    private var pendingUserName: String? = null

    fun setListener(newListener: RelayListener) {
        this.listener = newListener
    }

    fun connect(serverUrl: String, onConnectedCallback: (() -> Unit)? = null) {
        if (isConnected && webSocket != null) {
            onConnectedCallback?.let { mainHandler.post(it) }
            return
        }

        disconnect()

        val request = Request.Builder()
            .url(serverUrl)
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                isConnected = true
                mainHandler.post {
                    listener?.onConnected()
                    onConnectedCallback?.invoke()

                    // If a join was requested prior to connect opening
                    val room = pendingJoinRoom
                    val name = pendingUserName
                    if (room != null && name != null) {
                        doJoinRoom(room, name, currentPeerId ?: "android-${(1000..9999).random()}")
                    }
                }
            }

            override fun onMessage(ws: WebSocket, text: String) {
                mainHandler.post {
                    handleIncomingJson(text)
                }
            }

            override fun onClosing(ws: WebSocket, code: Int, reason: String) {
                ws.close(1000, null)
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                isConnected = false
                mainHandler.post {
                    listener?.onDisconnected(reason.ifEmpty { "Connection closed" })
                }
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                isConnected = false
                mainHandler.post {
                    listener?.onError(t.localizedMessage ?: "WebSocket connection failed")
                    listener?.onDisconnected(t.localizedMessage ?: "Network error")
                }
            }
        })
    }

    fun joinRoom(roomId: String, userName: String, peerId: String) {
        val cleanRoom = roomId.trim().uppercase()
        currentPeerId = peerId
        currentRoomId = cleanRoom

        if (!isConnected) {
            pendingJoinRoom = cleanRoom
            pendingUserName = userName
            return
        }

        doJoinRoom(cleanRoom, userName, peerId)
    }

    private fun doJoinRoom(roomId: String, userName: String, peerId: String) {
        val json = JSONObject().apply {
            put("type", "join-room")
            put("roomId", roomId)
            put("peerId", peerId)
            put("name", userName)
            put("browser", "Android")
        }
        webSocket?.send(json.toString())
    }

    fun createRoom(userName: String, peerId: String) {
        currentPeerId = peerId
        val json = JSONObject().apply {
            put("type", "create-room")
            put("peerId", peerId)
            put("name", userName)
        }
        webSocket?.send(json.toString())
    }

    fun updateUserName(userName: String) {
        val clean = userName.trim()
        if (clean.isEmpty()) return
        pendingUserName = clean
        val room = currentRoomId
        val peerId = currentPeerId
        if (isConnected && room != null && peerId != null) {
            val json = JSONObject().apply {
                put("type", "update-username")
                put("roomId", room)
                put("peerId", peerId)
                put("name", clean)
            }
            webSocket?.send(json.toString())
        }
    }

    fun sendRelayMessage(roomId: String, msg: ChatMessage, onSent: (() -> Unit)? = null): Boolean {
        if (!isConnected || webSocket == null) return false

        val payload = JSONObject().apply {
            put("id", msg.id)
            put("type", msg.type)
            put("text", msg.text)
            if (!msg.url.isNullOrEmpty()) put("url", msg.url)
            if (!msg.title.isNullOrEmpty()) put("title", msg.title)
            if (!msg.domain.isNullOrEmpty()) put("domain", msg.domain)
            if (!msg.favIconUrl.isNullOrEmpty()) put("favIconUrl", msg.favIconUrl)

            if (msg.type == "link" && msg.url != null) {
                val linkObj = JSONObject().apply {
                    put("url", msg.url)
                    put("title", msg.title ?: msg.url)
                    put("domain", msg.domain ?: "")
                    put("favIconUrl", msg.favIconUrl)
                }
                put("link", linkObj)
            }

            if (msg.media != null) {
                val mediaObj = JSONObject().apply {
                    put("type", msg.media.type)
                    put("mimeType", msg.media.mimeType)
                    put("data", msg.media.data)
                    put("name", msg.media.name)
                }
                put("media", mediaObj)
            }

            put("senderId", msg.senderId)
            put("senderName", msg.senderName)
            put("browser", "Android")
            put("timestamp", msg.timestamp)
        }

        val envelope = JSONObject().apply {
            put("type", "relay-message")
            put("roomId", roomId.trim().uppercase())
            put("senderId", msg.senderId)
            put("payload", payload)
        }

        val sent = webSocket?.send(envelope.toString()) ?: false
        if (sent) {
            onSent?.invoke()
        }
        return sent
    }

    fun leaveRoom() {
        val room = currentRoomId ?: return
        val json = JSONObject().apply {
            put("type", "leave-room")
            put("roomId", room)
            put("peerId", currentPeerId)
        }
        webSocket?.send(json.toString())
        currentRoomId = null
    }

    fun disconnect() {
        isConnected = false
        try {
            webSocket?.close(1000, "Normal closure")
        } catch (_: Exception) {}
        webSocket = null
    }

    private fun handleIncomingJson(raw: String) {
        try {
            val json = JSONObject(raw)
            when (json.optString("type")) {
                "room-created" -> {
                    val roomId = json.optString("roomId")
                    currentRoomId = roomId
                    listener?.onRoomCreated(roomId)
                    val name = pendingUserName ?: "Android Friend"
                    val peerId = currentPeerId ?: "android-${(1000..9999).random()}"
                    doJoinRoom(roomId, name, peerId)
                }

                "room-joined" -> {
                    val roomId = json.optString("roomId")
                    val peerId = json.optString("peerId")
                    currentRoomId = roomId
                    currentPeerId = peerId

                    val peersList = mutableListOf<PeerInfo>()
                    val peersArray = json.optJSONArray("peers") ?: JSONArray()
                    for (i in 0 until peersArray.length()) {
                        val p = peersArray.getJSONObject(i)
                        peersList.add(
                            PeerInfo(
                                id = p.optString("id"),
                                name = p.optString("name", "Friend"),
                                browser = p.optString("browser", "Desktop")
                            )
                        )
                    }

                    val historyList = mutableListOf<ChatMessage>()
                    val historyArray = json.optJSONArray("history") ?: JSONArray()
                    for (i in 0 until historyArray.length()) {
                        val m = parseChatMessage(historyArray.getJSONObject(i), peerId)
                        historyList.add(m)
                    }

                    listener?.onRoomJoined(roomId, peerId, peersList, historyList)
                }

                "peer-joined" -> {
                    val p = json.optJSONObject("peer")
                    if (p != null) {
                        listener?.onPeerJoined(
                            PeerInfo(
                                id = p.optString("id"),
                                name = p.optString("name", "Friend"),
                                browser = p.optString("browser", "Desktop")
                            )
                        )
                    }
                }

                "peer-left" -> {
                    val peerId = json.optString("peerId")
                    val name = json.optString("name", "Friend")
                    listener?.onPeerLeft(peerId, name)
                }

                "peer-updated" -> {
                    val p = json.optJSONObject("peer")
                    val oldName = json.optString("oldName", "Friend")
                    if (p != null) {
                        listener?.onPeerUpdated(
                            PeerInfo(
                                id = p.optString("id"),
                                name = p.optString("name", "Friend"),
                                browser = p.optString("browser", "Desktop")
                            ),
                            oldName
                        )
                    }
                }

                "relayed-message" -> {
                    val msgObj = json.optJSONObject("message")
                    if (msgObj != null) {
                        val msg = parseChatMessage(msgObj, currentPeerId ?: "")
                        listener?.onMessageReceived(msg)
                    }
                }

                "ack" -> {
                    val messageId = json.optString("messageId")
                    listener?.onMessageAck(messageId)
                }

                "ping" -> {
                    val pong = JSONObject().apply {
                        put("type", "pong")
                        put("timestamp", System.currentTimeMillis())
                    }
                    webSocket?.send(pong.toString())
                }

                "error" -> {
                    listener?.onError(json.optString("error", "Unknown server error"))
                }
            }
        } catch (e: Exception) {
            listener?.onError("Failed to parse server message: ${e.message}")
        }
    }

    private fun JSONObject.optCleanString(name: String, fallback: String? = null): String? {
        if (isNull(name) || !has(name)) return fallback
        val value = optString(name, "")
        if (value.isEmpty() || value.equals("null", ignoreCase = true)) return fallback
        return value
    }

    private fun parseChatMessage(obj: JSONObject, myPeerId: String): ChatMessage {
        val sId = obj.optCleanString("senderId") ?: ""
        val mediaObj = obj.optJSONObject("media")
        val media = if (mediaObj != null) {
            MediaPayload(
                type = mediaObj.optCleanString("type") ?: "image",
                mimeType = mediaObj.optCleanString("mimeType") ?: "image/jpeg",
                data = mediaObj.optCleanString("data") ?: "",
                name = mediaObj.optCleanString("name") ?: "image.jpg"
            )
        } else null

        val linkObj = obj.optJSONObject("link")
        val url = obj.optCleanString("url", linkObj?.optCleanString("url"))
        val title = obj.optCleanString("title", linkObj?.optCleanString("title"))
        val domain = obj.optCleanString("domain", linkObj?.optCleanString("domain"))
        val rawType = obj.optCleanString("type") ?: ""
        val finalType = when {
            rawType == "voice" || media?.type == "voice" -> "voice"
            rawType == "image" || (media != null && media.type == "image") -> "image"
            rawType == "link" && url != null -> "link"
            url != null -> "link"
            media != null -> "image"
            rawType.isNotEmpty() && rawType != "link" -> rawType
            else -> "text"
        }

        val text = obj.optCleanString("text") ?: ""

        return ChatMessage(
            id = obj.optCleanString("id") ?: "msg-${System.currentTimeMillis()}",
            type = finalType,
            text = text,
            url = url,
            title = title,
            domain = domain,
            favIconUrl = obj.optCleanString("favIconUrl", linkObj?.optCleanString("favIconUrl")),
            media = media,
            senderId = sId,
            senderName = obj.optCleanString("senderName") ?: "Friend",
            browser = obj.optCleanString("browser") ?: "Browser",
            timestamp = obj.optLong("timestamp", System.currentTimeMillis()),
            isOutgoing = sId == myPeerId
        )
    }
}
