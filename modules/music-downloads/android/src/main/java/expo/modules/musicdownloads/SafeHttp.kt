package expo.modules.musicdownloads

import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request as ExtractorRequest
import org.schabi.newpipe.extractor.downloader.Response as ExtractorResponse
import java.io.IOException
import java.net.InetAddress
import java.net.Proxy
import java.util.concurrent.TimeUnit
import java.util.concurrent.ConcurrentHashMap

/** All resolver, metadata, redirect and media requests pass the same boundary. */
object SafeHttp {
  const val MAX_FILE = 536870912L
  const val MAX_DOCUMENT = 4L * 1024 * 1024
  private val domains = setOf("youtube.com", "youtu.be", "youtube-nocookie.com", "youtubei.googleapis.com", "googlevideo.com", "ytimg.com", "ggpht.com", "jamendo.com", "jamendo.net", "jamendousercontent.com")
  private val audiusMedia = ConcurrentHashMap<String, Long>()
  /** Only official Audius API responses may register their media nodes. DNS is still checked. */
  internal fun registerAudiusMedia(raw: String): String {
    val url = raw.toHttpUrl()
    require(url.scheme == "https" && url.port == 443 && url.username.isEmpty() && url.password.isEmpty() &&
      url.host.contains('.') && !url.host.matches(Regex("[0-9.]+")) && !url.host.contains(':'))
    if (audiusMedia.size >= 256) audiusMedia.entries.removeIf { it.value < System.currentTimeMillis() }
    if (audiusMedia.size >= 256 && !audiusMedia.containsKey(url.host)) {
      audiusMedia.entries.minByOrNull { it.value }?.let { audiusMedia.remove(it.key, it.value) }
    }
    audiusMedia[url.host] = System.currentTimeMillis() + 12 * 3600000L
    return url.toString()
  }
  fun allowedHost(host: String): Boolean = domains.any { host == it || host.endsWith(".$it") } ||
    host == "api.audius.co" || host == "audius.co" || host == "www.audius.co" || ((audiusMedia[host] ?: 0) > System.currentTimeMillis())
  fun checked(raw: String): HttpUrl {
    val url = raw.toHttpUrl()
    require(url.scheme == "https" && url.port == 443 && url.username.isEmpty() && url.password.isEmpty() && allowedHost(url.host)) { "Destino não permitido por esta fonte." }
    return url
  }
  fun publicAddress(address: InetAddress): Boolean {
    val b = address.address
    if (address.isAnyLocalAddress || address.isLoopbackAddress || address.isLinkLocalAddress || address.isSiteLocalAddress || address.isMulticastAddress) return false
    if (b.size == 16 && ((b[0].toInt() and 0xfe) == 0xfc)) return false
    if (b.size == 4) {
      val first = b[0].toInt() and 255
      val second = b[1].toInt() and 255
      if (first == 0 || first >= 224 || (first == 100 && second in 64..127) || (first == 198 && second in 18..19)) return false
    }
    return true
  }
  val client: OkHttpClient = OkHttpClient.Builder()
    .proxy(Proxy.NO_PROXY).followRedirects(false).followSslRedirects(false)
    .connectTimeout(20, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS)
    .dns(object : Dns {
      override fun lookup(hostname: String): List<InetAddress> {
        require(allowedHost(hostname)) { "Host não permitido." }
        return Dns.SYSTEM.lookup(hostname).also { addresses -> require(addresses.isNotEmpty() && addresses.all(::publicAddress)) { "Endereço de rede não permitido." } }
      }
    }).build()

  fun open(request: Request, timeoutSeconds: Long? = null, active: (Call) -> Unit = {}): Response {
    var next = request
    val deadline = timeoutSeconds?.let { System.nanoTime() + TimeUnit.SECONDS.toNanos(it) }
    repeat(6) {
      checked(next.url.toString())
      val call = client.newCall(next)
      if (deadline != null) {
        val remaining = deadline - System.nanoTime()
        if (remaining <= 0) throw java.net.SocketTimeoutException("Tempo de consulta esgotado.")
        call.timeout().timeout(remaining, TimeUnit.NANOSECONDS)
      }
      active(call)
      val response = call.execute()
      if (response.code !in listOf(301,302,303,307,308)) return response
      val location = response.header("Location")
      val target = location?.let { response.request.url.resolve(it) }
      response.close()
      requireNotNull(target) { "Redirecionamento inválido." }
      checked(target.toString())
      next = next.newBuilder().url(target).apply {
        if (response.code == 303 || ((response.code == 301 || response.code == 302) && next.method == "POST")) get()
      }.build()
    }
    throw IOException("Muitos redirecionamentos.")
  }
  fun text(raw: String): String = open(Request.Builder().url(checked(raw)).header("User-Agent", "CustodioMusic/1.0").build()).use { response ->
    require(response.isSuccessful) { "A fonte respondeu HTTP ${response.code}." }
    readText(response)
  }
  internal fun textTimed(raw: String, seconds: Long): String = open(
    Request.Builder().url(checked(raw)).header("User-Agent", "CustodioMusic/1.0").build(), timeoutSeconds = seconds,
  ).use { response -> require(response.isSuccessful) { "Catálogo temporariamente indisponível." }; readText(response) }
  fun readText(response: Response): String {
    val body = requireNotNull(response.body)
    require(body.contentLength() <= MAX_DOCUMENT) { "Resposta da fonte muito grande." }
    body.byteStream().use { input ->
      val output = java.io.ByteArrayOutputStream()
      val buffer = ByteArray(8192)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        require(output.size() + count <= MAX_DOCUMENT) { "Resposta da fonte muito grande." }
        output.write(buffer, 0, count)
      }
      return output.toString("UTF-8")
    }
  }
  fun thumbnail(raw: String?): String? = raw?.takeIf { runCatching { checked(it) }.isSuccess }
}

class ExtractorHttp : Downloader() {
  override fun execute(request: ExtractorRequest): ExtractorResponse {
    val method = request.httpMethod()
    require(method in setOf("GET", "POST", "HEAD"))
    val builder = Request.Builder().url(SafeHttp.checked(request.url()))
      .header("User-Agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36")
    request.headers().forEach { (key, values) ->
      if (!key.equals("Cookie", true) && !key.equals("Authorization", true)) { builder.removeHeader(key); values.forEach { builder.addHeader(key, it) } }
    }
    builder.method(method, if (method == "POST") (request.dataToSend() ?: byteArrayOf()).toRequestBody() else null)
    return SafeHttp.open(builder.build()).use { response ->
      if (response.code == 429 || response.code == 403) throw IOException("A fonte bloqueou a consulta. Tente mais tarde.")
      ExtractorResponse(response.code, response.message, response.headers.toMultimap(), if (method == "HEAD") "" else SafeHttp.readText(response), response.request.url.toString())
    }
  }
}
