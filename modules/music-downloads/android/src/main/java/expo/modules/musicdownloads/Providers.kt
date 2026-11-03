package expo.modules.musicdownloads

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.json.JSONArray
import org.json.JSONObject
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.search.SearchInfo
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.StreamType
import org.schabi.newpipe.extractor.kiosk.KioskInfo
import org.schabi.newpipe.extractor.localization.ContentCountry

internal data class AudioChoice(val id: String, val extension: String, val mime: String, val bitrate: Int, val content: String, val manifest: Boolean = false, val baseUrl: String? = null) {
  fun publicJson() = JSONObject().put("id", id).put("extension", extension).put("mime", mime).put("bitrate", bitrate)
}
internal data class Resolved(val item: JSONObject, val formats: List<AudioChoice>) {
  fun publicJson() = JSONObject().put("item", item).put("formats", JSONArray(formats.map { it.publicJson() }))
}
internal interface MusicSource {
  val id: String
  val available: Boolean
  fun search(query: String): List<JSONObject>
  fun popular(): List<JSONObject> = emptyList()
  fun resolve(trackId: String): Resolved
  fun lookup(trackId: String): JSONObject = stream(trackId).first
  fun stream(trackId: String): Pair<JSONObject, AudioChoice> {
    val result = resolve(trackId)
    return result.item to (result.formats.firstOrNull { !it.manifest }
      ?: error("Esta faixa não oferece streaming compatível."))
  }
}
internal object Providers {
  private val youtube by lazy { YoutubeSource() }
  private val jamendo = JamendoSource()
  private val audius = AudiusSource()
  private data class Preview(val provider: String, val id: String, val time: Long, val result: Resolved)
  @Volatile private var preview: Preview? = null
  @Volatile private var popularCache: Pair<Long, String>? = null
  @Synchronized fun popular(): JSONObject {
    popularCache?.takeIf { System.currentTimeMillis() - it.first < 3600000 }?.let { return JSONObject(it.second) }
    val items = JSONArray(); val errors = JSONObject()
    listOf(youtube, audius, jamendo).filter { it.available }.forEach { provider ->
      try { provider.popular().forEach(items::put) }
      catch (_: Exception) { errors.put(provider.id, "As músicas em alta desta fonte não estão disponíveis agora.") }
    }
    val result = JSONObject().put("items", items).put("errors", errors)
    if (items.length() > 0) popularCache = System.currentTimeMillis() to result.toString()
    return result
  }
  fun inspect(provider: String, id: String): Resolved = source(provider).resolve(id).also { preview = Preview(provider, id, System.currentTimeMillis(), it) }
  fun prepared(provider: String, id: String): Resolved {
    val cached = preview
    return if (cached != null && cached.provider == provider && cached.id == id && System.currentTimeMillis() - cached.time < 300000) cached.result else inspect(provider, id)
  }
  fun source(id: String): MusicSource = when(id) { "youtube" -> youtube; "jamendo" -> jamendo; "audius" -> audius; else -> error("Fonte não suportada.") }
  fun states() = JSONArray(listOf(
    JSONObject().put("id", "youtube").put("label", "YouTube").put("available", true),
    JSONObject().put("id", "audius").put("label", "Audius").put("available", true),
    JSONObject().put("id", "jamendo").put("label", "Jamendo").put("available", jamendo.available).put("reason", if (jamendo.available) JSONObject.NULL else "Catálogo ainda não configurado neste APK.")
  ))
  fun search(query: String, sourceId: String): JSONObject {
    require(query.isNotBlank() && query.length <= 200) { "Digite até 200 caracteres." }
    val items = JSONArray(); val errors = JSONObject()
    val ids = if (sourceId == "all") listOf("youtube", "audius", "jamendo") else listOf(sourceId)
    ids.forEach { id ->
      try { val provider = source(id); if (provider.available) provider.search(query).forEach(items::put) }
      catch (_: Exception) { errors.put(id, "Não foi possível consultar esta fonte. Tente novamente mais tarde.") }
    }
    return JSONObject().put("items", items).put("errors", errors)
  }
  fun link(raw: String): Pair<String,String> {
    val url = SafeHttp.checked(raw.trim())
    val host = url.host.removePrefix("www.")
    if (host == "audius.co") return "audius" to audius.linkId(url.newBuilder().host("audius.co").build().toString())
    if (host == "youtu.be") return "youtube" to youtubeId(url.pathSegments.firstOrNull() ?: "")
    if (host == "youtube.com" || host.endsWith(".youtube.com")) {
      val id = if (url.encodedPath == "/watch") url.queryParameter("v") else if (url.pathSegments.firstOrNull() in setOf("shorts", "embed", "live")) url.pathSegments.getOrNull(1) else null
      return "youtube" to youtubeId(id ?: error("Envie o link de uma faixa, não de uma playlist ou canal."))
    }
    if (host == "jamendo.com" || host.endsWith(".jamendo.com")) {
      val position = url.pathSegments.indexOf("track")
      if (position >= 0) return "jamendo" to jamendoId(url.pathSegments.getOrNull(position + 1) ?: "")
    }
    error("Use o link de uma faixa do YouTube, Jamendo ou Audius.")
  }
  fun youtubeId(value: String) = value.also { require(it.matches(Regex("[a-zA-Z0-9_-]{11}"))) { "Identificador de vídeo inválido." } }
  fun jamendoId(value: String) = value.also { require(it.matches(Regex("[0-9]{1,12}"))) { "Identificador de faixa inválido." } }
  fun item(provider: String, id: String, title: String, artist: String, duration: Long, artwork: String?, downloadable: Boolean = true) = JSONObject()
    .put("provider", provider).put("id", id).put("title", title.take(500)).put("artist", artist.take(500)).put("duration", duration.coerceAtLeast(0))
    .put("thumbnail", SafeHttp.thumbnail(artwork) ?: JSONObject.NULL).put("downloadable", downloadable)
    .put("url", when (provider) { "youtube" -> "https://www.youtube.com/watch?v=$id"; "jamendo" -> "https://www.jamendo.com/track/$id"; "audius" -> "https://audius.co"; else -> error("Fonte não suportada.") })
}

