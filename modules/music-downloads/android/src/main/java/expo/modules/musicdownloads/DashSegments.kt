package expo.modules.musicdownloads

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.w3c.dom.Element
import java.io.ByteArrayInputStream
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.math.ceil

/** Finite, unencrypted DASH audio only. HLS/live/protected manifests fail closed. */
internal object DashSegments {
  private fun child(element: Element, name: String): Element? = (0 until element.childNodes.length)
    .map { element.childNodes.item(it) }.filterIsInstance<Element>()
    .firstOrNull { it.localName == name || it.tagName == name }
  private fun inherited(element: Element, name: String): Element? {
    var next: Element? = element
    while (next != null) { child(next, name)?.let { return it }; next = next.parentNode as? Element }
    return null
  }
  fun urls(choice: AudioChoice, duration: Long): List<String> {
    if (!choice.manifest) return listOf(SafeHttp.checked(choice.content).toString())
    val inline = choice.content.trimStart().startsWith("<")
    val xml = if (inline) choice.content else SafeHttp.text(choice.content)
    require(xml.length <= SafeHttp.MAX_DOCUMENT) { "Manifesto muito grande." }
    val factory = DocumentBuilderFactory.newInstance().apply {
      isNamespaceAware = true
      setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
      setFeature("http://xml.org/sax/features/external-general-entities", false)
      setFeature("http://xml.org/sax/features/external-parameter-entities", false)
      isXIncludeAware = false
      isExpandEntityReferences = false
    }
    val document = factory.newDocumentBuilder().parse(ByteArrayInputStream(xml.toByteArray()))
    require(document.documentElement.getAttribute("type") != "dynamic") { "Transmissões ao vivo não são suportadas." }
    require(document.getElementsByTagNameNS("*", "ContentProtection").length == 0) { "Conteúdo protegido não é suportado." }
    val reps = document.getElementsByTagNameNS("*", "Representation")
    val candidates = (0 until reps.length).map { reps.item(it) as Element }.filter { rep ->
      val mime = rep.getAttribute("mimeType").ifEmpty { (rep.parentNode as? Element)?.getAttribute("mimeType") ?: "" }
      mime.startsWith("audio/") || rep.getAttribute("id") == choice.id.substringBefore(':')
    }
    val rep = candidates.firstOrNull { it.getAttribute("id") == choice.id.substringBefore(':') }
      ?: candidates.singleOrNull() ?: error("Manifesto de áudio ambíguo.")
    var base = if (!inline) choice.content else choice.baseUrl
    val ancestors = mutableListOf<Element>()
    var cursor: Element? = rep
    while (cursor != null) { ancestors.add(0, cursor); cursor = cursor.parentNode as? Element }
    ancestors.forEach { element -> child(element, "BaseURL")?.textContent?.trim()?.takeIf { it.isNotEmpty() }?.let { value ->
      base = if (value.startsWith("https://")) SafeHttp.checked(value).toString()
        else base?.toHttpUrl()?.resolve(value)?.toString() ?: error("Base de mídia ausente.")
    } }
    fun url(value: String): String = SafeHttp.checked(if (value.startsWith("https://")) value
      else base?.toHttpUrl()?.resolve(value)?.toString() ?: error("Endereço de segmento inválido.")).toString()
    inherited(rep, "SegmentList")?.let { list ->
      val parts = mutableListOf<String>()
      child(list, "Initialization")?.let { init ->
        require(!init.hasAttribute("range")) { "Intervalo de inicialização não suportado." }
        init.getAttribute("sourceURL").takeIf { it.isNotEmpty() }?.let { parts.add(url(it)) }
      }
      val urls = list.getElementsByTagNameNS("*", "SegmentURL")
      require(urls.length in 1..20000)
      repeat(urls.length) { index ->
        val segment = urls.item(index) as Element
        require(!segment.hasAttribute("mediaRange")) { "Intervalos de segmentos não suportados." }
        parts.add(url(segment.getAttribute("media")))
      }
      return parts
    }
    inherited(rep, "SegmentTemplate")?.let { template ->
      val scale = template.getAttribute("timescale").toLongOrNull() ?: 1L
      require(scale > 0 && duration in 1..86400)
      val start = template.getAttribute("startNumber").toLongOrNull() ?: 1L
      val media = template.getAttribute("media")
      require(media.isNotBlank())
      val dollar = '$'
      fun expand(pattern: String, number: Long, time: Long): String {
        var result = pattern.replace("${dollar}RepresentationID${dollar}", rep.getAttribute("id"))
          .replace("${dollar}Bandwidth${dollar}", rep.getAttribute("bandwidth"))
          .replace("${dollar}Number${dollar}", number.toString()).replace("${dollar}Time${dollar}", time.toString())
        val padded = Regex(Regex.escape(dollar.toString()) + "Number%0([1-9][0-9]?)d" + Regex.escape(dollar.toString()))
        result = padded.replace(result) { number.toString().padStart(it.groupValues[1].toInt(), '0') }
        require(!result.contains(dollar)) { "Modelo de segmentos não suportado." }
        return url(result)
      }
      val parts = mutableListOf<String>()
      template.getAttribute("initialization").takeIf { it.isNotEmpty() }?.let { parts.add(expand(it, start, 0)) }
      var number = start
      val timeline = child(template, "SegmentTimeline")
      if (timeline != null) {
        val entries = timeline.getElementsByTagNameNS("*", "S")
        var time = 0L
        repeat(entries.length) { index ->
          val entry = entries.item(index) as Element
          time = entry.getAttribute("t").toLongOrNull() ?: time
          val step = entry.getAttribute("d").toLong()
          require(step > 0)
          var repeats = entry.getAttribute("r").toIntOrNull() ?: 0
          if (repeats < 0) {
            val end = (entries.item(index + 1) as? Element)?.getAttribute("t")?.toLongOrNull() ?: duration * scale
            repeats = (ceil((end-time).toDouble()/step).toInt()-1).coerceAtLeast(0)
          }
          require(repeats <= 20000 && parts.size + repeats < 20000)
          repeat(repeats + 1) { parts.add(expand(media, number++, time)); time += step }
        }
      } else {
        val step = template.getAttribute("duration").toLong()
        require(step > 0)
        val count = ceil(duration.toDouble()*scale/step).toInt()
        require(count in 1..20000)
        repeat(count) { parts.add(expand(media, number++, it.toLong()*step)) }
      }
      return parts
    }
    return listOf(SafeHttp.checked(requireNotNull(base)).toString())
  }
}
