import { StyleSheet, View } from 'react-native';

import Clouds from '@/src/assets/illustrations/clouds.svg';
import HotAirBalloon from '@/src/assets/illustrations/hotair_balloon.svg';
import TasksComplete from '@/src/assets/illustrations/tasks_complete.svg';

const SVGS = {
  tasks_complete: TasksComplete,
  hotair_balloon: HotAirBalloon,
  clouds: Clouds,
} as const;

export type IllustrationName = keyof typeof SVGS;

type Props = {
  name: IllustrationName;
  width: number;
  height?: number;
};

export function Illustration({ name, width, height }: Props) {
  const Svg = SVGS[name];

  return (
    <View style={[styles.wrapper, { width, height: height ?? width }]}>
      <Svg width={width} height={height ?? width} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
