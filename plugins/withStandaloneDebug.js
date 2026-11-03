const { withAppBuildGradle, withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withStandaloneDebug(config) {
  config = withAppBuildGradle(config, (mod) => {
    // Replace our generated block so incremental prebuild also picks up plugin changes.
    mod.modResults.contents = mod.modResults.contents.replace(/\n*\/\/ Custodio standalone debug APK\r?\nif \(findProperty\('custodio.standaloneDebug'\) == 'true'\) \{[\s\S]*?\r?\n\}\r?\n/g, '\n');
    mod.modResults.contents = mod.modResults.contents.trimEnd();
    mod.modResults.contents += `
// Custodio standalone debug APK
if (findProperty('custodio.standaloneDebug') == 'true') {
    react { extraPackagerArgs = ['--max-workers', '1'] }
    android.defaultConfig.externalNativeBuild.cmake.arguments '-DCMAKE_OBJECT_PATH_MAX=255'
    android.signingConfigs.debug.storeFile = rootProject.file('../.local/android-signing/debug.keystore')
    def localVersion = findProperty('custodio.versionCode')
    if (localVersion != null) android.defaultConfig.versionCode = Integer.parseInt(localVersion)
    android.buildTypes.release.signingConfig = android.signingConfigs.debug
    android.buildTypes.release.minifyEnabled = false
    android.buildTypes.release.shrinkResources = false
    android.buildTypes.release.crunchPngs = false
    android.lint.checkReleaseBuilds = false
}
`;
    return mod;
  });
  return withProjectBuildGradle(config, (mod) => {
    const marker = '// Custodio native build cache';
    mod.modResults.contents = mod.modResults.contents.replace(/\n*\/\/ Custodio native build cache\r?\nif \(findProperty\('custodio.standaloneDebug'\) == 'true'\) \{[\s\S]*?\r?\n\}\r?\n/g, '\n');
    const nativeConfig = `
${marker}
if (findProperty('custodio.standaloneDebug') == 'true') {
    def cacheId = Integer.toHexString(rootProject.projectDir.absolutePath.hashCode())
    def nativeCache = new File(System.getProperty('user.home'), '.cm-cxx/' + cacheId)
    subprojects { subproject ->
        subproject.pluginManager.withPlugin('com.android.base') {
            def androidConfig = subproject.extensions.getByName('android')
            androidConfig.externalNativeBuild.cmake.buildStagingDirectory = new File(nativeCache, subproject.name)
            androidConfig.defaultConfig.externalNativeBuild.cmake.arguments '-DCMAKE_JOB_POOLS=compile=2', '-DCMAKE_JOB_POOL_COMPILE=compile'
        }
    }
}
`;
    const anchor = 'apply plugin: "expo-root-project"';
    if (!mod.modResults.contents.includes(anchor)) throw new Error('Expo root Gradle plugin anchor not found');
    mod.modResults.contents = mod.modResults.contents.replace(anchor, nativeConfig + '\n' + anchor);
    return mod;
  });
};
