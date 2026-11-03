import { DownloadManager } from "../components/DownloadManager";
import { Header, Screen } from "../components/ui";
export default function DownloadsScreen() {
  return <Screen><Header title="Downloads" detail="Suas músicas para ouvir sem internet" /><DownloadManager /></Screen>;
}
