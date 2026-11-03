const {
  withAndroidManifest,
  withAppBuildGradle,
  withProjectBuildGradle,
  createRunOncePlugin,
} = require("@expo/config-plugins");
function withMusicDownloads(config) {
  config = withAndroidManifest(config, (mod) => {
    const activity = mod.modResults.manifest.application[0].activity.find(
      (entry) => entry.$["android:name"] === ".MainActivity",
    );
    activity["intent-filter"] ??= [];
    const exists = activity["intent-filter"].some((filter) =>
      filter.action?.some(
        (action) => action.$["android:name"] === "android.intent.action.SEND",
      ),
    );
    if (!exists)
      activity["intent-filter"].push({
        action: [{ $: { "android:name": "android.intent.action.SEND" } }],
        category: [
          { $: { "android:name": "android.intent.category.DEFAULT" } },
        ],
        data: [{ $: { "android:mimeType": "text/plain" } }],
      });
    return mod;
  });
  config = withAppBuildGradle(config, (mod) => {
    if (
      !mod.modResults.contents.includes(
        "// Custodio music-downloads desugaring",
      )
    )
      mod.modResults.contents +=
        '\n// Custodio music-downloads desugaring\nandroid { compileOptions { coreLibraryDesugaringEnabled true } }\ndependencies { coreLibraryDesugaring "com.android.tools:desugar_jdk_libs_nio:2.1.5" }\n';
    return mod;
  });
  return withProjectBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes("jitpack.io"))
      mod.modResults.contents +=
        '\nallprojects { repositories { maven { url "https://jitpack.io" } } }\n';
    return mod;
  });
}
module.exports = createRunOncePlugin(
  withMusicDownloads,
  "custodio-music-downloads",
  "1.0.0",
);
