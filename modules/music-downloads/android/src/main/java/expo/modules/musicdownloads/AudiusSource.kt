package expo.modules.musicdownloads

import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/** Official catalog. Restricted tracks are excluded; signed URLs are resolved only at playback. */
internal class AudiusSource(
  private val fetchText: (String) -> String = { SafeHttp.textTimed(it, 10) },
  private val canOpen: (String) -> Boolean = ::probe,
) : MusicSource {
  override val id = "audius"
  override val available = true
  private val failedNodes = ConcurrentHashMap<String, Long>()

  private fun api(path: String, parameters: Map<String, String> = emptyMap()): JSONObject {
    val url = "https://api.audius.co/v1/$path".toHttpUrl().newBuilder()
      .addQueryParameter("app_name", "CustodioMusic")
    parameters.forEach { (key, value) -> url.addQueryParameter(key, value) }
    return JSONObject(fetchText(url.build().toString()))
  }
  private fun validId(value: String) = value.also {
    require(it.matches(Regex("[a-zA-Z0-9_-]{1,128}"))) { "Identificador de faixa inválido." }
  }
  private fun streamable(track: JSONObject): Boolean =
    !track.optBoolean("is_delete") && !track.optBoolean("is_private") &&
      !track.optBoolean("is_unlisted") && !track.optBoolean("is_stream_gated") &&
      track.optBoolean("is_streamable", true) &&
      track.optJSONObject("access")?.optBoolean("stream", true) != false &&
      (track.optJSONArray("access_authorities")?.length() ?: 0) == 0

  private fun track(trackId: String): JSONObject = api("tracks/${validId(trackId)}").getJSONObject("data").also {
    require(streamable(it)) { "Esta música não está disponível para reprodução pública." }
  }
  private fun publicItem(track: JSONObject): JSONObject {
    val artwork = track.optJSONObject("artwork")?.optString("480x480")?.takeIf { it.isNotBlank() }
      ?.let { runCatching { SafeHttp.registerAudiusMedia(it) }.getOrNull() }
    val permalink = track.optString("permalink")
    val url = if (permalink.startsWith('/')) "https://audius.co$permalink" else permalink
    val canonical = url.toHttpUrl()
    require(canonical.scheme == "https" && canonical.host == "audius.co" && canonical.port == 443 && canonical.username.isEmpty() && canonical.password.isEmpty())
    return Providers.item(id, validId(track.getString("id")), track.getString("title"),
      track.getJSONObject("user").getString("name"), track.optLong("duration"), artwork, false)
      .put("url", canonical.toString()).put("licenseUrl", "https://audius.org/open-music-license.pdf")
  }
  private fun list(path: String, parameters: Map<String, String> = emptyMap()): List<JSONObject> {
    val data = api(path, parameters + ("limit" to "20")).getJSONArray("data")
    return (0 until data.length()).mapNotNull { index ->
      val track = data.getJSONObject(index)
      if (!streamable(track)) null else runCatching { publicItem(track) }.getOrNull()
    }
  }
  override fun search(query: String) = list("tracks/search", mapOf("query" to query))
  override fun popular() = list("tracks/trending")
  override fun lookup(trackId: String) = publicItem(track(trackId))
  // Streaming permission does not imply permission to download the original.
  override fun resolve(trackId: String) = Resolved(lookup(trackId), emptyList())
  fun linkId(url: String): String {
    val data = api("resolve", mapOf("url" to url)).getJSONObject("data")
    require(data.has("title") && data.has("user") && streamable(data)) { "Envie o link de uma música pública do Audius." }
    return validId(data.getString("id"))
  }
  override fun stream(trackId: String): Pair<JSONObject, AudioChoice> {
    val metadata = track(trackId)
    val stream = metadata.optJSONObject("stream")
    val primary = (stream?.optString("url")?.takeIf { it.isNotBlank() }
      ?: api("tracks/${validId(trackId)}/stream", mapOf("no_redirect" to "true")).getString("data"))
      .let { SafeHttp.registerAudiusMedia(it).toHttpUrl() }
    val candidates = mutableListOf(primary.toString())
    val mirrors = stream?.optJSONArray("mirrors")
    for (i in 0 until (mirrors?.length() ?: 0).coerceAtMost(3)) {
      runCatching {
        val base = SafeHttp.registerAudiusMedia(mirrors!!.getString(i)).toHttpUrl()
        candidates.add(base.newBuilder().encodedPath(primary.encodedPath).encodedQuery(primary.encodedQuery).build().toString())
      }
    }
    for (url in candidates.distinct().take(3)) {
      val host = url.toHttpUrl().host
      val failureKey = "$host:$trackId"
      if ((failedNodes[failureKey] ?: 0) > System.currentTimeMillis()) continue
      if (runCatching { canOpen(url) }.getOrDefault(false)) {
        failedNodes.remove(failureKey)
        return publicItem(metadata) to AudioChoice("stream-mp3", "mp3", "audio/mpeg", 0, url)
      }
      if (failedNodes.size > 128) failedNodes.clear()
      failedNodes[failureKey] = System.currentTimeMillis() + 60000
    }
    error("Esta música está temporariamente indisponível. Tente novamente em instantes.")
  }
  companion object {
    private fun probe(url: String): Boolean = SafeHttp.open(
      Request.Builder().url(SafeHttp.checked(url)).header("Range", "bytes=0-0")
        .header("User-Agent", "CustodioMusic/1.0").build(), timeoutSeconds = 4,
    ).use { it.isSuccessful && it.header("Content-Type", "")!!.substringBefore(';').lowercase().let { type ->
      type.startsWith("audio/") || type == "application/octet-stream"
    } }
  }
}
