package expo.modules.musicdownloads

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import java.util.concurrent.Executors
import java.util.concurrent.Future

class DownloadService : Service() {
  companion object {
    const val CHANNEL = "custodio-downloads"
    const val NOTIFICATION = 4102
  }
  private val executor = Executors.newSingleThreadExecutor()
  private var task: Future<*>? = null
  @Volatile private var engine: DownloadEngine? = null
  private var wakeLock: PowerManager.WakeLock? = null
  override fun onCreate() {
    super.onCreate()
    getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL, "Downloads de músicas", NotificationManager.IMPORTANCE_LOW))
  }
  private fun notification(entry: DownloadsDb.Entry? = null): Notification {
    val open = packageManager.getLaunchIntentForPackage(packageName)!!.apply {
      data = Uri.parse("custodiomusic://downloads")
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val builder = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle(entry?.let { org.json.JSONObject(it.payload).getJSONObject("item").optString("title") } ?: "Preparando downloads")
      .setContentText(when(entry?.state) { "processing" -> "Finalizando áudio"; "resolving" -> "Consultando fonte"; else -> "Baixando música" })
      .setOnlyAlertOnce(true).setOngoing(true).setSilent(true)
      .setContentIntent(PendingIntent.getActivity(this, 4102, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    if (entry != null) {
      val cancel = Intent(this, CancelReceiver::class.java).putExtra("id", entry.id)
      builder.addAction(android.R.drawable.ic_delete, "Cancelar", PendingIntent.getBroadcast(this, entry.id.hashCode(), cancel, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      builder.setProgress(100, if(entry.total > 0) ((entry.done*100/entry.total).coerceIn(0,100)).toInt() else 0, entry.total <= 0 || entry.state != "downloading")
    } else builder.setProgress(100,0,true)
    return builder.build()
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    ServiceCompat.startForeground(this, NOTIFICATION, notification(), if(Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0)
    task = executor.submit {
      try {
        wakeLock = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:downloads").apply { acquire(2*60*60*1000L) }
        val manager = DownloadEngine.get(this).also { engine = it }
        while (!Thread.currentThread().isInterrupted && manager.runNext { entry ->
          if(entry.state in setOf("resolving", "downloading", "processing")) getSystemService(NotificationManager::class.java).notify(NOTIFICATION, notification(entry))
        }) { /* one file at a time, including jobs added while the service runs */ }
      } finally {
        wakeLock?.let { if(it.isHeld) it.release() }
        stopSelf(startId)
      }
    }
    return START_NOT_STICKY
  }
  override fun onTimeout(startId: Int, fgsType: Int) {
    engine?.interrupt()
    task?.cancel(true)
    stopSelf()
  }
  override fun onDestroy() {
    engine?.interrupt()
    executor.shutdownNow()
    wakeLock?.let { if(it.isHeld) it.release() }
    super.onDestroy()
  }
  override fun onBind(intent: Intent?): IBinder? = null
}

class CancelReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra("id") ?: return
    if (!id.matches(Regex("[a-f0-9]{64}"))) return
    val pending = goAsync()
    Thread { try { DownloadEngine.get(context).cancel(id) } finally { pending.finish() } }.start()
  }
}
