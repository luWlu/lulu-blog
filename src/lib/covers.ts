/** 专属封面与它左上角的说明文字；frontmatter 里用 `cover: led` 这样的名字选择。 */
export const covers = {
  led: 'PS → EMIO → LED',
  relay: 'GPIO → DRIVER → RELAY',
  edge: '2-FF SYNC · EDGE DETECT',
  pulse: 'GATE COUNT · DUTY',
  pwm: 'COUNTER vs COMPARE',
  adc: 'SAMPLE → FILTER → CALIBRATE',
  dac: 'DDS LUT → DAC',
  verilog: 'D FLIP-FLOP · COUNTER',
} as const;

export type CoverName = keyof typeof covers;
export const coverNames = Object.keys(covers) as [CoverName, ...CoverName[]];