internal class YoutubeSource : MusicSource {
  override val id = "youtube"
  override val available = true
  init { NewPipe.init(ExtractorHttp()) }
  override fun popular(): List<JSONObject> {
    val kiosks = ServiceList.YouTube.kioskList
    val music = kiosks.availableKiosks.firstOrNull { it.contains("music", ignoreCase = true) }
      ?: error("Ranking musical indisponível nesta fonte")
    val extractor = kiosks.getExtractorById(music, null)
    extractor.forceContentCountry(ContentCountry("BR"))
    extractor.fetchPage()
    return KioskInfo.getInfo(extractor).relatedItems.filter { it.streamType == StreamType.VIDEO_STREAM && it.duration in 30..900 }
      .take(30).mapNotNull { stream -> runCatching {
        Providers.item(id, Providers.link(stream.url).second, stream.name, stream.uploaderName ?: "Artista", stream.duration, stream.thumbnails.firstOrNull()?.url)
      }.getOrNull() }
  }
  override fun search(query: String): List<JSONObject> {
    val service = ServiceList.YouTube
    val handler = service.searchQHFactory.fromQuery(query, listOf("videos"), "")
    return SearchInfo.getInfo(service, handler).relatedItems.filterIsInstance<StreamInfoItem>()
      .filter { it.streamType == StreamType.VIDEO_STREAM && it.duration > 0 }.take(20).mapNotNull { stream ->
        runCatching { val trackId = Providers.link(stream.url).second
          Providers.item(id, trackId, stream.name, stream.uploaderName ?: "Canal do YouTube", stream.duration, stream.thumbnails.firstOrNull()?.url)
        }.getOrNull()
      }
  }
  override fun resolve(trackId: String): Resolved {
    val canonical = "https://www.youtube.com/watch?v=${Providers.youtubeId(trackId)}"
    val extractor = ServiceList.YouTube.getStreamExtractor(canonical)
    extractor.fetchPage()
    require(extractor.ageLimit == 0 && extractor.streamType == StreamType.VIDEO_STREAM) { "Esta faixa exige acesso restrito ou é uma transmissão ao vivo." }
    val formats = extractor.audioStreams.mapNotNull { stream ->
      val format = stream.format ?: return@mapNotNull null
      if (format.suffix !in setOf("m4a", "webm", "opus", "ogg")) return@mapNotNull null
      if (stream.deliveryMethod !in setOf(DeliveryMethod.PROGRESSIVE_HTTP, DeliveryMethod.DASH)) return@mapNotNull null
      val isManifest = !stream.isUrl || (stream.isUrl && stream.content.substringBefore('?').endsWith(".mpd"))
      val content = if (stream.isUrl) SafeHttp.checked(stream.content).toString() else stream.content
      val key = "${stream.id}:${stream.audioTrackId ?: "default"}:${format.suffix}"
      AudioChoice(key, format.suffix, format.mimeType, stream.averageBitrate.coerceAtLeast(0), content, isManifest, stream.manifestUrl)
    }.distinctBy { it.id }.sortedWith(compareBy<AudioChoice> { if(it.extension == "m4a") 0 else 1 }.thenByDescending { it.bitrate })
    require(formats.isNotEmpty()) { "Nenhum formato de áudio compatível está disponível nesta fonte." }
    return Resolved(Providers.item(id, trackId, extractor.name, extractor.uploaderName, extractor.length, extractor.thumbnails.firstOrNull()?.url), formats)
  }
}

