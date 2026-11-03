package expo.modules.musicdownloads

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject

/** v1: cumulative checkpoints are transactional and safe to replay. Daily totals outlive raw events. */
internal class ListeningStore(context: Context) : SQLiteOpenHelper(context, "custodio-listening.db", null, 1) {
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE events(id TEXT PRIMARY KEY, trackId TEXT NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL, source TEXT NOT NULL, started INTEGER NOT NULL, seconds REAL NOT NULL, qualified INTEGER NOT NULL, reason TEXT NOT NULL)")
    db.execSQL("CREATE TABLE days(day TEXT NOT NULL, trackId TEXT NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL, seconds REAL NOT NULL, plays INTEGER NOT NULL, skips INTEGER NOT NULL, completions INTEGER NOT NULL, PRIMARY KEY(day,trackId))")
  }
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = error("Unsupported listening database migration")
  @Synchronized fun checkpoint(id: String, track: JSONObject, started: Long, seconds: Double, qualified: Boolean, reason: String, day: String) {
    if (seconds <= 0) return
    val db = writableDatabase
    db.beginTransaction()
    try {
      var oldSeconds = 0.0; var oldQualified = false; var oldReason = "playing"
      db.rawQuery("SELECT seconds,qualified,reason FROM events WHERE id=?", arrayOf(id)).use { c ->
        if (c.moveToFirst()) { oldSeconds = c.getDouble(0); oldQualified = c.getInt(1) != 0; oldReason = c.getString(2) }
      }
      val delta = (seconds - oldSeconds).coerceAtLeast(0.0)
      val plays = if (qualified && !oldQualified) 1 else 0
      val skips = if (reason == "skip" && oldReason != "skip") 1 else 0
      val completions = if (reason == "completed" && oldReason != "completed") 1 else 0
      db.execSQL("INSERT OR REPLACE INTO events VALUES(?,?,?,?,?,?,?,?,?)", arrayOf(id, track.getString("id"), track.getString("title"), track.getString("artist"), track.optString("source", "local"), started, seconds.coerceAtLeast(oldSeconds), if (qualified || oldQualified) 1 else 0, reason))
      db.execSQL("INSERT OR IGNORE INTO days VALUES(?,?,?,?,0,0,0,0)", arrayOf(day, track.getString("id"), track.getString("title"), track.getString("artist")))
      db.execSQL("UPDATE days SET seconds=seconds+?,plays=plays+?,skips=skips+?,completions=completions+? WHERE day=? AND trackId=?", arrayOf(delta, plays, skips, completions, day, track.getString("id")))
      db.setTransactionSuccessful()
    } finally { db.endTransaction() }
  }
  @Synchronized fun snapshot(includeEvents: Boolean): String {
    val result = JSONObject(); val days = JSONArray(); val events = JSONArray()
    readableDatabase.rawQuery("SELECT * FROM days ORDER BY day DESC,seconds DESC", null).use { c ->
      while (c.moveToNext()) days.put(JSONObject().put("day", c.getString(0)).put("trackId", c.getString(1)).put("title", c.getString(2)).put("artist", c.getString(3)).put("seconds", c.getDouble(4)).put("plays", c.getInt(5)).put("skips", c.getInt(6)).put("completions", c.getInt(7)))
    }
    if (includeEvents) readableDatabase.rawQuery("SELECT * FROM events ORDER BY started", null).use { c ->
      while (c.moveToNext()) events.put(JSONObject().put("id", c.getString(0)).put("trackId", c.getString(1)).put("title", c.getString(2)).put("artist", c.getString(3)).put("source", c.getString(4)).put("started", c.getLong(5)).put("seconds", c.getDouble(6)).put("qualified", c.getInt(7) != 0).put("reason", c.getString(8)))
    }
    return result.put("version", 1).put("days", days).put("events", events).toString()
  }
  @Synchronized fun prune() {
    val cutoff = java.util.Calendar.getInstance().apply { add(java.util.Calendar.MONTH, -12) }.timeInMillis
    writableDatabase.delete("events", "started < ?", arrayOf(cutoff.toString()))
  }
  @Synchronized fun clear() { writableDatabase.beginTransaction(); try { writableDatabase.delete("events", null, null); writableDatabase.delete("days", null, null); writableDatabase.setTransactionSuccessful() } finally { writableDatabase.endTransaction() } }
  /** Restoring the same backup replaces its snapshot rather than adding totals again. */
  @Synchronized fun restore(raw: String) {
    require(raw.length <= 20 * 1024 * 1024)
    val data = JSONObject(raw); require(data.getInt("version") == 1)
    val days = data.getJSONArray("days"); val events = data.getJSONArray("events")
    require(days.length() <= 100000 && events.length() <= 100000)
    val db = writableDatabase; db.beginTransaction()
    try {
      db.delete("events", null, null); db.delete("days", null, null)
      for (i in 0 until days.length()) {
        val d = days.getJSONObject(i)
        require(d.getString("day").matches(Regex("\\d{4}-\\d{2}-\\d{2}")))
        val seconds = d.getDouble("seconds"); require(seconds.isFinite() && seconds >= 0)
        val counts = listOf("plays", "skips", "completions").map { d.getInt(it).also { n -> require(n >= 0) } }
        db.execSQL("INSERT INTO days VALUES(?,?,?,?,?,?,?,?)", arrayOf(d.getString("day"), d.getString("trackId"), d.getString("title"), d.getString("artist"), seconds, counts[0], counts[1], counts[2]))
      }
      for (i in 0 until events.length()) {
        val e = events.getJSONObject(i); val seconds = e.getDouble("seconds"); require(seconds.isFinite() && seconds >= 0 && e.getLong("started") >= 0)
        db.execSQL("INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?)", arrayOf(e.getString("id"), e.getString("trackId"), e.getString("title"), e.getString("artist"), e.getString("source"), e.getLong("started"), seconds, if (e.getBoolean("qualified")) 1 else 0, e.getString("reason")))
      }
      db.setTransactionSuccessful()
    } finally { db.endTransaction() }
    prune()
  }
}
