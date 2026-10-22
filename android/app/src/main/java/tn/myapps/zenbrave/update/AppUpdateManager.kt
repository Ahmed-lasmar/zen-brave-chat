package tn.myapps.zenbrave.update

import android.app.Dialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import tn.myapps.zenbrave.R
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.util.concurrent.TimeUnit

data class UpdateInfo(
    val currentVersionCode: Int,
    val currentVersionName: String,
    val latestVersionCode: Int,
    val latestVersionName: String,
    val releaseDate: String,
    val apkSize: Long,
    val downloadUrl: String,
    val changelog: List<String>,
    val isUpdateAvailable: Boolean
)

class AppUpdateManager(private val context: Context) {

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    private val mainHandler = Handler(Looper.getMainLooper())

    fun getCurrentVersion(): Pair<Int, String> {
        return try {
            val pInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.packageManager.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(0))
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(context.packageName, 0)
            }
            val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pInfo.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                pInfo.versionCode
            }
            val name = pInfo.versionName ?: "1.0.0"
            Pair(code, name)
        } catch (_: Exception) {
            Pair(1, "1.0.0")
        }
    }

    fun checkForUpdates(
        serverEndpoint: String = "https://zenbrave.myapps.tn/api/version",
        callback: (Result<UpdateInfo>) -> Unit
    ) {
        val (currentCode, currentName) = getCurrentVersion()

        Thread {
            try {
                val request = Request.Builder()
                    .url(serverEndpoint)
                    .header("Accept", "application/json")
                    .build()

                val response = httpClient.newCall(request).execute()
                if (!response.isSuccessful) {
                    mainHandler.post {
                        callback(Result.failure(Exception("Server returned HTTP ${response.code}")))
                    }
                    return@Thread
                }

                val bodyStr = response.body?.string() ?: ""
                val json = JSONObject(bodyStr)
                val androidObj = json.optJSONObject("android") ?: JSONObject()

                val latestCode = androidObj.optInt("versionCode", currentCode)
                val latestName = androidObj.optString("versionName", currentName)
                val releaseDate = androidObj.optString("releaseDate", "Latest")
                val apkSize = androidObj.optLong("apkSize", 0L)
                val downloadUrl = androidObj.optString("downloadUrl", "https://zenbrave.myapps.tn/download/android")

                val changelogList = mutableListOf<String>()
                val changelogArray = androidObj.optJSONArray("changelog")
                if (changelogArray != null) {
                    for (i in 0 until changelogArray.length()) {
                        changelogList.add(changelogArray.optString(i))
                    }
                } else {
                    changelogList.add("General improvements and stability fixes")
                }

                val isUpdateAvailable = latestCode > currentCode

                val updateInfo = UpdateInfo(
                    currentVersionCode = currentCode,
                    currentVersionName = currentName,
                    latestVersionCode = latestCode,
                    latestVersionName = latestName,
                    releaseDate = releaseDate,
                    apkSize = apkSize,
                    downloadUrl = downloadUrl,
                    changelog = changelogList,
                    isUpdateAvailable = isUpdateAvailable
                )

                mainHandler.post {
                    callback(Result.success(updateInfo))
                }
            } catch (e: Exception) {
                mainHandler.post {
                    callback(Result.failure(e))
                }
            }
        }.start()
    }

    fun showUpdateDialog(activity: AppCompatActivity, updateInfo: UpdateInfo) {
        val dialog = Dialog(activity, R.style.Theme_ZenBrave_Dialog)
        dialog.setContentView(R.layout.dialog_app_update)
        dialog.window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)

        val tvStatusBadge = dialog.findViewById<TextView>(R.id.tvUpdateStatusBadge)
        val tvCurrentVersion = dialog.findViewById<TextView>(R.id.tvCurrentVersion)
        val tvLatestVersion = dialog.findViewById<TextView>(R.id.tvLatestVersion)
        val tvUpdateMeta = dialog.findViewById<TextView>(R.id.tvUpdateMeta)
        val tvChangelog = dialog.findViewById<TextView>(R.id.tvChangelog)
        val layoutProgress = dialog.findViewById<View>(R.id.layoutDownloadProgress)
        val pbDownload = dialog.findViewById<ProgressBar>(R.id.pbDownload)
        val tvProgressText = dialog.findViewById<TextView>(R.id.tvDownloadProgressText)
        val btnLater = dialog.findViewById<Button>(R.id.btnUpdateLater)
        val btnAction = dialog.findViewById<Button>(R.id.btnUpdateAction)

        tvCurrentVersion.text = "v${updateInfo.currentVersionName} (Build ${updateInfo.currentVersionCode})"
        tvLatestVersion.text = "v${updateInfo.latestVersionName} (Build ${updateInfo.latestVersionCode})"

        val mbSize = if (updateInfo.apkSize > 0) String.format("%.1f MB", updateInfo.apkSize / (1024f * 1024f)) else "7.8 MB"
        tvUpdateMeta.text = "Released: ${updateInfo.releaseDate} • $mbSize direct download"

        val changelogText = StringBuilder()
        for (item in updateInfo.changelog) {
            changelogText.append("• ").append(item).append("\n")
        }
        tvChangelog.text = changelogText.toString().trim()

        if (updateInfo.isUpdateAvailable) {
            tvStatusBadge.text = "🚀 New Update Available!"
            tvStatusBadge.setTextColor(androidx.core.content.ContextCompat.getColor(activity, R.color.accent_brave))
            btnAction.text = "Update Now"
            btnLater.text = "Later"

            btnAction.setOnClickListener {
                btnAction.isEnabled = false
                btnLater.isEnabled = false
                layoutProgress.visibility = View.VISIBLE

                downloadAndInstall(
                    downloadUrl = updateInfo.downloadUrl,
                    onProgress = { progress, currentBytes, totalBytes ->
                        pbDownload.progress = progress
                        val currentMb = currentBytes / (1024f * 1024f)
                        val totalMb = if (totalBytes > 0) totalBytes / (1024f * 1024f) else currentMb
                        tvProgressText.text = String.format("Downloading: %d%% (%.1f MB / %.1f MB)", progress, currentMb, totalMb)
                    },
                    onComplete = { apkFile ->
                        dialog.dismiss()
                        installApk(activity, apkFile)
                    },
                    onError = { err ->
                        btnAction.isEnabled = true
                        btnLater.isEnabled = true
                        layoutProgress.visibility = View.GONE
                        Toast.makeText(activity, "Download failed: ${err.message}", Toast.LENGTH_LONG).show()
                    }
                )
            }

            btnLater.setOnClickListener {
                dialog.dismiss()
            }
        } else {
            tvStatusBadge.text = "🟢 You are using the latest version"
            tvStatusBadge.setTextColor(androidx.core.content.ContextCompat.getColor(activity, R.color.accent_green))
            btnAction.text = "OK"
            btnLater.visibility = View.GONE

            btnAction.setOnClickListener {
                dialog.dismiss()
            }
        }

        dialog.show()
    }

    private fun downloadAndInstall(
        downloadUrl: String,
        onProgress: (progress: Int, currentBytes: Long, totalBytes: Long) -> Unit,
        onComplete: (File) -> Unit,
        onError: (Exception) -> Unit
    ) {
        Thread {
            try {
                val request = Request.Builder().url(downloadUrl).build()
                val response = httpClient.newCall(request).execute()

                if (!response.isSuccessful) {
                    mainHandler.post { onError(Exception("HTTP ${response.code}")) }
                    return@Thread
                }

                val body = response.body
                if (body == null) {
                    mainHandler.post { onError(Exception("Empty download response")) }
                    return@Thread
                }

                val totalBytes = body.contentLength()
                val targetFile = File(context.cacheDir, "zenbrave_update.apk")
                if (targetFile.exists()) targetFile.delete()

                val inputStream: InputStream = body.byteStream()
                val outputStream = FileOutputStream(targetFile)

                val buffer = ByteArray(8192)
                var bytesRead: Int
                var downloadedBytes = 0L

                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                    downloadedBytes += bytesRead

                    val progress = if (totalBytes > 0) ((downloadedBytes * 100) / totalBytes).toInt() else 0
                    mainHandler.post {
                        onProgress(progress, downloadedBytes, totalBytes)
                    }
                }

                outputStream.flush()
                outputStream.close()
                inputStream.close()

                mainHandler.post {
                    onComplete(targetFile)
                }
            } catch (e: Exception) {
                mainHandler.post {
                    onError(e)
                }
            }
        }.start()
    }

    fun installApk(activity: AppCompatActivity, apkFile: File) {
        if (!apkFile.exists() || apkFile.length() == 0L) {
            Toast.makeText(activity, "Update package file is invalid", Toast.LENGTH_SHORT).show()
            return
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!activity.packageManager.canRequestPackageInstalls()) {
                    Toast.makeText(activity, "Please allow Zen & Brave to install app updates", Toast.LENGTH_LONG).show()
                    val settingsIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = Uri.parse("package:${activity.packageName}")
                    }
                    activity.startActivity(settingsIntent)
                    return
                }
            }

            val contentUri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", apkFile)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(contentUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(activity, "Could not launch package installer: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }
}
