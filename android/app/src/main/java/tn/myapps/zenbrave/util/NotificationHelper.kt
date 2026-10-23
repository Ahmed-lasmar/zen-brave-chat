package tn.myapps.zenbrave.util

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import tn.myapps.zenbrave.R
import tn.myapps.zenbrave.model.ChatMessage
import tn.myapps.zenbrave.ui.MainActivity

object NotificationHelper {
    const val CHANNEL_ID = "zen_brave_chat_messages"
    const val CHANNEL_NAME = "Zen & Brave Chat Messages"
    const val CHANNEL_DESC = "Incoming messages, links, images, and voice notes from Zen & Brave Chat rooms"

    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return

            if (notificationManager.getNotificationChannel(CHANNEL_ID) != null) {
                return
            }

            val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val audioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
                .build()

            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = CHANNEL_DESC
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 150, 250)
                setSound(defaultSoundUri, audioAttributes)
                lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
                setShowBadge(true)
            }

            notificationManager.createNotificationChannel(channel)
        }
    }

    fun showMessageNotification(context: Context, message: ChatMessage, roomId: String) {
        createNotificationChannel(context)

        val senderName = if (message.senderName.isNotBlank() && !message.senderName.equals("null", ignoreCase = true)) {
            val browserTag = if (!message.browser.isNullOrBlank() &&
                !message.browser.equals("null", ignoreCase = true) &&
                !message.browser.equals("Unknown", ignoreCase = true)) {
                " (${message.browser})"
            } else ""
            "${message.senderName}$browserTag"
        } else {
            "Zen & Brave Chat"
        }

        val previewText = when {
            message.replyTo != null -> {
                val replySnippet = message.text.ifBlank { "Replied to ${message.replyTo.senderName}" }
                "↩️ [Reply to ${message.replyTo.senderName}] $replySnippet"
            }
            message.type == "link" || !message.url.isNullOrEmpty() -> {
                val title = message.title?.takeIf { it.isNotBlank() && !it.equals("null", ignoreCase = true) }
                val url = message.url ?: ""
                if (title != null) "🔗 $title" else "🔗 $url"
            }
            message.type == "voice" || message.media?.type == "voice" -> {
                if (message.text.isNotBlank() && !message.text.equals("null", ignoreCase = true)) {
                    message.text
                } else {
                    "🎤 Voice note"
                }
            }
            message.type == "image" || (message.media != null && message.media.type == "image") -> {
                val imgName = message.media?.name?.takeIf { it.isNotBlank() && !it.equals("null", ignoreCase = true) }
                if (imgName != null) "📷 $imgName" else "📷 Photo attachment"
            }
            message.text.isNotBlank() && !message.text.equals("null", ignoreCase = true) -> {
                message.text
            }
            else -> "New message"
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(MainActivity.EXTRA_ROOM_ID, roomId)
            putExtra(MainActivity.EXTRA_FROM_NOTIFICATION, true)
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            roomId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val defaultSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(senderName)
            .setContentText(previewText)
            .setStyle(NotificationCompat.BigTextStyle().bigText(previewText).setSummaryText("Room: $roomId"))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setSound(defaultSound)
            .setVibrate(longArrayOf(0, 250, 150, 250))
            .setContentIntent(pendingIntent)
            .build()

        try {
            val manager = NotificationManagerCompat.from(context)
            val notificationId = (roomId + message.id).hashCode() and 0x7FFFFFFF
            manager.notify(notificationId, notification)
        } catch (_: SecurityException) {
            // Android 13+ permission not granted yet
        } catch (_: Exception) {}
    }
}
