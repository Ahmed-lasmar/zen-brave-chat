package tn.myapps.zenbrave.data

import android.content.Context
import android.content.SharedPreferences
import java.net.URI
import java.util.regex.Pattern

class RoomPreferences(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("zenbrave_prefs", Context.MODE_PRIVATE)

    companion object {
        const val DEFAULT_SERVER_URL = "wss://zenbrave.myapps.tn"
        private const val KEY_LAST_ROOM = "key_last_room"
        private const val KEY_RECENT_ROOMS = "key_recent_rooms"
        private const val KEY_USER_NAME = "key_user_name"
        private const val KEY_PEER_ID = "key_peer_id"
        private const val KEY_SERVER_URL = "key_server_url"

        private val URL_PATTERN = Pattern.compile(
            "https?://[\\w\\-\\.\\~\\:\\?\\#\\[\\]\\@\\!\\$\\&\\'\\(\\)\\*\\+\\,\\;\\=\\/\\%]+"
        )

        fun extractUrl(text: String?): String? {
            if (text == null) return null
            val matcher = URL_PATTERN.matcher(text)
            if (!matcher.find()) return null
            var url = matcher.group()
            while (url.endsWith(".") || url.endsWith(",") || url.endsWith(")") || url.endsWith("]") || url.endsWith("!") || url.endsWith(";")) {
                url = url.substring(0, url.length - 1)
            }
            return url.ifEmpty { null }
        }

        fun extractDomain(urlStr: String?): String {
            if (urlStr.isNullOrBlank()) return "WEB"
            return try {
                val uri = URI(urlStr)
                val host = uri.host ?: return "WEB"
                host.removePrefix("www.")
            } catch (e: Exception) {
                "WEB"
            }
        }
    }

    var serverUrl: String
        get() = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL) ?: DEFAULT_SERVER_URL
        set(value) = prefs.edit().putString(KEY_SERVER_URL, value.trim()).apply()

    var userName: String
        get() = prefs.getString(KEY_USER_NAME, "Android Friend") ?: "Android Friend"
        set(value) = prefs.edit().putString(KEY_USER_NAME, value.trim()).apply()

    var peerId: String
        get() {
            var id = prefs.getString(KEY_PEER_ID, null)
            if (id == null) {
                id = "android-${(10000..99999).random()}"
                prefs.edit().putString(KEY_PEER_ID, id).apply()
            }
            return id
        }
        set(value) = prefs.edit().putString(KEY_PEER_ID, value).apply()

    var lastRoomId: String?
        get() = prefs.getString(KEY_LAST_ROOM, null)
        set(value) {
            val room = value?.trim()?.uppercase()
            if (!room.isNullOrEmpty()) {
                prefs.edit().putString(KEY_LAST_ROOM, room).apply()
                addRecentRoom(room)
            }
        }

    fun getRecentRooms(): List<String> {
        val raw = prefs.getString(KEY_RECENT_ROOMS, "") ?: ""
        if (raw.isBlank()) return emptyList()
        return raw.split(",").map { it.trim().uppercase() }.filter { it.isNotEmpty() }
    }

    fun addRecentRoom(room: String) {
        val clean = room.trim().uppercase()
        if (clean.isEmpty()) return

        val current = getRecentRooms().toMutableList()
        current.remove(clean)
        current.add(0, clean)

        // Limit to max 6 recent rooms
        val limited = current.take(6)
        prefs.edit().putString(KEY_RECENT_ROOMS, limited.joinToString(",")).apply()
    }
}
