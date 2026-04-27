import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import cloudsSvg from '@/src/assets/illustrations/clouds.svg';
import hotairBalloonSvg from '@/src/assets/illustrations/hotair_balloon.svg';
import tasksCompleteSvg from '@/src/assets/illustrations/tasks_complete.svg';

const SVGS = {
  tasks_complete: tasksCompleteSvg,
  hotair_balloon: hotairBalloonSvg,
  clouds: cloudsSvg,
} as const;

export type IllustrationName = keyof typeof SVGS;

type Props = {
  name: IllustrationName;
  width: number;
  height?: number;
};

export function Illustration({ name, width, height }: Props) {
  return (
    <View style={[styles.wrapper, { width, height: height ?? width }]} accessible={false}>
      <SvgXml xml={SVGS[name]} width="100%" height="100%" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
