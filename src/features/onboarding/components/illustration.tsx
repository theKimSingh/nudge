import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { cloudsSvg } from '@/assets/illustrations/clouds';
import { hotairBalloonSvg } from '@/assets/illustrations/hotair_balloon';
import { tasksCompleteSvg } from '@/assets/illustrations/tasks_complete';

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
