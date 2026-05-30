const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer.babelTransformerPath = require.resolve(
  'react-native-svg-transformer'
);

config.resolver.assetExts = config.resolver.assetExts.filter(
  (ext) => ext !== 'svg'
);

config.resolver.sourceExts.push('svg');

// 'bz2': the bundled Moonshine .tar.bz2 archive, require()'d in moonshine-asr.ts
// and extracted to DocumentDirectory on first launch.
config.resolver.assetExts.push('bz2');

module.exports = config;