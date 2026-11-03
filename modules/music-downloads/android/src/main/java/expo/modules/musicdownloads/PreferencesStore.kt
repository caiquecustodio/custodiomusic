package expo.modules.musicdownloads

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

internal class PreferencesStore(context: Context) : SQLiteOpenHelper(context, "custodio-preferences.db", null, 1) {
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE preferences(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL)")
  }
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = error("Unsupported preferences migration")
  private fun validate(key: String, value: String? = null) {
    require(key.startsWith("custodio.") && key.length <= 128)
    require(value == null || value.length <= 4 * 1024 * 1024)
  }
  @Synchronized fun read(key: String, legacy: String?): String? {
    validate(key, legacy)
    val db = writableDatabase
    db.beginTransaction()
    try {
      if (legacy != null) db.execSQL("INSERT OR IGNORE INTO preferences(key,value) VALUES(?,?)", arrayOf(key, legacy))
      val result = db.rawQuery("SELECT value FROM preferences WHERE key=?", arrayOf(key)).use { if (it.moveToFirst()) it.getString(0) else null }
      db.setTransactionSuccessful()
      return result
    } finally { db.endTransaction() }
  }
  @Synchronized fun write(key: String, value: String) {
    validate(key, value)
    writableDatabase.execSQL("INSERT OR REPLACE INTO preferences(key,value) VALUES(?,?)", arrayOf(key, value))
  }
}
