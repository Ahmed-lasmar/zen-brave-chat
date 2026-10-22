package tn.myapps.zenbrave.model

data class ChatMessage(
    val id: String = "msg-${System.currentTimeMillis()}-${(1000..9999).random()}",
    val type: String = "text", // "text", "link", "image", "system"
    val text: String = "",
    val url: String? = null,
    val title: String? = null,
    val domain: String? = null,
    val favIconUrl: String? = null,
    val media: MediaPayload? = null,
    val senderId: String = "",
    val senderName: String = "Android",
    val browser: String = "Android",
    val timestamp: Long = System.currentTimeMillis(),
    val isOutgoing: Boolean = false
)

data class MediaPayload(
    val type: String = "image", // "image" or "audio"
    val mimeType: String = "image/jpeg",
    val data: String = "", // base64 data url or base64 raw
    val name: String = "image.jpg"
)

data class PeerInfo(
    val id: String,
    val name: String,
    val browser: String
)