internal class JamendoSource(private val clientId: String = BuildConfig.JAMENDO_CLIENT_ID, private val fetchText: (String) -> String = SafeHttp::text) : MusicSource {
  override val id = "jamendo"
  override val available get() = clientId.isNotBlank()
  private fun tracks(key: String, value: String): List<JSONObject> {
    check(available) { "Catálogo Jamendo não configurado." }
    val url = "https://api.jamendo.com/v3.0/tracks/".toHttpUrl().newBuilder()
      .addQueryParameter("client_id", clientId).addQueryParameter("format", "json")
      .addQueryParameter("limit", "20").addQueryParameter("audioformat", "mp32").addQueryParameter(key, value).build()
    val response = JSONObject(fetchText(url.toString()))
    require(response.getJSONObject("headers").optInt("code", -1) == 0) { "O catálogo não respondeu à consulta." }
    val results = response.getJSONArray("results")
    return (0 until results.length()).map(results::getJSONObject)
  }
  private fun publicItem(track: JSONObject) = Providers.item(id, track.getString("id"), track.getString("name"), track.optString("artist_name", "Artista"), track.optLong("duration"), track.optString("image"), track.optBoolean("audiodownload_allowed", false))
  override fun search(query: String) = tracks("search", query).map(::publicItem)
  override fun popular() = tracks("order", "popularity_week").map(::publicItem)
  override fun stream(trackId: String): Pair<JSONObject, AudioChoice> {
    val track = tracks("id", Providers.jamendoId(trackId)).firstOrNull() ?: error("Faixa não encontrada.")
    val url = SafeHttp.checked(track.getString("audio")).toString()
    return publicItem(track) to AudioChoice("stream-mp32", "mp3", "audio/mpeg", 0, url)
  }
  override fun resolve(trackId: String): Resolved {
    val track = tracks("id", Providers.jamendoId(trackId)).firstOrNull() ?: error("Faixa não encontrada.")
    require(track.optBoolean("audiodownload_allowed", false)) { "O artista não disponibilizou download desta faixa." }
    val url = SafeHttp.checked(track.getString("audiodownload")).toString()
    return Resolved(publicItem(track).put("licenseUrl", track.optString("license_ccurl")), listOf(AudioChoice("mp32", "mp3", "audio/mpeg", 0, url)))
  }
}
