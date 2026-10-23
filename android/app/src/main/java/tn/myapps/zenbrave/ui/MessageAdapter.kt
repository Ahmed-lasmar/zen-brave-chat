package tn.myapps.zenbrave.ui

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaPlayer
import android.net.Uri
import android.util.Base64
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import tn.myapps.zenbrave.R
import tn.myapps.zenbrave.model.ChatMessage
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

class MessageAdapter(
    private val context: Context,
    private val messages: MutableList<ChatMessage> = mutableListOf(),
    var onReplyListener: ((ChatMessage) -> Unit)? = null,
    var onReactionListener: ((ChatMessage, String) -> Unit)? = null
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    companion object {
        private const val TYPE_TEXT = 1
        private const val TYPE_LINK = 2
        private const val TYPE_IMAGE = 3
        private const val TYPE_VOICE = 4
        private const val TYPE_SYSTEM = 5
        private val timeFormatter = SimpleDateFormat("HH:mm", Locale.getDefault())
    }

    private var mediaPlayer: MediaPlayer? = null
    private var currentlyPlayingId: String? = null

    override fun getItemViewType(position: Int): Int {
        val msg = messages[position]
        return when (msg.type) {
            "system" -> TYPE_SYSTEM
            "link" -> TYPE_LINK
            "voice" -> TYPE_VOICE
            "image" -> TYPE_IMAGE
            else -> {
                if (msg.url != null) TYPE_LINK
                else if (msg.media?.type == "voice") TYPE_VOICE
                else if (msg.media != null) TYPE_IMAGE
                else TYPE_TEXT
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return when (viewType) {
            TYPE_LINK -> LinkViewHolder(inflater.inflate(R.layout.item_message_link, parent, false))
            TYPE_IMAGE -> ImageViewHolder(inflater.inflate(R.layout.item_message_image, parent, false))
            TYPE_VOICE -> VoiceViewHolder(inflater.inflate(R.layout.item_message_voice, parent, false))
            TYPE_SYSTEM -> SystemViewHolder(inflater.inflate(R.layout.item_message_system, parent, false))
            else -> TextViewHolder(inflater.inflate(R.layout.item_message_text, parent, false))
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        val msg = messages[position]
        when (holder) {
            is TextViewHolder -> holder.bind(msg)
            is LinkViewHolder -> holder.bind(msg)
            is ImageViewHolder -> holder.bind(msg)
            is VoiceViewHolder -> holder.bind(msg)
            is SystemViewHolder -> holder.bind(msg)
        }
    }

    override fun getItemCount(): Int = messages.size

    fun addMessage(message: ChatMessage) {
        messages.add(message)
        notifyItemInserted(messages.size - 1)
    }

    fun setMessages(newMessages: List<ChatMessage>) {
        messages.clear()
        messages.addAll(newMessages)
        notifyDataSetChanged()
    }

    fun updateReactions(targetMessageId: String, reactions: Map<String, List<String>>) {
        val idx = messages.indexOfFirst { it.id == targetMessageId }
        if (idx != -1) {
            val updated = messages[idx].copy(reactions = reactions)
            messages[idx] = updated
            notifyItemChanged(idx)
        }
    }

    fun findMessagePosition(id: String): Int {
        return messages.indexOfFirst { it.id == id }
    }

    private fun formatSender(msg: ChatMessage): String {
        if (msg.isOutgoing) return "You"
        val name = if (msg.senderName.isNotBlank() && !msg.senderName.equals("null", ignoreCase = true)) msg.senderName else "Friend"
        return if (!msg.browser.isNullOrBlank() && !msg.browser.equals("Unknown", ignoreCase = true) && !msg.browser.equals("null", ignoreCase = true)) {
            "$name (${msg.browser})"
        } else {
            name
        }
    }

    private fun bindQuotedReply(layout: View?, msg: ChatMessage) {
        if (layout == null) return
        val reply = msg.replyTo
        if (reply != null) {
            layout.visibility = View.VISIBLE
            val tvSender = layout.findViewById<TextView>(R.id.tvQuotedSender)
            val tvText = layout.findViewById<TextView>(R.id.tvQuotedText)
            tvSender?.text = reply.senderName
            tvText?.text = reply.text
            layout.setOnClickListener {
                val targetIdx = findMessagePosition(reply.id)
                if (targetIdx != -1) {
                    (context as? MainActivity)?.scrollToMessage(targetIdx)
                } else {
                    Toast.makeText(context, "Quoted message not in active list", Toast.LENGTH_SHORT).show()
                }
            }
        } else {
            layout.visibility = View.GONE
        }
    }

    private fun bindReactions(layout: LinearLayout?, msg: ChatMessage) {
        if (layout == null) return
        layout.removeAllViews()
        if (msg.reactions.isEmpty()) {
            layout.visibility = View.GONE
            return
        }

        layout.visibility = View.VISIBLE
        for ((emoji, senders) in msg.reactions) {
            if (senders.isEmpty()) continue
            val chip = TextView(context).apply {
                text = "$emoji ${senders.size}"
                textSize = 11f
                setTextColor(ContextCompat.getColor(context, R.color.text_primary))
                val isMine = senders.contains("You") || senders.contains((context as? MainActivity)?.getCurrentUserName())
                background = ContextCompat.getDrawable(context, if (isMine) R.drawable.bg_reaction_chip_active else R.drawable.bg_reaction_chip)
                val params = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(0, 0, 8, 0)
                }
                layoutParams = params
                setOnClickListener {
                    onReactionListener?.invoke(msg, emoji)
                }
            }
            layout.addView(chip)
        }
    }

    private fun showMessageActionsDialog(msg: ChatMessage) {
        val options = arrayOf(
            "↩️ Reply to this message",
            "👍 React with 👍",
            "❤️ React with ❤️",
            "😂 React with 😂",
            "🔥 React with 🔥",
            "🎉 React with 🎉",
            "😮 React with 😮",
            "😢 React with 😢"
        )
        AlertDialog.Builder(context)
            .setTitle("Message Actions")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> onReplyListener?.invoke(msg)
                    1 -> onReactionListener?.invoke(msg, "👍")
                    2 -> onReactionListener?.invoke(msg, "❤️")
                    3 -> onReactionListener?.invoke(msg, "😂")
                    4 -> onReactionListener?.invoke(msg, "🔥")
                    5 -> onReactionListener?.invoke(msg, "🎉")
                    6 -> onReactionListener?.invoke(msg, "😮")
                    7 -> onReactionListener?.invoke(msg, "😢")
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    inner class TextViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val row: LinearLayout = itemView.findViewById(R.id.llMessageRow)
        private val container: LinearLayout = itemView.findViewById(R.id.llBubbleContainer)
        private val tvSender: TextView = itemView.findViewById(R.id.tvSenderName)
        private val tvText: TextView = itemView.findViewById(R.id.tvMessageText)
        private val tvTime: TextView = itemView.findViewById(R.id.tvTimestamp)
        private val llQuotedReply: View? = itemView.findViewById(R.id.llQuotedReply)
        private val llReactions: LinearLayout? = itemView.findViewById(R.id.llReactions)

        fun bind(msg: ChatMessage) {
            tvText.text = msg.text
            tvTime.text = timeFormatter.format(Date(msg.timestamp))

            if (msg.isOutgoing) {
                row.gravity = Gravity.END
                container.gravity = Gravity.END
                tvSender.visibility = View.GONE
                tvText.background = ContextCompat.getDrawable(context, R.drawable.bg_bubble_outgoing)
                tvText.setTextColor(ContextCompat.getColor(context, R.color.white))
            } else {
                row.gravity = Gravity.START
                container.gravity = Gravity.START
                tvSender.visibility = View.VISIBLE
                tvSender.text = formatSender(msg)
                tvText.background = ContextCompat.getDrawable(context, R.drawable.bg_bubble_incoming)
                tvText.setTextColor(ContextCompat.getColor(context, R.color.text_primary))
            }

            bindQuotedReply(llQuotedReply, msg)
            bindReactions(llReactions, msg)

            val showActions = View.OnLongClickListener {
                showMessageActionsDialog(msg)
                true
            }
            tvText.setOnLongClickListener(showActions)
            container.setOnLongClickListener(showActions)
        }
    }

    inner class LinkViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val row: LinearLayout = itemView.findViewById(R.id.llLinkRow)
        private val container: View = itemView.findViewById(R.id.llLinkContainer)
        private val tvSender: TextView = itemView.findViewById(R.id.tvLinkSender)
        private val tvDomain: TextView = itemView.findViewById(R.id.tvLinkDomain)
        private val tvTitle: TextView = itemView.findViewById(R.id.tvLinkTitle)
        private val tvUrl: TextView = itemView.findViewById(R.id.tvLinkUrl)
        private val btnOpen: View = itemView.findViewById(R.id.btnOpenLink)
        private val llQuotedReply: View? = itemView.findViewById(R.id.llQuotedReply)
        private val llReactions: LinearLayout? = itemView.findViewById(R.id.llReactions)

        fun bind(msg: ChatMessage) {
            row.gravity = if (msg.isOutgoing) Gravity.END else Gravity.START
            tvSender.text = formatSender(msg)

            val cleanDomain = if (msg.domain.isNullOrEmpty() || msg.domain.equals("null", ignoreCase = true)) null else msg.domain
            val cleanTitle = if (msg.title.isNullOrEmpty() || msg.title.equals("null", ignoreCase = true)) null else msg.title
            val cleanUrl = if (msg.url.isNullOrEmpty() || msg.url.equals("null", ignoreCase = true)) null else msg.url

            if (cleanDomain != null) {
                tvDomain.visibility = View.VISIBLE
                tvDomain.text = cleanDomain
            } else {
                tvDomain.visibility = View.GONE
            }

            tvTitle.text = cleanTitle ?: cleanUrl ?: "Shared Link"
            tvUrl.text = cleanUrl ?: ""
            tvUrl.visibility = if (cleanUrl != null) View.VISIBLE else View.GONE

            btnOpen.setOnClickListener {
                cleanUrl?.let { linkUrl ->
                    try {
                        val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(linkUrl))
                        context.startActivity(browserIntent)
                    } catch (_: Exception) {
                        Toast.makeText(context, "Could not open link", Toast.LENGTH_SHORT).show()
                    }
                }
            }

            bindQuotedReply(llQuotedReply, msg)
            bindReactions(llReactions, msg)

            val showActions = View.OnLongClickListener {
                showMessageActionsDialog(msg)
                true
            }
            container.setOnLongClickListener(showActions)
        }
    }

    inner class ImageViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val row: LinearLayout = itemView.findViewById(R.id.llImageRow)
        private val cardContainer: View? = itemView.findViewById(R.id.cardImageContainer)
        private val tvSender: TextView = itemView.findViewById(R.id.tvImageSender)
        private val tvTime: TextView? = itemView.findViewById(R.id.tvImageTime)
        private val ivImage: ImageView = itemView.findViewById(R.id.ivMessageImage)
        private val llQuotedReply: View? = itemView.findViewById(R.id.llQuotedReply)
        private val llReactions: LinearLayout? = itemView.findViewById(R.id.llReactions)

        fun bind(msg: ChatMessage) {
            row.gravity = if (msg.isOutgoing) Gravity.END else Gravity.START
            tvSender.text = formatSender(msg)
            tvTime?.text = timeFormatter.format(Date(msg.timestamp))

            val rawData = msg.media?.data ?: ""
            if (rawData.isNotEmpty()) {
                val cleanBase64 = if (rawData.contains(",")) rawData.substringAfter(",") else rawData
                try {
                    val decodedBytes = Base64.decode(cleanBase64, Base64.DEFAULT)
                    val bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
                    ivImage.setImageBitmap(bitmap)
                } catch (_: Exception) {
                    ivImage.setImageResource(R.mipmap.ic_launcher)
                }
            }

            val openViewerAction = View.OnClickListener {
                if (rawData.isNotEmpty()) {
                    val intent = Intent(context, ImageViewerActivity::class.java).apply {
                        putExtra(ImageViewerActivity.EXTRA_IMAGE_DATA, rawData)
                        putExtra(ImageViewerActivity.EXTRA_IMAGE_NAME, msg.media?.name ?: "image.jpg")
                        putExtra(ImageViewerActivity.EXTRA_SENDER, formatSender(msg))
                        putExtra(ImageViewerActivity.EXTRA_TIMESTAMP, msg.timestamp)
                    }
                    context.startActivity(intent)
                } else {
                    Toast.makeText(context, "Image data not available", Toast.LENGTH_SHORT).show()
                }
            }

            ivImage.setOnClickListener(openViewerAction)
            cardContainer?.setOnClickListener(openViewerAction)

            bindQuotedReply(llQuotedReply, msg)
            bindReactions(llReactions, msg)

            val showActions = View.OnLongClickListener {
                showMessageActionsDialog(msg)
                true
            }
            cardContainer?.setOnLongClickListener(showActions)
        }
    }

    inner class VoiceViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val row: LinearLayout = itemView.findViewById(R.id.llVoiceRow)
        private val container: View = itemView.findViewById(R.id.llVoiceContainer)
        private val tvSender: TextView = itemView.findViewById(R.id.tvVoiceSender)
        private val tvTitle: TextView = itemView.findViewById(R.id.tvVoiceTitle)
        private val tvMeta: TextView = itemView.findViewById(R.id.tvVoiceMeta)
        private val btnPlay: ImageButton = itemView.findViewById(R.id.btnVoicePlay)
        private val llQuotedReply: View? = itemView.findViewById(R.id.llQuotedReply)
        private val llReactions: LinearLayout? = itemView.findViewById(R.id.llReactions)

        fun bind(msg: ChatMessage) {
            row.gravity = if (msg.isOutgoing) Gravity.END else Gravity.START
            tvSender.text = formatSender(msg)
            tvTitle.text = if (msg.text.isNotEmpty()) msg.text else "🎤 Voice Note"
            tvMeta.text = timeFormatter.format(Date(msg.timestamp))

            val isPlaying = (currentlyPlayingId == msg.id)
            btnPlay.setImageResource(
                if (isPlaying) android.R.drawable.ic_media_pause
                else android.R.drawable.ic_media_play
            )

            btnPlay.setOnClickListener {
                toggleAudioPlayback(msg)
            }

            bindQuotedReply(llQuotedReply, msg)
            bindReactions(llReactions, msg)

            val showActions = View.OnLongClickListener {
                showMessageActionsDialog(msg)
                true
            }
            container.setOnLongClickListener(showActions)
        }
    }

    private fun toggleAudioPlayback(msg: ChatMessage) {
        if (currentlyPlayingId == msg.id) {
            stopAudio()
            notifyDataSetChanged()
            return
        }

        stopAudio()

        val rawData = msg.media?.data ?: ""
        if (rawData.isEmpty()) {
            Toast.makeText(context, "Voice note audio data is missing", Toast.LENGTH_SHORT).show()
            return
        }

        try {
            val base64Data = if (rawData.contains(",")) rawData.substringAfter(",") else rawData
            val audioBytes = Base64.decode(base64Data, Base64.DEFAULT)
            val mimeType = msg.media?.mimeType ?: "audio/mp4"
            val ext = if (mimeType.contains("ogg")) ".ogg" else if (mimeType.contains("webm")) ".webm" else ".m4a"
            val tempFile = File(context.cacheDir, "play_audio_${msg.id.hashCode()}$ext")
            tempFile.writeBytes(audioBytes)

            mediaPlayer = MediaPlayer().apply {
                setDataSource(tempFile.absolutePath)
                setOnCompletionListener {
                    stopAudio()
                    notifyDataSetChanged()
                }
                setOnErrorListener { _, _, _ ->
                    stopAudio()
                    notifyDataSetChanged()
                    true
                }
                prepare()
                start()
            }
            currentlyPlayingId = msg.id
            notifyDataSetChanged()
        } catch (e: Exception) {
            Toast.makeText(context, "Playback failed: ${e.message}", Toast.LENGTH_SHORT).show()
            stopAudio()
            notifyDataSetChanged()
        }
    }

    fun stopAudio() {
        try {
            mediaPlayer?.stop()
            mediaPlayer?.release()
        } catch (_: Exception) {}
        mediaPlayer = null
        currentlyPlayingId = null
    }

    inner class SystemViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val tvText: TextView = itemView.findViewById(R.id.tvSystemText)

        fun bind(msg: ChatMessage) {
            tvText.text = msg.text
        }
    }
}
