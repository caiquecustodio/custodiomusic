import { requireNativeModule } from 'expo-modules-core';


type AudioAnalysisModuleType = {
  readMetadata(uri: string): Promise<{ title?: string; artist?: string; album?: string; duration?: number; artwork?: string; lyrics?: string }>;
};

export default requireNativeModule<AudioAnalysisModuleType>('AudioAnalysis');
